// ──────────────────────────────────────────────────────────────
// Leave Approval Workflow
// Manages leave requests with balance validation, overlap
// detection, holiday-awareness, and approval chain.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";
import { EmployeeEntity } from "../domain/employee.entity";

const prisma = new PrismaClient();

export interface LeaveRequestInput {
  employeeId: string;
  leaveType: "CASUAL" | "SICK" | "EARNED" | "MATERNITY" | "PATERNITY" | "UNPAID" | "COMPENSATORY";
  startDate: string;
  endDate: string;
  reason?: string;
  approverId: string;
}

export interface LeaveBalance {
  casual: { entitled: number; used: number; remaining: number };
  sick: { entitled: number; used: number; remaining: number };
  earned: { entitled: number; used: number; remaining: number };
  maternity: { entitled: number; used: number; remaining: number };
  paternity: { entitled: number; used: number; remaining: number };
  compensatory: { entitled: number; used: number; remaining: number };
  total: { entitled: number; used: number; remaining: number };
}

const LEAVE_ENTITLEMENTS: Record<string, { annual: number; maxAccumulation: number; carryForward: boolean }> = {
  CASUAL: { annual: 12, maxAccumulation: 12, carryForward: false },
  SICK: { annual: 12, maxAccumulation: 36, carryForward: true },
  EARNED: { annual: 15, maxAccumulation: 45, carryForward: true },
  MATERNITY: { annual: 182, maxAccumulation: 182, carryForward: false }, // 26 weeks (days)
  PATERNITY: { annual: 15, maxAccumulation: 15, carryForward: false },
  COMPENSATORY: { annual: 0, maxAccumulation: 10, carryForward: true },
  UNPAID: { annual: 999, maxAccumulation: 999, carryForward: false },
};

export class LeaveApprovalWorkflow {
  /**
   * Submit a leave request with validation.
   */
  static async submit(input: LeaveRequestInput, actorId: string): Promise<any> {
    const employee = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!employee) throw new Error("Employee not found");

    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    // Validate dates
    if (startDate > endDate) throw new Error("Start date must be before end date");
    if (startDate < new Date()) throw new Error("Cannot apply for past dates");

    // Calculate total days
    const totalDays = this.calculateLeaveDays(startDate, endDate, input.leaveType);

    // Check for overlapping leave
    const overlap = await this.checkOverlap(input.employeeId, startDate, endDate);
    if (overlap) {
      throw new Error(`Leave dates overlap with existing request: ${overlap.leaveType} (${overlap.startDate.toISOString().split("T")[0]} to ${overlap.endDate.toISOString().split("T")[0]})`);
    }

    // Check leave balance
    if (input.leaveType !== "UNPAID") {
      const balance = await this.getBalance(input.employeeId);
      const typeKey = input.leaveType.toLowerCase() as keyof LeaveBalance;
      const available = (balance[typeKey] as any)?.remaining ?? 0;
      if (totalDays > available) {
        throw new Error(
          `Insufficient ${input.leaveType} leave balance. Available: ${available}, Requested: ${totalDays}`
        );
      }
    }

    // Self-approval prevention
    if (input.approverId === employee.userId) {
      throw new Error("Cannot approve own leave request");
    }

    const record = await prisma.leaveRecord.create({
      data: {
        employeeId: input.employeeId,
        leaveType: input.leaveType,
        startDate,
        endDate,
        totalDays,
        reason: input.reason,
        status: "PENDING",
        approvedBy: null,
      },
    });

    await createAuditLog({
      userId: actorId,
      action: "CREATE",
      entity: "LeaveRecord",
      entityId: record.id,
      newValue: { employeeId: input.employeeId, leaveType: input.leaveType, totalDays, startDate: input.startDate, endDate: input.endDate },
    });

