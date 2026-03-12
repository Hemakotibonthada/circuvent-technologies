// ──────────────────────────────────────────────────────────────
// HR & Payroll — Attendance Automation Service
// Comprehensive attendance management: clock-in/out, overtime
// calculation, half-day/absent marking, regularization,
// department summaries, leave deductions, pattern analysis,
// shift reconciliation, and reporting.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types & Interfaces
// ══════════════════════════════════════════════════════════════

export interface AttendanceEntry {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  totalHours: number | null;
  overtimeHours: number | null;
  status: string;
  location: string | null;
  notes: string | null;
}

export interface MonthlyAttendanceSummary {
  employeeId: string;
  employeeName: string;
  month: number;
  year: number;
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  lateDays: number;
  wfhDays: number;
  holidays: number;
  weekOffs: number;
  leaveDays: number;
  overtimeHours: number;
  totalHoursWorked: number;
  avgDailyHours: number;
  attendancePercentage: number;
}

export interface DepartmentAttendance {
  department: string;
  date: string;
  totalEmployees: number;
  present: number;
  absent: number;
  halfDay: number;
  wfh: number;
  onLeave: number;
  attendancePercentage: number;
  lateComers: Array<{ name: string; checkIn: string }>;
}

export interface AttendancePattern {
  employeeId: string;
  employeeName: string;
  lateComingCount: number;
  earlyLeavingCount: number;
  avgCheckInTime: string;
  avgCheckOutTime: string;
  avgDailyHours: number;
  frequentAbsenceDays: string[]; // e.g., "Monday", "Friday"
  consecutiveAbsences: number;
  trend: "REGULAR" | "IRREGULAR" | "CONCERNING";
}

export interface AttendanceDashboard {
  date: string;
  totalEmployees: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  wfhToday: number;
  onLeaveToday: number;
  attendanceRate: number;
  lateComers: Array<{ name: string; department: string; checkIn: string }>;
  earlyLeavers: Array<{ name: string; department: string; checkOut: string }>;
  yetToCheckIn: Array<{ name: string; department: string }>;
  byDepartment: Array<{ department: string; present: number; total: number; rate: number }>;
}

export interface PayableDays {
  employeeId: string;
  month: number;
  year: number;
  calendarDays: number;
  weekOffs: number;
  holidays: number;
  totalWorkingDays: number;
  presentDays: number;
  halfDays: number;
  leaveDays: number;
  absentDays: number;
  lopDays: number;
  payableDays: number;
}

// ══════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════

const STANDARD_WORKING_HOURS = 8;
const OVERTIME_THRESHOLD = 8.5; // Start counting OT after 8.5 hours
const LATE_THRESHOLD_MINUTES = 15; // 15 minutes after shift start
const EARLY_LEAVE_THRESHOLD_HOURS = 7; // Less than 7 hours = early leave
const AUTO_CLOCKOUT_TIME = "23:59:00";

// ══════════════════════════════════════════════════════════════
// Attendance Automation Service
// ══════════════════════════════════════════════════════════════

