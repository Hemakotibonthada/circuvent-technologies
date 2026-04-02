// ══════════════════════════════════════════════════════════════
// Timesheet Routes — Weekly timesheets with project tracking
// ══════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ── GET /timesheets — List timesheets ──
router.get("/", async (req: Request, res: Response) => {
  try {
    const { employeeId, status, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;

    const [timesheets, total] = await Promise.all([
      prisma.timesheet.findMany({
        where,
        include: { entries: { orderBy: { date: "asc" } } },
        orderBy: { weekStart: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.timesheet.count({ where }),
    ]);

    res.json({ success: true, data: timesheets, meta: { total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch timesheets" });
  }
});

// ── GET /timesheets/my — My timesheets ──
router.get("/my", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    const timesheets = await prisma.timesheet.findMany({
      where: { employeeId: employee.id },
      include: { entries: { orderBy: { date: "asc" } } },
      orderBy: { weekStart: "desc" },
      take: 12,
    });
    res.json({ success: true, data: timesheets });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch your timesheets" });
  }
});

// ── GET /timesheets/current — Current week's timesheet ──
router.get("/current", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    // Calculate current week start (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    let timesheet = await prisma.timesheet.findFirst({
      where: { employeeId: employee.id, weekStart },
      include: { entries: { orderBy: { date: "asc" } } },
    });

    // Auto-create if not exists
    if (!timesheet) {
      timesheet = await prisma.timesheet.create({
        data: {
          employeeId: employee.id,
          weekStart,
          weekEnd,
          status: "DRAFT",
        },
        include: { entries: true },
      });
    }

    res.json({ success: true, data: timesheet });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch current timesheet" });
  }
});

// ── GET /timesheets/:id ──
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const timesheet = await prisma.timesheet.findUnique({
      where: { id: req.params.id },
      include: { entries: { orderBy: { date: "asc" } } },
    });
    if (!timesheet) { res.status(404).json({ success: false, error: "Timesheet not found" }); return; }
    res.json({ success: true, data: timesheet });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch timesheet" });
  }
});

// ── POST /timesheets — Create timesheet ──
router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    const { weekStart, entries } = req.body;
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const timesheet = await prisma.timesheet.create({
      data: {
        employeeId: employee.id,
        weekStart: start,
        weekEnd: end,
        entries: entries ? {
          create: entries.map((e: any) => ({
            projectId: e.projectId,
            taskId: e.taskId,
            date: new Date(e.date),
            hours: Number(e.hours),
            description: e.description,
            category: e.category || "DEVELOPMENT",
            billable: e.billable !== false,
          })),
        } : undefined,
      },
      include: { entries: true },
    });

    // Auto-calculate total
    const totalHours = timesheet.entries.reduce((sum, e) => sum + e.hours, 0);
    if (totalHours > 0) {
      await prisma.timesheet.update({ where: { id: timesheet.id }, data: { totalHours } });
    }

    res.status(201).json({ success: true, data: { ...timesheet, totalHours } });
  } catch (error: any) {
    if (error.code === "P2002") {
      res.status(409).json({ success: false, error: "Timesheet already exists for this week" });
      return;
    }
    res.status(500).json({ success: false, error: "Failed to create timesheet" });
  }
});

// ── POST /timesheets/:id/entries — Add entry ──
router.post("/:id/entries", async (req: Request, res: Response) => {
  try {
    const { projectId, taskId, date, hours, description, category, billable } = req.body;
    const entry = await prisma.timesheetEntry.create({
      data: {
        timesheetId: req.params.id,
        projectId, taskId,
        date: new Date(date),
        hours: Number(hours),
        description,
        category: category || "DEVELOPMENT",
        billable: billable !== false,
      },
    });

    // Auto-recalculate total
    const total = await prisma.timesheetEntry.aggregate({
      where: { timesheetId: req.params.id },
      _sum: { hours: true },
    });
    await prisma.timesheet.update({
      where: { id: req.params.id },
      data: { totalHours: total._sum.hours || 0 },
    });

    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to add entry" });
  }
});

// ── PUT /timesheets/:id/entries/:entryId — Update entry ──
router.put("/:id/entries/:entryId", async (req: Request, res: Response) => {
  try {
    const { hours, description, category, billable, projectId } = req.body;
    const entry = await prisma.timesheetEntry.update({
      where: { id: req.params.entryId },
      data: {
        ...(hours !== undefined && { hours: Number(hours) }),
        ...(description !== undefined && { description }),
        ...(category && { category }),
        ...(billable !== undefined && { billable }),
        ...(projectId !== undefined && { projectId }),
      },
    });

    // Recalculate total
    const total = await prisma.timesheetEntry.aggregate({
      where: { timesheetId: req.params.id },
      _sum: { hours: true },
    });
    await prisma.timesheet.update({
      where: { id: req.params.id },
      data: { totalHours: total._sum.hours || 0 },
    });

    res.json({ success: true, data: entry });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update entry" });
  }
});

