// ──────────────────────────────────────────────────────────────
// HR & Payroll — Analytics Service
// Workforce analytics: retention, department perf, salary
// benchmarks, leave patterns, expense analysis, attendance,
// hiring funnel, training effectiveness, recognition trends,
// and payroll projections.
// ──────────────────────────────────────────────────────────────

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Response Types
// ══════════════════════════════════════════════════════════════

export interface RetentionResult {
  period: { start: Date; end: Date };
  startHeadcount: number;
  endHeadcount: number;
  newHires: number;
  exits: number;
  retentionRate: number;
  voluntaryExits: number;
  avgTenureMonths: number;
  retentionTrend: Array<{ month: string; rate: number; headcount: number }>;
}

export interface DepartmentPerformanceResult {
  department: string;
  headcount: number;
  avgGoalCompletion: number;
  avgTimesheetHours: number;
  recognitionCount: number;
  avgPerformanceRating: number;
  trainingCompletion: number;
  leaveUtilization: number;
  performanceScore: number;
}

export interface SalaryBenchmarkResult {
  department: string;
  headcount: number;
  min: number;
  max: number;
  avg: number;
  median: number;
  p25: number;
  p75: number;
  totalCost: number;
  byDesignation: Array<{
    designation: string;
    count: number;
    avg: number;
    min: number;
    max: number;
  }>;
}

export interface LeavePatternResult {
  totalLeavesTaken: number;
  avgLeavesPerEmployee: number;
  peakLeaveMonths: Array<{ month: string; count: number }>;
  leaveTypeDistribution: Array<{ type: string; count: number; totalDays: number }>;
  frequentLeaveTakers: Array<{ employeeCode: string; name: string; totalDays: number; leaveCount: number }>;
  dayOfWeekPattern: Array<{ day: string; count: number }>;
  monthlyTrend: Array<{ month: string; leaves: number; days: number }>;
}

export interface ExpenseAnalysisResult {
  totalExpenses: number;
  claimCount: number;
  avgClaimAmount: number;
  byCategory: Array<{ category: string; amount: number; count: number }>;
  byDepartment: Array<{ department: string; amount: number; count: number }>;
  monthlyTrend: Array<{ month: string; amount: number; count: number }>;
  rndExpenses: number;
  pendingReimbursement: number;
  topSpenders: Array<{ employeeCode: string; name: string; totalAmount: number }>;
}

export interface AttendanceAnalysisResult {
  totalRecords: number;
  onTimeRate: number;
  avgWorkingHours: number;
  absenteeRate: number;
  wfhRate: number;
  statusBreakdown: Array<{ status: string; count: number; percentage: number }>;
  departmentAttendance: Array<{ department: string; presentRate: number; avgHours: number }>;
  weekdayPattern: Array<{ day: string; presentCount: number; absentCount: number }>;
  lateArrivals: number;
  earlyDepartures: number;
}

export interface HiringFunnelResult {
  totalApplications: number;
  totalHired: number;
  overallConversionRate: number;
  stages: Array<{
    stage: string;
    count: number;
    conversionFromPrevious: number;
    avgDaysInStage: number;
  }>;
  byDivision: Array<{ division: string; applications: number; hired: number; conversionRate: number }>;
  sourceEffectiveness: Array<{ source: string; applications: number; hired: number; conversionRate: number }>;
  avgTimeToHire: number;
  openPositions: number;
}

export interface TrainingEffectivenessResult {
  totalPrograms: number;
  totalEnrollments: number;
  completionRate: number;
  avgScore: number;
  byCategory: Array<{
    category: string;
    enrollments: number;
    completed: number;
    avgScore: number;
    avgProgress: number;
  }>;
  performanceCorrelation: Array<{
    employeeCode: string;
    trainingsCompleted: number;
    avgTrainingScore: number;
    performanceRating: number;
  }>;
  mandatoryComplianceRate: number;
  dropoutRate: number;
}

export interface RecognitionAnalyticsResult {
  totalRecognitions: number;
  totalPoints: number;
  avgPerEmployee: number;
  topGivers: Array<{ userId: string; name: string; count: number; points: number }>;
  topReceivers: Array<{ userId: string; name: string; count: number; points: number }>;
  byCategory: Array<{ category: string; count: number; points: number }>;
  byType: Array<{ type: string; count: number }>;
  monthlyTrend: Array<{ month: string; count: number; points: number }>;
  departmentEngagement: Array<{ department: string; given: number; received: number }>;
}

export interface PayrollProjectionResult {
  currentMonthlyPayroll: number;
  projections: Array<{
    month: string;
    projectedGross: number;
    projectedNet: number;
    projectedDeductions: number;
    headcount: number;
  }>;
  annualProjection: number;
  growthRate: number;
  departmentBreakdown: Array<{ department: string; monthlyCost: number; headcount: number }>;
}

// ══════════════════════════════════════════════════════════════
// Analytics Service
// ══════════════════════════════════════════════════════════════

