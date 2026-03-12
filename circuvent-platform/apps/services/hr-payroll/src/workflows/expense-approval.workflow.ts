// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Multi-Level Expense Approval Workflow
// Implements configurable N-level approval with escalation,
// auto-routing based on amount thresholds, and audit trail.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

const AMOUNT_THRESHOLDS = {
  L1_MAX: 25000,    // Up to ₹25,000 — L1 approval only
  L2_MAX: 100000,   // Up to ₹1,00,000 — L1 + L2 approval
  L3_ABOVE: 100000, // Above ₹1,00,000 — L1 + L2 + L3
};

const ESCALATION_HOURS = 48; // Auto-escalate after 48 hours without action

export interface WorkflowInitParams {
  entityType: string;
  entityId: string;
  initiatedById: string;
  amount: number;
  approverL1Id: string;
  approverL2Id?: string;
  approverL3Id?: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalActionParams {
  workflowId: string;
  approverId: string;
  action: "APPROVED" | "REJECTED" | "ESCALATED";
  comments?: string;
}

export class ExpenseApprovalWorkflow {
  /**
   * Initiates a new approval workflow for an expense claim.
   * Determines the required approval levels based on amount.
   */
  static async initiate(params: WorkflowInitParams): Promise<any> {
    const maxLevel = this.determineMaxLevel(params.amount);

    const workflow = await prisma.approvalWorkflow.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        currentLevel: 1,
        maxLevel,
        status: "PENDING_L1",
        initiatedById: params.initiatedById,
        metadata: params.metadata as any,
        steps: {
          create: [
            { level: 1, approverId: params.approverL1Id },
            ...(maxLevel >= 2 && params.approverL2Id
              ? [{ level: 2, approverId: params.approverL2Id }]
              : []),
            ...(maxLevel >= 3 && params.approverL3Id
              ? [{ level: 3, approverId: params.approverL3Id }]
              : []),
          ],
        },
      },
      include: { steps: true },
    });

    await createAuditLog({
      userId: params.initiatedById,
      action: "CREATE",
      entity: "ApprovalWorkflow",
      entityId: workflow.id,
      newValue: { entityType: params.entityType, entityId: params.entityId, maxLevel },
    });

    return workflow;
  }

  /**
   * Process an approval action (approve/reject/escalate).
   */
  static async processAction(params: ApprovalActionParams): Promise<{
    workflow: any;
    isComplete: boolean;
    finalStatus: string;
  }> {
    const workflow = await prisma.approvalWorkflow.findUnique({
      where: { id: params.workflowId },
      include: { steps: { orderBy: { level: "asc" } } },
    });

    if (!workflow) throw new Error("Workflow not found");

    // Validate: cannot approve own request
    if (workflow.initiatedById === params.approverId) {
      throw new Error("Cannot approve own request");
    }

    // Find the current step for this approver
    const currentStep = workflow.steps.find(
      (s) => s.level === workflow.currentLevel && s.approverId === params.approverId && !s.action
    );

    if (!currentStep) {
      throw new Error("No pending approval step for this approver at the current level");
    }

    // Record the action
    await prisma.approvalStep.update({
      where: { id: currentStep.id },
      data: {
        action: params.action,
        comments: params.comments,
        actionAt: new Date(),
      },
    });

    let newStatus: string;
    let isComplete = false;

    if (params.action === "REJECTED") {
      // Rejection at any level terminates the workflow
      newStatus = "REJECTED";
      isComplete = true;

      // Update the linked entity (expense claim)
      await this.updateEntityStatus(workflow.entityType, workflow.entityId, "REJECTED");

    } else if (params.action === "ESCALATED") {
      // Move to next level if available
      if (workflow.currentLevel < workflow.maxLevel) {
        const nextLevel = workflow.currentLevel + 1;
        newStatus = `PENDING_L${nextLevel}`;
      } else {
        newStatus = "ESCALATED";
        isComplete = true;
      }

    } else if (params.action === "APPROVED") {
      if (workflow.currentLevel < workflow.maxLevel) {
        // Move to next approval level
        const nextLevel = workflow.currentLevel + 1;
        newStatus = `PENDING_L${nextLevel}`;
      } else {
        // Final approval
        newStatus = "APPROVED";
        isComplete = true;

        // Update the linked entity
        await this.updateEntityStatus(workflow.entityType, workflow.entityId, "APPROVED");
      }
    } else {
      newStatus = workflow.status;
    }

    // Update workflow
    const updatedWorkflow = await prisma.approvalWorkflow.update({
      where: { id: workflow.id },
      data: {
        status: newStatus as any,
        currentLevel: params.action === "APPROVED" && !isComplete
          ? workflow.currentLevel + 1
          : workflow.currentLevel,
      },
      include: { steps: true },
    });

    await createAuditLog({
      userId: params.approverId,
      action: params.action as any,
      entity: "ApprovalWorkflow",
      entityId: workflow.id,
      newValue: {
        level: workflow.currentLevel,
        action: params.action,
        newStatus,
        comments: params.comments,
      },
    });

    return { workflow: updatedWorkflow, isComplete, finalStatus: newStatus };
  }

  /**
   * Get pending approvals for a specific user.
   */
  static async getPendingForApprover(approverId: string): Promise<any[]> {
    const pendingSteps = await prisma.approvalStep.findMany({
      where: {
        approverId,
        action: null,
        workflow: {
          status: { in: ["PENDING_L1", "PENDING_L2", "PENDING_L3"] },
        },
      },
      include: {
        workflow: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Only return steps where the current level matches the step level
    return pendingSteps.filter((step) => step.level === step.workflow.currentLevel);
  }

  /**
   * Check for stale workflows and auto-escalate.
   */
  static async checkAndAutoEscalate(): Promise<number> {
    const staleThreshold = new Date(Date.now() - ESCALATION_HOURS * 60 * 60 * 1000);

    const staleWorkflows = await prisma.approvalWorkflow.findMany({
      where: {
        status: { in: ["PENDING_L1", "PENDING_L2", "PENDING_L3"] },
        updatedAt: { lt: staleThreshold },
      },
      include: { steps: true },
    });

    let escalated = 0;

    for (const wf of staleWorkflows) {
      if (wf.currentLevel < wf.maxLevel) {
        await prisma.approvalWorkflow.update({
          where: { id: wf.id },
          data: {
            currentLevel: wf.currentLevel + 1,
            status: `PENDING_L${wf.currentLevel + 1}` as any,
          },
        });

        // Record auto-escalation
        await prisma.approvalStep.updateMany({
          where: {
            workflowId: wf.id,
            level: wf.currentLevel,
            action: null,
          },
          data: {
            action: "ESCALATED",
            comments: "Auto-escalated due to timeout",
            actionAt: new Date(),
          },
        });

        escalated++;
      }
    }

    return escalated;
  }

  /**
   * Get workflow history for an entity.
   */
  static async getWorkflowForEntity(entityType: string, entityId: string): Promise<any> {
    return prisma.approvalWorkflow.findFirst({
      where: { entityType, entityId },
      include: { steps: { orderBy: { level: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
  }

  private static determineMaxLevel(amount: number): number {
    if (amount <= AMOUNT_THRESHOLDS.L1_MAX) return 1;
    if (amount <= AMOUNT_THRESHOLDS.L2_MAX) return 2;
    return 3;
  }

  private static async updateEntityStatus(entityType: string, entityId: string, status: string): Promise<void> {
    try {
      if (entityType === "ExpenseClaim") {
        await prisma.expenseClaim.update({
          where: { id: entityId },
          data: {
            status: status as any,
            ...(status === "APPROVED" ? { approvedAt: new Date() } : {}),
          },
        });
      } else if (entityType === "LeaveRecord") {
        await prisma.leaveRecord.update({
          where: { id: entityId },
          data: { status },
        });
      }
    } catch (error) {
      console.error(`[WORKFLOW] Failed to update entity status:`, error);
    }
  }
}
