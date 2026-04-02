// ══════════════════════════════════════════════════════════════
// Asset Management Routes — Full lifecycle tracking
// ══════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ── GET /assets — List all assets ──
router.get("/", async (req: Request, res: Response) => {
  try {
    const { status, category, assignedTo, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (category) where.category = category;
    if (assignedTo) where.assignedTo = assignedTo;

    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.asset.count({ where }),
    ]);

    res.json({ success: true, data: assets, meta: { total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch assets" });
  }
});

// ── GET /assets/dashboard — Asset dashboard stats ──
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const [total, byCategory, byStatus, totalValue, pendingRequests] = await Promise.all([
      prisma.asset.count(),
      prisma.asset.groupBy({ by: ["category"], _count: true }),
      prisma.asset.groupBy({ by: ["status"], _count: true }),
      prisma.asset.aggregate({ _sum: { purchasePrice: true } }),
      prisma.assetRequest.count({ where: { status: "PENDING" } }),
    ]);

    const totalPurchase = totalValue._sum.purchasePrice || 0;

    res.json({
      success: true,
      data: {
        totalAssets: total,
        totalPurchaseValue: totalPurchase,
        pendingRequests,
        byCategory: byCategory.map(c => ({ category: c.category, count: c._count })),
        byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
        utilizationRate: total > 0
          ? ((byStatus.find(s => s.status === "ALLOCATED")?._count || 0) / total * 100).toFixed(1)
          : "0",
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch dashboard" });
  }
});

// ── GET /assets/:id — Asset detail ──
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const asset = await prisma.asset.findUnique({
      where: { id: req.params.id },
    });
    if (!asset) { res.status(404).json({ success: false, error: "Asset not found" }); return; }
    res.json({ success: true, data: asset });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch asset" });
  }
});

// ── POST /assets — Create asset ──
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      name, assetCode, serialNumber, category, status, purchaseDate,
      purchasePrice, warrantyExpiry, location,
      assignedTo, notes, model, brand, condition,
    } = req.body;

    if (!name || !assetCode || !category) {
      res.status(400).json({ success: false, error: "name, assetCode, category required" });
      return;
    }

    const asset = await prisma.asset.create({
      data: {
        name, assetCode, serialNumber, category, status: status || "AVAILABLE",
        purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
        purchasePrice: Number(purchasePrice) || 0,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
        location, assignedTo, notes, model, brand,
        condition: condition || "GOOD",
      },
    });

    res.status(201).json({ success: true, data: asset, message: `Asset ${assetCode} created` });
  } catch (error: any) {
    if (error.code === "P2002") {
      res.status(409).json({ success: false, error: "Asset code already exists" });
      return;
    }
    res.status(500).json({ success: false, error: "Failed to create asset" });
  }
});

// ── PUT /assets/:id — Update asset ──
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const {
      name, category, status, warrantyExpiry,
      location, assignedTo, notes, model, brand, condition,
    } = req.body;

    const asset = await prisma.asset.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(category && { category }),
        ...(status && { status }),
        ...(warrantyExpiry !== undefined && { warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null }),
        ...(location !== undefined && { location }),
        ...(assignedTo !== undefined && { assignedTo }),
        ...(notes !== undefined && { notes }),
        ...(model !== undefined && { model }),
        ...(brand !== undefined && { brand }),
        ...(condition && { condition }),
      },
    });

    res.json({ success: true, data: asset });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update asset" });
  }
});

// ── POST /assets/:id/assign — Assign asset to employee ──
router.post("/:id/assign", async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.body;
    const asset = await prisma.asset.update({
      where: { id: req.params.id },
      data: { assignedTo: employeeId, status: "ASSIGNED" },
    });

    await prisma.auditLog.create({
      data: {
        userId: (req as any).user?.userId || "system",
        action: "UPDATE",
        entity: "Asset",
        entityId: asset.id,
        newValue: { action: "ASSIGNED", assignedTo: employeeId },
      },
    });

    res.json({ success: true, data: asset, message: `Asset assigned to employee` });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to assign asset" });
  }
});

