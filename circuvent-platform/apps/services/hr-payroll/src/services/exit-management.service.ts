// ──────────────────────────────────────────────────────────────
// HR & Payroll — Exit Management Service
// Comprehensive employee exit automation: exit workflows,
// checklist management, notice period handling, asset return,
// access revocation, knowledge transfer, final settlement,
// analytics, exit interviews, and alumni profiles.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types & Interfaces
// ══════════════════════════════════════════════════════════════

export type ExitType = "VOLUNTARY" | "INVOLUNTARY" | "RETIREMENT" | "CONTRACT_END" | "ABSCONDING";
export type ExitStatus = "INITIATED" | "IN_PROGRESS" | "CHECKLIST_PENDING" | "SETTLEMENT_PENDING" | "COMPLETED" | "CANCELLED";

export interface ExitChecklistItem {
  id: string;
  title: string;
  category: "IT" | "HR" | "FINANCE" | "ADMIN" | "TEAM";
  isCompleted: boolean;
  completedAt?: string;
  completedBy?: string;
  assignedTo?: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  notes?: string;
}

export interface ExitWorkflow {
  id: string;
  employeeId: string;
  employeeName: string;
  exitType: ExitType;
  reason: string;
  status: ExitStatus;
  resignationId?: string;
  lastWorkingDay: string;
  noticePeriodDays: number;
  noticePeriodBuyout: boolean;
  buyoutAmount?: number;
  checklist: ExitChecklistItem[];
  feedbackCollected: boolean;
  knowledgeTransferComplete: boolean;
  assetsReturned: boolean;
  accessRevoked: boolean;
  settlementProcessed: boolean;
  initiatedAt: string;
  completedAt?: string;
}

export interface FinalSettlement {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  lastWorkingDay: string;
  tenureYears: number;
  components: {
    pendingSalary: number;
    leaveEncashment: number;
    gratuity: number;
    bonus: number;
    pendingReimbursements: number;
    deductions: number;
    advanceRecovery: number;
    noticePeriodRecovery: number;
    pfEmployerContribution: number;
  };
  totalPayable: number;
  totalDeductions: number;
  netSettlement: number;
}

export interface ExitFeedback {
  overallExperience: number; // 1-5
  managementRating: number;
  workLifeBalance: number;
  growthOpportunities: number;
  compensationSatisfaction: number;
  reasonForLeaving: string;
  wouldRecommend: boolean;
  suggestions: string;
  bestAspect: string;
  worstAspect: string;
}

export interface ExitAnalytics {
  totalExits: number;
  thisMonth: number;
  thisQuarter: number;
  thisYear: number;
  avgTenure: number;
  avgNoticePeriod: number;
  attritionRate: number;
  voluntaryRate: number;
  byReason: Array<{ reason: string; count: number; percentage: number }>;
  byDepartment: Array<{ department: string; count: number; rate: number }>;
  byTenure: Array<{ range: string; count: number }>;
  byExitType: Array<{ type: ExitType; count: number }>;
  monthlyTrend: Array<{ month: string; exits: number }>;
  avgSettlementAmount: number;
}

export interface AlumniProfile {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  designation: string;
  dateOfJoining: string;
  dateOfLeaving: string;
  tenureYears: number;
  lastDesignation: string;
  exitType: ExitType;
  linkedInUrl?: string;
  personalEmail?: string;
  achievements: string[];
}

// ── Exit Checklist Template (25+ items) ──

const DEFAULT_EXIT_CHECKLIST: Array<{
  title: string;
  category: ExitChecklistItem["category"];
  priority: ExitChecklistItem["priority"];
}> = [
  // IT (8 items)
  { title: "Return laptop/workstation", category: "IT", priority: "HIGH" },
  { title: "Return company mobile/phone", category: "IT", priority: "HIGH" },
  { title: "Return access badge/card", category: "IT", priority: "HIGH" },
  { title: "Revoke email and domain access", category: "IT", priority: "HIGH" },
  { title: "Revoke VPN and remote access", category: "IT", priority: "HIGH" },
  { title: "Remove from GitHub/GitLab repositories", category: "IT", priority: "MEDIUM" },
  { title: "Remove from Slack/Teams channels", category: "IT", priority: "MEDIUM" },
  { title: "Data backup and transfer to successor", category: "IT", priority: "HIGH" },
  // HR (7 items)
  { title: "Exit interview conducted", category: "HR", priority: "HIGH" },
  { title: "Final settlement calculation completed", category: "HR", priority: "HIGH" },
  { title: "PF transfer/withdrawal form submitted", category: "HR", priority: "HIGH" },
  { title: "Gratuity nomination updated", category: "HR", priority: "MEDIUM" },
  { title: "Experience letter generated", category: "HR", priority: "HIGH" },
  { title: "Relieving letter generated", category: "HR", priority: "HIGH" },
  { title: "Full & Final settlement document signed", category: "HR", priority: "HIGH" },
  // Finance (5 items)
  { title: "Pending expense claims settled", category: "FINANCE", priority: "HIGH" },
  { title: "Salary advance recovery processed", category: "FINANCE", priority: "HIGH" },
  { title: "Return company credit card", category: "FINANCE", priority: "MEDIUM" },
  { title: "Tax computation and Form 16 issued", category: "FINANCE", priority: "HIGH" },
  { title: "Bank account details verified for settlement", category: "FINANCE", priority: "HIGH" },
  // Admin (3 items)
  { title: "Return parking spot/key", category: "ADMIN", priority: "LOW" },
  { title: "Cancel cafeteria subscription", category: "ADMIN", priority: "LOW" },
  { title: "Return office keys and locker items", category: "ADMIN", priority: "MEDIUM" },
  // Team (4 items)
  { title: "Knowledge transfer sessions completed", category: "TEAM", priority: "HIGH" },
  { title: "Project handover documentation created", category: "TEAM", priority: "HIGH" },
  { title: "Reassign open tasks/tickets", category: "TEAM", priority: "HIGH" },
  { title: "Client/stakeholder transition communicated", category: "TEAM", priority: "MEDIUM" },
];