export class AttendanceAutomationService {
  /**
   * Clock in an employee.
   */
  static async clockIn(
    employeeId: string,
    source: string = "WEB"
  ): Promise<AttendanceEntry> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, userId: true, employeeCode: true },
    });

    if (!employee) throw new Error("Employee not found");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check for existing clock-in
    const existing = await prisma.attendanceLog.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });

    if (existing && existing.checkIn) {
      throw new Error("Already clocked in today");
    }

    const now = new Date();
    const isLate = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > LATE_THRESHOLD_MINUTES);

    const log = existing
      ? await prisma.attendanceLog.update({
          where: { id: existing.id },
          data: {
            checkIn: now,
            status: isLate ? "PRESENT" : "PRESENT",
            location: source,
            notes: isLate ? `Late check-in (${now.toLocaleTimeString()})` : undefined,
          },
        })
      : await prisma.attendanceLog.create({
          data: {
            employeeId,
            date: today,
            checkIn: now,
            status: source === "REMOTE" ? "WORK_FROM_HOME" : "PRESENT",
            location: source,
            notes: isLate ? `Late check-in (${now.toLocaleTimeString()})` : undefined,
          },
        });

    await createAuditLog({
      userId: employee.userId,
      action: "CREATE",
      entity: "AttendanceLog",
      entityId: log.id,
      newValue: { time: now.toISOString(), source, isLate },
    });

    return this.mapAttendanceLog(log);
  }

  /**
   * Clock out an employee — calculates total hours and overtime.
   */
  static async clockOut(employeeId: string): Promise<AttendanceEntry> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, userId: true },
    });

    if (!employee) throw new Error("Employee not found");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.attendanceLog.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });

    if (!existing) throw new Error("No clock-in found for today");
    if (!existing.checkIn) throw new Error("No clock-in time recorded");
    if (existing.checkOut) throw new Error("Already clocked out today");

    const now = new Date();
    const totalHours = (now.getTime() - existing.checkIn.getTime()) / (1000 * 60 * 60);
    const overtimeHours = totalHours > OVERTIME_THRESHOLD ? totalHours - STANDARD_WORKING_HOURS : 0;

    const log = await prisma.attendanceLog.update({
      where: { id: existing.id },
      data: {
        checkOut: now,
        totalHours: Math.round(totalHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        status: totalHours < 4 ? "HALF_DAY" : existing.status,
      },
    });

    await createAuditLog({
      userId: employee.userId,
      action: "UPDATE",
      entity: "AttendanceLog",
      entityId: log.id,
      newValue: { time: now.toISOString(), totalHours: Math.round(totalHours * 100) / 100 },
    });

    return this.mapAttendanceLog(log);
  }

  /**
   * Auto clock-out employees who forgot to clock out (runs at 23:59).
   */
  static async autoClockOutMissing(): Promise<{ processed: number; employees: string[] }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const missingClockout = await prisma.attendanceLog.findMany({
      where: {
        date: today,
        checkIn: { not: null },
        checkOut: null,
      },
      include: { employee: { select: { employeeCode: true } } },
    });

    const autoClockoutTime = new Date();
    autoClockoutTime.setHours(23, 59, 0, 0);

    const employees: string[] = [];

    for (const log of missingClockout) {
      const totalHours = log.checkIn
        ? (autoClockoutTime.getTime() - log.checkIn.getTime()) / (1000 * 60 * 60)
        : STANDARD_WORKING_HOURS;

      // Cap at standard working hours for auto-clockout
      const cappedHours = Math.min(totalHours, STANDARD_WORKING_HOURS);

      await prisma.attendanceLog.update({
        where: { id: log.id },
        data: {
          checkOut: autoClockoutTime,
          totalHours: Math.round(cappedHours * 100) / 100,
          overtimeHours: 0,
          notes: (log.notes ? log.notes + " | " : "") + "Auto clock-out at 23:59",
        },
      });

      employees.push(log.employee.employeeCode);
    }

    if (employees.length > 0) {
      await createAuditLog({
        userId: "SYSTEM",
        action: "UPDATE",
        entity: "AttendanceLog",
        metadata: { processedCount: employees.length, employees },
      });
    }

    return { processed: employees.length, employees };
  }

  /**
   * Calculate overtime hours for an employee in a period (per Factories Act).
   */
  static async calculateOvertimeHours(
    employeeId: string,
    period: { month: number; year: number }
  ): Promise<{
    totalOvertimeHours: number;
    overtimeDays: number;
    overtimePayMultiplier: number;
    details: Array<{ date: string; regularHours: number; overtimeHours: number }>;
  }> {
    const startDate = new Date(period.year, period.month - 1, 1);
    const endDate = new Date(period.year, period.month, 0);

    const logs = await prisma.attendanceLog.findMany({
      where: {
        employeeId,
        date: { gte: startDate, lte: endDate },
        overtimeHours: { gt: 0 },
      },
      orderBy: { date: "asc" },
    });

    const details = logs.map((log) => ({
      date: log.date.toISOString().split("T")[0],
      regularHours: STANDARD_WORKING_HOURS,
      overtimeHours: Number(log.overtimeHours),
    }));

    const totalOvertimeHours = details.reduce((sum, d) => sum + d.overtimeHours, 0);

    return {
      totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
      overtimeDays: details.length,
      overtimePayMultiplier: 2, // Factories Act: 2x for overtime
      details,
    };
  }

  /**
   * Mark half-day for an employee.
   */
  static async markHalfDay(
    employeeId: string,
    date: Date,
    reason: string
  ): Promise<AttendanceEntry> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, userId: true },
    });

    if (!employee) throw new Error("Employee not found");

    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    const log = await prisma.attendanceLog.upsert({
      where: { employeeId_date: { employeeId, date: dateOnly } },
      create: {
        employeeId,
        date: dateOnly,
        status: "HALF_DAY",
        totalHours: STANDARD_WORKING_HOURS / 2,
        notes: reason,
      },
      update: {
        status: "HALF_DAY",
        totalHours: STANDARD_WORKING_HOURS / 2,
        notes: reason,
      },
    });

    await createAuditLog({
      userId: employee.userId,
      action: "UPDATE",
      entity: "AttendanceLog",
      entityId: log.id,
      newValue: { status: "HALF_DAY", reason },
    });

    return this.mapAttendanceLog(log);
  }

  /**
   * Mark absent — auto-detect from missing clock-in.
   */
  static async markAbsent(
    employeeId: string,
    date: Date
  ): Promise<AttendanceEntry> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, userId: true },
    });

    if (!employee) throw new Error("Employee not found");

    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    // Check if not on approved leave
    const leaveRecord = await prisma.leaveRecord.findFirst({
      where: {
        employeeId,
        status: "APPROVED",
        startDate: { lte: dateOnly },
        endDate: { gte: dateOnly },
      },
    });

    const status = leaveRecord ? "ON_LEAVE" : "ABSENT";

    const log = await prisma.attendanceLog.upsert({
      where: { employeeId_date: { employeeId, date: dateOnly } },
      create: {
        employeeId,
        date: dateOnly,
        status,
        totalHours: 0,
        notes: leaveRecord ? `On approved leave (${leaveRecord.id})` : "Absent — no clock-in detected",
      },
      update: {
        status,
        totalHours: 0,
        notes: leaveRecord ? `On approved leave (${leaveRecord.id})` : "Absent — no clock-in detected",
      },
    });

    return this.mapAttendanceLog(log);
  }

  /**
   * Regularize attendance — post-facto correction with reason.
   */
  static async regularizeAttendance(
    employeeId: string,
    date: Date,
    reason: string
  ): Promise<AttendanceEntry> {
    if (!reason || reason.trim().length < 5) throw new Error("Regularization reason must be at least 5 characters");

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, userId: true, employeeCode: true },
    });

    if (!employee) throw new Error("Employee not found");

    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    const log = await prisma.attendanceLog.upsert({
      where: { employeeId_date: { employeeId, date: dateOnly } },
      create: {
        employeeId,
        date: dateOnly,
        status: "PRESENT",
        totalHours: STANDARD_WORKING_HOURS,
        notes: `Regularized: ${reason.trim()}`,
      },
      update: {
        status: "PRESENT",
        totalHours: STANDARD_WORKING_HOURS,
        notes: `Regularized: ${reason.trim()}`,
      },
    });

    await createAuditLog({
      userId: employee.userId,
      action: "UPDATE",
      entity: "AttendanceLog",
      entityId: log.id,
      newValue: { date: dateOnly.toISOString(), reason },
    });

    return this.mapAttendanceLog(log);
  }

  /**
   * Get monthly attendance summary for an employee.
   */
  static async getMonthlyAttendanceSummary(
    employeeId: string,
    month: number,
    year: number
  ): Promise<MonthlyAttendanceSummary> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const logs = await prisma.attendanceLog.findMany({
      where: { employeeId, date: { gte: startDate, lte: endDate } },
      orderBy: { date: "asc" },
    });

    // Calculate working days (exclude weekends)
    let totalWorkingDays = 0;
    let weekOffs = 0;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekOffs++;
      } else {
        totalWorkingDays++;
      }
    }

    const presentDays = logs.filter((l) => l.status === "PRESENT").length;
    const absentDays = logs.filter((l) => l.status === "ABSENT").length;
    const halfDays = logs.filter((l) => l.status === "HALF_DAY").length;
    const wfhDays = logs.filter((l) => l.status === "WORK_FROM_HOME").length;
    const holidays = logs.filter((l) => l.status === "HOLIDAY").length;
    const leaveDays = logs.filter((l) => l.status === "ON_LEAVE").length;

    const lateDays = logs.filter((l) => l.notes?.toLowerCase().includes("late")).length;

    const totalHoursWorked = logs.reduce((sum, l) => sum + Number(l.totalHours || 0), 0);
    const overtimeHours = logs.reduce((sum, l) => sum + Number(l.overtimeHours || 0), 0);
    const daysWithHours = logs.filter((l) => Number(l.totalHours) > 0).length;
    const avgDailyHours = daysWithHours > 0 ? Math.round((totalHoursWorked / daysWithHours) * 100) / 100 : 0;

    const effectivePresentDays = presentDays + wfhDays + halfDays * 0.5;
    const attendancePercentage = totalWorkingDays > 0
      ? Math.round((effectivePresentDays / totalWorkingDays) * 100)
      : 0;

    return {
      employeeId,
      employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
      month,
      year,
      totalWorkingDays,
      presentDays,
      absentDays,
      halfDays,
      lateDays,
      wfhDays,
      holidays,
      weekOffs,
      leaveDays,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      totalHoursWorked: Math.round(totalHoursWorked * 100) / 100,
      avgDailyHours,
      attendancePercentage,
    };
  }

  /**
   * Get department-wide attendance for a specific date.
   */
  static async getDepartmentAttendance(
    department: string,
    date: Date
  ): Promise<DepartmentAttendance> {
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    const employees = await prisma.employee.findMany({
      where: { department, dateOfLeaving: null },
      include: {
        user: { select: { firstName: true, lastName: true } },
        attendanceLogs: { where: { date: dateOnly } },
      },
    });

    const totalEmployees = employees.length;
    let present = 0, absent = 0, halfDay = 0, wfh = 0, onLeave = 0;
    const lateComers: Array<{ name: string; checkIn: string }> = [];

    for (const emp of employees) {
      const log = emp.attendanceLogs[0];
      if (!log) {
        absent++;
        continue;
      }

      switch (log.status) {
        case "PRESENT": present++; break;
        case "HALF_DAY": halfDay++; break;
        case "WORK_FROM_HOME": wfh++; break;
        case "ON_LEAVE": onLeave++; break;
        case "ABSENT": absent++; break;
        default: present++;
      }

      if (log.notes?.toLowerCase().includes("late") && log.checkIn) {
        lateComers.push({
          name: `${emp.user.firstName} ${emp.user.lastName}`,
          checkIn: log.checkIn.toLocaleTimeString(),
        });
      }
    }

    const effectivePresent = present + wfh + halfDay * 0.5;
    const attendancePercentage = totalEmployees > 0
      ? Math.round((effectivePresent / totalEmployees) * 100)
      : 0;

    return {
      department,
      date: dateOnly.toISOString().split("T")[0],
      totalEmployees,
      present,
      absent,
      halfDay,
      wfh,
      onLeave,
      attendancePercentage,
      lateComers,
    };
  }

  /**
   * Calculate leave deductions for absences in a given month.
   */
  static async calculateLeaveDeductions(
    employeeId: string,
    month: number
  ): Promise<{
    deductionDays: number;
    casualLeaveUsed: number;
    sickLeaveUsed: number;
    lopDays: number;
    salary: number;
    deductionAmount: number;
  }> {
    const year = new Date().getFullYear();
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) throw new Error("Employee not found");

    const summary = await this.getMonthlyAttendanceSummary(employeeId, month, year);

    // Check approved leaves
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const approvedLeaves = await prisma.leaveRecord.findMany({
      where: {
        employeeId,
        status: "APPROVED",
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });

    let casualLeaveUsed = 0;
    let sickLeaveUsed = 0;

    for (const leave of approvedLeaves) {
      const type = leave.leaveType?.toLowerCase() || "";
      if (type.includes("casual") || type.includes("cl")) {
        casualLeaveUsed += Number(leave.totalDays || 0);
      } else if (type.includes("sick") || type.includes("sl")) {
        sickLeaveUsed += Number(leave.totalDays || 0);
      }
    }

    // LOP = absent days not covered by approved leave
    const lopDays = Math.max(0, summary.absentDays - (casualLeaveUsed + sickLeaveUsed));
    const deductionDays = lopDays + summary.halfDays * 0.5;

    const dailySalary = Number(employee.baseSalary) / 365;
    const deductionAmount = Math.round(deductionDays * dailySalary * 100) / 100;

    return {
      deductionDays,
      casualLeaveUsed,
      sickLeaveUsed,
      lopDays,
      salary: Number(employee.baseSalary),
      deductionAmount,
    };
  }

  /**
   * Generate company-wide attendance report for a month.
   */
  static async generateAttendanceReport(
    month: number,
    year: number
  ): Promise<string> {
    const employees = await prisma.employee.findMany({
      where: { dateOfLeaving: null },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    const summaries: MonthlyAttendanceSummary[] = [];

    for (const emp of employees) {
      try {
        const summary = await this.getMonthlyAttendanceSummary(emp.id, month, year);
        summaries.push(summary);
      } catch {
        // Skip employees with issues
      }
    }

    const avgAttendance = summaries.length > 0
      ? Math.round(summaries.reduce((sum, s) => sum + s.attendancePercentage, 0) / summaries.length)
      : 0;

    const totalOT = summaries.reduce((sum, s) => sum + s.overtimeHours, 0);

    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Attendance Report — ${new Date(year, month - 1).toLocaleString("en", { month: "long" })} ${year}</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; max-width: 1000px; margin: 40px auto; color: #1a1a1a; }
        h1 { color: #1e3a5f; }
        .stat-row { display: flex; gap: 20px; margin: 20px 0; }
        .stat { background: #f5f7fa; padding: 15px 20px; border-radius: 8px; flex: 1; text-align: center; }
        .stat-value { font-size: 1.5em; font-weight: bold; color: #1e3a5f; }
        .stat-label { font-size: 0.85em; color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 0.85em; }
        th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #e0e0e0; }
        th { background: #f5f7fa; font-weight: 600; position: sticky; top: 0; }
        .low { color: #c00; }
        .high { color: #060; }
      </style></head>
      <body>
        <h1>Attendance Report — ${new Date(year, month - 1).toLocaleString("en", { month: "long" })} ${year}</h1>

        <div class="stat-row">
          <div class="stat"><div class="stat-value">${employees.length}</div><div class="stat-label">Total Employees</div></div>
          <div class="stat"><div class="stat-value">${avgAttendance}%</div><div class="stat-label">Avg Attendance</div></div>
          <div class="stat"><div class="stat-value">${Math.round(totalOT)}</div><div class="stat-label">Total OT Hours</div></div>
        </div>

        <table>
          <tr>
            <th>Employee</th><th>Present</th><th>Absent</th><th>Half Day</th><th>WFH</th>
            <th>Leave</th><th>OT Hours</th><th>Avg Hours</th><th>Attendance %</th>
          </tr>
          ${summaries.map((s) => `
            <tr>
              <td>${s.employeeName}</td>
              <td>${s.presentDays}</td>
              <td class="${s.absentDays > 3 ? "low" : ""}">${s.absentDays}</td>
              <td>${s.halfDays}</td>
              <td>${s.wfhDays}</td>
              <td>${s.leaveDays}</td>
              <td>${s.overtimeHours}</td>
              <td>${s.avgDailyHours}</td>
              <td class="${s.attendancePercentage < 80 ? "low" : s.attendancePercentage >= 95 ? "high" : ""}">${s.attendancePercentage}%</td>
            </tr>
          `).join("")}
        </table>
      </body>
      </html>
    `;

    await prisma.generatedDocument.create({
      data: {
        name: `Attendance Report — ${month}/${year}`,
        category: "ATTENDANCE_REPORT",
        entityType: "AttendanceReport",
        entityId: `report-${month}-${year}`,
        generatedBy: "SYSTEM",
        format: "HTML",
        content: html,
        data: { month, year, avgAttendance, totalEmployees: employees.length } as any,
      },
    });

    return html;
  }

  /**
   * Identify attendance patterns — late coming, early leaving, etc.
   */
  static async identifyPatterns(employeeId: string): Promise<AttendancePattern> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");

    // Last 90 days of data
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const logs = await prisma.attendanceLog.findMany({
      where: { employeeId, date: { gte: ninetyDaysAgo } },
      orderBy: { date: "asc" },
    });

    const lateComingCount = logs.filter((l) => l.notes?.toLowerCase().includes("late")).length;

    const earlyLeavingCount = logs.filter(
      (l) => l.totalHours !== null && Number(l.totalHours) < EARLY_LEAVE_THRESHOLD_HOURS && l.status === "PRESENT"
    ).length;

    // Average check-in/out times
    const checkInTimes = logs.filter((l) => l.checkIn).map((l) => l.checkIn!.getHours() * 60 + l.checkIn!.getMinutes());
    const checkOutTimes = logs.filter((l) => l.checkOut).map((l) => l.checkOut!.getHours() * 60 + l.checkOut!.getMinutes());

    const avgCheckInMinutes = checkInTimes.length > 0
      ? Math.round(checkInTimes.reduce((a, b) => a + b, 0) / checkInTimes.length)
      : 9 * 60;
    const avgCheckOutMinutes = checkOutTimes.length > 0
      ? Math.round(checkOutTimes.reduce((a, b) => a + b, 0) / checkOutTimes.length)
      : 18 * 60;

    const formatMinutes = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

    const avgDailyHours = logs.filter((l) => Number(l.totalHours) > 0).length > 0
      ? Math.round(
          logs.filter((l) => Number(l.totalHours) > 0).reduce((sum, l) => sum + Number(l.totalHours), 0) /
          logs.filter((l) => Number(l.totalHours) > 0).length * 100
        ) / 100
      : 0;

    // Frequent absence days
    const absentLogs = logs.filter((l) => l.status === "ABSENT");
    const dayCount: Record<string, number> = {};
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    for (const log of absentLogs) {
      const dayName = dayNames[log.date.getDay()];
      dayCount[dayName] = (dayCount[dayName] || 0) + 1;
    }
    const frequentAbsenceDays = Object.entries(dayCount)
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .map(([day]) => day);

    // Consecutive absences
    let maxConsecutive = 0;
    let currentStreak = 0;
    for (const log of logs) {
      if (log.status === "ABSENT") {
        currentStreak++;
        maxConsecutive = Math.max(maxConsecutive, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    // Trend determination
    let trend: AttendancePattern["trend"] = "REGULAR";
    if (lateComingCount > 10 || earlyLeavingCount > 8 || maxConsecutive >= 3) {
      trend = "CONCERNING";
    } else if (lateComingCount > 5 || earlyLeavingCount > 3 || frequentAbsenceDays.length > 0) {
      trend = "IRREGULAR";
    }

    return {
      employeeId,
      employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
      lateComingCount,
      earlyLeavingCount,
      avgCheckInTime: formatMinutes(avgCheckInMinutes),
      avgCheckOutTime: formatMinutes(avgCheckOutMinutes),
      avgDailyHours,
      frequentAbsenceDays,
      consecutiveAbsences: maxConsecutive,
      trend,
    };
  }

  /**
   * Sync attendance with shift schedule — reconcile expected vs actual.
   */
  static async syncWithShiftSchedule(
    employeeId: string,
    date: Date
  ): Promise<{ synced: boolean; shiftStart: string; shiftEnd: string; actualCheckIn: string | null; actualCheckOut: string | null; discrepancy: boolean }> {
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    // Try to find shift assignment
    const shiftDoc = await prisma.generatedDocument.findFirst({
      where: {
        entityType: "ShiftAssignment",
        entityId: employeeId,
        data: { path: ["date"], equals: dateOnly.toISOString().split("T")[0] },
      },
    });

    const shiftData = shiftDoc?.data as any;
    const shiftStart = shiftData?.shiftStart || "09:00";
    const shiftEnd = shiftData?.shiftEnd || "18:00";

    const log = await prisma.attendanceLog.findUnique({
      where: { employeeId_date: { employeeId, date: dateOnly } },
    });

    const actualCheckIn = log?.checkIn?.toLocaleTimeString() || null;
    const actualCheckOut = log?.checkOut?.toLocaleTimeString() || null;

    // Check for discrepancy (> 30 min deviation)
    const discrepancy = log?.checkIn
      ? Math.abs(log.checkIn.getHours() * 60 + log.checkIn.getMinutes() - parseInt(shiftStart.split(":")[0]) * 60 - parseInt(shiftStart.split(":")[1])) > 30
      : false;

    return { synced: true, shiftStart, shiftEnd, actualCheckIn, actualCheckOut, discrepancy };
  }

  /**
   * Get real-time attendance dashboard for today.
   */
  static async getAttendanceDashboard(): Promise<AttendanceDashboard> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const employees = await prisma.employee.findMany({
      where: { dateOfLeaving: null },
      include: {
        user: { select: { firstName: true, lastName: true } },
        attendanceLogs: { where: { date: today } },
      },
    });

    const totalEmployees = employees.length;
    let presentToday = 0, absentToday = 0, lateToday = 0, wfhToday = 0, onLeaveToday = 0;

    const lateComers: AttendanceDashboard["lateComers"] = [];
    const earlyLeavers: AttendanceDashboard["earlyLeavers"] = [];
    const yetToCheckIn: AttendanceDashboard["yetToCheckIn"] = [];
    const deptMap = new Map<string, { present: number; total: number }>();

    for (const emp of employees) {
      const dept = emp.department;
      const entry = deptMap.get(dept) || { present: 0, total: 0 };
      entry.total++;

      const log = emp.attendanceLogs[0];

      if (!log) {
        absentToday++;
        yetToCheckIn.push({
          name: `${emp.user.firstName} ${emp.user.lastName}`,
          department: dept,
        });
      } else {
        switch (log.status) {
          case "PRESENT":
            presentToday++;
            entry.present++;
            break;
          case "WORK_FROM_HOME":
            wfhToday++;
            entry.present++;
            break;
          case "ON_LEAVE":
            onLeaveToday++;
            break;
          case "ABSENT":
            absentToday++;
            break;
          default:
            presentToday++;
            entry.present++;
        }

        if (log.notes?.toLowerCase().includes("late") && log.checkIn) {
          lateToday++;
          lateComers.push({
            name: `${emp.user.firstName} ${emp.user.lastName}`,
            department: dept,
            checkIn: log.checkIn.toLocaleTimeString(),
          });
        }

        if (log.checkOut && Number(log.totalHours) < EARLY_LEAVE_THRESHOLD_HOURS) {
          earlyLeavers.push({
            name: `${emp.user.firstName} ${emp.user.lastName}`,
            department: dept,
            checkOut: log.checkOut.toLocaleTimeString(),
          });
        }
      }

      deptMap.set(dept, entry);
    }

    const attendanceRate = totalEmployees > 0
      ? Math.round(((presentToday + wfhToday) / totalEmployees) * 100)
      : 0;

    const byDepartment = Array.from(deptMap.entries()).map(([department, data]) => ({
      department,
      present: data.present,
      total: data.total,
      rate: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0,
    })).sort((a, b) => b.rate - a.rate);

    return {
      date: today.toISOString().split("T")[0],
      totalEmployees,
      presentToday,
      absentToday,
      lateToday,
      wfhToday,
      onLeaveToday,
      attendanceRate,
      lateComers,
      earlyLeavers,
      yetToCheckIn: yetToCheckIn.slice(0, 20), // Limit for dashboard
      byDepartment,
    };
  }

  /**
   * Calculate payable days for payroll processing.
   */
  static async calculatePayableDays(
    employeeId: string,
    month: number,
    year: number
  ): Promise<PayableDays> {
    const summary = await this.getMonthlyAttendanceSummary(employeeId, month, year);

    const calendarDays = new Date(year, month, 0).getDate();
    const lopDays = Math.max(0, summary.absentDays);
    const payableDays = summary.totalWorkingDays - lopDays + summary.holidays;

    return {
      employeeId,
      month,
      year,
      calendarDays,
      weekOffs: summary.weekOffs,
      holidays: summary.holidays,
      totalWorkingDays: summary.totalWorkingDays,
      presentDays: summary.presentDays + summary.wfhDays,
      halfDays: summary.halfDays,
      leaveDays: summary.leaveDays,
      absentDays: summary.absentDays,
      lopDays,
      payableDays: Math.max(0, payableDays),
    };
  }

  /**
   * Export attendance data in CSV or JSON format.
   */
  static async exportAttendanceData(
    month: number,
    year: number,
    format: "CSV" | "JSON" = "JSON"
  ): Promise<string> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const logs = await prisma.attendanceLog.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      include: { employee: { include: { user: { select: { firstName: true, lastName: true } } } } },
      orderBy: [{ employeeId: "asc" }, { date: "asc" }],
    });

    if (format === "CSV") {
      const headers = "Employee Code,Name,Date,Check-In,Check-Out,Total Hours,OT Hours,Status,Notes";
      const rows = logs.map((l) =>
        [
          l.employee.employeeCode,
          `${l.employee.user.firstName} ${l.employee.user.lastName}`,
          l.date.toISOString().split("T")[0],
          l.checkIn?.toLocaleTimeString() || "",
          l.checkOut?.toLocaleTimeString() || "",
          l.totalHours?.toString() || "0",
          l.overtimeHours?.toString() || "0",
          l.status,
          `"${(l.notes || "").replace(/"/g, '""')}"`,
        ].join(",")
      );
      return [headers, ...rows].join("\n");
    }

    // JSON format
    const data = logs.map((l) => ({
      employeeCode: l.employee.employeeCode,
      name: `${l.employee.user.firstName} ${l.employee.user.lastName}`,
      date: l.date.toISOString().split("T")[0],
      checkIn: l.checkIn?.toISOString() || null,
      checkOut: l.checkOut?.toISOString() || null,
      totalHours: Number(l.totalHours) || 0,
      overtimeHours: Number(l.overtimeHours) || 0,
      status: l.status,
      notes: l.notes,
    }));

    return JSON.stringify(data, null, 2);
  }

  /**
   * Get employees working beyond a threshold (overworked).
   */
  static async getOverworkedEmployees(
    threshold: number = 50 // Weekly hours threshold
  ): Promise<Array<{ employeeId: string; name: string; department: string; weeklyHours: number; overtime: number }>> {
    // Last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const logs = await prisma.attendanceLog.findMany({
      where: {
        date: { gte: weekAgo },
        totalHours: { not: null },
      },
      include: {
        employee: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    // Group by employee
    const empHours = new Map<string, { name: string; department: string; hours: number; ot: number }>();

    for (const log of logs) {
      const key = log.employeeId;
      const entry = empHours.get(key) || {
        name: `${log.employee.user.firstName} ${log.employee.user.lastName}`,
        department: log.employee.department,
        hours: 0,
        ot: 0,
      };
      entry.hours += Number(log.totalHours) || 0;
      entry.ot += Number(log.overtimeHours) || 0;
      empHours.set(key, entry);
    }

    return Array.from(empHours.entries())
      .filter(([, data]) => data.hours >= threshold)
      .map(([employeeId, data]) => ({
        employeeId,
        name: data.name,
        department: data.department,
        weeklyHours: Math.round(data.hours * 100) / 100,
        overtime: Math.round(data.ot * 100) / 100,
      }))
      .sort((a, b) => b.weeklyHours - a.weeklyHours);
  }

  // ── Private Helpers ──

  private static mapAttendanceLog(log: any): AttendanceEntry {
    return {
      id: log.id,
      employeeId: log.employeeId,
      date: log.date.toISOString().split("T")[0],
      checkIn: log.checkIn?.toISOString() || null,
      checkOut: log.checkOut?.toISOString() || null,
      totalHours: log.totalHours !== null ? Number(log.totalHours) : null,
      overtimeHours: log.overtimeHours !== null ? Number(log.overtimeHours) : null,
      status: log.status,
      location: log.location,
      notes: log.notes,
    };
  }
}
