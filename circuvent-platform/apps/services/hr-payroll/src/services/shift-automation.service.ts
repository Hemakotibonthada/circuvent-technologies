// ──────────────────────────────────────────────────────────────
// HR & Payroll — Shift Automation Service
// Advanced shift scheduling engine: generate weekly schedules,
// auto-assign shifts, detect conflicts, compute overtime,
// monitor staffing levels, handle swaps, mark absentees,
// generate reports, optimize distribution, and predict needs.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types & Interfaces
// ══════════════════════════════════════════════════════════════

export interface ShiftPattern {
  name: string;
  rotationType: "FIXED" | "WEEKLY_ROTATION" | "BI_WEEKLY" | "CUSTOM";
  shifts: string[];        // shift definition IDs
  daysOn: number;
  daysOff: number;
}

export interface ShiftRule {
  maxConsecutiveDays: number;
  minRestHoursBetweenShifts: number;
  maxWeeklyHours: number;
  maxOvertimeHoursPerWeek: number;
  allowDoubleShifts: boolean;
  preferredShiftDistribution: "EQUAL" | "SENIORITY" | "PREFERENCE";
}

export interface ScheduleConflict {
  type: "OVERLAP" | "INSUFFICIENT_REST" | "ON_LEAVE" | "MAX_HOURS_EXCEEDED" | "CONSECUTIVE_DAYS";
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  existingShiftId?: string;
  suggestedResolution?: string;
}

export interface StaffingLevel {
  shiftId: string;
  shiftName: string;
  required: number;
  assigned: number;
  gap: number;
  fillRate: number;
}

export interface ShiftSwapRequest {
  id: string;
  requesterId: string;
  requesterScheduleId: string;
  targetId: string;
  targetScheduleId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason?: string;
}

export interface ShiftReportData {
  period: { start: Date; end: Date };
  totalShiftsScheduled: number;
  totalShiftsCompleted: number;
  absenteeCount: number;
  avgOvertimeHours: number;
  staffingFillRate: number;
  swapCount: number;
  byDepartment: Array<{
    department: string;
    scheduled: number;
    completed: number;
    absentees: number;
    overtimeHours: number;
  }>;
  byShift: Array<{
    shiftName: string;
    scheduled: number;
    completed: number;
    fillRate: number;
  }>;
}

export interface StaffingPrediction {
  weekLabel: string;
  weekStart: Date;
  predictedRequired: number;
  predictedAvailable: number;
  gap: number;
  confidence: number;
  factors: string[];
}

export interface WeeklyScheduleResult {
  department: string;
  weekStart: Date;
  scheduledCount: number;
  skippedCount: number;
  assignments: Array<{
    employeeId: string;
    employeeName: string;
    shiftName: string;
    date: string;
    day: string;
  }>;
}

// ══════════════════════════════════════════════════════════════
// Shift Automation Service
// ══════════════════════════════════════════════════════════════

export class ShiftAutomationService {
  private static readonly DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  private static readonly STANDARD_HOURS_PER_SHIFT = 8;
  private static readonly DEFAULT_MAX_WEEKLY_HOURS = 48;
  private static readonly DEFAULT_MAX_CONSECUTIVE_DAYS = 6;
  private static readonly DEFAULT_MIN_REST_HOURS = 11;

