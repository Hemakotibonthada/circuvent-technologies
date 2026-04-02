// ══════════════════════════════════════════════════════════════
// Grievance Management Routes — File, investigate, resolve
// ══════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ── GET /grievances — List all grievances ──
router.get("/", async (req: Request, res: Response) => {
  try {
    const { status, category, priority, assignedTo, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;
    if (assignedTo) where.assignedTo = assignedTo;

    const [grievances, total] = await Promise.all([
      prisma.grievance.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.grievance.count({ where }),
    ]);

    res.json({ success: true, data: grievances, meta: { total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch grievances" });
  }
});

// ── GET /grievances/my — My grievances ──
router.get("/my", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    const grievances = await prisma.grievance.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: grievances });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch your grievances" });
  }
});

// ── GET /grievances/:id ──
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const grievance = await prisma.grievance.findUnique({ where: { id: req.params.id } });
    if (!grievance) { res.status(404).json({ success: false, error: "Grievance not found" }); return; }
    res.json({ success: true, data: grievance });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch grievance" });
  }
});

// ── POST /grievances — File a grievance ──
router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    const { category, subject, description, priority, isAnonymous } = req.body;
    if (!category || !subject || !description) {
      res.status(400).json({ success: false, error: "category, subject, description required" });
      return;
    }

    // Auto-assign investigator based on category (round-robin)
    const hrManagers = await prisma.user.findMany({ where: { role: "HR_MANAGER", status: "ACTIVE" }, select: { id: true } });
    const activeGrievanceCounts = await Promise.all(
      hrManagers.map(async (m) => ({
        id: m.id,
        count: await prisma.grievance.count({ where: { assignedTo: m.id, status: { in: ["OPEN", "INVESTIGATING"] } } }),
      }))
    );
    const leastLoaded = activeGrievanceCounts.sort((a, b) => a.count - b.count)[0];

    const grievance = await prisma.grievance.create({
      data: {
        grievanceCode: `GRV-${Date.now().toString(36).toUpperCase()}`,
        employeeId: isAnonymous ? "ANONYMOUS" : employee.id,
        category,
        subject,
        description,
        priority: priority || "MEDIUM",
        status: "OPEN",
        assignedTo: leastLoaded?.id || null,
        isAnonymous: isAnonymous || false,
      },
    });

    res.status(201).json({
      success: true,
      data: grievance,
      message: leastLoaded
        ? `Grievance filed and auto-assigned to investigator`
        : "Grievance filed. Pending investigator assignment.",
    });
  } catch (error) {
    console.error("[GRIEVANCE] Create error:", error);
    res.status(500).json({ success: false, error: "Failed to file grievance" });
  }
});

// ── PATCH /grievances/:id — Update grievance ──
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { status, priority, assignedTo, resolution } = req.body;
    const updateData: any = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
    if (resolution) updateData.resolution = resolution;
    if (status === "RESOLVED") updateData.resolvedAt = new Date();

    const grievance = await prisma.grievance.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ success: true, data: grievance });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update grievance" });
  }
});

// ── POST /grievances/:id/escalate — Escalate to higher authority ──
router.post("/:id/escalate", async (req: Request, res: Response) => {
  try {
    const { escalateTo, reason } = req.body;
    const grievance = await prisma.grievance.update({
      where: { id: req.params.id },
      data: {
        status: "ESCALATED",
        assignedTo: escalateTo || null,
        resolution: reason ? `Escalated: ${reason}` : "Escalated to higher authority",
      },
    });

    res.json({ success: true, data: grievance, message: "Grievance escalated" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to escalate" });
  }
});

// ── POST /grievances/:id/resolve — Resolve grievance ──
router.post("/:id/resolve", async (req: Request, res: Response) => {
  try {
    const { resolution, outcome } = req.body;
    const grievance = await prisma.grievance.update({
      where: { id: req.params.id },
      data: {
        status: "RESOLVED",
        resolution: resolution || "Resolved",
        resolvedAt: new Date(),
      },
    });

    res.json({ success: true, data: grievance, message: "Grievance resolved" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to resolve" });
  }
});

// ── POST /grievances/:id/withdraw — Employee withdraws grievance ──
router.post("/:id/withdraw", async (req: Request, res: Response) => {
  try {
    const grievance = await prisma.grievance.update({
      where: { id: req.params.id },
      data: { status: "WITHDRAWN" },
    });
    res.json({ success: true, data: grievance, message: "Grievance withdrawn" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to withdraw" });
  }
});

// ── GET /grievances/dashboard/stats ──
router.get("/dashboard/stats", async (_req: Request, res: Response) => {
  try {
    const [total, byStatus, byCategory, byPriority, overdue, avgResolutionTime] = await Promise.all([
      prisma.grievance.count(),
      prisma.grievance.groupBy({ by: ["status"], _count: true }),
      prisma.grievance.groupBy({ by: ["category"], _count: true }),
      prisma.grievance.groupBy({ by: ["priority"], _count: true }),
      prisma.grievance.count({
        where: {
          status: { in: ["OPEN", "INVESTIGATING"] },
          createdAt: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.grievance.findMany({
        where: { status: "RESOLVED", resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
      }),
    ]);

    const avgDays = avgResolutionTime.length > 0
      ? avgResolutionTime.reduce((sum, g) => {
          const diff = (g.resolvedAt!.getTime() - g.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          return sum + diff;
        }, 0) / avgResolutionTime.length
      : 0;

    res.json({
      success: true,
      data: {
        totalGrievances: total,
        overdue,
        averageResolutionDays: Math.round(avgDays * 10) / 10,
        byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
        byCategory: byCategory.map(c => ({ category: c.category, count: c._count })),
        byPriority: byPriority.map(p => ({ priority: p.priority, count: p._count })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch stats" });
  }
});

export { router as grievanceRouter };
