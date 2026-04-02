// ──────────────────────────────────────────────────────────────
// Enhanced Expense Routes — R&D tagging + BOM linking + approvals
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { HTTP_STATUS, successResponse, errorResponse } from "@circuvent/shared";
import { ExpenseService, LeaveService } from "../services";
import { createExpenseSchema, leaveRequestSchema } from "../validators";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const { employeeId, status, isRnDExpense } = req.query;
    const claims = await ExpenseService.list({
      employeeId: employeeId as string,
      status: status as string,
      isRnDExpense: isRnDExpense !== undefined ? isRnDExpense === "true" : undefined,
    });
    res.json(successResponse(claims));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch expenses"));
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = createExpenseSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const actorId = (req as any).user?.userId;
    const claim = await ExpenseService.create(parsed.data, actorId);
    res.status(HTTP_STATUS.CREATED).json(successResponse(claim, "Expense claim created"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse(error.message || "Failed to create expense"));
  }
});

router.patch("/:id/approve", async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).user?.userId;
    const claim = await ExpenseService.approve(req.params.id, actorId);
    res.json(successResponse(claim, "Expense approved"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to approve"));
  }
});

router.patch("/:id/reject", async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).user?.userId;
    const claim = await ExpenseService.reject(req.params.id, actorId);
    res.json(successResponse(claim, "Expense rejected"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to reject"));
  }
});

router.patch("/:id/reimburse", async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).user?.userId;
    const claim = await ExpenseService.reimburse(req.params.id, actorId);
    res.json(successResponse(claim, "Expense reimbursed"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to reimburse"));
  }
});

router.get("/rnd/summary", async (req: Request, res: Response) => {
  try {
    const summary = await ExpenseService.getRnDSummary(req.query.financialYear as string);
    res.json(successResponse(summary));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch R&D summary"));
  }
});

// ── Leave routes (bundled here for simplicity) ──
router.post("/leave", async (req: Request, res: Response) => {
  try {
    const parsed = leaveRequestSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const actorId = (req as any).user?.userId;
    const record = await LeaveService.create(parsed.data, actorId);
    res.status(HTTP_STATUS.CREATED).json(successResponse(record, "Leave request created"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to create leave request"));
  }
});

router.patch("/leave/:id/approve", async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).user?.userId;
    const record = await LeaveService.approve(req.params.id, actorId);
    res.json(successResponse(record, "Leave approved"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to approve leave"));
  }
});

router.patch("/leave/:id/reject", async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).user?.userId;
    const record = await LeaveService.reject(req.params.id, actorId);
    res.json(successResponse(record, "Leave rejected"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to reject leave"));
  }
});

export { router as expenseRouter };
