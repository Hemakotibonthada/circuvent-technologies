// ──────────────────────────────────────────────────────────────
// Employee Portal — Attendance & Time Tracking Routes
// Clock in/out, daily logs, monthly summary, overtime
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

// ── POST / — Clock In ──
router.post("/clock-in", async (req: Request, res: Response) => {
  try {
    let { employeeId, location, notes } = req.body;

    // If no employeeId provided, try to find employee by userId from JWT
    if (!employeeId) {
      const userId = (req as any).user?.userId || req.body.userId;
      if (userId) {
        const emp = await prisma.employee.findUnique({ where: { userId } });
        if (emp) employeeId = emp.id;
      }
    }

    if (!employeeId) {
      res.status(400).json(errorResponse("Employee record not found. Please contact HR to complete your onboarding."));
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.attendanceLog.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });

    if (existing?.checkIn) {
      res.status(400).json(errorResponse("Already clocked in today"));
      return;
    }

    const log = await prisma.attendanceLog.upsert({
      where: { employeeId_date: { employeeId, date: today } },
      update: { checkIn: new Date(), location, notes, status: "PRESENT", ipAddress: req.ip },
      create: {
        employeeId, date: today, checkIn: new Date(),
        status: "PRESENT", location, notes, ipAddress: req.ip,
      },
    });
    res.status(201).json(successResponse(log, "Clocked in successfully"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── POST /clock-out — Clock Out ──
router.post("/clock-out", async (req: Request, res: Response) => {
  try {
    let { employeeId } = req.body;

    if (!employeeId) {
      const userId = (req as any).user?.userId || req.body.userId;
      if (userId) {
        const emp = await prisma.employee.findUnique({ where: { userId } });
        if (emp) employeeId = emp.id;
      }
    }

    if (!employeeId) {
      res.status(400).json(errorResponse("Employee record not found."));
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const log = await prisma.attendanceLog.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });

    if (!log || !log.checkIn) {
      res.status(400).json(errorResponse("Not clocked in today"));
      return;
    }
    if (log.checkOut) {
      res.status(400).json(errorResponse("Already clocked out today"));
      return;
    }

    const checkOut = new Date();
    const diffMs = checkOut.getTime() - log.checkIn.getTime();
    const totalHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
    const overtimeHours = Math.max(0, Number((totalHours - 8).toFixed(2)));

    const updated = await prisma.attendanceLog.update({
      where: { id: log.id },
      data: { checkOut, totalHours, overtimeHours, status: totalHours < 4 ? "HALF_DAY" : "PRESENT" },
    });
    res.json(successResponse(updated, `Clocked out. Total: ${totalHours}h`));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /today/:employeeId — Today's status ──
router.get("/today/:employeeId", async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const log = await prisma.attendanceLog.findUnique({
      where: { employeeId_date: { employeeId: req.params.employeeId, date: today } },
    });
    res.json(successResponse(log || { status: "NOT_CLOCKED_IN" }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /history/:employeeId — Attendance history ──
router.get("/history/:employeeId", async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = Number(month) || now.getMonth() + 1;
    const y = Number(year) || now.getFullYear();
    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0, 23, 59, 59);

    const logs = await prisma.attendanceLog.findMany({
      where: { employeeId: req.params.employeeId, date: { gte: startDate, lte: endDate } },
      orderBy: { date: "asc" },
    });
    res.json(successResponse(logs));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /summary/:employeeId — Monthly summary ──
router.get("/summary/:employeeId", async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = Number(month) || now.getMonth() + 1;
    const y = Number(year) || now.getFullYear();
    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0, 23, 59, 59);

    const logs = await prisma.attendanceLog.findMany({
      where: { employeeId: req.params.employeeId, date: { gte: startDate, lte: endDate } },
    });

    const summary = {
      month: m, year: y,
      totalDays: new Date(y, m, 0).getDate(),
      present: logs.filter(l => l.status === "PRESENT").length,
      halfDay: logs.filter(l => l.status === "HALF_DAY").length,
      wfh: logs.filter(l => l.status === "WORK_FROM_HOME").length,
      absent: logs.filter(l => l.status === "ABSENT").length,
      onLeave: logs.filter(l => l.status === "ON_LEAVE").length,
      holiday: logs.filter(l => l.status === "HOLIDAY").length,
      totalHours: logs.reduce((sum, l) => sum + Number(l.totalHours || 0), 0),
      overtimeHours: logs.reduce((sum, l) => sum + Number(l.overtimeHours || 0), 0),
      avgHoursPerDay: logs.length > 0
        ? Number((logs.reduce((sum, l) => sum + Number(l.totalHours || 0), 0) / logs.filter(l => l.totalHours).length).toFixed(2))
        : 0,
    };
    res.json(successResponse(summary));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /team — Team attendance for today ──
router.get("/team", async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const logs = await prisma.attendanceLog.findMany({
      where: { date: today },
      include: { employee: { include: { user: { select: { firstName: true, lastName: true, email: true } } } } },
      orderBy: { checkIn: "asc" },
    });
    const totalEmployees = await prisma.employee.count({ where: { dateOfLeaving: null } });
    res.json(successResponse({
      date: today,
      totalEmployees,
      clockedIn: logs.filter(l => l.checkIn).length,
      clockedOut: logs.filter(l => l.checkOut).length,
      wfh: logs.filter(l => l.status === "WORK_FROM_HOME").length,
      logs,
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

export { router as attendanceRouter };
