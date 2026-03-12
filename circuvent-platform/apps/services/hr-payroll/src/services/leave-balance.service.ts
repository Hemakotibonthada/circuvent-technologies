// ──────────────────────────────────────────────────────────────
// HR & Payroll — Leave Balance Service
// Comprehensive leave balance computation with carry-forward,
// accrual rules, pro-rata for new joiners, and encashment.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface LeaveEntitlement {
  annual: number;
  maxAccumulation: number;
  carryForward: boolean;
  encashable: boolean;
  proRataForNewJoiners: boolean;
}

const LEAVE_ENTITLEMENTS: Record<string, LeaveEntitlement> = {
  CASUAL:       { annual: 12, maxAccumulation: 12, carryForward: false, encashable: false, proRataForNewJoiners: true },
  SICK:         { annual: 12, maxAccumulation: 36, carryForward: true, encashable: false, proRataForNewJoiners: false },
  EARNED:       { annual: 15, maxAccumulation: 45, carryForward: true, encashable: true, proRataForNewJoiners: true },
  MATERNITY:    { annual: 182, maxAccumulation: 182, carryForward: false, encashable: false, proRataForNewJoiners: false },
  PATERNITY:    { annual: 15, maxAccumulation: 15, carryForward: false, encashable: false, proRataForNewJoiners: false },
  COMPENSATORY: { annual: 0, maxAccumulation: 10, carryForward: true, encashable: false, proRataForNewJoiners: false },
  BEREAVEMENT:  { annual: 5, maxAccumulation: 5, carryForward: false, encashable: false, proRataForNewJoiners: false },
  UNPAID:       { annual: 999, maxAccumulation: 999, carryForward: false, encashable: false, proRataForNewJoiners: false },
};

export interface DetailedLeaveBalance {
  leaveType: string;
  entitled: number;
  carriedForward: number;
  accrued: number;
  used: number;
  pending: number;
  available: number;
  encashable: number;
  maxAccumulation: number;
}

export interface FullLeaveReport {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  financialYear: string;
  joiningDate: string;
  monthsInFY: number;
  balances: DetailedLeaveBalance[];
  totalEntitled: number;
  totalUsed: number;
  totalAvailable: number;
  totalEncashable: number;
  history: { id: string; type: string; startDate: string; endDate: string; days: number; status: string }[];
}

export class LeaveBalanceService {
  static async getFullReport(employeeId: string, financialYear?: string): Promise<FullLeaveReport> {
    const fy = financialYear || this.getCurrentFY();
    const [fyStartYear] = fy.split("-").map(Number);
    const fyStart = new Date(fyStartYear, 3, 1);
    const fyEnd = new Date(fyStartYear + 1, 2, 31);

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!employee) throw new Error("Employee not found");

    // Calculate months in FY
    const joinDate = new Date(employee.dateOfJoining);
    const effectiveStart = joinDate > fyStart ? joinDate : fyStart;
    const monthsInFY = Math.max(1, Math.ceil(
      (fyEnd.getTime() - effectiveStart.getTime()) / (30.44 * 24 * 60 * 60 * 1000)
    ));

    // Get all leave records in FY
    const leaves = await prisma.leaveRecord.findMany({
      where: {
        employeeId,
        OR: [
          { startDate: { gte: fyStart, lte: fyEnd } },
          { endDate: { gte: fyStart, lte: fyEnd } },
          { startDate: { lte: fyStart }, endDate: { gte: fyEnd } },
        ],
      },
      orderBy: { startDate: "desc" },
    });

    // Get previous FY carry-forward (if applicable)
    const prevFYEnd = new Date(fyStartYear, 2, 31);
    const prevLeaves = await prisma.leaveRecord.findMany({
      where: {
        employeeId,
        status: { in: ["APPROVED"] },
        startDate: { lt: fyStart },
      },
    });

    const balances: DetailedLeaveBalance[] = [];
    let totalEntitled = 0, totalUsed = 0, totalAvailable = 0, totalEncashable = 0;

