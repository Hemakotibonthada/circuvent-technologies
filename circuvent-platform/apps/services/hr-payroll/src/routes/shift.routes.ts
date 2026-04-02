// ══════════════════════════════════════════════════════════════
// Shift Management Routes — Scheduling, swap, patterns
// ══════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ── Shift Definitions ──────────────────────────────────────

// GET /shifts/definitions — List all shift definitions
router.get("/definitions", async (_req: Request, res: Response) => {
  try {
    const shifts = await prisma.shiftDefinition.findMany({
      orderBy: { startTime: "asc" },
    });
    res.json({ success: true, data: shifts });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch shift definitions" });
  }
});

// POST /shifts/definitions — Create shift definition
router.post("/definitions", async (req: Request, res: Response) => {
  try {
    const { name, startTime, endTime, breakMinutes, color, isActive } = req.body;
    if (!name || !startTime || !endTime) {
      res.status(400).json({ success: false, error: "name, startTime, endTime required" });
      return;
    }
    const shift = await prisma.shiftDefinition.create({
      data: { name, startTime, endTime, breakMinutes: breakMinutes || 60, color, isActive: isActive !== false },
    });
    res.status(201).json({ success: true, data: shift });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to create shift definition" });
  }
});

// PUT /shifts/definitions/:id — Update shift definition
router.put("/definitions/:id", async (req: Request, res: Response) => {
  try {
    const { name, startTime, endTime, breakMinutes, color, isActive } = req.body;
    const shift = await prisma.shiftDefinition.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(startTime && { startTime }),
        ...(endTime && { endTime }),
        ...(breakMinutes !== undefined && { breakMinutes }),
        ...(color !== undefined && { color }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json({ success: true, data: shift });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update shift definition" });
  }
});

// DELETE /shifts/definitions/:id
router.delete("/definitions/:id", async (req: Request, res: Response) => {
  try {
    await prisma.shiftDefinition.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Shift definition deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to delete shift definition" });
  }
});

// ── Schedule Management ────────────────────────────────────

// GET /shifts/schedules — List schedules with filters
router.get("/schedules", async (req: Request, res: Response) => {
  try {
    const { employeeId, shiftId, startDate, endDate, status } = req.query;
    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (shiftId) where.shiftId = shiftId;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }

    const schedules = await prisma.shiftSchedule.findMany({
      where,
      include: { shift: true },
      orderBy: { date: "asc" },
    });
    res.json({ success: true, data: schedules });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch schedules" });
  }
});

// GET /shifts/schedules/my — My schedules
router.get("/schedules/my", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    const from = req.query.from ? new Date(req.query.from as string) : new Date();
    const to = req.query.to ? new Date(req.query.to as string) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const schedules = await prisma.shiftSchedule.findMany({
      where: { employeeId: employee.id, date: { gte: from, lte: to } },
      include: { shift: true },
      orderBy: { date: "asc" },
    });
    res.json({ success: true, data: schedules });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch your schedules" });
  }
});

// POST /shifts/schedules — Create schedule (single)
router.post("/schedules", async (req: Request, res: Response) => {
  try {
    const { employeeId, shiftId, date, notes } = req.body;
    const schedule = await prisma.shiftSchedule.create({
      data: {
        employeeId, shiftId,
        date: new Date(date),
        notes,
      },
      include: { shift: true },
    });
    res.status(201).json({ success: true, data: schedule });
  } catch (error: any) {
    if (error.code === "P2002") {
      res.status(409).json({ success: false, error: "Employee already has a shift for this date" });
      return;
    }
    res.status(500).json({ success: false, error: "Failed to create schedule" });
  }
});