// ── DELETE /timesheets/:id/entries/:entryId ──
router.delete("/:id/entries/:entryId", async (req: Request, res: Response) => {
  try {
    await prisma.timesheetEntry.delete({ where: { id: req.params.entryId } });

    // Recalculate total
    const total = await prisma.timesheetEntry.aggregate({
      where: { timesheetId: req.params.id },
      _sum: { hours: true },
    });
    await prisma.timesheet.update({
      where: { id: req.params.id },
      data: { totalHours: total._sum.hours || 0 },
    });

    res.json({ success: true, message: "Entry deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to delete entry" });
  }
});

// ── POST /timesheets/:id/submit — Submit for approval ──
router.post("/:id/submit", async (req: Request, res: Response) => {
  try {
    const timesheet = await prisma.timesheet.findUnique({
      where: { id: req.params.id },
      include: { entries: true },
    });

    if (!timesheet) { res.status(404).json({ success: false, error: "Timesheet not found" }); return; }
    if (timesheet.entries.length === 0) {
      res.status(400).json({ success: false, error: "Cannot submit empty timesheet" });
      return;
    }

    // Auto-approve if total hours are within normal range (35-45 hours)
    const totalHours = timesheet.entries.reduce((sum, e) => sum + e.hours, 0);
    const autoApprove = totalHours >= 35 && totalHours <= 45;

    const updated = await prisma.timesheet.update({
      where: { id: req.params.id },
      data: {
        status: autoApprove ? "APPROVED" : "SUBMITTED",
        totalHours,
        ...(autoApprove && { approvedBy: "SYSTEM_AUTO", approvedAt: new Date(), comments: "Auto-approved (normal hours)" }),
      },
    });

    res.json({
      success: true,
      data: updated,
      message: autoApprove
        ? `Timesheet auto-approved (${totalHours}h — within normal range)`
        : "Timesheet submitted for review",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to submit timesheet" });
  }
});

// ── POST /timesheets/:id/approve — Approve timesheet ──
router.post("/:id/approve", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const updated = await prisma.timesheet.update({
      where: { id: req.params.id },
      data: { status: "APPROVED", approvedBy: userId, approvedAt: new Date(), comments: req.body.comments },
    });
    res.json({ success: true, data: updated, message: "Timesheet approved" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to approve" });
  }
});

// ── POST /timesheets/:id/reject — Reject timesheet ──
router.post("/:id/reject", async (req: Request, res: Response) => {
  try {
    const updated = await prisma.timesheet.update({
      where: { id: req.params.id },
      data: { status: "REJECTED", comments: req.body.reason || "Rejected" },
    });
    res.json({ success: true, data: updated, message: "Timesheet rejected" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to reject" });
  }
});

// ── GET /timesheets/reports/summary — Timesheet analytics ──
router.get("/reports/summary", async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year) || new Date().getFullYear();
    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0);

    const [totalSubmitted, totalApproved, avgHours, byCategory, topProjects] = await Promise.all([
      prisma.timesheet.count({ where: { status: "SUBMITTED", weekStart: { gte: startDate, lte: endDate } } }),
      prisma.timesheet.count({ where: { status: "APPROVED", weekStart: { gte: startDate, lte: endDate } } }),
      prisma.timesheet.aggregate({
        where: { weekStart: { gte: startDate, lte: endDate } },
        _avg: { totalHours: true },
      }),
      prisma.timesheetEntry.groupBy({
        by: ["category"],
        where: { date: { gte: startDate, lte: endDate } },
        _sum: { hours: true },
      }),
      prisma.timesheetEntry.groupBy({
        by: ["projectId"],
        where: { date: { gte: startDate, lte: endDate }, projectId: { not: null } },
        _sum: { hours: true },
        orderBy: { _sum: { hours: "desc" } },
        take: 10,
      }),
    ]);

    const billableHours = await prisma.timesheetEntry.aggregate({
      where: { date: { gte: startDate, lte: endDate }, billable: true },
      _sum: { hours: true },
    });
    const totalEntryHours = await prisma.timesheetEntry.aggregate({
      where: { date: { gte: startDate, lte: endDate } },
      _sum: { hours: true },
    });

    res.json({
      success: true,
      data: {
        month: m, year: y,
        totalSubmitted, totalApproved,
        averageWeeklyHours: Math.round((avgHours._avg.totalHours || 0) * 10) / 10,
        billableRate: totalEntryHours._sum.hours
          ? ((billableHours._sum.hours || 0) / totalEntryHours._sum.hours * 100).toFixed(1)
          : "0",
        byCategory: byCategory.map(c => ({ category: c.category, hours: c._sum.hours || 0 })),
        topProjects: topProjects.map(p => ({ projectId: p.projectId, hours: p._sum.hours || 0 })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to generate report" });
  }
});

export { router as timesheetRouter };