    for (const [leaveType, entitlement] of Object.entries(LEAVE_ENTITLEMENTS)) {
      if (leaveType === "UNPAID") continue;

      // Pro-rata for new joiners
      let entitled = entitlement.annual;
      if (entitlement.proRataForNewJoiners && joinDate > fyStart) {
        entitled = Math.round((entitlement.annual * monthsInFY) / 12);
      }

      // Carry forward from previous year
      let carriedForward = 0;
      if (entitlement.carryForward) {
        const prevUsed = prevLeaves
          .filter((l) => l.leaveType === leaveType && l.status === "APPROVED")
          .reduce((sum, l) => sum + Number(l.totalDays), 0);
        const prevEntitled = entitlement.annual;
        carriedForward = Math.min(
          Math.max(0, prevEntitled - prevUsed),
          entitlement.maxAccumulation - entitled
        );
      }

      // Calculate accrued (monthly accrual)
      const now = new Date();
      const monthsElapsed = now < fyStart ? 0 : Math.min(
        monthsInFY,
        Math.ceil((Math.min(now.getTime(), fyEnd.getTime()) - effectiveStart.getTime()) / (30.44 * 24 * 60 * 60 * 1000))
      );
      const accrued = Math.min(entitled, Math.round((entitled * monthsElapsed) / 12));

      // Used and pending
      const typeLeaves = leaves.filter((l) => l.leaveType === leaveType);
      const used = typeLeaves
        .filter((l) => l.status === "APPROVED")
        .reduce((sum, l) => sum + Number(l.totalDays), 0);
      const pending = typeLeaves
        .filter((l) => l.status === "PENDING")
        .reduce((sum, l) => sum + Number(l.totalDays), 0);

      const available = Math.max(0, Math.min(
        entitled + carriedForward - used - pending,
        entitlement.maxAccumulation
      ));

      const encashable = entitlement.encashable ? Math.max(0, available - pending) : 0;

      balances.push({
        leaveType, entitled, carriedForward, accrued, used, pending,
        available, encashable, maxAccumulation: entitlement.maxAccumulation,
      });

      totalEntitled += entitled + carriedForward;
      totalUsed += used;
      totalAvailable += available;
      totalEncashable += encashable;
    }

    const history = leaves.map((l) => ({
      id: l.id,
      type: l.leaveType,
      startDate: l.startDate.toISOString().split("T")[0],
      endDate: l.endDate.toISOString().split("T")[0],
      days: Number(l.totalDays),
      status: l.status,
    }));

    return {
      employeeId,
      employeeCode: employee.employeeCode,
      employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
      financialYear: fy,
      joiningDate: employee.dateOfJoining.toISOString().split("T")[0],
      monthsInFY,
      balances,
      totalEntitled, totalUsed, totalAvailable, totalEncashable,
      history,
    };
  }

  static async getTeamSummary(department: string, financialYear?: string): Promise<{
    department: string;
    employees: { id: string; name: string; totalUsed: number; totalAvailable: number }[];
    departmentTotals: { totalEntitled: number; totalUsed: number; avgUsagePercent: number };
  }> {
    const employees = await prisma.employee.findMany({
      where: { department, dateOfLeaving: null },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    const summaries = await Promise.all(
      employees.map(async (emp) => {
        try {
          const report = await this.getFullReport(emp.id, financialYear);
          return {
            id: emp.id,
            name: `${emp.user.firstName} ${emp.user.lastName}`,
            totalUsed: report.totalUsed,
            totalAvailable: report.totalAvailable,
            totalEntitled: report.totalEntitled,
          };
        } catch {
          return { id: emp.id, name: `${emp.user.firstName} ${emp.user.lastName}`, totalUsed: 0, totalAvailable: 0, totalEntitled: 0 };
        }
      })
    );

    const totalEntitled = summaries.reduce((s, e) => s + e.totalEntitled, 0);
    const totalUsed = summaries.reduce((s, e) => s + e.totalUsed, 0);

    return {
      department,
      employees: summaries.map((e) => ({ id: e.id, name: e.name, totalUsed: e.totalUsed, totalAvailable: e.totalAvailable })),
      departmentTotals: {
        totalEntitled,
        totalUsed,
        avgUsagePercent: totalEntitled > 0 ? Math.round((totalUsed / totalEntitled) * 100) : 0,
      },
    };
  }

  static async calculateEncashment(employeeId: string): Promise<{
    eligible: boolean;
    encashableDays: number;
    dailyRate: number;
    encashmentAmount: number;
    breakdown: { leaveType: string; days: number; amount: number }[];
  }> {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new Error("Employee not found");

    const report = await this.getFullReport(employeeId);
    const dailyRate = Number(employee.baseSalary) / 365;

    const breakdown = report.balances
      .filter((b) => b.encashable > 0)
      .map((b) => ({
        leaveType: b.leaveType,
        days: b.encashable,
        amount: Math.round(b.encashable * dailyRate),
      }));

    const totalDays = breakdown.reduce((s, b) => s + b.days, 0);
    const totalAmount = breakdown.reduce((s, b) => s + b.amount, 0);

    return {
      eligible: totalDays > 0,
      encashableDays: totalDays,
      dailyRate: Math.round(dailyRate),
      encashmentAmount: totalAmount,
      breakdown,
    };
  }

  private static getCurrentFY(): string {
    const now = new Date();
    const year = now.getFullYear();
    return now.getMonth() < 3 ? `${year - 1}-${year}` : `${year}-${year + 1}`;
  }
}