// POST /shifts/schedules/bulk — Bulk create schedules
router.post("/schedules/bulk", async (req: Request, res: Response) => {
  try {
    const { schedules } = req.body; // [{employeeId, shiftId, date}]
    if (!Array.isArray(schedules) || schedules.length === 0) {
      res.status(400).json({ success: false, error: "schedules array required" });
      return;
    }

    let created = 0;
    let skipped = 0;
    for (const s of schedules) {
      try {
        await prisma.shiftSchedule.create({
          data: {
            employeeId: s.employeeId,
            shiftId: s.shiftId,
            date: new Date(s.date),
          },
        });
        created++;
      } catch {
        skipped++; // Likely duplicate
      }
    }

    res.status(201).json({
      success: true,
      message: `Created ${created} schedules, skipped ${skipped} (duplicates)`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to bulk create schedules" });
  }
});

// POST /shifts/schedules/auto-generate — Auto-generate weekly schedules
router.post("/schedules/auto-generate", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, department, shiftPattern } = req.body;
    // shiftPattern: [{dayOfWeek: 0-6, shiftId: string}]

    if (!startDate || !endDate || !shiftPattern) {
      res.status(400).json({ success: false, error: "startDate, endDate, shiftPattern required" });
      return;
    }

    // Get all employees in department
    const whereEmployee: any = {};
    if (department) whereEmployee.department = department;
    const employees = await prisma.employee.findMany({ where: whereEmployee, select: { id: true } });

    const start = new Date(startDate);
    const end = new Date(endDate);
    let created = 0;

    for (const emp of employees) {
      const current = new Date(start);
      while (current <= end) {
        const dayOfWeek = current.getDay();
        const patternMatch = shiftPattern.find((p: any) => p.dayOfWeek === dayOfWeek);
        if (patternMatch) {
          try {
            await prisma.shiftSchedule.create({
              data: {
                employeeId: emp.id,
                shiftId: patternMatch.shiftId,
                date: new Date(current),
              },
            });
            created++;
          } catch { /* skip duplicates */ }
        }
        current.setDate(current.getDate() + 1);
      }
    }

    res.status(201).json({
      success: true,
      message: `Auto-generated ${created} schedules for ${employees.length} employees`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to auto-generate schedules" });
  }
});

// ── Check In / Check Out ───────────────────────────────────

// POST /shifts/checkin — Clock in for scheduled shift
router.post("/checkin", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const schedule = await prisma.shiftSchedule.findFirst({
      where: { employeeId: employee.id, date: today, status: "SCHEDULED" },
      include: { shift: true },
    });

    if (!schedule) {
      res.status(404).json({ success: false, error: "No scheduled shift found for today" });
      return;
    }

    const updated = await prisma.shiftSchedule.update({
      where: { id: schedule.id },
      data: { status: "CHECKED_IN" },
      include: { shift: true },
    });

    // Auto-clock attendance
    await prisma.attendanceLog.create({
      data: {
        employeeId: employee.id,
        date: today,
        checkIn: new Date(),
        status: "PRESENT",
      },
    });

    res.json({ success: true, data: updated, message: `Checked in for ${schedule.shift.name}` });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to check in" });
  }
});

// POST /shifts/checkout — Clock out
router.post("/checkout", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const schedule = await prisma.shiftSchedule.findFirst({
      where: { employeeId: employee.id, date: today, status: "CHECKED_IN" },
    });

    if (!schedule) {
      res.status(404).json({ success: false, error: "No active check-in found" });
      return;
    }

    const updated = await prisma.shiftSchedule.update({
      where: { id: schedule.id },
      data: { status: "COMPLETED" },
    });

    // Auto-update attendance
    const attendance = await prisma.attendanceLog.findFirst({
      where: { employeeId: employee.id, date: today },
    });
    if (attendance) {
      const clockOut = new Date();
      const hours = (clockOut.getTime() - attendance.checkIn!.getTime()) / (1000 * 60 * 60);
      await prisma.attendanceLog.update({
        where: { id: attendance.id },
        data: { checkOut: clockOut, totalHours: Math.round(hours * 100) / 100 },
      });
    }

    res.json({ success: true, data: updated, message: "Checked out successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to check out" });
  }
});

// ── Shift Swap ─────────────────────────────────────────────

// POST /shifts/swap-request — Request shift swap
router.post("/swap-request", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    const { scheduleId, targetEmployeeId } = req.body;
    const schedule = await prisma.shiftSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule || schedule.employeeId !== employee.id) {
      res.status(400).json({ success: false, error: "Invalid schedule for swap" });
      return;
    }

    const updated = await prisma.shiftSchedule.update({
      where: { id: scheduleId },
      data: { status: "SWAPPED", swapRequestedWith: targetEmployeeId },
    });

    res.json({ success: true, data: updated, message: "Swap request submitted" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to request swap" });
  }
});

// ── Dashboard ──────────────────────────────────────────────

router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const [totalDefs, todayScheduled, todayCheckedIn, weekSchedules, byShift] = await Promise.all([
      prisma.shiftDefinition.count({ where: { isActive: true } }),
      prisma.shiftSchedule.count({ where: { date: today } }),
      prisma.shiftSchedule.count({ where: { date: today, status: "CHECKED_IN" } }),
      prisma.shiftSchedule.count({ where: { date: { gte: today, lte: weekEnd } } }),
      prisma.shiftSchedule.groupBy({
        by: ["shiftId"],
        where: { date: today },
        _count: true,
      }),
    ]);

    const shiftDefs = await prisma.shiftDefinition.findMany();
    const shiftMap = new Map(shiftDefs.map(s => [s.id, s.name]));

    res.json({
      success: true,
      data: {
        activeShiftDefinitions: totalDefs,
        todayScheduled,
        todayCheckedIn,
        todayAbsent: todayScheduled - todayCheckedIn,
        weekAheadSchedules: weekSchedules,
        todayByShift: byShift.map(s => ({
          shiftName: shiftMap.get(s.shiftId) || s.shiftId,
          count: s._count,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch dashboard" });
  }
});

export { router as shiftRouter };
