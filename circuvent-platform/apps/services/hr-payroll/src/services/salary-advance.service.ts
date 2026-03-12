// ──────────────────────────────────────────────────────────────
// HR & Payroll — Salary Advance Service
// Handles salary advance requests, approvals, auto-deduction
// from payroll, and advance history/reporting.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type AdvanceStatus = "PENDING" | "APPROVED" | "REJECTED" | "DISBURSED" | "DEDUCTED" | "CANCELLED";

export interface SalaryAdvance {
  id: string;
  employeeId: string;
  employeeName?: string;
  amount: number;
  reason: string;
  status: AdvanceStatus;
  requestDate: Date;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedReason?: string;
  deductionMonth?: number;
  deductionYear?: number;
  deductedAmount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdvanceRequest {
  employeeId: string;
  amount: number;
  reason: string;
}

export interface AdvanceReport {
  month: number;
  year: number;
  totalRequested: number;
  totalApproved: number;
  totalDisbursed: number;
  totalDeducted: number;
  pendingCount: number;
  byDepartment: Array<{ department: string; count: number; totalAmount: number }>;
  entries: SalaryAdvance[];
}

export interface MaxAdvanceResult {
  employeeId: string;
  grossSalary: number;
  netSalary: number;
  maxAdvanceAllowed: number;
  existingPendingAdvances: number;
  availableAdvance: number;
}

// ══════════════════════════════════════════════════════════════
// Salary Advance Service
// ══════════════════════════════════════════════════════════════

export class SalaryAdvanceService {
  /**
   * Request a salary advance.
   * Auto-validates against max allowed (50% of net salary).
   */
  static async requestAdvance(
    employeeId: string,
    amount: number,
    reason: string
  ): Promise<SalaryAdvance> {
    if (amount <= 0) {
      throw new Error("Advance amount must be positive");
    }

    if (!reason || reason.trim().length < 10) {
      throw new Error("Please provide a detailed reason (min 10 characters)");
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, baseSalary: true, dateOfLeaving: true, userId: true },
    });

    if (!employee) throw new Error("Employee not found");
    if (employee.dateOfLeaving !== null) throw new Error("Only active employees can request advances");

    // Check max advance
    const maxResult = await this.calculateMaxAdvance(employeeId);
    if (amount > maxResult.availableAdvance) {
      throw new Error(
        `Requested amount ₹${amount.toLocaleString("en-IN")} exceeds maximum available advance ₹${maxResult.availableAdvance.toLocaleString("en-IN")}`
      );
    }

    // Check for existing pending advance
    const existingPending = await prisma.generatedDocument.findFirst({
      where: {
        entityType: "SalaryAdvance",
        entityId: employeeId,
        category: "SALARY_ADVANCE",
        data: { path: ["status"], equals: "PENDING" },
      },
    });

    if (existingPending) {
      throw new Error("You already have a pending advance request. Please wait for it to be processed.");
    }

    const advance = await prisma.generatedDocument.create({
      data: {
        name: `Salary Advance — ${employeeId}`,
        category: "SALARY_ADVANCE",
        entityType: "SalaryAdvance",
        entityId: employeeId,
        generatedBy: employeeId,
        format: "JSON",
        data: {
          employeeId,
          amount,
          reason: reason.trim(),
          status: "PENDING" as AdvanceStatus,
          requestDate: new Date().toISOString(),
        },
      },
    });

    await createAuditLog({
      userId: employee.userId,
      action: "CREATE",
      entity: "SalaryAdvance",
      entityId: advance.id,
      newValue: { amount, reason, status: "PENDING" },
    });