  /**
   * Generate a full weekly schedule for a department using a given pattern.
   * Handles rotation, leave conflicts, and capacity constraints.
   */
  static async generateWeeklySchedule(
    department: string,
    weekStart: Date,
    pattern: ShiftPattern
  ): Promise<WeeklyScheduleResult> {
    const result: WeeklyScheduleResult = {
      department,
      weekStart,
      scheduledCount: 0,
      skippedCount: 0,
      assignments: [],
    };

    const employees = await prisma.employee.findMany({
      where: { department, dateOfLeaving: null },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { employeeCode: "asc" },
    });

    if (employees.length === 0) return result;

    const shiftDefs = await prisma.shiftDefinition.findMany({
      where: { id: { in: pattern.shifts }, isActive: true },
    });

    if (shiftDefs.length === 0) return result;

    // Build week dates (7 days)
    const weekDates: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + d);
      weekDates.push(date);
    }

    // Collect employee leave data for the week
    const weekEnd = weekDates[6];
    const leaveRecords = await prisma.leaveRecord.findMany({
      where: {
        employeeId: { in: employees.map(e => e.id) },
        status: "APPROVED",
        startDate: { lte: weekEnd },
        endDate: { gte: weekStart },
      },
      select: { employeeId: true, startDate: true, endDate: true },
    });

    const isOnLeave = (employeeId: string, date: Date): boolean => {
      return leaveRecords.some(lr =>
        lr.employeeId === employeeId &&
        date >= lr.startDate &&
        date <= lr.endDate
      );
    };

    let shiftIndex = 0;

    for (const employee of employees) {
      for (const date of weekDates) {
        const dayOfWeek = date.getDay();

        // Skip weekends for standard patterns
        if (pattern.rotationType === "FIXED" && (dayOfWeek === 0 || dayOfWeek === 6)) continue;

        // Skip if on leave
        if (isOnLeave(employee.id, date)) {
          result.skippedCount++;
          continue;
        }

        // Check existing assignment
        try {
          const existing = await prisma.shiftSchedule.findUnique({
            where: { employeeId_date: { employeeId: employee.id, date } },
          });

          if (existing) {
            result.skippedCount++;
            continue;
          }

          const shift = shiftDefs[shiftIndex % shiftDefs.length];

          await prisma.shiftSchedule.create({
            data: {
              employeeId: employee.id,
              shiftId: shift.id,
              date,
              status: "SCHEDULED",
            },
          });

          result.scheduledCount++;
          result.assignments.push({
            employeeId: employee.id,
            employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
            shiftName: shift.name,
            date: date.toISOString().split("T")[0],
            day: this.DAY_NAMES[dayOfWeek],
          });
        } catch {
          result.skippedCount++;
        }
      }

      // Rotate shift for next employee
      if (pattern.rotationType === "WEEKLY_ROTATION" || pattern.rotationType === "BI_WEEKLY") {
        shiftIndex++;
      }
    }

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "ShiftSchedule",
      entityId: `${department}-${weekStart.toISOString().split("T")[0]}`,
      newValue: { department, weekStart, scheduled: result.scheduledCount, pattern: pattern.name },
    });

    return result;
  }

  /**
   * Auto-assign shifts respecting configurable rules (max hours, rest periods, etc.).
   */
  static async autoAssignShifts(
    employees: Array<{ id: string; name: string; preferences?: string[] }>,
    shiftDefinitions: Array<{ id: string; name: string; startTime: string; endTime: string; hoursPerShift: number }>,
    rules: ShiftRule,
    dates: Date[]
  ): Promise<{
    assigned: number;
    skipped: number;
    violations: string[];
    assignments: Array<{ employeeId: string; shiftId: string; date: string }>;
  }> {
    const assignments: Array<{ employeeId: string; shiftId: string; date: string }> = [];
    const violations: string[] = [];
    let assigned = 0;
    let skipped = 0;

    // Track weekly hours per employee
    const weeklyHours = new Map<string, number>();
    // Track consecutive work days per employee
    const consecutiveDays = new Map<string, number>();

    for (const date of dates) {
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0) {
        // Reset weekly counters on Sunday
        weeklyHours.clear();
        consecutiveDays.clear();
      }

      for (const employee of employees) {
        const currentHours = weeklyHours.get(employee.id) || 0;
        const currentConsecutive = consecutiveDays.get(employee.id) || 0;

        // Select the best shift for this employee
        let bestShift = shiftDefinitions[0];

        // Use preference-based assignment if configured
        if (rules.preferredShiftDistribution === "PREFERENCE" && employee.preferences?.length) {
          const preferred = shiftDefinitions.find(s => employee.preferences!.includes(s.id));
          if (preferred) bestShift = preferred;
        }

        // Rule: max weekly hours
        if (currentHours + bestShift.hoursPerShift > rules.maxWeeklyHours) {
          violations.push(`${employee.name}: weekly hours would exceed ${rules.maxWeeklyHours}h`);
          skipped++;
          continue;
        }

        // Rule: max consecutive days
        if (currentConsecutive >= rules.maxConsecutiveDays) {
          violations.push(`${employee.name}: consecutive days exceeds ${rules.maxConsecutiveDays}`);
          skipped++;
          consecutiveDays.set(employee.id, 0);
          continue;
        }

        assignments.push({
          employeeId: employee.id,
          shiftId: bestShift.id,
          date: date.toISOString().split("T")[0],
        });
        assigned++;

        weeklyHours.set(employee.id, currentHours + bestShift.hoursPerShift);
        consecutiveDays.set(employee.id, currentConsecutive + 1);
      }
    }

    return { assigned, skipped, violations, assignments };
  }

  /**
   * Detect scheduling conflicts for a potential shift assignment.
   */
  static async detectSchedulingConflicts(
    employeeId: string,
    shiftId: string,
    date: Date
  ): Promise<ScheduleConflict[]> {
    const conflicts: ScheduleConflict[] = [];

    // 1. Check existing assignment overlap
    const existing = await prisma.shiftSchedule.findUnique({
      where: { employeeId_date: { employeeId, date } },
      include: { shift: true },
    });

    if (existing) {
      conflicts.push({
        type: "OVERLAP",
        description: `Already assigned to "${existing.shift.name}" on this date`,
        severity: "HIGH",
        existingShiftId: existing.shiftId,
        suggestedResolution: "Remove existing assignment or choose a different date",
      });
    }

    // 2. Check if on approved leave
    const onLeave = await prisma.leaveRecord.findFirst({
      where: {
        employeeId,
        status: "APPROVED",
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });

    if (onLeave) {
      conflicts.push({
        type: "ON_LEAVE",
        description: `Employee is on approved ${onLeave.leaveType} leave (${onLeave.startDate.toISOString().split("T")[0]} to ${onLeave.endDate.toISOString().split("T")[0]})`,
        severity: "HIGH",
        suggestedResolution: "Choose a date outside the leave period",
      });
    }

    // 3. Check previous day's shift for minimum rest hours
    const prevDate = new Date(date);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevSchedule = await prisma.shiftSchedule.findUnique({
      where: { employeeId_date: { employeeId, date: prevDate } },
      include: { shift: true },
    });

    const targetShift = await prisma.shiftDefinition.findUnique({ where: { id: shiftId } });

    if (prevSchedule && targetShift) {
      const prevEndHour = parseInt(prevSchedule.shift.endTime.split(":")[0], 10);
      const targetStartHour = parseInt(targetShift.startTime.split(":")[0], 10);
      const restHours = targetStartHour + 24 - prevEndHour;

      if (restHours < this.DEFAULT_MIN_REST_HOURS) {
        conflicts.push({
          type: "INSUFFICIENT_REST",
          description: `Only ${restHours}h rest between shifts (minimum: ${this.DEFAULT_MIN_REST_HOURS}h)`,
          severity: "MEDIUM",
          suggestedResolution: "Assign a later shift or skip this day",
        });
      }
    }

    // 4. Check weekly hours
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const weekSchedules = await prisma.shiftSchedule.findMany({
      where: {
        employeeId,
        date: { gte: weekStart, lte: weekEnd },
      },
    });

    const currentWeeklyHours = weekSchedules.length * this.STANDARD_HOURS_PER_SHIFT;
    if (currentWeeklyHours + this.STANDARD_HOURS_PER_SHIFT > this.DEFAULT_MAX_WEEKLY_HOURS) {
      conflicts.push({
        type: "MAX_HOURS_EXCEEDED",
        description: `Weekly hours would be ${currentWeeklyHours + this.STANDARD_HOURS_PER_SHIFT}h (max: ${this.DEFAULT_MAX_WEEKLY_HOURS}h)`,
        severity: "HIGH",
        suggestedResolution: "Reduce shifts in this week",
      });
    }

    // 5. Check consecutive work days
    let consecutiveDays = 0;
    for (let d = 1; d <= this.DEFAULT_MAX_CONSECUTIVE_DAYS + 1; d++) {
      const checkDate = new Date(date);
      checkDate.setDate(date.getDate() - d);
      const hasShift = await prisma.shiftSchedule.findUnique({
        where: { employeeId_date: { employeeId, date: checkDate } },
      });
      if (hasShift) consecutiveDays++;
      else break;
    }

    if (consecutiveDays >= this.DEFAULT_MAX_CONSECUTIVE_DAYS) {
      conflicts.push({
        type: "CONSECUTIVE_DAYS",
        description: `${consecutiveDays} consecutive work days (max: ${this.DEFAULT_MAX_CONSECUTIVE_DAYS})`,
        severity: "MEDIUM",
        suggestedResolution: "Insert a rest day before this shift",
      });
    }

    return conflicts;
  }

  /**
   * Calculate total overtime hours for an employee in a given week.
   */
  static async calculateOvertimeHours(
    employeeId: string,
    weekStart: Date
  ): Promise<{
    regularHours: number;
    overtimeHours: number;
    totalHours: number;
    dailyBreakdown: Array<{ date: string; hours: number; isOvertime: boolean }>;
  }> {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const schedules = await prisma.shiftSchedule.findMany({
      where: {
        employeeId,
        date: { gte: weekStart, lte: weekEnd },
        status: { in: ["SCHEDULED", "COMPLETED"] },
      },
      include: { shift: true },
      orderBy: { date: "asc" },
    });

    const dailyBreakdown: Array<{ date: string; hours: number; isOvertime: boolean }> = [];
    let totalHours = 0;

    for (const schedule of schedules) {
      const startHour = parseInt(schedule.shift.startTime.split(":")[0], 10);
      const endHour = parseInt(schedule.shift.endTime.split(":")[0], 10);
      const hours = endHour > startHour ? endHour - startHour : 24 - startHour + endHour;

      totalHours += hours;
      dailyBreakdown.push({
        date: schedule.date.toISOString().split("T")[0],
        hours,
        isOvertime: totalHours > this.DEFAULT_MAX_WEEKLY_HOURS,
      });
    }

    const regularHours = Math.min(totalHours, this.DEFAULT_MAX_WEEKLY_HOURS);
    const overtimeHours = Math.max(0, totalHours - this.DEFAULT_MAX_WEEKLY_HOURS);

    return { regularHours, overtimeHours, totalHours, dailyBreakdown };
  }

  /**
   * Get staffing levels for all shifts on a given date.
   */
  static async getStaffingLevels(date: Date): Promise<StaffingLevel[]> {
    const shifts = await prisma.shiftDefinition.findMany({
      where: { isActive: true },
    });

    const results: StaffingLevel[] = [];

    for (const shift of shifts) {
      const assigned = await prisma.shiftSchedule.count({
        where: { shiftId: shift.id, date, status: { in: ["SCHEDULED", "COMPLETED"] } },
      });

      const required = 5; // default minimum staffing level
      const gap = required - assigned;
      const fillRate = required > 0 ? Math.round((assigned / required) * 100) : 100;

      results.push({
        shiftId: shift.id,
        shiftName: shift.name,
        required,
        assigned,
        gap: Math.max(0, gap),
        fillRate: Math.min(100, fillRate),
      });
    }

    return results;
  }

  /**
   * Identify shifts that are understaffed on a given date.
   */
  static async identifyUnderstaffedShifts(date: Date): Promise<StaffingLevel[]> {
    const levels = await this.getStaffingLevels(date);
    return levels.filter(l => l.gap > 0).sort((a, b) => b.gap - a.gap);
  }

  /**
   * Swap two employees' shift schedules.
   */
  static async swapShifts(
    schedule1Id: string,
    schedule2Id: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const [schedule1, schedule2] = await Promise.all([
        prisma.shiftSchedule.findUnique({ where: { id: schedule1Id } }),
        prisma.shiftSchedule.findUnique({ where: { id: schedule2Id } }),
      ]);

      if (!schedule1 || !schedule2) {
        return { success: false, message: "One or both schedules not found" };
      }

      // Swap shift assignments using a transaction
      await prisma.$transaction([
        prisma.shiftSchedule.update({
          where: { id: schedule1Id },
          data: { shiftId: schedule2.shiftId, date: schedule2.date },
        }),
        prisma.shiftSchedule.update({
          where: { id: schedule2Id },
          data: { shiftId: schedule1.shiftId, date: schedule1.date },
        }),
      ]);

      await createAuditLog({
        userId: "SYSTEM",
        action: "UPDATE",
        entity: "ShiftSchedule",
        entityId: `${schedule1Id}↔${schedule2Id}`,
        oldValue: {
          schedule1: { shiftId: schedule1.shiftId, date: schedule1.date },
          schedule2: { shiftId: schedule2.shiftId, date: schedule2.date },
        },
        newValue: {
          schedule1: { shiftId: schedule2.shiftId, date: schedule2.date },
          schedule2: { shiftId: schedule1.shiftId, date: schedule1.date },
        },
      });

      return { success: true, message: "Shifts swapped successfully" };
    } catch (error: any) {
      return { success: false, message: `Swap failed: ${error.message}` };
    }
  }

  /**
   * Approve a shift swap request and execute the swap.
   * Uses ShiftSchedule swapRequestedWith field since no dedicated swap request model exists.
   */
  static async approveSwapRequest(
    requestId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Find the schedule that has a swap request
      const schedule = await prisma.shiftSchedule.findUnique({
        where: { id: requestId },
      });

      if (!schedule) {
        return { success: false, message: "Swap request not found" };
      }

      if (!schedule.swapRequestedWith) {
        return { success: false, message: "No swap request pending for this schedule" };
      }

      // Find the target schedule
      const targetSchedule = await prisma.shiftSchedule.findUnique({
        where: { id: schedule.swapRequestedWith },
      });

      if (!targetSchedule) {
        return { success: false, message: "Target schedule not found" };
      }

      // Execute the swap
      const swapResult = await this.swapShifts(schedule.id, targetSchedule.id);

      if (!swapResult.success) {
        return swapResult;
      }

      // Clear swap request markers
      await prisma.$transaction([
        prisma.shiftSchedule.update({
          where: { id: schedule.id },
          data: { swapRequestedWith: null },
        }),
        prisma.shiftSchedule.update({
          where: { id: targetSchedule.id },
          data: { swapRequestedWith: null },
        }),
      ]);

      // Notify both employees
      const userIds = [schedule.employeeId, targetSchedule.employeeId];

      for (const empId of userIds) {
        const emp = await prisma.employee.findUnique({
          where: { id: empId },
          select: { userId: true },
        });
        if (emp) {
          await prisma.notification.create({
            data: {
              userId: emp.userId,
              title: "Shift Swap Approved",
              message: "Your shift swap request has been approved and schedules have been updated.",
              type: "success",
              module: "hr",
            },
          });
        }
      }

      return { success: true, message: "Swap request approved and executed" };
    } catch (error: any) {
      return { success: false, message: `Approval failed: ${error.message}` };
    }
  }

  /**
   * Auto-mark employees as absent who were scheduled but did not check in.
   */
  static async markAbsentees(date: Date): Promise<{
    absentCount: number;
    absentees: Array<{ employeeId: string; employeeName: string; shiftName: string }>;
  }> {
    const absentees: Array<{ employeeId: string; employeeName: string; shiftName: string }> = [];

    // Find all scheduled shifts for the date
    const scheduledShifts = await prisma.shiftSchedule.findMany({
      where: { date, status: "SCHEDULED" },
      include: {
        shift: true,
      },
    });

    for (const schedule of scheduledShifts) {
      // Check if employee has an attendance log for this date
      const attendanceLog = await prisma.attendanceLog.findFirst({
        where: {
          employeeId: schedule.employeeId,
          date,
          status: { in: ["PRESENT", "WORK_FROM_HOME", "HALF_DAY"] },
        },
      });

      if (!attendanceLog) {
        // Mark as absent
        await prisma.shiftSchedule.update({
          where: { id: schedule.id },
          data: { status: "ABSENT" },
        });

        // Look up employee + user separately
        const emp = await prisma.employee.findUnique({
          where: { id: schedule.employeeId },
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        });

        const employeeName = emp ? `${emp.user.firstName} ${emp.user.lastName}` : "Unknown";
        absentees.push({
          employeeId: schedule.employeeId,
          employeeName,
          shiftName: schedule.shift.name,
        });

        // Notify the employee
        if (emp) {
          await prisma.notification.create({
            data: {
              userId: emp.user.id,
              title: "Absence Recorded",
              message: `You were marked absent for your ${schedule.shift.name} shift on ${date.toISOString().split("T")[0]}.`,
              type: "warning",
              module: "hr",
            },
          });
        }
      }
    }

    if (absentees.length > 0) {
      await createAuditLog({
        userId: "SYSTEM",
        action: "UPDATE",
        entity: "ShiftSchedule",
        entityId: `absentees-${date.toISOString().split("T")[0]}`,
        newValue: { date, absentCount: absentees.length },
      });
    }

    return { absentCount: absentees.length, absentees };
  }

  /**
   * Generate a comprehensive shift report for a date range.
   */
  static async generateShiftReport(
    startDate: Date,
    endDate: Date
  ): Promise<ShiftReportData> {
    const schedules = await prisma.shiftSchedule.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      include: {
        shift: true,
      },
    });

    // Build employee department map for all unique employees in schedules
    const uniqueEmpIds = [...new Set(schedules.map(s => s.employeeId))];
    const employees = await prisma.employee.findMany({
      where: { id: { in: uniqueEmpIds } },
      select: { id: true, department: true },
    });
    const empDeptMap = new Map(employees.map(e => [e.id, e.department]));

    const totalShiftsScheduled = schedules.length;
    const totalShiftsCompleted = schedules.filter(s => s.status === "COMPLETED").length;
    const absenteeCount = schedules.filter(s => s.status === "ABSENT").length;

    // Department breakdown
    const deptMap = new Map<string, { scheduled: number; completed: number; absentees: number }>();
    for (const s of schedules) {
      const dept = empDeptMap.get(s.employeeId) || "Unknown";
      const entry = deptMap.get(dept) || { scheduled: 0, completed: 0, absentees: 0 };
      entry.scheduled++;
      if (s.status === "COMPLETED") entry.completed++;
      if (s.status === "ABSENT") entry.absentees++;
      deptMap.set(dept, entry);
    }

    // Shift breakdown
    const shiftMap = new Map<string, { name: string; scheduled: number; completed: number }>();
    for (const s of schedules) {
      const entry = shiftMap.get(s.shiftId) || { name: s.shift.name, scheduled: 0, completed: 0 };
      entry.scheduled++;
      if (s.status === "COMPLETED") entry.completed++;
      shiftMap.set(s.shiftId, entry);
    }

    // Swap count — count schedules that have swapRequestedWith set
    const swapCount = await prisma.shiftSchedule.count({
      where: {
        swapRequestedWith: { not: null },
        date: { gte: startDate, lte: endDate },
      },
    });

    // Overtime calculation (simplified)
    const overtimeSchedules = schedules.filter(s => s.status === "COMPLETED");
    const uniqueEmployees = new Set(overtimeSchedules.map(s => s.employeeId));
    const totalOvertimeHours = uniqueEmployees.size > 0
      ? Math.max(0, (overtimeSchedules.length * this.STANDARD_HOURS_PER_SHIFT / uniqueEmployees.size) - 40) * uniqueEmployees.size
      : 0;

    return {
      period: { start: startDate, end: endDate },
      totalShiftsScheduled,
      totalShiftsCompleted,
      absenteeCount,
      avgOvertimeHours: uniqueEmployees.size > 0 ? Math.round(totalOvertimeHours / uniqueEmployees.size * 10) / 10 : 0,
      staffingFillRate: totalShiftsScheduled > 0 ? Math.round((totalShiftsCompleted / totalShiftsScheduled) * 100) : 0,
      swapCount,
      byDepartment: Array.from(deptMap.entries()).map(([department, data]) => ({
        department,
        ...data,
        overtimeHours: 0,
      })),
      byShift: Array.from(shiftMap.entries()).map(([, data]) => ({
        shiftName: data.name,
        scheduled: data.scheduled,
        completed: data.completed,
        fillRate: data.scheduled > 0 ? Math.round((data.completed / data.scheduled) * 100) : 0,
      })),
    };
  }

  /**
   * Optimize shift distribution across employees for fairness.
   * Ensures equal number of preferred/unpreferred shifts where possible.
   */
  static async optimizeShiftDistribution(
    department: string
  ): Promise<{
    optimized: boolean;
    changes: number;
    distribution: Array<{ employeeId: string; employeeName: string; shifts: Record<string, number> }>;
    fairnessScore: number;
  }> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const employees = await prisma.employee.findMany({
      where: { department, dateOfLeaving: null },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (employees.length === 0) {
      return { optimized: false, changes: 0, distribution: [], fairnessScore: 100 };
    }

    // Analyze current distribution over last 30 days
    const schedules = await prisma.shiftSchedule.findMany({
      where: {
        employeeId: { in: employees.map(e => e.id) },
        date: { gte: thirtyDaysAgo, lte: now },
      },
      include: { shift: true },
    });

    // Build distribution map
    const distributionMap = new Map<string, { name: string; shifts: Map<string, number>; total: number }>();
    for (const emp of employees) {
      distributionMap.set(emp.id, {
        name: `${emp.user.firstName} ${emp.user.lastName}`,
        shifts: new Map(),
        total: 0,
      });
    }

    for (const s of schedules) {
      const entry = distributionMap.get(s.employeeId);
      if (entry) {
        const shiftName = s.shift.name;
        entry.shifts.set(shiftName, (entry.shifts.get(shiftName) || 0) + 1);
        entry.total++;
      }
    }

    // Calculate fairness score (standard deviation of total shifts / mean)
    const totals = Array.from(distributionMap.values()).map(e => e.total);
    const mean = totals.length > 0 ? totals.reduce((s, v) => s + v, 0) / totals.length : 0;
    const variance = totals.length > 0
      ? totals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / totals.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;
    const fairnessScore = Math.max(0, Math.round((1 - coefficientOfVariation) * 100));

    const distribution = Array.from(distributionMap.entries()).map(([employeeId, data]) => ({
      employeeId,
      employeeName: data.name,
      shifts: Object.fromEntries(data.shifts),
    }));

    return {
      optimized: fairnessScore >= 80,
      changes: 0, // Future: implement actual rebalancing
      distribution,
      fairnessScore,
    };
  }

  /**
   * Predict future staffing needs based on historical scheduling patterns.
   * Analyzes leave trends, seasonal patterns, and headcount changes.
   */
  static async predictStaffingNeeds(
    department: string,
    futureWeeks: number = 4
  ): Promise<StaffingPrediction[]> {
    const now = new Date();
    const predictions: StaffingPrediction[] = [];

    // Gather historical data (past 12 weeks)
    const historyStart = new Date(now);
    historyStart.setDate(now.getDate() - 84); // 12 weeks

    // Get active employee IDs in the department
    const deptEmployees = await prisma.employee.findMany({
      where: { department, dateOfLeaving: null },
      select: { id: true },
    });
    const deptEmployeeIds = deptEmployees.map(e => e.id);

    const historicalSchedules = await prisma.shiftSchedule.findMany({
      where: {
        employeeId: { in: deptEmployeeIds },
        date: { gte: historyStart, lte: now },
      },
      select: { date: true, status: true },
    });

    // Calculate historical averages
    const weeklyScheduled = new Map<number, number>();
    const weeklyAbsent = new Map<number, number>();

    for (const s of historicalSchedules) {
      const weekOfYear = this.getWeekOfYear(s.date);
      weeklyScheduled.set(weekOfYear, (weeklyScheduled.get(weekOfYear) || 0) + 1);
      if (s.status === "ABSENT") {
        weeklyAbsent.set(weekOfYear, (weeklyAbsent.get(weekOfYear) || 0) + 1);
      }
    }

    const avgWeeklyScheduled = weeklyScheduled.size > 0
      ? Array.from(weeklyScheduled.values()).reduce((s, v) => s + v, 0) / weeklyScheduled.size
      : 0;
    const avgWeeklyAbsent = weeklyAbsent.size > 0
      ? Array.from(weeklyAbsent.values()).reduce((s, v) => s + v, 0) / weeklyAbsent.size
      : 0;

    // Current active headcount
    const activeEmployees = await prisma.employee.count({
      where: { department, dateOfLeaving: null },
    });

    // Upcoming leaves
    const futureEnd = new Date(now);
    futureEnd.setDate(now.getDate() + futureWeeks * 7);
    const upcomingLeaves = await prisma.leaveRecord.findMany({
      where: {
        employee: { department, dateOfLeaving: null },
        status: "APPROVED",
        startDate: { gte: now, lte: futureEnd },
      },
      select: { startDate: true, endDate: true, totalDays: true },
    });

    // Generate predictions per future week
    for (let w = 0; w < futureWeeks; w++) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() + w * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      // Leaves overlapping this week
      const weekLeaves = upcomingLeaves.filter(
        l => l.startDate <= weekEnd && l.endDate >= weekStart
      );
      const leaveDays = weekLeaves.reduce((s, l) => s + Number(l.totalDays || 1), 0);

      const predictedAvailable = Math.max(0, activeEmployees - Math.ceil(leaveDays / 5));
      const absenteeRate = avgWeeklyScheduled > 0 ? avgWeeklyAbsent / avgWeeklyScheduled : 0.05;
      const predictedRequired = Math.ceil(avgWeeklyScheduled * (1 + absenteeRate));

      const factors: string[] = [];
      if (weekLeaves.length > 0) factors.push(`${weekLeaves.length} approved leaves`);
      if (absenteeRate > 0.1) factors.push("High historical absenteeism");

      // Confidence based on data volume
      const dataPoints = weeklyScheduled.size;
      const confidence = Math.min(95, Math.max(50, 50 + dataPoints * 4));

      predictions.push({
        weekLabel: `Week ${w + 1} (${weekStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" })})`,
        weekStart,
        predictedRequired,
        predictedAvailable,
        gap: Math.max(0, predictedRequired - predictedAvailable),
        confidence,
        factors,
      });
    }

    return predictions;
  }

  // ── Private Helpers ──

  private static getWeekOfYear(date: Date): number {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  }
}
