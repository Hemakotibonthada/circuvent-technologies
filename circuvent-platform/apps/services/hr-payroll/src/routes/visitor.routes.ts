// ══════════════════════════════════════════════════════════════
// Visitor Management Routes — Pre-registration, check-in/out
// ══════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// GET /visitors — List visitors
router.get("/", async (req: Request, res: Response) => {
  try {
    const { status, hostId, date, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (hostId) where.hostId = hostId;
    if (date) {
      const d = new Date(date as string);
      const nextDay = new Date(d); nextDay.setDate(d.getDate() + 1);
      where.createdAt = { gte: d, lt: nextDay };
    }

    const [visitors, total] = await Promise.all([
      prisma.visitor.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.visitor.count({ where }),
    ]);

    // Enrich with host names
    const hostIds = [...new Set(visitors.map(v => v.hostId))];
    const hosts = await prisma.user.findMany({
      where: { id: { in: hostIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const hostMap = new Map(hosts.map(h => [h.id, h]));

    const enriched = visitors.map(v => ({
      ...v,
      host: hostMap.get(v.hostId) || { firstName: "Unknown", lastName: "" },
    }));

    res.json({ success: true, data: enriched, meta: { total } });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch visitors" });
  }
});

// GET /visitors/today — Today's visitors
router.get("/today", async (_req: Request, res: Response) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

    const visitors = await prisma.visitor.findMany({
      where: { createdAt: { gte: today, lt: tomorrow } },
      orderBy: { createdAt: "desc" },
    });

    const hostIds = [...new Set(visitors.map(v => v.hostId))];
    const hosts = await prisma.user.findMany({
      where: { id: { in: hostIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const hostMap = new Map(hosts.map(h => [h.id, h]));

    const enriched = visitors.map(v => ({
      ...v,
      host: hostMap.get(v.hostId),
    }));

    const stats = {
      total: visitors.length,
      checkedIn: visitors.filter(v => v.status === "CHECKED_IN").length,
      checkedOut: visitors.filter(v => v.status === "CHECKED_OUT").length,
      preRegistered: visitors.filter(v => v.status === "PRE_REGISTERED").length,
    };

    res.json({ success: true, data: enriched, meta: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch today's visitors" });
  }
});

// POST /visitors — Pre-register visitor
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, email, phone, company, purpose, hostId, idType, idNumber, expectedAt } = req.body;
    if (!name || !purpose || !hostId) {
      res.status(400).json({ success: false, error: "name, purpose, hostId required" });
      return;
    }

    const visitor = await prisma.visitor.create({
      data: { name, email, phone, company, purpose, hostId, idType, idNumber, status: "PRE_REGISTERED" },
    });

    // Auto-notify host
    await prisma.notification.create({
      data: {
        userId: hostId,
        type: "VISITOR",
        module: "VISITOR",
        title: `Visitor pre-registered: ${name}`,
        message: `${name} from ${company || "N/A"} is expected to visit. Purpose: ${purpose}`,
      },
    });

    res.status(201).json({ success: true, data: visitor, message: "Visitor pre-registered" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to register visitor" });
  }
});

// POST /visitors/:id/check-in — Check in visitor
router.post("/:id/check-in", async (req: Request, res: Response) => {
  try {
    const { badgeNumber } = req.body;
    const visitor = await prisma.visitor.update({
      where: { id: req.params.id },
      data: {
        status: "CHECKED_IN",
        checkInAt: new Date(),
        badgeNumber: badgeNumber || `V-${Date.now().toString(36).toUpperCase()}`,
      },
    });

    // Auto-notify host
    await prisma.notification.create({
      data: {
        userId: visitor.hostId,
        type: "VISITOR",
        module: "VISITOR",
        title: `${visitor.name} has checked in`,
        message: `Your visitor ${visitor.name} has arrived at reception`,
      },
    });

    res.json({ success: true, data: visitor, message: `${visitor.name} checked in. Badge: ${visitor.badgeNumber}` });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to check in" });
  }
});

// POST /visitors/:id/check-out — Check out visitor
router.post("/:id/check-out", async (req: Request, res: Response) => {
  try {
    const visitor = await prisma.visitor.update({
      where: { id: req.params.id },
      data: { status: "CHECKED_OUT", checkOutAt: new Date() },
    });
    res.json({ success: true, data: visitor, message: `${visitor.name} checked out` });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to check out" });
  }
});

// POST /visitors/:id/deny — Deny visitor
router.post("/:id/deny", async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const visitor = await prisma.visitor.update({
      where: { id: req.params.id },
      data: { status: "DENIED", notes: reason },
    });
    res.json({ success: true, data: visitor, message: "Visitor denied" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to deny visitor" });
  }
});

// Dashboard
router.get("/dashboard/stats", async (_req: Request, res: Response) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [todayTotal, todayInBuilding, monthTotal, byPurpose, byCompany] = await Promise.all([
      prisma.visitor.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      prisma.visitor.count({ where: { status: "CHECKED_IN" } }),
      prisma.visitor.count({ where: { createdAt: { gte: thisMonth } } }),
      prisma.visitor.groupBy({
        by: ["purpose"],
        where: { createdAt: { gte: thisMonth } },
        _count: true,
        orderBy: { _count: { purpose: "desc" } },
        take: 5,
      }),
      prisma.visitor.groupBy({
        by: ["company"],
        where: { createdAt: { gte: thisMonth }, company: { not: null } },
        _count: true,
        orderBy: { _count: { company: "desc" } },
        take: 5,
      }),
    ]);

    res.json({
      success: true,
      data: {
        todayVisitors: todayTotal,
        currentlyInBuilding: todayInBuilding,
        monthTotal,
        topPurposes: byPurpose.map(p => ({ purpose: p.purpose, count: p._count })),
        topCompanies: byCompany.map(c => ({ company: c.company, count: c._count })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch stats" });
  }
});

export { router as visitorRouter };
