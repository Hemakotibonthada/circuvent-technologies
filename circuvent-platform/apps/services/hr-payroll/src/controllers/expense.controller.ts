// ──────────────────────────────────────────────────────────────
// HR Payroll — Expense Controller
// Handles expense claim CRUD, multi-level approval workflow
// initiation, R&D tagging, and expense analytics.
// ──────────────────────────────────────────────────────────────

import { Request, Response } from "express";
import { ExpenseService } from "../services";
import { ExpenseApprovalWorkflow } from "../workflows/expense-approval.workflow";
import { expenseClaimSchemaV2, approvalActionSchema } from "../validators/hr.validators.v2";
import { successResponse, errorResponse } from "@circuvent/shared";

export class ExpenseController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { employeeId, status, isRnDExpense } = req.query;
      const claims = await ExpenseService.list({
        employeeId: employeeId as string,
        status: status as string,
        isRnDExpense: isRnDExpense !== undefined ? isRnDExpense === "true" : undefined,
      });
      res.json(successResponse(claims));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = expenseClaimSchemaV2.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(errorResponse(parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ")));
        return;
      }
      const actorId = (req as any).user?.userId;
      const claim = await ExpenseService.create(parsed.data, actorId);

      // Auto-initiate approval workflow if approver provided
      if (parsed.data.approverL1Id) {
        const totalAmount = parsed.data.items.reduce((sum, item) => sum + item.amount, 0);
        try {
          await ExpenseApprovalWorkflow.initiate({
            entityType: "ExpenseClaim",
            entityId: claim.id,
            initiatedById: actorId,
            amount: totalAmount,
            approverL1Id: parsed.data.approverL1Id,
            approverL2Id: parsed.data.approverL2Id,
            approverL3Id: parsed.data.approverL3Id,
            metadata: { title: parsed.data.title, isRnD: parsed.data.isRnDExpense },
          });
        } catch (wfError: any) {
          console.warn("[EXPENSE] Workflow initiation failed:", wfError.message);
        }
      }

      res.status(201).json(successResponse(claim, "Expense claim created"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async approve(req: Request, res: Response): Promise<void> {
    try {
      const actorId = (req as any).user?.userId;

      // Check for workflow-based approval
      const workflow = await ExpenseApprovalWorkflow.getWorkflowForEntity("ExpenseClaim", req.params.id);
      if (workflow) {
        const result = await ExpenseApprovalWorkflow.processAction({
          workflowId: workflow.id,
          approverId: actorId,
          action: "APPROVED",
          comments: req.body.comments,
        });
        res.json(successResponse(result, result.isComplete ? "Expense fully approved" : `Moved to level ${result.workflow.currentLevel}`));
        return;
      }

      // Direct approval (no workflow)
      const claim = await ExpenseService.approve(req.params.id, actorId);
      res.json(successResponse(claim, "Expense approved"));
    } catch (error: any) {
      const status = error.message.includes("own request") ? 400 : error.message.includes("not found") ? 404 : 500;
      res.status(status).json(errorResponse(error.message));
    }
  }

  static async reject(req: Request, res: Response): Promise<void> {
    try {
      const actorId = (req as any).user?.userId;

      // Check for workflow-based rejection
      const workflow = await ExpenseApprovalWorkflow.getWorkflowForEntity("ExpenseClaim", req.params.id);
      if (workflow) {
        const result = await ExpenseApprovalWorkflow.processAction({
          workflowId: workflow.id,
          approverId: actorId,
          action: "REJECTED",
          comments: req.body.comments || "Rejected",
        });
        res.json(successResponse(result, "Expense rejected"));
        return;
      }

      const claim = await ExpenseService.reject(req.params.id, actorId);
      res.json(successResponse(claim, "Expense rejected"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async reimburse(req: Request, res: Response): Promise<void> {
    try {
      const actorId = (req as any).user?.userId;
      const claim = await ExpenseService.reimburse(req.params.id, actorId);
      res.json(successResponse(claim, "Expense reimbursed"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getRnDSummary(req: Request, res: Response): Promise<void> {
    try {
      const summary = await ExpenseService.getRnDSummary(req.query.financialYear as string);
      res.json(successResponse(summary));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  // ── Approval Workflow Endpoints ──

  static async processApproval(req: Request, res: Response): Promise<void> {
    try {
      const parsed = approvalActionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(errorResponse(parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ")));
        return;
      }
      const result = await ExpenseApprovalWorkflow.processAction(parsed.data);
      res.json(successResponse(result, result.isComplete ? `Workflow ${result.finalStatus}` : `Moved to level ${result.workflow.currentLevel}`));
    } catch (error: any) {
      const status = error.message.includes("own request") ? 400 : error.message.includes("not found") ? 404 : 500;
      res.status(status).json(errorResponse(error.message));
    }
  }

  static async getPendingApprovals(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.userId;
      const pending = await ExpenseApprovalWorkflow.getPendingForApprover(userId);
      res.json(successResponse(pending));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getWorkflowStatus(req: Request, res: Response): Promise<void> {
    try {
      const workflow = await ExpenseApprovalWorkflow.getWorkflowForEntity(
        req.params.entityType,
        req.params.entityId,
      );
      if (!workflow) { res.status(404).json(errorResponse("No workflow found")); return; }
      res.json(successResponse(workflow));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async autoEscalate(_req: Request, res: Response): Promise<void> {
    try {
      const count = await ExpenseApprovalWorkflow.checkAndAutoEscalate();
      res.json(successResponse({ escalated: count }, `${count} workflow(s) auto-escalated`));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getExpenseAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { employeeId, status, isRnDExpense } = req.query;
      const claims = await ExpenseService.list({
        employeeId: employeeId as string,
        status: status as string,
        isRnDExpense: isRnDExpense !== undefined ? isRnDExpense === "true" : undefined,
      });

      const totalAmount = claims.reduce((sum: number, c: any) => sum + Number(c.totalAmount), 0);
      const approved = claims.filter((c: any) => c.status === "APPROVED" || c.status === "REIMBURSED");
      const approvedAmount = approved.reduce((sum: number, c: any) => sum + Number(c.totalAmount), 0);
      const rndClaims = claims.filter((c: any) => c.isRnDExpense);
      const rndAmount = rndClaims.reduce((sum: number, c: any) => sum + Number(c.totalAmount), 0);

      const byCategory: Record<string, number> = {};
      for (const claim of claims) {
        if (claim.items) {
          for (const item of claim.items) {
            const cat = (item as any).category || "OTHER";
            byCategory[cat] = (byCategory[cat] || 0) + Number((item as any).amount);
          }
        }
      }

      const byStatus: Record<string, number> = {};
      for (const claim of claims) {
        byStatus[claim.status] = (byStatus[claim.status] || 0) + 1;
      }

      res.json(successResponse({
        totalClaims: claims.length,
        totalAmount,
        approvedAmount,
        rndAmount,
        rndPercentage: totalAmount > 0 ? Math.round((rndAmount / totalAmount) * 100) : 0,
        averageClaimAmount: claims.length > 0 ? Math.round(totalAmount / claims.length) : 0,
        byStatus,
        byCategory: Object.entries(byCategory).map(([cat, amount]) => ({ category: cat, amount })).sort((a, b) => b.amount - a.amount),
        approvalRate: claims.length > 0 ? Math.round((approved.length / claims.length) * 100) : 0,
      }));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }
}
