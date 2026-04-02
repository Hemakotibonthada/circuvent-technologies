// ══════════════════════════════════════════════════════════════
// Travel Management Routes — Complete CRUD + automation
// ══════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ── GET /travel/requests — List travel requests ──
router.get("/requests", async (req: Request, res: Response) => {
  try {
    const { status, employeeId, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;

    const [requests, total] = await Promise.all([
      prisma.travelRequest.findMany({
        where,
        include: {
          itineraries: { orderBy: { sortOrder: "asc" } },
          travelExpenses: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.travelRequest.count({ where }),
    ]);

    res.json({ success: true, data: requests, meta: { total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch travel requests" });
  }
});

// ── GET /travel/requests/my — My travel requests ──
router.get("/requests/my", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    const requests = await prisma.travelRequest.findMany({
      where: { employeeId: employee.id },
      include: { itineraries: { orderBy: { sortOrder: "asc" } }, travelExpenses: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch your travel requests" });
  }
});

// ── GET /travel/requests/:id — Travel request detail ──
router.get("/requests/:id", async (req: Request, res: Response) => {
  try {
    const request = await prisma.travelRequest.findUnique({
      where: { id: req.params.id },
      include: { itineraries: { orderBy: { sortOrder: "asc" } }, travelExpenses: true },
    });
    if (!request) { res.status(404).json({ success: false, error: "Travel request not found" }); return; }
    res.json({ success: true, data: request });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch travel request" });
  }
});

// ── POST /travel/requests — Create travel request ──
router.post("/requests", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    const { purpose, destination, departureDate, returnDate, estimatedBudget, notes, itineraries } = req.body;
    if (!purpose || !destination || !departureDate || !returnDate) {
      res.status(400).json({ success: false, error: "purpose, destination, departureDate, returnDate are required" });
      return;
    }

    // Auto-validate against travel policy
    const policy = await prisma.travelPolicy.findFirst({ where: { isActive: true } });
    let autoApproved = false;
    if (policy && Number(estimatedBudget) < policy.approvalThreshold) {
      autoApproved = true;
    }

    const request = await prisma.travelRequest.create({
      data: {
        employeeId: employee.id,
        purpose,
        destination,
        departureDate: new Date(departureDate),
        returnDate: new Date(returnDate),
        estimatedBudget: Number(estimatedBudget) || 0,
        notes,
        status: autoApproved ? "APPROVED" : "SUBMITTED",
        approvedBy: autoApproved ? "SYSTEM_AUTO" : undefined,
        approvedAt: autoApproved ? new Date() : undefined,
        itineraries: itineraries ? {
          create: itineraries.map((it: any, idx: number) => ({
            segmentType: it.segmentType,
            fromLocation: it.fromLocation,
            toLocation: it.toLocation,
            departureTime: new Date(it.departureTime),
            arrivalTime: it.arrivalTime ? new Date(it.arrivalTime) : null,
            carrier: it.carrier,
            bookingRef: it.bookingRef,
            cost: Number(it.cost) || 0,
            notes: it.notes,
            sortOrder: idx,
          }))
        } : undefined,
      },
      include: { itineraries: true },
    });

    res.status(201).json({
      success: true,
      data: request,
      message: autoApproved ? "Travel request auto-approved (under policy threshold)" : "Travel request submitted for approval",
    });
  } catch (error) {
    console.error("[TRAVEL] Create error:", error);
    res.status(500).json({ success: false, error: "Failed to create travel request" });
  }
});

// ── PATCH /travel/requests/:id — Update travel request ──
router.patch("/requests/:id", async (req: Request, res: Response) => {
  try {
    const { purpose, destination, departureDate, returnDate, estimatedBudget, notes, status } = req.body;
    const request = await prisma.travelRequest.update({
      where: { id: req.params.id },
      data: {
        ...(purpose && { purpose }),
        ...(destination && { destination }),
        ...(departureDate && { departureDate: new Date(departureDate) }),
        ...(returnDate && { returnDate: new Date(returnDate) }),
        ...(estimatedBudget !== undefined && { estimatedBudget: Number(estimatedBudget) }),
        ...(notes !== undefined && { notes }),
        ...(status && { status }),
      },
    });
    res.json({ success: true, data: request });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update travel request" });
  }
});

// ── POST /travel/requests/:id/approve — Approve travel request ──
router.post("/requests/:id/approve", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const request = await prisma.travelRequest.update({
      where: { id: req.params.id },
      data: { status: "APPROVED", approvedBy: userId, approvedAt: new Date() },
    });
    res.json({ success: true, data: request, message: "Travel request approved" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to approve" });
  }
});

// ── POST /travel/requests/:id/reject — Reject travel request ──
router.post("/requests/:id/reject", async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const request = await prisma.travelRequest.update({
      where: { id: req.params.id },
      data: { status: "REJECTED", rejectionReason: reason },
    });
    res.json({ success: true, data: request, message: "Travel request rejected" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to reject" });
  }
});

// ── DELETE /travel/requests/:id — Cancel travel request ──
router.delete("/requests/:id", async (req: Request, res: Response) => {
  try {
    await prisma.travelRequest.update({
      where: { id: req.params.id },
      data: { status: "CANCELLED" },
    });
    res.json({ success: true, message: "Travel request cancelled" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to cancel" });
  }
});

// ── Itinerary CRUD ──
router.post("/requests/:id/itineraries", async (req: Request, res: Response) => {
  try {
    const { segmentType, fromLocation, toLocation, departureTime, arrivalTime, carrier, bookingRef, cost, notes } = req.body;
    const count = await prisma.travelItinerary.count({ where: { travelRequestId: req.params.id } });
    const itinerary = await prisma.travelItinerary.create({
      data: {
        travelRequestId: req.params.id,
        segmentType, fromLocation, toLocation: toLocation || null,
        departureTime: new Date(departureTime),
        arrivalTime: arrivalTime ? new Date(arrivalTime) : null,
        carrier, bookingRef, cost: Number(cost) || 0, notes,
        sortOrder: count,
      },
    });
    res.status(201).json({ success: true, data: itinerary });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to add itinerary" });
  }
});

router.delete("/itineraries/:id", async (req: Request, res: Response) => {
  try {
    await prisma.travelItinerary.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Itinerary segment removed" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to delete itinerary" });
  }
});

// ── Travel Expenses ──
router.post("/requests/:id/expenses", async (req: Request, res: Response) => {
  try {
    const { category, description, amount, currency, receiptUrl, date } = req.body;
    const expense = await prisma.travelExpense.create({
      data: {
        travelRequestId: req.params.id,
        category, description, amount: Number(amount),
        currency: currency || "INR", receiptUrl, date: new Date(date),
      },
    });

    // Auto-update actual cost on travel request
    const totalExpenses = await prisma.travelExpense.aggregate({
      where: { travelRequestId: req.params.id },
      _sum: { amount: true },
    });
    await prisma.travelRequest.update({
      where: { id: req.params.id },
      data: { actualCost: totalExpenses._sum.amount || 0 },
    });

    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to add travel expense" });
  }
});

// ── Travel Policies ──
router.get("/policies", async (_req: Request, res: Response) => {
  try {
    const policies = await prisma.travelPolicy.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ success: true, data: policies });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch policies" });
  }
});

router.post("/policies", async (req: Request, res: Response) => {
  try {
    const { name, maxDailyAllowance, maxHotelRate, maxFlightClass, requiresApproval, approvalThreshold } = req.body;
    const policy = await prisma.travelPolicy.create({
      data: {
        name, maxDailyAllowance: Number(maxDailyAllowance), maxHotelRate: Number(maxHotelRate),
        maxFlightClass: maxFlightClass || "ECONOMY", requiresApproval: requiresApproval !== false,
        approvalThreshold: Number(approvalThreshold) || 10000,
      },
    });
    res.status(201).json({ success: true, data: policy });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to create policy" });
  }
});

// ── Dashboard Stats ──
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const [total, byStatus, totalBudget, thisMonth] = await Promise.all([
      prisma.travelRequest.count(),
      prisma.travelRequest.groupBy({ by: ["status"], _count: true }),
      prisma.travelRequest.aggregate({ _sum: { estimatedBudget: true, actualCost: true } }),
      prisma.travelRequest.count({
        where: { createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalRequests: total,
        thisMonthRequests: thisMonth,
        byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
        totalEstimatedBudget: totalBudget._sum.estimatedBudget || 0,
        totalActualCost: totalBudget._sum.actualCost || 0,
        budgetUtilization: totalBudget._sum.estimatedBudget
          ? ((totalBudget._sum.actualCost || 0) / totalBudget._sum.estimatedBudget * 100).toFixed(1)
          : 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch dashboard" });
  }
});

export { router as travelRouter };
