// ──────────────────────────────────────────────────────────────
// Enhanced Payroll Routes — salary generation + India tax
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { HTTP_STATUS, successResponse, errorResponse } from "@circuvent/shared";
import { PayrollService } from "../services";
import { generateSalarySchema, bulkSalarySchema } from "../validators";

const router = Router();

router.post("/generate", async (req: Request, res: Response) => {
  try {
    const parsed = generateSalarySchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const actorId = (req as any).user?.userId;
    const slip = await PayrollService.generateSlip(parsed.data.employeeId, parsed.data.month, parsed.data.year, parsed.data.bonus, actorId);
    res.status(HTTP_STATUS.CREATED).json(successResponse(slip, "Salary slip generated"));
  } catch (error: any) {
    if (error.message?.includes("already exists")) { res.status(HTTP_STATUS.CONFLICT).json(errorResponse(error.message)); return; }
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse(error.message || "Failed to generate salary slip"));
  }
});

router.post("/generate-bulk", async (req: Request, res: Response) => {
  try {
    const parsed = bulkSalarySchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const actorId = (req as any).user?.userId;
    const results = await PayrollService.bulkGenerate(parsed.data.month, parsed.data.year, actorId);
    res.json(successResponse(results, `Bulk: ${results.generated} generated, ${results.skipped} skipped`));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Bulk generation failed"));
  }
});

router.get("/:employeeId/slips", async (req: Request, res: Response) => {
  try {
    const slips = await PayrollService.getSlips(req.params.employeeId);
    res.json(successResponse(slips));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch slips"));
  }
});

router.patch("/slips/:id/pay", async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).user?.userId;
    const slip = await PayrollService.markPaid(req.params.id, actorId);
    res.json(successResponse(slip, "Salary marked as paid"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to mark as paid"));
  }
});

router.get("/calculate-preview", async (req: Request, res: Response) => {
  try {
    const { annualSalary, bonus } = req.query;
    if (!annualSalary) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse("annualSalary required")); return; }
    const breakdown = PayrollService.previewSalary(Number(annualSalary), Number(bonus) || 0);
    res.json(successResponse(breakdown));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to calculate"));
  }
});

export { router as payrollRouter };
