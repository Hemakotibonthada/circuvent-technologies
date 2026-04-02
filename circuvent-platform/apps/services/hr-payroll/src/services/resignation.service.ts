// ──────────────────────────────────────────────────────────────
// HR & Payroll — Resignation Service
// Handles resignation submission, approval workflow, notice
// period calculation, offboarding checklist, experience/
// relieving letter generation, and final settlement.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type ResignationStatus =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN"
  | "EXIT_IN_PROGRESS"
  | "EXIT_COMPLETED";

export interface Resignation {
  id: string;
  employeeId: string;
  employeeName?: string;
  reason: string;
  lastWorkingDay: Date;
  noticePeriodDays: number;
  status: ResignationStatus;
  submittedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedReason?: string;
  exitChecklist?: ExitChecklistItem[];
  settlementAmount?: number;
  createdAt: Date;
}

export interface ExitChecklistItem {
  id: string;
  title: string;
  category: "IT" | "HR" | "FINANCE" | "ADMIN" | "TEAM";
  isCompleted: boolean;
  completedAt?: string;
  assignedTo?: string;
}

export interface FinalSettlement {
  employeeId: string;
  employeeName: string;
  lastWorkingDay: string;
  components: {
    pendingSalary: number;
    leaveEncashment: number;
    gratuity: number;
    bonus: number;
    pendingReimbursements: number;
    deductions: number;
    advanceRecovery: number;
    noticePeriodRecovery: number;
  };
  totalPayable: number;
  totalDeductions: number;
  netSettlement: number;
}

export interface ResignationAnalytics {
  totalResignations: number;
  thisMonth: number;
  thisQuarter: number;
  avgNoticePeriod: number;
  byReason: Array<{ reason: string; count: number; percentage: number }>;
  byDepartment: Array<{ department: string; count: number }>;
  byTenure: Array<{ range: string; count: number }>;
  attritionRate: number;
}

// ── Exit Checklist Template ──

const DEFAULT_EXIT_CHECKLIST: Array<{
  title: string;
  category: ExitChecklistItem["category"];
}> = [
  // IT
  { title: "Return laptop/workstation", category: "IT" },
  { title: "Revoke email and system access", category: "IT" },
  { title: "Revoke VPN and GitHub access", category: "IT" },
  { title: "Remove from Slack/Teams channels", category: "IT" },
  { title: "Return access card/badge", category: "IT" },
  { title: "Data backup and handover", category: "IT" },
  // HR
  { title: "Exit interview conducted", category: "HR" },
  { title: "Final settlement calculation", category: "HR" },
  { title: "PF transfer/withdrawal form", category: "HR" },
  { title: "Gratuity nomination update", category: "HR" },
  { title: "Experience letter generated", category: "HR" },
  { title: "Relieving letter generated", category: "HR" },
  { title: "Full & final settlement signed", category: "HR" },
  // Finance
  { title: "Pending expense settlements", category: "FINANCE" },
  { title: "Salary advance recovery", category: "FINANCE" },
  { title: "Return company credit card", category: "FINANCE" },
  // Admin
  { title: "Return parking spot/key", category: "ADMIN" },
  { title: "Cancel cafeteria subscription", category: "ADMIN" },
  // Team
  { title: "Knowledge transfer complete", category: "TEAM" },
  { title: "Project handover documentation", category: "TEAM" },
  { title: "Reassign open tasks/tickets", category: "TEAM" },
];

// ══════════════════════════════════════════════════════════════
// Resignation Service
// ══════════════════════════════════════════════════════════════