    return {
      id: advance.id,
      employeeId,
      amount,
      reason,
      status: "PENDING",
      requestDate: new Date(),
      createdAt: advance.createdAt,
      updatedAt: advance.createdAt,
    };
  }

  /**
   * Get all advances for an employee.
   */
  static async getMyAdvances(employeeId: string): Promise<SalaryAdvance[]> {
    const docs = await prisma.generatedDocument.findMany({
      where: {
        entityType: "SalaryAdvance",
        entityId: employeeId,
        category: "SALARY_ADVANCE",
      },
      orderBy: { createdAt: "desc" },
    });

    return docs.map((doc) => this.mapDocToAdvance(doc));
  }

  /**
   * Get all pending advance approvals.
   */
  static async getPendingApprovals(): Promise<SalaryAdvance[]> {
    const docs = await prisma.generatedDocument.findMany({
      where: {
        entityType: "SalaryAdvance",
        category: "SALARY_ADVANCE",
        data: { path: ["status"], equals: "PENDING" },
      },
      orderBy: { createdAt: "asc" },
    });

    return docs.map((doc) => this.mapDocToAdvance(doc));
  }

  /**
   * Approve a salary advance.
   */
  static async approveAdvance(advanceId: string, approverId: string): Promise<SalaryAdvance> {
    const doc = await prisma.generatedDocument.findUnique({ where: { id: advanceId } });
    if (!doc) throw new Error("Advance request not found");

    const data = doc.data as any;
    if (data.status !== "PENDING") {
      throw new Error(`Cannot approve advance with status: ${data.status}`);
    }

    const updated = await prisma.generatedDocument.update({
      where: { id: advanceId },
      data: {
        data: {
          ...data,
          status: "APPROVED",
          approvedBy: approverId,
          approvedAt: new Date().toISOString(),
        },
      },
    });

    await createAuditLog({
      userId: approverId,
      action: "APPROVE",
      entity: "SalaryAdvance",
      entityId: advanceId,
      newValue: { status: "APPROVED", amount: data.amount },
    });

    return this.mapDocToAdvance(updated);
  }

  /**
   * Reject a salary advance with reason.
   */
  static async rejectAdvance(
    advanceId: string,
    approverId: string,
    reason: string
  ): Promise<SalaryAdvance> {
    const doc = await prisma.generatedDocument.findUnique({ where: { id: advanceId } });
    if (!doc) throw new Error("Advance request not found");

    const data = doc.data as any;
    if (data.status !== "PENDING") {
      throw new Error(`Cannot reject advance with status: ${data.status}`);
    }

    const updated = await prisma.generatedDocument.update({
      where: { id: advanceId },
      data: {
        data: {
          ...data,
          status: "REJECTED",
          approvedBy: approverId,
          rejectedReason: reason,
          approvedAt: new Date().toISOString(),
        },
      },
    });

    await createAuditLog({
      userId: approverId,
      action: "REJECT",
      entity: "SalaryAdvance",
      entityId: advanceId,
      newValue: { status: "REJECTED", reason },
    });

    return this.mapDocToAdvance(updated);
  }

  /**
   * Calculate maximum advance allowed (50% of net salary).
   */
  static async calculateMaxAdvance(employeeId: string): Promise<MaxAdvanceResult> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, baseSalary: true },
    });

    if (!employee) throw new Error("Employee not found");

    const grossSalary = Number(employee.baseSalary) / 12;
    // Estimated net salary (rough: ~70% of gross after deductions)
    const estimatedNet = Math.round(grossSalary * 0.70);
    const maxAdvance = Math.round(estimatedNet * 0.50);

    // Check existing pending/approved but not yet deducted advances
    const pendingDocs = await prisma.generatedDocument.findMany({
      where: {
        entityType: "SalaryAdvance",
        entityId: employeeId,
        category: "SALARY_ADVANCE",
        data: { path: ["status"], string_contains: "APPROVED" },
      },
    });

    // Also check PENDING advances
    const allPending = await prisma.generatedDocument.findMany({
      where: {
        entityType: "SalaryAdvance",
        entityId: employeeId,
        category: "SALARY_ADVANCE",
        data: { path: ["status"], equals: "PENDING" },
      },
    });

    const existingAmount = [...pendingDocs, ...allPending].reduce((sum, doc) => {
      const data = doc.data as any;
      return sum + (data.amount || 0);
    }, 0);

    return {
      employeeId,
      grossSalary: Math.round(grossSalary),
      netSalary: estimatedNet,
      maxAdvanceAllowed: maxAdvance,
      existingPendingAdvances: existingAmount,
      availableAdvance: Math.max(0, maxAdvance - existingAmount),
    };
  }

  /**
   * Auto-deduct approved advances from monthly payroll.
   */
  static async deductFromPayroll(
    employeeId: string,
    month: number,
    year: number
  ): Promise<{ deducted: number; advances: string[] }> {
    const approvedDocs = await prisma.generatedDocument.findMany({
      where: {
        entityType: "SalaryAdvance",
        entityId: employeeId,
        category: "SALARY_ADVANCE",
        data: { path: ["status"], equals: "APPROVED" },
      },
    });

    let totalDeducted = 0;
    const advanceIds: string[] = [];

    for (const doc of approvedDocs) {
      const data = doc.data as any;
      totalDeducted += data.amount || 0;
      advanceIds.push(doc.id);

      await prisma.generatedDocument.update({
        where: { id: doc.id },
        data: {
          data: {
            ...data,
            status: "DEDUCTED",
            deductionMonth: month,
            deductionYear: year,
            deductedAmount: data.amount,
            deductedAt: new Date().toISOString(),
          },
        },
      });
    }

    if (totalDeducted > 0) {
      await createAuditLog({
        userId: "SYSTEM",
        action: "UPDATE",
        entity: "SalaryAdvance",
        entityId: `${employeeId}_${year}_${month}`,
        newValue: { totalDeducted, advanceCount: advanceIds.length, month, year },
      });
    }

    return { deducted: totalDeducted, advances: advanceIds };
  }

  /**
   * Get advance history for an employee.
   */
  static async getAdvanceHistory(employeeId: string): Promise<SalaryAdvance[]> {
    const docs = await prisma.generatedDocument.findMany({
      where: {
        entityType: "SalaryAdvance",
        entityId: employeeId,
        category: "SALARY_ADVANCE",
      },
      orderBy: { createdAt: "desc" },
    });

    return docs.map((doc) => this.mapDocToAdvance(doc));
  }

  /**
   * Cancel a pending advance request.
   */
  static async cancelAdvance(advanceId: string): Promise<SalaryAdvance> {
    const doc = await prisma.generatedDocument.findUnique({ where: { id: advanceId } });
    if (!doc) throw new Error("Advance request not found");

    const data = doc.data as any;
    if (data.status !== "PENDING") {
      throw new Error("Only pending advances can be cancelled");
    }

    const updated = await prisma.generatedDocument.update({
      where: { id: advanceId },
      data: {
        data: { ...data, status: "CANCELLED", cancelledAt: new Date().toISOString() },
      },
    });

    return this.mapDocToAdvance(updated);
  }

  /**
   * Generate a monthly advance report.
   */
  static async generateAdvanceReport(month: number, year: number): Promise<AdvanceReport> {
    const allAdvances = await prisma.generatedDocument.findMany({
      where: {
        entityType: "SalaryAdvance",
        category: "SALARY_ADVANCE",
        createdAt: {
          gte: new Date(year, month - 1, 1),
          lt: new Date(year, month, 1),
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const advances = allAdvances.map((doc) => this.mapDocToAdvance(doc));

    const totalRequested = advances.reduce((s, a) => s + a.amount, 0);
    const totalApproved = advances
      .filter((a) => ["APPROVED", "DISBURSED", "DEDUCTED"].includes(a.status))
      .reduce((s, a) => s + a.amount, 0);
    const totalDisbursed = advances
      .filter((a) => ["DISBURSED", "DEDUCTED"].includes(a.status))
      .reduce((s, a) => s + a.amount, 0);
    const totalDeducted = advances
      .filter((a) => a.status === "DEDUCTED")
      .reduce((s, a) => s + (a.deductedAmount || 0), 0);

    // Group by department
    const deptMap = new Map<string, { count: number; totalAmount: number }>();
    for (const adv of advances) {
      const emp = await prisma.employee.findUnique({
        where: { id: adv.employeeId },
        select: { department: true },
      });
      const dept = emp?.department || "Unknown";
      const existing = deptMap.get(dept) || { count: 0, totalAmount: 0 };
      deptMap.set(dept, { count: existing.count + 1, totalAmount: existing.totalAmount + adv.amount });
    }

    return {
      month,
      year,
      totalRequested,
      totalApproved,
      totalDisbursed,
      totalDeducted,
      pendingCount: advances.filter((a) => a.status === "PENDING").length,
      byDepartment: Array.from(deptMap.entries()).map(([department, data]) => ({
        department,
        ...data,
      })),
      entries: advances,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // Private Helpers
  // ══════════════════════════════════════════════════════════════

  private static mapDocToAdvance(doc: any): SalaryAdvance {
    const data = doc.data as any;
    return {
      id: doc.id,
      employeeId: data.employeeId || doc.entityId,
      amount: data.amount || 0,
      reason: data.reason || "",
      status: data.status || "PENDING",
      requestDate: data.requestDate ? new Date(data.requestDate) : doc.createdAt,
      approvedBy: data.approvedBy,
      approvedAt: data.approvedAt ? new Date(data.approvedAt) : undefined,
      rejectedReason: data.rejectedReason,
      deductionMonth: data.deductionMonth,
      deductionYear: data.deductionYear,
      deductedAmount: data.deductedAmount,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt || doc.createdAt,
    };
  }
}