// ══════════════════════════════════════════════════════════════
// Exit Management Service
// ══════════════════════════════════════════════════════════════

export class ExitManagementService {
  /**
   * Initiate exit workflow for an employee.
   */
  static async initiateExit(
    employeeId: string,
    exitType: ExitType,
    reason: string
  ): Promise<ExitWorkflow> {
    if (!reason || reason.trim().length < 5) {
      throw new Error("Exit reason must be at least 5 characters");
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    if (!employee) throw new Error("Employee not found");
    if (employee.dateOfLeaving) throw new Error("Employee already has an exit date set");

    // Check for existing active exit workflow
    const existingWorkflow = await prisma.generatedDocument.findFirst({
      where: {
        entityType: "ExitWorkflow",
        entityId: employeeId,
        category: "EXIT_WORKFLOW",
        data: { path: ["status"], not: "COMPLETED" },
      },
    });

    if (existingWorkflow) {
      throw new Error("An exit workflow is already in progress for this employee");
    }

    const noticePeriodDays = this.calculateNoticePeriod(employee.employmentType);
    const lastWorkingDay = new Date();
    lastWorkingDay.setDate(lastWorkingDay.getDate() + noticePeriodDays);

    // Check for resignation record
    const resignation = await prisma.resignation.findFirst({
      where: { employeeId, status: { in: ["SUBMITTED", "ACCEPTED"] } },
      orderBy: { createdAt: "desc" },
    });

    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;

    const workflow: Omit<ExitWorkflow, "id"> = {
      employeeId,
      employeeName,
      exitType,
      reason: reason.trim(),
      status: "INITIATED",
      resignationId: resignation?.id,
      lastWorkingDay: lastWorkingDay.toISOString(),
      noticePeriodDays,
      noticePeriodBuyout: false,
      checklist: [],
      feedbackCollected: false,
      knowledgeTransferComplete: false,
      assetsReturned: false,
      accessRevoked: false,
      settlementProcessed: false,
      initiatedAt: new Date().toISOString(),
    };

    const doc = await prisma.generatedDocument.create({
      data: {
        name: `Exit Workflow — ${employee.employeeCode}`,
        category: "EXIT_WORKFLOW",
        entityType: "ExitWorkflow",
        entityId: employeeId,
        generatedBy: "SYSTEM",
        format: "JSON",
        data: workflow as any,
      },
    });

    // Notify HR managers
    const hrAdmins = await prisma.user.findMany({
      where: { role: { in: ["HR_MANAGER", "ADMIN"] }, status: "ACTIVE" },
      select: { id: true },
    });

    for (const admin of hrAdmins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          title: "Exit Initiated",
          message: `Exit workflow initiated for ${employeeName} (${employee.employeeCode}). Type: ${exitType}`,
          type: "warning",
          module: "hr",
          actionUrl: `/hr/exits/${doc.id}`,
        },
      });
    }

    await createAuditLog({
      userId: employee.userId,
      action: "CREATE",
      entity: "ExitWorkflow",
      entityId: doc.id,
      newValue: { employeeId, exitType, reason, noticePeriodDays },
    });

    return { ...workflow, id: doc.id };
  }

  /**
   * Create a comprehensive exit checklist (25+ items).
   */
  static async createExitChecklist(employeeId: string): Promise<{
    checklistId: string;
    items: ExitChecklistItem[];
    totalItems: number;
  }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employeeCode: true, userId: true },
    });

    if (!employee) throw new Error("Employee not found");

    const items: ExitChecklistItem[] = DEFAULT_EXIT_CHECKLIST.map((template, index) => ({
      id: `exit-${employee.id}-${index + 1}`,
      title: template.title,
      category: template.category,
      priority: template.priority,
      isCompleted: false,
    }));

    const doc = await prisma.generatedDocument.create({
      data: {
        name: `Exit Checklist — ${employee.employeeCode}`,
        category: "EXIT_CHECKLIST",
        entityType: "ExitChecklist",
        entityId: employeeId,
        generatedBy: "SYSTEM",
        format: "JSON",
        data: { items, status: "PENDING", createdAt: new Date().toISOString() } as any,
      },
    });

    // Update the exit workflow with checklist
    const workflowDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "ExitWorkflow", entityId: employeeId, category: "EXIT_WORKFLOW" },
      orderBy: { createdAt: "desc" },
    });

    if (workflowDoc) {
      const wfData = workflowDoc.data as any;
      await prisma.generatedDocument.update({
        where: { id: workflowDoc.id },
        data: {
          data: { ...wfData, checklist: items, status: "CHECKLIST_PENDING" },
        },
      });
    }

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "ExitChecklist",
      entityId: doc.id,
      newValue: { employeeId, itemCount: items.length },
    });

    return { checklistId: doc.id, items, totalItems: items.length };
  }

  /**
   * Get exit progress as a percentage.
   */
  static async getExitProgress(employeeId: string): Promise<{
    totalItems: number;
    completedItems: number;
    percentage: number;
    pendingByCategory: Array<{ category: string; pending: number }>;
  }> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { entityType: "ExitChecklist", entityId: employeeId, category: "EXIT_CHECKLIST" },
      orderBy: { createdAt: "desc" },
    });

    if (!doc) throw new Error("Exit checklist not found for this employee");

    const items: ExitChecklistItem[] = (doc.data as any)?.items || [];
    const totalItems = items.length;
    const completedItems = items.filter((i) => i.isCompleted).length;
    const percentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    // Summarize pending by category
    const categoryMap = new Map<string, number>();
    for (const item of items) {
      if (!item.isCompleted) {
        categoryMap.set(item.category, (categoryMap.get(item.category) || 0) + 1);
      }
    }
    const pendingByCategory = Array.from(categoryMap.entries()).map(([category, pending]) => ({
      category,
      pending,
    }));

    return { totalItems, completedItems, percentage, pendingByCategory };
  }

  /**
   * Complete a single checklist item.
   */
  static async completeChecklistItem(
    checklistItemId: string,
    completedBy?: string,
    notes?: string
  ): Promise<{ success: boolean; completionPercent: number }> {
    // Parse employee ID from the checklist item ID format: exit-{empId}-{index}
    const parts = checklistItemId.split("-");
    const employeeId = parts.slice(1, -1).join("-");

    const doc = await prisma.generatedDocument.findFirst({
      where: { entityType: "ExitChecklist", entityId: employeeId, category: "EXIT_CHECKLIST" },
      orderBy: { createdAt: "desc" },
    });

    if (!doc) throw new Error("Exit checklist not found");

    const data = doc.data as any;
    const items: ExitChecklistItem[] = data.items || [];
    const itemIndex = items.findIndex((i) => i.id === checklistItemId);

    if (itemIndex === -1) throw new Error("Checklist item not found");
    if (items[itemIndex].isCompleted) throw new Error("Item already completed");

    items[itemIndex].isCompleted = true;
    items[itemIndex].completedAt = new Date().toISOString();
    items[itemIndex].completedBy = completedBy;
    if (notes) items[itemIndex].notes = notes;

    const completionPercent = Math.round(
      (items.filter((i) => i.isCompleted).length / items.length) * 100
    );
    const allCompleted = items.every((i) => i.isCompleted);

    await prisma.generatedDocument.update({
      where: { id: doc.id },
      data: {
        data: {
          ...data,
          items,
          status: allCompleted ? "COMPLETED" : "IN_PROGRESS",
          completedAt: allCompleted ? new Date().toISOString() : undefined,
        },
      },
    });

    await createAuditLog({
      userId: completedBy || "SYSTEM",
      action: "UPDATE",
      entity: "ExitChecklist",
      entityId: checklistItemId,
      newValue: { completed: true, completionPercent },
    });

    return { success: true, completionPercent };
  }

  /**
   * Collect exit interview feedback.
   */
  static async collectFeedback(
    employeeId: string,
    feedback: ExitFeedback
  ): Promise<{ success: boolean; feedbackId: string }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");

    const doc = await prisma.generatedDocument.create({
      data: {
        name: `Exit Feedback — ${employee.employeeCode}`,
        category: "EXIT_FEEDBACK",
        entityType: "ExitFeedback",
        entityId: employeeId,
        generatedBy: employeeId,
        format: "JSON",
        data: {
          ...feedback,
          employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
          department: employee.department,
          designation: employee.designation,
          collectedAt: new Date().toISOString(),
        } as any,
      },
    });

    // Update workflow
    const workflowDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "ExitWorkflow", entityId: employeeId, category: "EXIT_WORKFLOW" },
      orderBy: { createdAt: "desc" },
    });

    if (workflowDoc) {
      const wfData = workflowDoc.data as any;
      await prisma.generatedDocument.update({
        where: { id: workflowDoc.id },
        data: { data: { ...wfData, feedbackCollected: true } },
      });
    }

    await createAuditLog({
      userId: employee.userId,
      action: "CREATE",
      entity: "ExitFeedback",
      entityId: doc.id,
      newValue: { overallExperience: feedback.overallExperience, wouldRecommend: feedback.wouldRecommend },
    });

    return { success: true, feedbackId: doc.id };
  }

  /**
   * Calculate notice period based on employment type.
   */
  static calculateNoticePeriod(empType: string): number {
    const noticePeriods: Record<string, number> = {
      FULL_TIME: 60,
      PART_TIME: 30,
      CONTRACT: 30,
      INTERN: 15,
      PROBATION: 30,
      SENIOR_MANAGEMENT: 90,
    };
    return noticePeriods[empType] || 30;
  }

  /**
   * Buy out remaining notice period with payment.
   */
  static async buyOutNoticePeriod(
    employeeId: string,
    daysRemaining: number
  ): Promise<{ success: boolean; buyoutAmount: number }> {
    if (daysRemaining <= 0) throw new Error("Days remaining must be positive");

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");

    const dailySalary = Number(employee.baseSalary) / 365;
    const buyoutAmount = Math.round(dailySalary * daysRemaining * 100) / 100;

    // Update workflow with buyout info
    const workflowDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "ExitWorkflow", entityId: employeeId, category: "EXIT_WORKFLOW" },
      orderBy: { createdAt: "desc" },
    });

    if (workflowDoc) {
      const wfData = workflowDoc.data as any;
      const newLwd = new Date();
      await prisma.generatedDocument.update({
        where: { id: workflowDoc.id },
        data: {
          data: {
            ...wfData,
            noticePeriodBuyout: true,
            buyoutAmount,
            lastWorkingDay: newLwd.toISOString(),
          },
        },
      });
    }

    await createAuditLog({
      userId: employee.userId,
      action: "UPDATE",
      entity: "ExitWorkflow",
      entityId: employeeId,
      newValue: { noticePeriodBuyout: true, buyoutAmount, daysRemaining },
    });

    return { success: true, buyoutAmount };
  }

  /**
   * Initiate asset return process for exiting employee.
   */
  static async initiateAssetReturn(employeeId: string): Promise<{
    assetsFound: number;
    returnRequests: Array<{ assetId: string; assetName: string; category: string; requestId: string }>;
  }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, userId: true, employeeCode: true },
    });

    if (!employee) throw new Error("Employee not found");

    // Find all assets assigned to this employee
    const assets = await prisma.asset.findMany({
      where: { assignedTo: employeeId, status: "ALLOCATED" },
    });

    const returnRequests: Array<{ assetId: string; assetName: string; category: string; requestId: string }> = [];

    for (const asset of assets) {
      const request = await prisma.assetRequest.create({
        data: {
          employeeId,
          assetCategory: asset.category,
          justification: `Return request for exit — ${asset.assetCode}: ${asset.name}`,
          status: "PENDING",
        },
      });

      returnRequests.push({
        assetId: asset.id,
        assetName: asset.name,
        category: asset.category,
        requestId: request.id,
      });
    }

    // Update the exit workflow
    const workflowDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "ExitWorkflow", entityId: employeeId, category: "EXIT_WORKFLOW" },
      orderBy: { createdAt: "desc" },
    });

    if (workflowDoc) {
      const wfData = workflowDoc.data as any;
      await prisma.generatedDocument.update({
        where: { id: workflowDoc.id },
        data: {
          data: {
            ...wfData,
            assetsReturned: assets.length === 0,
            assetReturnRequests: returnRequests,
          },
        },
      });
    }

    await createAuditLog({
      userId: employee.userId,
      action: "CREATE",
      entity: "AssetReturn",
      entityId: employeeId,
      newValue: { assetsCount: assets.length, requestIds: returnRequests.map((r) => r.requestId) },
    });

    return { assetsFound: assets.length, returnRequests };
  }

  /**
   * Revoke all system access for the exiting employee.
   */
  static async revokeSystemAccess(employeeId: string): Promise<{
    success: boolean;
    actionsPerformed: string[];
  }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");

    const actionsPerformed: string[] = [];

    // Deactivate user account
    await prisma.user.update({
      where: { id: employee.userId },
      data: { status: "INACTIVE" },
    });
    actionsPerformed.push("User account deactivated");

    // Revoke all refresh tokens
    await prisma.refreshToken.deleteMany({
      where: { userId: employee.userId },
    });
    actionsPerformed.push("All refresh tokens revoked");

    // Update workflow
    const workflowDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "ExitWorkflow", entityId: employeeId, category: "EXIT_WORKFLOW" },
      orderBy: { createdAt: "desc" },
    });

    if (workflowDoc) {
      const wfData = workflowDoc.data as any;
      await prisma.generatedDocument.update({
        where: { id: workflowDoc.id },
        data: { data: { ...wfData, accessRevoked: true } },
      });
    }

    // Notify IT admins
    await prisma.notification.create({
      data: {
        userId: employee.userId,
        title: "Access Revoked",
        message: `System access for ${employee.user.firstName} ${employee.user.lastName} (${employee.employeeCode}) has been revoked.`,
        type: "warning",
        module: "hr",
      },
    });

    await createAuditLog({
      userId: "SYSTEM",
      action: "UPDATE",
      entity: "User",
      entityId: employee.userId,
      newValue: { actionsPerformed },
    });

    return { success: true, actionsPerformed };
  }

  /**
   * Initiate knowledge transfer from exiting employee to successor.
   */
  static async initiateKnowledgeTransfer(
    employeeId: string,
    successorId: string
  ): Promise<{
    success: boolean;
    tasksToTransfer: number;
    ktSessionsPlanned: number;
  }> {
    const [employee, successor] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: employeeId },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      }),
      prisma.employee.findUnique({
        where: { id: successorId },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);

    if (!employee) throw new Error("Employee not found");
    if (!successor) throw new Error("Successor not found");

    // Fetch open goals/tasks for the exiting employee
    const openGoals = await prisma.goal.findMany({
      where: { employeeId, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
    });

    // Reassign tasks to successor
    for (const goal of openGoals) {
      await prisma.goal.update({
        where: { id: goal.id },
        data: {
          employeeId: successorId,
          managerNotes: `Transferred from ${employee.user.firstName} ${employee.user.lastName} during exit KT`,
        },
      });
    }

    // Plan KT sessions (one per week for 2 weeks)
    const ktSessions = [
      { topic: "Project Overview & Architecture", daysFromNow: 2 },
      { topic: "Codebase Walkthrough", daysFromNow: 5 },
      { topic: "Stakeholder Contacts & Processes", daysFromNow: 8 },
      { topic: "Pending Items & Handover", daysFromNow: 12 },
    ];

    for (const session of ktSessions) {
      const sessionDate = new Date();
      sessionDate.setDate(sessionDate.getDate() + session.daysFromNow);

      await prisma.notification.create({
        data: {
          userId: successor.user.id,
          title: "Knowledge Transfer Session",
          message: `KT session with ${employee.user.firstName}: "${session.topic}" scheduled for ${sessionDate.toLocaleDateString()}`,
          type: "info",
          module: "hr",
        },
      });
    }

    // Store KT plan in workflow
    const workflowDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "ExitWorkflow", entityId: employeeId, category: "EXIT_WORKFLOW" },
      orderBy: { createdAt: "desc" },
    });

    if (workflowDoc) {
      const wfData = workflowDoc.data as any;
      await prisma.generatedDocument.update({
        where: { id: workflowDoc.id },
        data: {
          data: {
            ...wfData,
            knowledgeTransferComplete: false,
            ktPlan: {
              successorId,
              successorName: `${successor.user.firstName} ${successor.user.lastName}`,
              tasksTransferred: openGoals.length,
              sessions: ktSessions,
              initiatedAt: new Date().toISOString(),
            },
          },
        },
      });
    }

    await createAuditLog({
      userId: employee.userId,
      action: "CREATE",
      entity: "KnowledgeTransfer",
      entityId: employeeId,
      newValue: { successorId, tasksTransferred: openGoals.length, sessionsPlanned: ktSessions.length },
    });

    return {
      success: true,
      tasksToTransfer: openGoals.length,
      ktSessionsPlanned: ktSessions.length,
    };
  }

  /**
   * Calculate full & final settlement.
   */
  static async calculateFinalSettlement(employeeId: string): Promise<FinalSettlement> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");

    const lastWorkingDay = employee.dateOfLeaving || new Date();
    const joiningDate = employee.dateOfJoining;
    const totalDays = Math.floor(
      (lastWorkingDay.getTime() - joiningDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const tenureYears = Math.round((totalDays / 365) * 10) / 10;

    const annualSalary = Number(employee.baseSalary);
    const monthlySalary = annualSalary / 12;
    const dailySalary = annualSalary / 365;

    // Pending salary (days worked in current month)
    const now = new Date();
    const daysWorkedThisMonth = now.getDate();
    const pendingSalary = Math.round(dailySalary * daysWorkedThisMonth * 100) / 100;

    // Leave encashment — fetch unused leave days
    const leaveRecords = await prisma.leaveRecord.findMany({
      where: { employeeId, status: "APPROVED" },
    });
    const totalLeaveTaken = leaveRecords.reduce((sum, lr) => sum + Number(lr.totalDays || 0), 0);
    const annualLeaveEntitlement = 24; // Standard entitlement
    const unusedLeaves = Math.max(0, annualLeaveEntitlement - totalLeaveTaken);
    const leaveEncashment = Math.round(unusedLeaves * dailySalary * 100) / 100;

    // Gratuity (if tenure >= 5 years): (15/26) * last drawn salary * years of service
    const gratuity = tenureYears >= 5
      ? Math.round((15 / 26) * monthlySalary * Math.floor(tenureYears) * 100) / 100
      : 0;

    // Bonus — pro-rata for the year
    const monthsWorkedThisYear = now.getMonth() + 1;
    const bonus = Math.round((monthlySalary * monthsWorkedThisYear) / 12 * 0.0833 * 100) / 100; // 8.33% statutory bonus

    // Pending reimbursements
    const pendingExpenses = await prisma.expenseClaim.findMany({
      where: { employeeId, status: "APPROVED" },
    });
    const pendingReimbursements = pendingExpenses.reduce(
      (sum, exp) => sum + Number(exp.totalAmount),
      0
    );

    // Salary advance recovery
    const advances = await prisma.salaryAdvance.findMany({
      where: { employeeId, status: "DISBURSED" },
    });
    const advanceRecovery = advances.reduce(
      (sum, adv) => sum + Number(adv.amount),
      0
    );

    // Notice period recovery (if applicable)
    const workflowDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "ExitWorkflow", entityId: employeeId, category: "EXIT_WORKFLOW" },
      orderBy: { createdAt: "desc" },
    });
    const wfData = workflowDoc?.data as any;
    const noticePeriodRecovery = wfData?.noticePeriodBuyout ? (wfData.buyoutAmount || 0) : 0;

    // PF employer contribution
    const pfEmployerContribution = Math.round(monthlySalary * 0.12 * tenureYears * 100) / 100;

    // Standard deductions (professional tax, etc.)
    const deductions = 200; // Last month professional tax

    const totalPayable = pendingSalary + leaveEncashment + gratuity + bonus + pendingReimbursements + pfEmployerContribution;
    const totalDeductions = deductions + advanceRecovery + noticePeriodRecovery;
    const netSettlement = Math.round((totalPayable - totalDeductions) * 100) / 100;

    const settlement: FinalSettlement = {
      employeeId,
      employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
      employeeCode: employee.employeeCode,
      lastWorkingDay: lastWorkingDay.toISOString(),
      tenureYears,
      components: {
        pendingSalary,
        leaveEncashment,
        gratuity,
        bonus,
        pendingReimbursements,
        deductions,
        advanceRecovery,
        noticePeriodRecovery,
        pfEmployerContribution,
      },
      totalPayable: Math.round(totalPayable * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      netSettlement,
    };

    return settlement;
  }

  /**
   * Generate Full & Final settlement statement as HTML.
   */
  static async generateFnFStatement(employeeId: string): Promise<string> {
    const settlement = await this.calculateFinalSettlement(employeeId);

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Full & Final Settlement — ${settlement.employeeName}</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; color: #1a1a1a; }
        h1 { color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; }
        h2 { color: #2c5f8a; margin-top: 24px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e0e0e0; }
        th { background: #f5f7fa; font-weight: 600; }
        .amount { text-align: right; font-family: monospace; }
        .total-row { font-weight: bold; background: #eef3f8; }
        .net-row { font-size: 1.2em; color: #1e3a5f; background: #d4e6f8; }
        .footer { margin-top: 40px; font-size: 0.85em; color: #666; }
        .company { color: #1e3a5f; font-weight: bold; }
      </style></head>
      <body>
        <h1>Full & Final Settlement Statement</h1>
        <p><span class="company">Circuvent Technologies Pvt. Ltd.</span></p>

        <h2>Employee Details</h2>
        <table>
          <tr><td><strong>Employee Name</strong></td><td>${settlement.employeeName}</td></tr>
          <tr><td><strong>Employee Code</strong></td><td>${settlement.employeeCode}</td></tr>
          <tr><td><strong>Department</strong></td><td>${employee?.department || "—"}</td></tr>
          <tr><td><strong>Designation</strong></td><td>${employee?.designation || "—"}</td></tr>
          <tr><td><strong>Date of Joining</strong></td><td>${employee?.dateOfJoining.toLocaleDateString() || "—"}</td></tr>
          <tr><td><strong>Last Working Day</strong></td><td>${new Date(settlement.lastWorkingDay).toLocaleDateString()}</td></tr>
          <tr><td><strong>Tenure</strong></td><td>${settlement.tenureYears} years</td></tr>
        </table>

        <h2>Payable Components</h2>
        <table>
          <tr><th>Component</th><th class="amount">Amount (₹)</th></tr>
          <tr><td>Pending Salary</td><td class="amount">${settlement.components.pendingSalary.toLocaleString("en-IN")}</td></tr>
          <tr><td>Leave Encashment</td><td class="amount">${settlement.components.leaveEncashment.toLocaleString("en-IN")}</td></tr>
          <tr><td>Gratuity</td><td class="amount">${settlement.components.gratuity.toLocaleString("en-IN")}</td></tr>
          <tr><td>Pro-rata Bonus</td><td class="amount">${settlement.components.bonus.toLocaleString("en-IN")}</td></tr>
          <tr><td>Pending Reimbursements</td><td class="amount">${settlement.components.pendingReimbursements.toLocaleString("en-IN")}</td></tr>
          <tr><td>PF Employer Contribution</td><td class="amount">${settlement.components.pfEmployerContribution.toLocaleString("en-IN")}</td></tr>
          <tr class="total-row"><td>Total Payable</td><td class="amount">₹${settlement.totalPayable.toLocaleString("en-IN")}</td></tr>
        </table>

        <h2>Deductions</h2>
        <table>
          <tr><th>Component</th><th class="amount">Amount (₹)</th></tr>
          <tr><td>Professional Tax</td><td class="amount">${settlement.components.deductions.toLocaleString("en-IN")}</td></tr>
          <tr><td>Salary Advance Recovery</td><td class="amount">${settlement.components.advanceRecovery.toLocaleString("en-IN")}</td></tr>
          <tr><td>Notice Period Recovery</td><td class="amount">${settlement.components.noticePeriodRecovery.toLocaleString("en-IN")}</td></tr>
          <tr class="total-row"><td>Total Deductions</td><td class="amount">₹${settlement.totalDeductions.toLocaleString("en-IN")}</td></tr>
        </table>

        <table>
          <tr class="net-row"><td><strong>Net Settlement Amount</strong></td><td class="amount"><strong>₹${settlement.netSettlement.toLocaleString("en-IN")}</strong></td></tr>
        </table>

        <div class="footer">
          <p>This is a computer-generated document. Date: ${new Date().toLocaleDateString()}</p>
          <p>For queries, contact HR at hr@circuvent.io</p>
        </div>
      </body>
      </html>
    `;

    // Store the generated statement
    await prisma.generatedDocument.create({
      data: {
        name: `FnF Statement — ${settlement.employeeCode}`,
        category: "FNF_STATEMENT",
        entityType: "FinalSettlement",
        entityId: employeeId,
        generatedBy: "SYSTEM",
        format: "HTML",
        content: html,
        data: settlement as any,
      },
    });

    return html;
  }

  /**
   * Process settlement payment by debiting from company fund.
   */
  static async processSettlementPayment(
    employeeId: string,
    amount: number
  ): Promise<{ success: boolean; transactionId: string; reference: string }> {
    if (amount <= 0) throw new Error("Settlement amount must be positive");

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");

    // Find the HR/Payroll fund
    const fund = await prisma.fund.findFirst({
      where: {
        category: "OPERATIONAL",
        isActive: true,
        remainingAmount: { gte: amount },
      },
      orderBy: { remainingAmount: "desc" },
    });

    if (!fund) throw new Error("Insufficient funds available for settlement");

    const reference = `FNF-${employee.employeeCode}-${Date.now()}`;

    const transaction = await prisma.fundTransaction.create({
      data: {
        fundId: fund.id,
        transactionType: "DEBIT",
        amount,
        description: `Final settlement for ${employee.user.firstName} ${employee.user.lastName} (${employee.employeeCode})`,
        referenceType: "FinalSettlement",
        referenceId: employeeId,
        beneficiaryAccount: employee.bankAccountNo || undefined,
        beneficiaryName: `${employee.user.firstName} ${employee.user.lastName}`,
        transferRef: reference,
        status: "COMPLETED",
        processedAt: new Date(),
        processedBy: "SYSTEM",
        balanceBefore: fund.remainingAmount,
        balanceAfter: fund.remainingAmount - amount,
      },
    });

    // Update fund balance
    await prisma.fund.update({
      where: { id: fund.id },
      data: {
        spentAmount: { increment: amount },
        remainingAmount: { decrement: amount },
      },
    });

    // Update workflow
    const workflowDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "ExitWorkflow", entityId: employeeId, category: "EXIT_WORKFLOW" },
      orderBy: { createdAt: "desc" },
    });

    if (workflowDoc) {
      const wfData = workflowDoc.data as any;
      await prisma.generatedDocument.update({
        where: { id: workflowDoc.id },
        data: {
          data: {
            ...wfData,
            settlementProcessed: true,
            settlementAmount: amount,
            settlementTransactionId: transaction.id,
            settlementReference: reference,
          },
        },
      });
    }

    await createAuditLog({
      userId: "SYSTEM",
      action: "UPDATE",
      entity: "FinalSettlement",
      entityId: employeeId,
      newValue: { amount, transactionId: transaction.id, reference },
    });

    return { success: true, transactionId: transaction.id, reference };
  }

  /**
   * Generate exit analytics — attrition trends, exit reasons, tenure analysis.
   */
  static async generateExitAnalytics(): Promise<ExitAnalytics> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Fetch all exit workflow documents
    const exitDocs = await prisma.generatedDocument.findMany({
      where: { entityType: "ExitWorkflow", category: "EXIT_WORKFLOW" },
      orderBy: { createdAt: "desc" },
    });

    const totalEmployees = await prisma.employee.count();
    const totalExits = exitDocs.length;

    const thisMonth = exitDocs.filter((d) => d.createdAt >= startOfMonth).length;
    const thisQuarter = exitDocs.filter((d) => d.createdAt >= startOfQuarter).length;
    const thisYear = exitDocs.filter((d) => d.createdAt >= startOfYear).length;

    // Average tenure
    const employees = await prisma.employee.findMany({
      where: { dateOfLeaving: { not: null } },
      select: { dateOfJoining: true, dateOfLeaving: true, department: true },
    });

    const tenures = employees.map((e) => {
      const days = Math.floor(
        ((e.dateOfLeaving?.getTime() || Date.now()) - e.dateOfJoining.getTime()) / (1000 * 60 * 60 * 24)
      );
      return days / 365;
    });
    const avgTenure = tenures.length > 0 ? Math.round((tenures.reduce((a, b) => a + b, 0) / tenures.length) * 10) / 10 : 0;

    // Notice periods
    const noticePeriods = exitDocs.map((d) => (d.data as any)?.noticePeriodDays || 30);
    const avgNoticePeriod = noticePeriods.length > 0 ? Math.round(noticePeriods.reduce((a: number, b: number) => a + b, 0) / noticePeriods.length) : 30;

    // Attrition rate
    const attritionRate = totalEmployees > 0 ? Math.round((thisYear / totalEmployees) * 100 * 10) / 10 : 0;

    // By exit type
    const voluntaryExits = exitDocs.filter((d) => (d.data as any)?.exitType === "VOLUNTARY").length;
    const voluntaryRate = totalExits > 0 ? Math.round((voluntaryExits / totalExits) * 100 * 10) / 10 : 0;

    // By reason
    const reasonMap = new Map<string, number>();
    for (const doc of exitDocs) {
      const reason = (doc.data as any)?.reason || "Unknown";
      const normalized = reason.length > 30 ? reason.slice(0, 30) : reason;
      reasonMap.set(normalized, (reasonMap.get(normalized) || 0) + 1);
    }
    const byReason = Array.from(reasonMap.entries())
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: totalExits > 0 ? Math.round((count / totalExits) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // By department
    const deptMap = new Map<string, number>();
    for (const doc of exitDocs) {
      const empId = doc.entityId;
      if (empId) {
        const emp = employees.find((e: any) => e.id === empId);
        const dept = (emp as any)?.department || (doc.data as any)?.department || "Unknown";
        deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
      }
    }
    const byDepartment = Array.from(deptMap.entries())
      .map(([department, count]) => ({
        department,
        count,
        rate: totalEmployees > 0 ? Math.round((count / totalEmployees) * 100 * 10) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // By tenure bucket
    const tenureBuckets: Record<string, number> = {
      "0-1 years": 0,
      "1-2 years": 0,
      "2-3 years": 0,
      "3-5 years": 0,
      "5+ years": 0,
    };
    for (const t of tenures) {
      if (t < 1) tenureBuckets["0-1 years"]++;
      else if (t < 2) tenureBuckets["1-2 years"]++;
      else if (t < 3) tenureBuckets["2-3 years"]++;
      else if (t < 5) tenureBuckets["3-5 years"]++;
      else tenureBuckets["5+ years"]++;
    }
    const byTenure = Object.entries(tenureBuckets).map(([range, count]) => ({ range, count }));

    // By exit type
    const exitTypeMap = new Map<ExitType, number>();
    for (const doc of exitDocs) {
      const t = ((doc.data as any)?.exitType || "VOLUNTARY") as ExitType;
      exitTypeMap.set(t, (exitTypeMap.get(t) || 0) + 1);
    }
    const byExitType = Array.from(exitTypeMap.entries()).map(([type, count]) => ({ type, count }));

    // Monthly trend (last 12 months)
    const monthlyTrend: Array<{ month: string; exits: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const label = `${d.toLocaleString("en", { month: "short" })} ${d.getFullYear()}`;
      const exits = exitDocs.filter(
        (doc) => doc.createdAt >= d && doc.createdAt <= monthEnd
      ).length;
      monthlyTrend.push({ month: label, exits });
    }

    // Avg settlement
    const settlements = exitDocs
      .map((d) => (d.data as any)?.settlementAmount)
      .filter((s): s is number => typeof s === "number" && s > 0);
    const avgSettlementAmount = settlements.length > 0
      ? Math.round(settlements.reduce((a, b) => a + b, 0) / settlements.length)
      : 0;

    return {
      totalExits,
      thisMonth,
      thisQuarter,
      thisYear,
      avgTenure,
      avgNoticePeriod,
      attritionRate,
      voluntaryRate,
      byReason,
      byDepartment,
      byTenure,
      byExitType,
      monthlyTrend,
      avgSettlementAmount,
    };
  }

  /**
   * Schedule an exit interview.
   */
  static async scheduleExitInterview(
    employeeId: string,
    interviewerId: string,
    date: Date
  ): Promise<{ success: boolean; scheduledAt: string }> {
    const [employee, interviewer] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: employeeId },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      }),
      prisma.user.findUnique({
        where: { id: interviewerId },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);

    if (!employee) throw new Error("Employee not found");
    if (!interviewer) throw new Error("Interviewer not found");
    if (date < new Date()) throw new Error("Interview date must be in the future");

    // Notify both parties
    await prisma.notification.create({
      data: {
        userId: employee.user.id,
        title: "Exit Interview Scheduled",
        message: `Your exit interview with ${interviewer.firstName} ${interviewer.lastName} is scheduled for ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}.`,
        type: "info",
        module: "hr",
      },
    });

    await prisma.notification.create({
      data: {
        userId: interviewer.id,
        title: "Exit Interview — Interviewer",
        message: `Exit interview with ${employee.user.firstName} ${employee.user.lastName} (${employee.employeeCode}) scheduled for ${date.toLocaleDateString()}.`,
        type: "info",
        module: "hr",
      },
    });

    // Store in workflow
    const workflowDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "ExitWorkflow", entityId: employeeId, category: "EXIT_WORKFLOW" },
      orderBy: { createdAt: "desc" },
    });

    if (workflowDoc) {
      const wfData = workflowDoc.data as any;
      await prisma.generatedDocument.update({
        where: { id: workflowDoc.id },
        data: {
          data: {
            ...wfData,
            exitInterview: {
              interviewerId,
              interviewerName: `${interviewer.firstName} ${interviewer.lastName}`,
              scheduledAt: date.toISOString(),
            },
          },
        },
      });
    }

    await createAuditLog({
      userId: interviewerId,
      action: "CREATE",
      entity: "ExitInterview",
      entityId: employeeId,
      newValue: { interviewerId, date: date.toISOString() },
    });

    return { success: true, scheduledAt: date.toISOString() };
  }

  /**
   * Generate an alumni profile for a departed employee.
   */
  static async generateAlumniProfile(employeeId: string): Promise<AlumniProfile> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });

    if (!employee) throw new Error("Employee not found");
    if (!employee.dateOfLeaving) throw new Error("Employee has not yet exited the organization");

    const tenureYears = Math.round(
      ((employee.dateOfLeaving.getTime() - employee.dateOfJoining.getTime()) / (1000 * 60 * 60 * 24 * 365)) * 10
    ) / 10;

    // Fetch completed goals as achievements
    const completedGoals = await prisma.goal.findMany({
      where: { employeeId, status: "COMPLETED" },
      select: { title: true },
      take: 10,
    });

    // Get exit type from workflow
    const workflowDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "ExitWorkflow", entityId: employeeId, category: "EXIT_WORKFLOW" },
      orderBy: { createdAt: "desc" },
    });
    const exitType: ExitType = (workflowDoc?.data as any)?.exitType || "VOLUNTARY";

    const profile: AlumniProfile = {
      employeeId,
      employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
      employeeCode: employee.employeeCode,
      department: employee.department,
      designation: employee.designation,
      dateOfJoining: employee.dateOfJoining.toISOString(),
      dateOfLeaving: employee.dateOfLeaving.toISOString(),
      tenureYears,
      lastDesignation: employee.designation,
      exitType,
      personalEmail: employee.user.email,
      achievements: completedGoals.map((g) => g.title),
    };

    // Store alumni profile
    await prisma.generatedDocument.create({
      data: {
        name: `Alumni Profile — ${employee.employeeCode}`,
        category: "ALUMNI_PROFILE",
        entityType: "AlumniProfile",
        entityId: employeeId,
        generatedBy: "SYSTEM",
        format: "JSON",
        data: profile as any,
      },
    });

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "AlumniProfile",
      entityId: employeeId,
      newValue: { employeeCode: employee.employeeCode, tenureYears },
    });

    return profile;
  }
}
