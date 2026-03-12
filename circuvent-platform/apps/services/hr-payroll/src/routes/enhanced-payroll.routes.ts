// ──────────────────────────────────────────────────────────────
// HR Payroll — Enhanced Payroll Routes (Phase 2)
// Adds statutory engine preview, PDF generation, bulk ops,
// YTD calculations, and gratuity computation.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { EnhancedPayrollService } from "../services/enhanced-payroll.service";
import { PayslipPDFService } from "../services/payslip-pdf.service";
import { ExpenseApprovalWorkflow } from "../workflows/expense-approval.workflow";

const router = Router();

// ── POST /api/payroll/v2/generate ──
router.post("/v2/generate", async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).user?.userId;
    const result = await EnhancedPayrollService.generateSlip(req.body, actorId);
    res.status(201).json({ success: true, data: result, message: "Salary slip generated with statutory engine" });
  } catch (error: any) {
    const status = error.message.includes("not found") ? 404 : error.message.includes("already exists") ? 409 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// ── POST /api/payroll/v2/generate-bulk ──
router.post("/v2/generate-bulk", async (req: Request, res: Response) => {
  try {
    const { month, year, state } = req.body;
    const actorId = (req as any).user?.userId;
    const result = await EnhancedPayrollService.bulkGenerate(month, year, state || "Karnataka", actorId);
    res.json({ success: true, data: result, message: `Bulk: ${result.generated} generated, ${result.skipped} skipped` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /api/payroll/v2/preview ──
router.get("/v2/preview", async (req: Request, res: Response) => {
  try {
    const { annualCTC, state, section80C, section80D, section24, hraExemption } = req.query;
    if (!annualCTC) { res.status(400).json({ success: false, error: "annualCTC required" }); return; }

    const preview = await EnhancedPayrollService.salaryPreview(
      Number(annualCTC),
      (state as string) || "Karnataka",
      {
        section80C: section80C ? Number(section80C) : undefined,
        section80D: section80D ? Number(section80D) : undefined,
        section24: section24 ? Number(section24) : undefined,
        hraExemption: hraExemption ? Number(hraExemption) : undefined,
      }
    );

    res.json({ success: true, data: preview });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /api/payroll/v2/dashboard ──
router.get("/v2/dashboard", async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    const result = await EnhancedPayrollService.getPayrollDashboard(
      month ? Number(month) : undefined,
      year ? Number(year) : undefined
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /api/payroll/v2/:employeeId/ytd ──
router.get("/v2/:employeeId/ytd", async (req: Request, res: Response) => {
  try {
    const ytd = await EnhancedPayrollService.getEmployeeYTD(
      req.params.employeeId,
      req.query.financialYear as string
    );
    res.json({ success: true, data: ytd });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /api/payroll/v2/:employeeId/gratuity ──
router.get("/v2/:employeeId/gratuity", async (req: Request, res: Response) => {
  try {
    const result = await EnhancedPayrollService.calculateEmployeeGratuity(req.params.employeeId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /api/payroll/v2/slips/:slipId/pdf ──
router.post("/v2/slips/:slipId/pdf", async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).user?.userId;
    const result = await PayslipPDFService.generateAndStore(req.params.slipId, actorId);
    res.status(201).json({ success: true, data: result, message: "Payslip PDF generated" });
  } catch (error: any) {
    const status = error.message.includes("not found") ? 404 : error.message.includes("already generated") ? 409 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// ── POST /api/payroll/v2/pdf/bulk ──
router.post("/v2/pdf/bulk", async (req: Request, res: Response) => {
  try {
    const { month, year } = req.body;
    const actorId = (req as any).user?.userId;
    const result = await PayslipPDFService.bulkGenerate(month, year, actorId);
    res.json({ success: true, data: result, message: `PDFs: ${result.generated} generated, ${result.skipped} skipped` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /api/payroll/v2/pdf/:documentId/download ──
router.get("/v2/pdf/:documentId/download", async (req: Request, res: Response) => {
  try {
    const { buffer, filename, checksum } = await PayslipPDFService.download(req.params.documentId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Checksum-SHA256", checksum);
    res.send(buffer);
  } catch (error: any) {
    res.status(404).json({ success: false, error: error.message });
  }
});

// ── PATCH /api/payroll/v2/slips/:slipId/pay ──
router.patch("/v2/slips/:slipId/pay", async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).user?.userId;
    const slip = await EnhancedPayrollService.markPaid(req.params.slipId, actorId);
    res.json({ success: true, data: slip, message: "Marked as paid" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /api/payroll/v2/pay-bulk ──
router.post("/v2/pay-bulk", async (req: Request, res: Response) => {
  try {
    const { month, year } = req.body;
    const actorId = (req as any).user?.userId;
    const count = await EnhancedPayrollService.bulkMarkPaid(month, year, actorId);
    res.json({ success: true, data: { paidCount: count }, message: `${count} slips marked as paid` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ══════════════════════════════════════════════════════════════
// Expense Approval Workflow Routes
// ══════════════════════════════════════════════════════════════

// ── POST /api/payroll/v2/approval/initiate ──
router.post("/v2/approval/initiate", async (req: Request, res: Response) => {
  try {
    const workflow = await ExpenseApprovalWorkflow.initiate(req.body);
    res.status(201).json({ success: true, data: workflow, message: "Approval workflow initiated" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /api/payroll/v2/approval/action ──
router.post("/v2/approval/action", async (req: Request, res: Response) => {
  try {
    const result = await ExpenseApprovalWorkflow.processAction(req.body);
    res.json({
      success: true,
      data: result,
      message: result.isComplete
        ? `Workflow ${result.finalStatus}.`
        : `Moved to level ${result.workflow.currentLevel}.`,
    });
  } catch (error: any) {
    const status = error.message.includes("own request") ? 400 : error.message.includes("not found") ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// ── GET /api/payroll/v2/approval/pending ──
router.get("/v2/approval/pending", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const pending = await ExpenseApprovalWorkflow.getPendingForApprover(userId);
    res.json({ success: true, data: pending });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /api/payroll/v2/approval/:entityType/:entityId ──
router.get("/v2/approval/:entityType/:entityId", async (req: Request, res: Response) => {
  try {
    const workflow = await ExpenseApprovalWorkflow.getWorkflowForEntity(
      req.params.entityType,
      req.params.entityId
    );
    res.json({ success: true, data: workflow });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /api/payroll/v2/approval/auto-escalate ──
router.post("/v2/approval/auto-escalate", async (req: Request, res: Response) => {
  try {
    const count = await ExpenseApprovalWorkflow.checkAndAutoEscalate();
    res.json({ success: true, data: { escalated: count }, message: `${count} workflow(s) auto-escalated` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export { router as enhancedPayrollRouter };