export class ResignationService {
  /**
   * Submit a resignation request.
   */
  static async submitResignation(
    employeeId: string,
    reason: string,
    lastWorkingDay: Date,
    noticePeriodDays: number
  ): Promise<Resignation> {
    if (!reason || reason.trim().length < 10) {
      throw new Error("Please provide a resignation reason (min 10 characters)");
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");
    if (employee.dateOfLeaving !== null) throw new Error("Only active employees can resign");

    // Check for existing resignation
    const existing = await prisma.generatedDocument.findFirst({
      where: {
        entityType: "Resignation",
        entityId: employeeId,
        category: "RESIGNATION",
        data: { path: ["status"], string_contains: "SUBMITTED" },
      },
    });

    if (existing) {
      throw new Error("A resignation request is already pending");
    }

    const calculatedNotice = await this.calculateNoticePeriod(employeeId);

    const doc = await prisma.generatedDocument.create({
      data: {
        name: `Resignation — ${employee.user?.firstName} ${employee.user?.lastName}`,
        category: "RESIGNATION",
        entityType: "Resignation",
        entityId: employeeId,
        generatedBy: employeeId,
        format: "JSON",
        data: {
          employeeId,
          employeeName: `${employee.user?.firstName || ""} ${employee.user?.lastName || ""}`.trim(),
          reason: reason.trim(),
          lastWorkingDay: lastWorkingDay.toISOString(),
          noticePeriodDays: noticePeriodDays || calculatedNotice,
          status: "SUBMITTED" as ResignationStatus,
          submittedAt: new Date().toISOString(),
        },
      },
    });

    await createAuditLog({
      userId: employee.userId,
      action: "CREATE",
      entity: "Resignation",
      entityId: doc.id,
      newValue: { reason, lastWorkingDay, noticePeriodDays },
    });

    return this.mapDocToResignation(doc);
  }

  /**
   * Get resignation for an employee.
   */
  static async getMyResignation(employeeId: string): Promise<Resignation | null> {
    const doc = await prisma.generatedDocument.findFirst({
      where: {
        entityType: "Resignation",
        entityId: employeeId,
        category: "RESIGNATION",
      },
      orderBy: { createdAt: "desc" },
    });

    return doc ? this.mapDocToResignation(doc) : null;
  }

  /**
   * Get all pending resignation requests.
   */
  static async getPendingResignations(): Promise<Resignation[]> {
    const docs = await prisma.generatedDocument.findMany({
      where: {
        entityType: "Resignation",
        category: "RESIGNATION",
        data: { path: ["status"], equals: "SUBMITTED" },
      },
      orderBy: { createdAt: "asc" },
    });

    return docs.map((doc) => this.mapDocToResignation(doc));
  }

  /**
   * Approve a resignation.
   */
  static async approveResignation(
    resignationId: string,
    approverId: string
  ): Promise<Resignation> {
    const doc = await prisma.generatedDocument.findUnique({ where: { id: resignationId } });
    if (!doc) throw new Error("Resignation not found");

    const data = doc.data as any;
    if (data.status !== "SUBMITTED" && data.status !== "UNDER_REVIEW") {
      throw new Error(`Cannot approve resignation with status: ${data.status}`);
    }

    const updated = await prisma.generatedDocument.update({
      where: { id: resignationId },
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
      entity: "Resignation",
      entityId: resignationId,
      newValue: { status: "APPROVED" },
    });

    return this.mapDocToResignation(updated);
  }

  /**
   * Reject a resignation with reason.
   */
  static async rejectResignation(
    resignationId: string,
    approverId: string,
    reason: string
  ): Promise<Resignation> {
    const doc = await prisma.generatedDocument.findUnique({ where: { id: resignationId } });
    if (!doc) throw new Error("Resignation not found");

    const data = doc.data as any;
    if (data.status !== "SUBMITTED" && data.status !== "UNDER_REVIEW") {
      throw new Error(`Cannot reject resignation with status: ${data.status}`);
    }

    const updated = await prisma.generatedDocument.update({
      where: { id: resignationId },
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
      entity: "Resignation",
      entityId: resignationId,
      newValue: { status: "REJECTED", reason },
    });

    return this.mapDocToResignation(updated);
  }

  /**
   * Calculate notice period based on employment type.
   */
  static async calculateNoticePeriod(employeeId: string): Promise<number> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { employmentType: true, dateOfJoining: true },
    });

    if (!employee) throw new Error("Employee not found");

    const type = employee.employmentType || "FULL_TIME";
    switch (type) {
      case "FULL_TIME":
        return 90;  // 3 months
      case "PART_TIME":
        return 30;  // 1 month
      case "CONTRACT":
        return 30;  // As per contract, default 1 month
      case "INTERN":
        return 15;  // 15 days
      default:
        return 60;  // 2 months default
    }
  }

  /**
   * Create an exit/offboarding checklist for a resignation.
   */
  static async initiateOffboarding(resignationId: string): Promise<ExitChecklistItem[]> {
    const doc = await prisma.generatedDocument.findUnique({ where: { id: resignationId } });
    if (!doc) throw new Error("Resignation not found");

    const data = doc.data as any;
    if (data.status !== "APPROVED") {
      throw new Error("Offboarding can only be initiated for approved resignations");
    }

    const checklist: ExitChecklistItem[] = DEFAULT_EXIT_CHECKLIST.map((item, i) => ({
      id: `exit-${resignationId}-${i + 1}`,
      title: item.title,
      category: item.category,
      isCompleted: false,
    }));

    await prisma.generatedDocument.update({
      where: { id: resignationId },
      data: {
        data: {
          ...data,
          status: "EXIT_IN_PROGRESS",
          exitChecklist: checklist,
          offboardingStartedAt: new Date().toISOString(),
        },
      },
    });

    return checklist;
  }

  /**
   * Generate an experience letter.
   */
  static async generateExperienceLetter(employeeId: string): Promise<string> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");

    const name = `${employee.user?.firstName || ""} ${employee.user?.lastName || ""}`.trim();
    const joiningDate = new Date(employee.dateOfJoining).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

    const letter = `
EXPERIENCE CERTIFICATE

Date: ${today}

To Whom It May Concern,

This is to certify that ${name} (Employee Code: ${employee.employeeCode}) was employed at Circuvent Technologies Pvt. Ltd. from ${joiningDate} to ${today}.

During the tenure, ${name} served in the capacity of ${employee.designation || "Software Professional"} in the ${employee.department || "Engineering"} department.

${name} has demonstrated good workmanship, professionalism, and dedication throughout the employment period. We found ${name} to be sincere, hardworking, and a valuable team member.

We wish ${name} all the best for future endeavours.

For Circuvent Technologies Pvt. Ltd.

_________________________
Authorized Signatory
Human Resources Department
`.trim();

    await prisma.generatedDocument.create({
      data: {
        name: `Experience Letter — ${employee.employeeCode}`,
        category: "EXPERIENCE_LETTER",
        entityType: "Employee",
        entityId: employeeId,
        generatedBy: "SYSTEM",
        format: "TEXT",
        data: { content: letter, generatedAt: new Date().toISOString() },
      },
    });

    return letter;
  }

  /**
   * Generate a relieving letter.
   */
  static async generateRelievingLetter(employeeId: string): Promise<string> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");

    const name = `${employee.user?.firstName || ""} ${employee.user?.lastName || ""}`.trim();
    const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

    const letter = `
RELIEVING LETTER

Date: ${today}
Ref: CIR/HR/REL/${employee.employeeCode}/${new Date().getFullYear()}

Dear ${name},

Sub: Relieving from Services

With reference to your resignation letter and the subsequent acceptance, we hereby confirm that you are relieved from the services of Circuvent Technologies Pvt. Ltd. effective ${today}.

Employee Details:
• Name: ${name}
• Employee Code: ${employee.employeeCode}
• Designation: ${employee.designation || "Software Professional"}
• Department: ${employee.department || "Engineering"}
• Date of Joining: ${new Date(employee.dateOfJoining).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
• Date of Relieving: ${today}

As on date, you have no outstanding dues or liabilities towards the company. Your full and final settlement will be processed as per company policy.

We wish you all the best in your future endeavours.

Yours sincerely,

_________________________
Head of Human Resources
Circuvent Technologies Pvt. Ltd.
`.trim();

    await prisma.generatedDocument.create({
      data: {
        name: `Relieving Letter — ${employee.employeeCode}`,
        category: "RELIEVING_LETTER",
        entityType: "Employee",
        entityId: employeeId,
        generatedBy: "SYSTEM",
        format: "TEXT",
        data: { content: letter, generatedAt: new Date().toISOString() },
      },
    });

    return letter;
  }

  /**
   * Calculate final settlement — gratuity, leave encashment, pending salary.
   */
  static async calculateFinalSettlement(employeeId: string): Promise<FinalSettlement> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        leaveRecords: true,
      },
    });

    if (!employee) throw new Error("Employee not found");

    const name = `${employee.user?.firstName || ""} ${employee.user?.lastName || ""}`.trim();
    const annualCTC = Number(employee.baseSalary);
    const monthlySalary = Math.round(annualCTC / 12);
    const basicPlusDA = Math.round(monthlySalary * 0.60);

    // Years of service
    const joiningDate = new Date(employee.dateOfJoining);
    const today = new Date();
    const yearsOfService = (today.getTime() - joiningDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

    // Pending salary (prorated for current month)
    const dayOfMonth = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const pendingSalary = Math.round((monthlySalary / daysInMonth) * dayOfMonth);

    // Leave encashment
    const totalLeaveBalance = employee.leaveRecords?.reduce((sum: number, lr: any) => sum + Number(lr.totalDays || 0), 0) || 0;
    const leaveEncashment = Math.round((basicPlusDA / 30) * Math.min(totalLeaveBalance, 300));

    // Gratuity (if eligible: 5+ years)
    const isGratuityEligible = yearsOfService >= 5;
    const gratuityAmount = isGratuityEligible
      ? Math.min(Math.round((basicPlusDA * 15 * Math.floor(yearsOfService)) / 26), 2500000)
      : 0;

    // Check pending advances
    const advances = await prisma.generatedDocument.findMany({
      where: {
        entityType: "SalaryAdvance",
        entityId: employeeId,
        category: "SALARY_ADVANCE",
        data: { path: ["status"], equals: "APPROVED" },
      },
    });
    const advanceRecovery = advances.reduce((s, doc) => {
      const d = doc.data as any;
      return s + (d.amount || 0);
    }, 0);

    // Build settlement
    const components = {
      pendingSalary,
      leaveEncashment,
      gratuity: gratuityAmount,
      bonus: 0,
      pendingReimbursements: 0,
      deductions: 0,
      advanceRecovery,
      noticePeriodRecovery: 0,
    };

    const totalPayable = components.pendingSalary + components.leaveEncashment +
      components.gratuity + components.bonus + components.pendingReimbursements;
    const totalDeductions = components.deductions + components.advanceRecovery + components.noticePeriodRecovery;
    const netSettlement = totalPayable - totalDeductions;

    // Get resignation for last working day
    const resignation = await prisma.generatedDocument.findFirst({
      where: { entityType: "Resignation", entityId: employeeId, category: "RESIGNATION" },
      orderBy: { createdAt: "desc" },
    });
    const resignationData = resignation?.data as any;

    return {
      employeeId,
      employeeName: name,
      lastWorkingDay: resignationData?.lastWorkingDay || today.toISOString(),
      components,
      totalPayable,
      totalDeductions,
      netSettlement,
    };
  }

  /**
   * Mark exit as complete.
   */
  static async markExitComplete(resignationId: string): Promise<Resignation> {
    const doc = await prisma.generatedDocument.findUnique({ where: { id: resignationId } });
    if (!doc) throw new Error("Resignation not found");

    const data = doc.data as any;
    if (data.status !== "EXIT_IN_PROGRESS" && data.status !== "APPROVED") {
      throw new Error(`Cannot mark exit complete for status: ${data.status}`);
    }

    // Mark employee as inactive
    if (data.employeeId) {
      await prisma.employee.update({
        where: { id: data.employeeId },
        data: { dateOfLeaving: new Date() },
      });
    }

    const updated = await prisma.generatedDocument.update({
      where: { id: resignationId },
      data: {
        data: {
          ...data,
          status: "EXIT_COMPLETED",
          exitCompletedAt: new Date().toISOString(),
        },
      },
    });

    await createAuditLog({
      userId: "SYSTEM",
      action: "UPDATE",
      entity: "Resignation",
      entityId: resignationId,
      newValue: { status: "EXIT_COMPLETED", employeeId: data.employeeId },
    });

    return this.mapDocToResignation(updated);
  }

  /**
   * Get resignation analytics — trends and reason breakdown.
   */
  static async getResignationAnalytics(): Promise<ResignationAnalytics> {
    const allDocs = await prisma.generatedDocument.findMany({
      where: { entityType: "Resignation", category: "RESIGNATION" },
      orderBy: { createdAt: "desc" },
    });

    const resignations = allDocs.map((doc) => this.mapDocToResignation(doc));
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisQuarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

    const thisMonth = resignations.filter((r) => r.submittedAt >= thisMonthStart).length;
    const thisQuarter = resignations.filter((r) => r.submittedAt >= thisQuarterStart).length;
    const avgNotice = resignations.length > 0
      ? Math.round(resignations.reduce((s, r) => s + r.noticePeriodDays, 0) / resignations.length)
      : 0;

    // Reasons breakdown
    const reasonMap = new Map<string, number>();
    for (const r of resignations) {
      const bucket = this.categorizeReason(r.reason);
      reasonMap.set(bucket, (reasonMap.get(bucket) || 0) + 1);
    }
    const byReason = Array.from(reasonMap.entries())
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: Math.round((count / (resignations.length || 1)) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    // Department breakdown
    const deptCounts = new Map<string, number>();
    for (const doc of allDocs) {
      const data = doc.data as any;
      if (data.employeeId) {
        const emp = await prisma.employee.findUnique({
          where: { id: data.employeeId },
          select: { department: true },
        });
        const dept = emp?.department || "Unknown";
        deptCounts.set(dept, (deptCounts.get(dept) || 0) + 1);
      }
    }

    // Tenure breakdown
    const tenureBuckets = [
      { range: "< 1 year", min: 0, max: 1, count: 0 },
      { range: "1-2 years", min: 1, max: 2, count: 0 },
      { range: "2-5 years", min: 2, max: 5, count: 0 },
      { range: "5+ years", min: 5, max: Infinity, count: 0 },
    ];

    // Total active employees for attrition rate
    const totalActive = await prisma.employee.count({ where: { dateOfLeaving: null } });
    const attritionRate = totalActive > 0
      ? Math.round((resignations.length / totalActive) * 100 * 100) / 100
      : 0;

    return {
      totalResignations: resignations.length,
      thisMonth,
      thisQuarter,
      avgNoticePeriod: avgNotice,
      byReason,
      byDepartment: Array.from(deptCounts.entries()).map(([department, count]) => ({ department, count })),
      byTenure: tenureBuckets,
      attritionRate,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // Private Helpers
  // ══════════════════════════════════════════════════════════════

  private static mapDocToResignation(doc: any): Resignation {
    const data = doc.data as any;
    return {
      id: doc.id,
      employeeId: data.employeeId || doc.entityId,
      employeeName: data.employeeName,
      reason: data.reason || "",
      lastWorkingDay: data.lastWorkingDay ? new Date(data.lastWorkingDay) : new Date(),
      noticePeriodDays: data.noticePeriodDays || 90,
      status: data.status || "SUBMITTED",
      submittedAt: data.submittedAt ? new Date(data.submittedAt) : doc.createdAt,
      approvedBy: data.approvedBy,
      approvedAt: data.approvedAt ? new Date(data.approvedAt) : undefined,
      rejectedReason: data.rejectedReason,
      exitChecklist: data.exitChecklist,
      settlementAmount: data.settlementAmount,
      createdAt: doc.createdAt,
    };
  }

  private static categorizeReason(reason: string): string {
    const lower = reason.toLowerCase();
    if (lower.includes("better opportunity") || lower.includes("offer") || lower.includes("new job")) return "Better Opportunity";
    if (lower.includes("personal") || lower.includes("family") || lower.includes("relocation")) return "Personal/Family";
    if (lower.includes("health") || lower.includes("medical")) return "Health Reasons";
    if (lower.includes("higher studies") || lower.includes("education")) return "Higher Studies";
    if (lower.includes("career") || lower.includes("growth")) return "Career Growth";
    if (lower.includes("compensation") || lower.includes("salary") || lower.includes("pay")) return "Compensation";
    if (lower.includes("work-life") || lower.includes("burnout") || lower.includes("stress")) return "Work-Life Balance";
    return "Other";
  }
}