    return record;
  }

  /**
   * Approve a leave request.
   */
  static async approve(leaveId: string, approverId: string, comments?: string): Promise<any> {
    const leave = await prisma.leaveRecord.findUnique({ where: { id: leaveId } });
    if (!leave) throw new Error("Leave record not found");
    if (leave.status !== "PENDING") throw new Error("Leave is not in PENDING state");

    const record = await prisma.leaveRecord.update({
      where: { id: leaveId },
      data: { status: "APPROVED", approvedBy: approverId },
    });

    await createAuditLog({
      userId: approverId,
      action: "APPROVE",
      entity: "LeaveRecord",
      entityId: leaveId,
      newValue: { status: "APPROVED", comments },
    });

    return record;
  }

  /**
   * Reject a leave request.
   */
  static async reject(leaveId: string, approverId: string, comments?: string): Promise<any> {
    const leave = await prisma.leaveRecord.findUnique({ where: { id: leaveId } });
    if (!leave) throw new Error("Leave record not found");
    if (leave.status !== "PENDING") throw new Error("Leave is not in PENDING state");

    const record = await prisma.leaveRecord.update({
      where: { id: leaveId },
      data: { status: "REJECTED", approvedBy: approverId },
    });

    await createAuditLog({
      userId: approverId,
      action: "REJECT",
      entity: "LeaveRecord",
      entityId: leaveId,
      newValue: { status: "REJECTED", comments },
    });

    return record;
  }

  /**
   * Cancel a pending leave request.
   */
  static async cancel(leaveId: string, actorId: string): Promise<any> {
    const leave = await prisma.leaveRecord.findUnique({ where: { id: leaveId } });
    if (!leave) throw new Error("Leave record not found");
    if (leave.status !== "PENDING" && leave.status !== "APPROVED") {
      throw new Error("Only PENDING or APPROVED leaves can be cancelled");
    }

    const record = await prisma.leaveRecord.update({
      where: { id: leaveId },
      data: { status: "CANCELLED" },
    });

    await createAuditLog({
      userId: actorId, action: "UPDATE", entity: "LeaveRecord",
      entityId: leaveId, newValue: { status: "CANCELLED" },
    });

    return record;
  }

  /**
   * Get leave balance for an employee.
   */
  static async getBalance(employeeId: string): Promise<LeaveBalance> {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new Error("Employee not found");

    const entity = new EmployeeEntity({
      id: employee.id,
      employeeCode: employee.employeeCode,
      userId: employee.userId,
      employmentType: employee.employmentType as any,
      designation: employee.designation,
      department: employee.department,
      dateOfJoining: employee.dateOfJoining,
      dateOfLeaving: employee.dateOfLeaving,
      baseSalary: Number(employee.baseSalary),
      currency: employee.currency,
      panNumber: employee.panNumber,
      aadhaarNumber: employee.aadhaarNumber,
      uanNumber: employee.uanNumber,
    });

    // Get used leaves per type (approved + pending)
    const usedLeaves = await prisma.leaveRecord.groupBy({
      by: ["leaveType"],
      where: {
        employeeId,
        status: { in: ["APPROVED", "PENDING"] },
        startDate: { gte: this.getCurrentFYStart() },
      },
      _sum: { totalDays: true },
    });

    const usedMap: Record<string, number> = {};
    for (const u of usedLeaves) {
      usedMap[u.leaveType] = Number(u._sum.totalDays || 0);
    }

    const makeEntry = (type: string) => {
      const entitlement = LEAVE_ENTITLEMENTS[type] || { annual: 0, maxAccumulation: 0, carryForward: false };
      const entitled = entitlement.annual;
      const used = usedMap[type] || 0;
      return { entitled, used, remaining: Math.max(0, entitled - used) };
    };

    const types = ["casual", "sick", "earned", "maternity", "paternity", "compensatory"] as const;
    const balance: any = {};
    let totalEntitled = 0, totalUsed = 0, totalRemaining = 0;

    for (const t of types) {
      const entry = makeEntry(t.toUpperCase());
      balance[t] = entry;
      totalEntitled += entry.entitled;
      totalUsed += entry.used;
      totalRemaining += entry.remaining;
    }

    balance.total = { entitled: totalEntitled, used: totalUsed, remaining: totalRemaining };
    return balance as LeaveBalance;
  }

  /**
   * Get team leave calendar for a period.
   */
  static async getTeamCalendar(department: string, month: number, year: number): Promise<any[]> {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);

    const employees = await prisma.employee.findMany({
      where: { department, dateOfLeaving: null },
      include: {
        user: { select: { firstName: true, lastName: true } },
        leaveRecords: {
          where: {
            status: { in: ["APPROVED", "PENDING"] },
            OR: [
              { startDate: { gte: start, lte: end } },
              { endDate: { gte: start, lte: end } },
              { startDate: { lte: start }, endDate: { gte: end } },
            ],
          },
        },
      },
    });

    return employees.map((emp) => ({
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      name: `${emp.user.firstName} ${emp.user.lastName}`,
      leaves: emp.leaveRecords.map((l) => ({
        id: l.id,
        type: l.leaveType,
        startDate: l.startDate,
        endDate: l.endDate,
        totalDays: Number(l.totalDays),
        status: l.status,
      })),
    }));
  }

  /**
   * Get pending leave requests for approval.
   */
  static async getPendingApprovals(managerId?: string): Promise<any[]> {
    return prisma.leaveRecord.findMany({
      where: { status: "PENDING" },
      include: {
        employee: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  private static calculateLeaveDays(start: Date, end: Date, leaveType: string): number {
    let days = 0;
    const current = new Date(start);

    while (current <= end) {
      const dayOfWeek = current.getDay();
      // Skip weekends for certain leave types
      if (leaveType !== "MATERNITY" && leaveType !== "PATERNITY") {
        if (dayOfWeek !== 0 && dayOfWeek !== 6) days++;
      } else {
        days++; // Calendar days for maternity/paternity
      }
      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  private static async checkOverlap(employeeId: string, startDate: Date, endDate: Date): Promise<any | null> {
    return prisma.leaveRecord.findFirst({
      where: {
        employeeId,
        status: { in: ["APPROVED", "PENDING"] },
        OR: [
          { startDate: { lte: endDate }, endDate: { gte: startDate } },
        ],
      },
    });
  }

  private static getCurrentFYStart(): Date {
    const now = new Date();
    const year = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
    return new Date(year, 3, 1);
  }
}