// ── POST /assets/:id/unassign — Remove assignment ──
router.post("/:id/unassign", async (req: Request, res: Response) => {
  try {
    const asset = await prisma.asset.update({
      where: { id: req.params.id },
      data: { assignedTo: null, status: "AVAILABLE" },
    });
    res.json({ success: true, data: asset, message: "Asset unassigned" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to unassign asset" });
  }
});

// ── POST /assets/:id/maintenance — Schedule maintenance ──
router.post("/:id/maintenance", async (req: Request, res: Response) => {
  try {
    const { scheduledDate, notes } = req.body;
    const asset = await prisma.asset.update({
      where: { id: req.params.id },
      data: {
        status: "MAINTENANCE",
        notes: notes ? `Maintenance scheduled: ${notes}` : undefined,
      },
    });
    res.json({ success: true, data: asset, message: "Maintenance scheduled" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to schedule maintenance" });
  }
});

// ── POST /assets/:id/dispose — Dispose asset ──
router.post("/:id/dispose", async (req: Request, res: Response) => {
  try {
    const { reason, disposalValue } = req.body;
    const asset = await prisma.asset.update({
      where: { id: req.params.id },
      data: {
        status: "DISPOSED",
        assignedTo: null,
        notes: `Disposed: ${reason || "N/A"}`,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: (req as any).user?.userId || "system",
        action: "UPDATE",
        entity: "Asset",
        entityId: asset.id,
        newValue: { action: "DISPOSED", reason, disposalValue },
      },
    });

    res.json({ success: true, data: asset, message: "Asset disposed" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to dispose asset" });
  }
});

// ── Auto-depreciation batch job ──
router.post("/auto-depreciate", async (_req: Request, res: Response) => {
  try {
    const assets = await prisma.asset.findMany({
      where: { status: { not: "DISPOSED" }, purchasePrice: { gt: 0 } },
    });

    let processed = 0;
    const results: { id: string; name: string; ageYears: number; depreciatedValue: number }[] = [];
    for (const asset of assets) {
      if (!asset.purchaseDate) continue;
      const ageYears = (Date.now() - new Date(asset.purchaseDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      // Straight-line depreciation: 20% per year (5 year useful life)
      const depreciationRate = 0.20;
      const depreciatedValue = Math.max(0, Number(asset.purchasePrice) * (1 - depreciationRate * ageYears));
      results.push({ id: asset.id, name: asset.name, ageYears: Math.round(ageYears * 10) / 10, depreciatedValue: Math.round(depreciatedValue * 100) / 100 });
      processed++;
    }

    res.json({ success: true, message: `Auto-depreciation calculated for ${processed} assets.`, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to run depreciation" });
  }
});

// ── Asset Requests ──
router.get("/requests/all", async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const where: any = {};
    if (status) where.status = status;

    const requests = await prisma.assetRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch asset requests" });
  }
});

router.post("/requests", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    const { assetCategory, justification } = req.body;
    const request = await prisma.assetRequest.create({
      data: {
        employeeId: employee.id,
        assetCategory,
        justification: justification || "",
        status: "PENDING",
      },
    });
    res.status(201).json({ success: true, data: request, message: "Asset request submitted" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to create request" });
  }
});

router.post("/requests/:id/approve", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const request = await prisma.assetRequest.update({
      where: { id: req.params.id },
      data: { status: "APPROVED", approvedBy: userId },
    });
    res.json({ success: true, data: request, message: "Asset request approved" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to approve" });
  }
});

router.post("/requests/:id/reject", async (req: Request, res: Response) => {
  try {
    const request = await prisma.assetRequest.update({
      where: { id: req.params.id },
      data: { status: "REJECTED" },
    });
    res.json({ success: true, data: request, message: "Asset request rejected" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to reject" });
  }
});

export { router as assetRouter };