export class AnalyticsService {
  /**
   * Calculate employee retention rate over a specified period.
   */
  static async employeeRetention(period: {
    startDate: Date;
    endDate: Date;
  }): Promise<RetentionResult> {
    const { startDate, endDate } = period;

    const startHeadcount = await prisma.employee.count({
      where: {
        dateOfJoining: { lte: startDate },
        OR: [{ dateOfLeaving: null }, { dateOfLeaving: { gt: startDate } }],
      },
    });

    const endHeadcount = await prisma.employee.count({
      where: {
        dateOfJoining: { lte: endDate },
        OR: [{ dateOfLeaving: null }, { dateOfLeaving: { gt: endDate } }],
      },
    });

    const newHires = await prisma.employee.count({
      where: { dateOfJoining: { gte: startDate, lte: endDate } },
    });

    const exits = await prisma.employee.count({
      where: { dateOfLeaving: { gte: startDate, lte: endDate } },
    });

    // Voluntary exits (resignations)
    const voluntaryExits = await prisma.resignation.count({
      where: {
        status: { in: ["ACCEPTED", "COMPLETED"] },
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    // Average tenure
    const allEmployees = await prisma.employee.findMany({
      where: { dateOfLeaving: null },
      select: { dateOfJoining: true },
    });

    const now = new Date();
    const totalTenureMonths = allEmployees.reduce((sum, emp) => {
      return sum + Math.floor((now.getTime() - emp.dateOfJoining.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    }, 0);
    const avgTenureMonths = allEmployees.length > 0
      ? Math.round((totalTenureMonths / allEmployees.length) * 10) / 10
      : 0;

    const avgHeadcount = (startHeadcount + endHeadcount) / 2;
    const retentionRate = avgHeadcount > 0
      ? Math.round(((avgHeadcount - exits) / avgHeadcount) * 100 * 100) / 100
      : 100;

    // Monthly trend
    const monthCount = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    );

    const retentionTrend = await Promise.all(
      Array.from({ length: Math.min(monthCount, 12) }, async (_, i) => {
        const ms = new Date(startDate);
        ms.setMonth(startDate.getMonth() + i);
        const me = new Date(ms);
        me.setMonth(me.getMonth() + 1);
        me.setDate(0);

        const headcount = await prisma.employee.count({
          where: {
            dateOfJoining: { lte: me },
            OR: [{ dateOfLeaving: null }, { dateOfLeaving: { gt: me } }],
          },
        });

        const monthExits = await prisma.employee.count({
          where: { dateOfLeaving: { gte: ms, lte: me } },
        });

        return {
          month: ms.toLocaleString("en-IN", { month: "short", year: "numeric" }),
          rate: headcount > 0 ? Math.round(((headcount - monthExits) / headcount) * 100) : 100,
          headcount,
        };
      })
    );

    return {
      period: { start: startDate, end: endDate },
      startHeadcount,
      endHeadcount,
      newHires,
      exits,
      retentionRate,
      voluntaryExits,
      avgTenureMonths,
      retentionTrend,
    };
  }

  /**
   * Aggregate performance metrics per department.
   */
  static async departmentPerformance(): Promise<DepartmentPerformanceResult[]> {
    const departments = await prisma.employee.groupBy({
      by: ["department"],
      where: { dateOfLeaving: null },
      _count: { id: true },
    });

    const results: DepartmentPerformanceResult[] = [];

    for (const dept of departments) {
      const department = dept.department;
      const headcount = dept._count.id;

      // Get employee IDs for department (needed for Timesheet which lacks employee relation)
      const deptEmployeeIds = await prisma.employee.findMany({
        where: { department, dateOfLeaving: null },
        select: { id: true },
      }).then(emps => emps.map(e => e.id));

      const [goals, timesheets, recognitions, reviews, trainings, leaves] = await Promise.all([
        prisma.goal.aggregate({
          where: { employee: { department, dateOfLeaving: null } },
          _avg: { progress: true },
        }),
        prisma.timesheet.aggregate({
          where: {
            employeeId: { in: deptEmployeeIds },
            status: "APPROVED",
          },
          _avg: { totalHours: true },
        }),
        prisma.recognition.count({
          where: {
            receiverId: {
              in: await prisma.user
                .findMany({ where: { department }, select: { id: true } })
                .then(users => users.map(u => u.id)),
            },
          },
        }),
        prisma.performanceReview.aggregate({
          where: {
            employee: { department, dateOfLeaving: null },
            status: "COMPLETED",
          },
          _avg: { overallRating: true },
        }),
        prisma.trainingEnrollment.count({
          where: {
            employee: { department, dateOfLeaving: null },
            status: "COMPLETED",
          },
        }),
        prisma.leaveRecord.aggregate({
          where: {
            employee: { department, dateOfLeaving: null },
            status: "APPROVED",
            startDate: { gte: new Date(new Date().getFullYear(), 0, 1) },
          },
          _sum: { totalDays: true },
        }),
      ]);

      const avgGoalCompletion = Number(goals._avg.progress || 0);
      const avgTimesheetHours = Number(timesheets?._avg?.totalHours || 0);
      const avgPerformanceRating = Number(reviews._avg.overallRating || 0);
      const totalLeaveDays = Number(leaves._sum.totalDays || 0);
      const leaveUtilization = headcount > 0 ? Math.round((totalLeaveDays / (headcount * 24)) * 100) : 0;
      const trainingCompletion = headcount > 0 ? Math.round((trainings / headcount) * 100) : 0;

      // Composite score (weighted average)
      const performanceScore = Math.round(
        avgGoalCompletion * 0.25 +
        (avgPerformanceRating / 5) * 100 * 0.30 +
        trainingCompletion * 0.15 +
        Math.min(avgTimesheetHours / 40, 1) * 100 * 0.15 +
        (recognitions > 0 ? Math.min(recognitions / headcount, 1) * 100 : 0) * 0.15
      );

      results.push({
        department,
        headcount,
        avgGoalCompletion: Math.round(avgGoalCompletion * 10) / 10,
        avgTimesheetHours: Math.round(avgTimesheetHours * 10) / 10,
        recognitionCount: recognitions,
        avgPerformanceRating: Math.round(avgPerformanceRating * 100) / 100,
        trainingCompletion,
        leaveUtilization,
        performanceScore,
      });
    }

    return results.sort((a, b) => b.performanceScore - a.performanceScore);
  }

  /**
   * Salary benchmark analysis: min, max, avg, median, percentiles by department.
   */
  static async salaryBenchmark(department?: string): Promise<SalaryBenchmarkResult[]> {
    const deptFilter = department ? { department } : {};

    const departments = await prisma.employee.groupBy({
      by: ["department"],
      where: { dateOfLeaving: null, ...deptFilter },
      _count: { id: true },
    });

    const results: SalaryBenchmarkResult[] = [];

    for (const dept of departments) {
      const employees = await prisma.employee.findMany({
        where: { department: dept.department, dateOfLeaving: null },
        select: { baseSalary: true, designation: true },
        orderBy: { baseSalary: "asc" },
      });

      const salaries = employees.map(e => Number(e.baseSalary));
      const n = salaries.length;

      if (n === 0) continue;

      const min = salaries[0];
      const max = salaries[n - 1];
      const avg = Math.round(salaries.reduce((s, v) => s + v, 0) / n);
      const median = n % 2 === 0
        ? Math.round((salaries[n / 2 - 1] + salaries[n / 2]) / 2)
        : salaries[Math.floor(n / 2)];
      const p25 = salaries[Math.floor(n * 0.25)];
      const p75 = salaries[Math.floor(n * 0.75)];
      const totalCost = salaries.reduce((s, v) => s + v, 0);

      // Group by designation
      const designationMap = new Map<string, number[]>();
      for (const emp of employees) {
        const desig = emp.designation;
        if (!designationMap.has(desig)) designationMap.set(desig, []);
        designationMap.get(desig)!.push(Number(emp.baseSalary));
      }

      const byDesignation = Array.from(designationMap.entries()).map(([designation, sals]) => ({
        designation,
        count: sals.length,
        avg: Math.round(sals.reduce((s, v) => s + v, 0) / sals.length),
        min: Math.min(...sals),
        max: Math.max(...sals),
      }));

      results.push({
        department: dept.department,
        headcount: n,
        min, max, avg, median, p25, p75, totalCost,
        byDesignation,
      });
    }

    return results;
  }

  /**
   * Analyze leave patterns: peak months, frequent takers, day-of-week patterns.
   */
  static async leavePatternAnalysis(year?: number): Promise<LeavePatternResult> {
    const targetYear = year || new Date().getFullYear();
    const yearStart = new Date(targetYear, 0, 1);
    const yearEnd = new Date(targetYear, 11, 31, 23, 59, 59);

    const activeEmployees = await prisma.employee.count({ where: { dateOfLeaving: null } });

    const leaveRecords = await prisma.leaveRecord.findMany({
      where: {
        status: "APPROVED",
        startDate: { gte: yearStart, lte: yearEnd },
      },
      include: {
        employee: {
          select: { employeeCode: true, user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    const totalLeavesTaken = leaveRecords.length;
    const avgLeavesPerEmployee = activeEmployees > 0
      ? Math.round((totalLeavesTaken / activeEmployees) * 10) / 10
      : 0;

    // Peak months
    const monthCounts: Record<string, number> = {};
    for (const leave of leaveRecords) {
      const monthKey = leave.startDate.toLocaleString("en-IN", { month: "short", year: "numeric" });
      monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
    }
    const peakLeaveMonths = Object.entries(monthCounts)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => b.count - a.count);

    // Leave type distribution
    const typeMap = new Map<string, { count: number; totalDays: number }>();
    for (const leave of leaveRecords) {
      const entry = typeMap.get(leave.leaveType) || { count: 0, totalDays: 0 };
      entry.count++;
      entry.totalDays += Number(leave.totalDays);
      typeMap.set(leave.leaveType, entry);
    }
    const leaveTypeDistribution = Array.from(typeMap.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.totalDays - a.totalDays);

    // Frequent leave takers
    const employeeLeaveCounts = new Map<string, {
      employeeCode: string; name: string; totalDays: number; leaveCount: number;
    }>();
    for (const leave of leaveRecords) {
      const key = leave.employeeId;
      const entry = employeeLeaveCounts.get(key) || {
        employeeCode: leave.employee.employeeCode,
        name: `${leave.employee.user.firstName} ${leave.employee.user.lastName}`,
        totalDays: 0,
        leaveCount: 0,
      };
      entry.totalDays += Number(leave.totalDays);
      entry.leaveCount++;
      employeeLeaveCounts.set(key, entry);
    }
    const frequentLeaveTakers = Array.from(employeeLeaveCounts.values())
      .sort((a, b) => b.totalDays - a.totalDays)
      .slice(0, 10);

    // Day of week pattern
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayCounts = new Array(7).fill(0);
    for (const leave of leaveRecords) {
      const startDay = leave.startDate.getDay();
      dayCounts[startDay]++;
    }
    const dayOfWeekPattern = dayNames.map((day, i) => ({ day, count: dayCounts[i] }));

    // Monthly trend
    const monthlyTrend: Array<{ month: string; leaves: number; days: number }> = [];
    for (let m = 0; m < 12; m++) {
      const ms = new Date(targetYear, m, 1);
      const me = new Date(targetYear, m + 1, 0, 23, 59, 59);
      const monthLeaves = leaveRecords.filter(
        l => l.startDate >= ms && l.startDate <= me
      );
      monthlyTrend.push({
        month: ms.toLocaleString("en-IN", { month: "short" }),
        leaves: monthLeaves.length,
        days: monthLeaves.reduce((s, l) => s + Number(l.totalDays), 0),
      });
    }

    return {
      totalLeavesTaken,
      avgLeavesPerEmployee,
      peakLeaveMonths,
      leaveTypeDistribution,
      frequentLeaveTakers,
      dayOfWeekPattern,
      monthlyTrend,
    };
  }

  /**
   * Expense analysis: trends by category, department, and month.
   */
  static async expenseAnalysis(period: {
    startDate: Date;
    endDate: Date;
  }): Promise<ExpenseAnalysisResult> {
    const { startDate, endDate } = period;

    const claims = await prisma.expenseClaim.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ["APPROVED", "REIMBURSED"] },
      },
      include: {
        employee: { select: { department: true, employeeCode: true, user: { select: { firstName: true, lastName: true } } } },
        items: { select: { description: true, amount: true, isRnDRelated: true } },
      },
    });

    const totalExpenses = claims.reduce((s, c) => s + Number(c.totalAmount), 0);
    const claimCount = claims.length;
    const avgClaimAmount = claimCount > 0 ? Math.round(totalExpenses / claimCount) : 0;

    // Group by category (from expense items descriptions)
    const categoryMap = new Map<string, { amount: number; count: number }>();
    for (const claim of claims) {
      for (const item of claim.items) {
        const category = item.description.split(" ")[0] || "General";
        const entry = categoryMap.get(category) || { amount: 0, count: 0 };
        entry.amount += Number(item.amount);
        entry.count++;
        categoryMap.set(category, entry);
      }
    }
    const byCategory = Array.from(categoryMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // Group by department
    const deptMap = new Map<string, { amount: number; count: number }>();
    for (const claim of claims) {
      const dept = claim.employee.department;
      const entry = deptMap.get(dept) || { amount: 0, count: 0 };
      entry.amount += Number(claim.totalAmount);
      entry.count++;
      deptMap.set(dept, entry);
    }
    const byDepartment = Array.from(deptMap.entries())
      .map(([department, data]) => ({ department, ...data }))
      .sort((a, b) => b.amount - a.amount);

    // Monthly trend
    const monthDiff = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    );
    const monthlyTrend = Array.from({ length: Math.min(monthDiff, 12) }, (_, i) => {
      const ms = new Date(startDate);
      ms.setMonth(startDate.getMonth() + i);
      const me = new Date(ms);
      me.setMonth(me.getMonth() + 1);
      me.setDate(0);

      const monthClaims = claims.filter(c => c.createdAt >= ms && c.createdAt <= me);
      return {
        month: ms.toLocaleString("en-IN", { month: "short", year: "numeric" }),
        amount: monthClaims.reduce((s, c) => s + Number(c.totalAmount), 0),
        count: monthClaims.length,
      };
    });

    // R&D expenses
    const rndExpenses = claims
      .filter(c => c.isRnDExpense)
      .reduce((s, c) => s + Number(c.totalAmount), 0);

    // Pending reimbursement
    const pendingReimbursement = await prisma.expenseClaim.aggregate({
      where: { status: "APPROVED" },
      _sum: { totalAmount: true },
    });

    // Top spenders
    const spenderMap = new Map<string, { employeeCode: string; name: string; totalAmount: number }>();
    for (const claim of claims) {
      const key = claim.employeeId;
      const entry = spenderMap.get(key) || {
        employeeCode: claim.employee.employeeCode,
        name: `${claim.employee.user.firstName} ${claim.employee.user.lastName}`,
        totalAmount: 0,
      };
      entry.totalAmount += Number(claim.totalAmount);
      spenderMap.set(key, entry);
    }
    const topSpenders = Array.from(spenderMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 10);

    return {
      totalExpenses,
      claimCount,
      avgClaimAmount,
      byCategory,
      byDepartment,
      monthlyTrend,
      rndExpenses,
      pendingReimbursement: Number(pendingReimbursement._sum.totalAmount || 0),
      topSpenders,
    };
  }

  /**
   * Attendance analysis: on-time rate, average hours, absentee patterns.
   */
  static async attendanceAnalysis(period?: {
    startDate: Date;
    endDate: Date;
  }): Promise<AttendanceAnalysisResult> {
    const now = new Date();
    const startDate = period?.startDate || new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = period?.endDate || now;

    const logs = await prisma.attendanceLog.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      include: { employee: { select: { department: true } } },
    });

    const totalRecords = logs.length;
    const presentLogs = logs.filter(l => l.status === "PRESENT" || l.status === "WORK_FROM_HOME");
    const absentLogs = logs.filter(l => l.status === "ABSENT");
    const wfhLogs = logs.filter(l => l.status === "WORK_FROM_HOME");

    const onTimeRate = totalRecords > 0 ? Math.round((presentLogs.length / totalRecords) * 100) : 0;
    const absenteeRate = totalRecords > 0 ? Math.round((absentLogs.length / totalRecords) * 100) : 0;
    const wfhRate = totalRecords > 0 ? Math.round((wfhLogs.length / totalRecords) * 100) : 0;

    const workedHours = presentLogs
      .filter(l => l.totalHours)
      .map(l => Number(l.totalHours));
    const avgWorkingHours = workedHours.length > 0
      ? Math.round((workedHours.reduce((s, h) => s + h, 0) / workedHours.length) * 10) / 10
      : 0;

    // Status breakdown
    const statusCountMap = new Map<string, number>();
    for (const log of logs) {
      statusCountMap.set(log.status, (statusCountMap.get(log.status) || 0) + 1);
    }
    const statusBreakdown = Array.from(statusCountMap.entries()).map(([status, count]) => ({
      status,
      count,
      percentage: totalRecords > 0 ? Math.round((count / totalRecords) * 100) : 0,
    }));

    // Department attendance
    const deptMap = new Map<string, { present: number; total: number; hours: number[]; }>();
    for (const log of logs) {
      const dept = log.employee.department;
      const entry = deptMap.get(dept) || { present: 0, total: 0, hours: [] };
      entry.total++;
      if (log.status === "PRESENT" || log.status === "WORK_FROM_HOME") {
        entry.present++;
        if (log.totalHours) entry.hours.push(Number(log.totalHours));
      }
      deptMap.set(dept, entry);
    }
    const departmentAttendance = Array.from(deptMap.entries()).map(([department, data]) => ({
      department,
      presentRate: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0,
      avgHours: data.hours.length > 0
        ? Math.round((data.hours.reduce((s, h) => s + h, 0) / data.hours.length) * 10) / 10
        : 0,
    }));

    // Weekday pattern
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayPresent = new Array(7).fill(0);
    const dayAbsent = new Array(7).fill(0);
    for (const log of logs) {
      const day = new Date(log.date).getDay();
      if (log.status === "PRESENT" || log.status === "WORK_FROM_HOME") dayPresent[day]++;
      if (log.status === "ABSENT") dayAbsent[day]++;
    }
    const weekdayPattern = dayNames.map((day, i) => ({
      day,
      presentCount: dayPresent[i],
      absentCount: dayAbsent[i],
    }));

    // Late arrivals (check-in after 10:00)
    const lateArrivals = presentLogs.filter(l => {
      if (!l.checkIn) return false;
      const checkInHour = new Date(l.checkIn).getHours();
      return checkInHour >= 10;
    }).length;

    // Early departures (check-out before 17:00)
    const earlyDepartures = presentLogs.filter(l => {
      if (!l.checkOut) return false;
      const checkOutHour = new Date(l.checkOut).getHours();
      return checkOutHour < 17;
    }).length;

    return {
      totalRecords,
      onTimeRate,
      avgWorkingHours,
      absenteeRate,
      wfhRate,
      statusBreakdown,
      departmentAttendance,
      weekdayPattern,
      lateArrivals,
      earlyDepartures,
    };
  }

  /**
   * Hiring funnel: conversion rates across recruitment pipeline stages.
   */
  static async hiringFunnel(): Promise<HiringFunnelResult> {
    const applications = await prisma.application.findMany({
      include: {
        job: { select: { division: true, department: true } },
        candidate: { select: { source: true } },
      },
    });

    const totalApplications = applications.length;
    const totalHired = applications.filter(a => a.status === "HIRED").length;
    const overallConversionRate = totalApplications > 0
      ? Math.round((totalHired / totalApplications) * 100 * 100) / 100
      : 0;

    // Stage funnel
    const stageOrder = [
      "APPLIED", "SCREENING", "SHORTLISTED", "TECHNICAL_ROUND",
      "HR_ROUND", "FINAL_ROUND", "OFFER_EXTENDED", "OFFER_ACCEPTED", "HIRED",
    ];
    const stageCounts = new Map<string, number>();
    for (const app of applications) {
      const stageIdx = stageOrder.indexOf(app.status);
      // Count all stages this application passed through
      for (let i = 0; i <= stageIdx; i++) {
        stageCounts.set(stageOrder[i], (stageCounts.get(stageOrder[i]) || 0) + 1);
      }
    }

    const stages = stageOrder.map((stage, i) => {
      const count = stageCounts.get(stage) || 0;
      const prevCount = i > 0 ? (stageCounts.get(stageOrder[i - 1]) || 0) : totalApplications;
      return {
        stage,
        count,
        conversionFromPrevious: prevCount > 0 ? Math.round((count / prevCount) * 100) : 0,
        avgDaysInStage: 0, // Would require timeline data computation
      };
    });

    // By division
    const divMap = new Map<string, { applications: number; hired: number }>();
    for (const app of applications) {
      const div = app.job.division;
      const entry = divMap.get(div) || { applications: 0, hired: 0 };
      entry.applications++;
      if (app.status === "HIRED") entry.hired++;
      divMap.set(div, entry);
    }
    const byDivision = Array.from(divMap.entries()).map(([division, data]) => ({
      division,
      ...data,
      conversionRate: data.applications > 0 ? Math.round((data.hired / data.applications) * 100) : 0,
    }));

    // Source effectiveness
    const sourceMap = new Map<string, { applications: number; hired: number }>();
    for (const app of applications) {
      const source = app.candidate.source;
      const entry = sourceMap.get(source) || { applications: 0, hired: 0 };
      entry.applications++;
      if (app.status === "HIRED") entry.hired++;
      sourceMap.set(source, entry);
    }
    const sourceEffectiveness = Array.from(sourceMap.entries()).map(([source, data]) => ({
      source,
      ...data,
      conversionRate: data.applications > 0 ? Math.round((data.hired / data.applications) * 100) : 0,
    }));

    // Average time to hire
    const hiredApps = applications.filter(a => a.status === "HIRED" && a.hiredAt);
    const avgTimeToHire = hiredApps.length > 0
      ? Math.round(
          hiredApps.reduce((sum, a) => {
            return sum + Math.floor((a.hiredAt!.getTime() - a.appliedAt.getTime()) / (1000 * 60 * 60 * 24));
          }, 0) / hiredApps.length
        )
      : 0;

    const openPositions = await prisma.jobPosting.count({ where: { status: "OPEN" } });

    return {
      totalApplications,
      totalHired,
      overallConversionRate,
      stages,
      byDivision,
      sourceEffectiveness,
      avgTimeToHire,
      openPositions,
    };
  }

  /**
   * Training effectiveness: completion rates, scores, performance correlation.
   */
  static async trainingEffectiveness(): Promise<TrainingEffectivenessResult> {
    const totalPrograms = await prisma.trainingProgram.count();
    const enrollments = await prisma.trainingEnrollment.findMany({
      include: {
        program: { select: { category: true, mandatory: true } },
        employee: {
          select: {
            employeeCode: true,
            performanceReviews: {
              where: { status: "COMPLETED" },
              select: { overallRating: true },
              orderBy: { completedAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    const totalEnrollments = enrollments.length;
    const completed = enrollments.filter(e => e.status === "COMPLETED");
    const dropped = enrollments.filter(e => e.status === "DROPPED");
    const completionRate = totalEnrollments > 0
      ? Math.round((completed.length / totalEnrollments) * 100)
      : 0;
    const dropoutRate = totalEnrollments > 0
      ? Math.round((dropped.length / totalEnrollments) * 100)
      : 0;

    const scores = completed
      .filter(e => e.score !== null)
      .map(e => Number(e.score));
    const avgScore = scores.length > 0
      ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
      : 0;

    // By category
    const categoryMap = new Map<string, {
      enrollments: number; completed: number; scores: number[]; progresses: number[];
    }>();
    for (const e of enrollments) {
      const cat = e.program.category;
      const entry = categoryMap.get(cat) || { enrollments: 0, completed: 0, scores: [], progresses: [] };
      entry.enrollments++;
      if (e.status === "COMPLETED") entry.completed++;
      if (e.score) entry.scores.push(Number(e.score));
      entry.progresses.push(e.progress);
      categoryMap.set(cat, entry);
    }
    const byCategory = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      enrollments: data.enrollments,
      completed: data.completed,
      avgScore: data.scores.length > 0
        ? Math.round((data.scores.reduce((s, v) => s + v, 0) / data.scores.length) * 10) / 10
        : 0,
      avgProgress: data.progresses.length > 0
        ? Math.round(data.progresses.reduce((s, v) => s + v, 0) / data.progresses.length)
        : 0,
    }));

    // Performance correlation
    const employeeTrainingMap = new Map<string, {
      employeeCode: string;
      trainingsCompleted: number;
      scores: number[];
      performanceRating: number;
    }>();
    for (const e of completed) {
      const key = e.employeeId;
      const entry = employeeTrainingMap.get(key) || {
        employeeCode: e.employee.employeeCode,
        trainingsCompleted: 0,
        scores: [],
        performanceRating: e.employee.performanceReviews[0]
          ? Number(e.employee.performanceReviews[0].overallRating)
          : 0,
      };
      entry.trainingsCompleted++;
      if (e.score) entry.scores.push(Number(e.score));
      employeeTrainingMap.set(key, entry);
    }
    const performanceCorrelation = Array.from(employeeTrainingMap.values())
      .filter(e => e.performanceRating > 0)
      .map(e => ({
        employeeCode: e.employeeCode,
        trainingsCompleted: e.trainingsCompleted,
        avgTrainingScore: e.scores.length > 0
          ? Math.round((e.scores.reduce((s, v) => s + v, 0) / e.scores.length) * 10) / 10
          : 0,
        performanceRating: e.performanceRating,
      }))
      .sort((a, b) => b.performanceRating - a.performanceRating)
      .slice(0, 20);

    // Mandatory compliance rate
    const mandatoryEnrollments = enrollments.filter(e => e.program.mandatory);
    const mandatoryCompleted = mandatoryEnrollments.filter(e => e.status === "COMPLETED");
    const mandatoryComplianceRate = mandatoryEnrollments.length > 0
      ? Math.round((mandatoryCompleted.length / mandatoryEnrollments.length) * 100)
      : 100;

    return {
      totalPrograms,
      totalEnrollments,
      completionRate,
      avgScore,
      byCategory,
      performanceCorrelation,
      mandatoryComplianceRate,
      dropoutRate,
    };
  }

  /**
   * Recognition analytics: top givers/receivers, category trends.
   */
  static async recognitionAnalytics(year?: number): Promise<RecognitionAnalyticsResult> {
    const targetYear = year || new Date().getFullYear();
    const yearStart = new Date(targetYear, 0, 1);
    const yearEnd = new Date(targetYear, 11, 31, 23, 59, 59);

    const recognitions = await prisma.recognition.findMany({
      where: { createdAt: { gte: yearStart, lte: yearEnd } },
    });

    const totalRecognitions = recognitions.length;
    const totalPoints = recognitions.reduce((s, r) => s + r.points, 0);

    // Get active employee count for average
    const activeEmployees = await prisma.employee.count({ where: { dateOfLeaving: null } });
    const avgPerEmployee = activeEmployees > 0
      ? Math.round((totalRecognitions / activeEmployees) * 10) / 10
      : 0;

    // Top givers
    const giverMap = new Map<string, { count: number; points: number }>();
    const receiverMap = new Map<string, { count: number; points: number }>();
    for (const r of recognitions) {
      const gEntry = giverMap.get(r.giverId) || { count: 0, points: 0 };
      gEntry.count++;
      gEntry.points += r.points;
      giverMap.set(r.giverId, gEntry);

      const rEntry = receiverMap.get(r.receiverId) || { count: 0, points: 0 };
      rEntry.count++;
      rEntry.points += r.points;
      receiverMap.set(r.receiverId, rEntry);
    }

    const allUserIds = [...new Set([...giverMap.keys(), ...receiverMap.keys()])];
    const users = await prisma.user.findMany({
      where: { id: { in: allUserIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userNameMap = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`]));

    const topGivers = Array.from(giverMap.entries())
      .map(([userId, data]) => ({
        userId, name: userNameMap.get(userId) || "Unknown", ...data,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topReceivers = Array.from(receiverMap.entries())
      .map(([userId, data]) => ({
        userId, name: userNameMap.get(userId) || "Unknown", ...data,
      }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 10);

    // By category
    const catMap = new Map<string, { count: number; points: number }>();
    for (const r of recognitions) {
      const entry = catMap.get(r.category) || { count: 0, points: 0 };
      entry.count++;
      entry.points += r.points;
      catMap.set(r.category, entry);
    }
    const byCategory = Array.from(catMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.count - a.count);

    // By type
    const typeMap = new Map<string, number>();
    for (const r of recognitions) {
      typeMap.set(r.type, (typeMap.get(r.type) || 0) + 1);
    }
    const byType = Array.from(typeMap.entries())
      .map(([type, count]) => ({ type, count }));

    // Monthly trend
    const monthlyTrend: Array<{ month: string; count: number; points: number }> = [];
    for (let m = 0; m < 12; m++) {
      const ms = new Date(targetYear, m, 1);
      const me = new Date(targetYear, m + 1, 0, 23, 59, 59);
      const monthRecs = recognitions.filter(r => r.createdAt >= ms && r.createdAt <= me);
      monthlyTrend.push({
        month: ms.toLocaleString("en-IN", { month: "short" }),
        count: monthRecs.length,
        points: monthRecs.reduce((s, r) => s + r.points, 0),
      });
    }

    // Department engagement
    const deptUsers = await prisma.user.findMany({
      where: { department: { not: null } },
      select: { id: true, department: true },
    });
    const userDeptMap = new Map(deptUsers.map(u => [u.id, u.department!]));

    const deptEngMap = new Map<string, { given: number; received: number }>();
    for (const r of recognitions) {
      const giverDept = userDeptMap.get(r.giverId);
      const receiverDept = userDeptMap.get(r.receiverId);
      if (giverDept) {
        const entry = deptEngMap.get(giverDept) || { given: 0, received: 0 };
        entry.given++;
        deptEngMap.set(giverDept, entry);
      }
      if (receiverDept) {
        const entry = deptEngMap.get(receiverDept) || { given: 0, received: 0 };
        entry.received++;
        deptEngMap.set(receiverDept, entry);
      }
    }
    const departmentEngagement = Array.from(deptEngMap.entries())
      .map(([department, data]) => ({ department, ...data }))
      .sort((a, b) => (b.given + b.received) - (a.given + a.received));

    return {
      totalRecognitions,
      totalPoints,
      avgPerEmployee,
      topGivers,
      topReceivers,
      byCategory,
      byType,
      monthlyTrend,
      departmentEngagement,
    };
  }

  /**
   * Project future payroll costs based on historical trends.
   */
  static async payrollProjection(months: number = 6): Promise<PayrollProjectionResult> {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Get last 6 months of payroll data
    const recentPayroll = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const m = currentMonth - (5 - i);
        const y = m <= 0 ? currentYear - 1 : currentYear;
        const adjustedMonth = m <= 0 ? m + 12 : m;

        return prisma.salarySlip.aggregate({
          where: { month: adjustedMonth, year: y },
          _sum: { grossSalary: true, netSalary: true, totalDeductions: true },
          _count: { id: true },
        }).then(r => ({
          month: adjustedMonth,
          year: y,
          gross: Number(r._sum.grossSalary || 0),
          net: Number(r._sum.netSalary || 0),
          deductions: Number(r._sum.totalDeductions || 0),
          headcount: r._count.id,
        }));
      })
    );

    const recentWithData = recentPayroll.filter(p => p.headcount > 0);
    const currentMonthlyPayroll = recentWithData.length > 0
      ? recentWithData[recentWithData.length - 1].gross
      : 0;

    // Calculate growth rate
    let growthRate = 0;
    if (recentWithData.length >= 2) {
      const first = recentWithData[0].gross;
      const last = recentWithData[recentWithData.length - 1].gross;
      if (first > 0) {
        growthRate = Math.round(((last - first) / first) * 100 * 100) / 100;
      }
    }

    // Monthly growth factor
    const monthlyGrowthFactor = recentWithData.length >= 2
      ? Math.pow(1 + growthRate / 100, 1 / recentWithData.length)
      : 1;

    // Project future months
    const baseGross = currentMonthlyPayroll || recentWithData.reduce((s, p) => s + p.gross, 0) / Math.max(recentWithData.length, 1);
    const baseNet = recentWithData.length > 0
      ? recentWithData[recentWithData.length - 1].net
      : 0;
    const baseDeductions = recentWithData.length > 0
      ? recentWithData[recentWithData.length - 1].deductions
      : 0;
    const baseHeadcount = recentWithData.length > 0
      ? recentWithData[recentWithData.length - 1].headcount
      : await prisma.employee.count({ where: { dateOfLeaving: null } });

    const projections = Array.from({ length: months }, (_, i) => {
      const projMonth = currentMonth + i + 1;
      const projYear = projMonth > 12 ? currentYear + Math.floor((projMonth - 1) / 12) : currentYear;
      const adjustedMonth = ((projMonth - 1) % 12) + 1;
      const factor = Math.pow(monthlyGrowthFactor, i + 1);

      return {
        month: new Date(projYear, adjustedMonth - 1).toLocaleString("en-IN", { month: "short", year: "numeric" }),
        projectedGross: Math.round(baseGross * factor),
        projectedNet: Math.round(baseNet * factor),
        projectedDeductions: Math.round(baseDeductions * factor),
        headcount: baseHeadcount,
      };
    });

    const annualProjection = projections.reduce((s, p) => s + p.projectedGross, 0)
      + recentWithData.reduce((s, p) => s + p.gross, 0);

    // Department breakdown
    const departments = await prisma.employee.groupBy({
      by: ["department"],
      where: { dateOfLeaving: null },
      _count: { id: true },
      _sum: { baseSalary: true },
    });

    const departmentBreakdown = departments.map(d => ({
      department: d.department,
      monthlyCost: Math.round(Number(d._sum.baseSalary || 0) / 12),
      headcount: d._count.id,
    }));

    return {
      currentMonthlyPayroll,
      projections,
      annualProjection,
      growthRate,
      departmentBreakdown,
    };
  }
}
