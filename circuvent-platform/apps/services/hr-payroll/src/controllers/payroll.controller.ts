// ──────────────────────────────────────────────────────────────
// HR Payroll Controller — handles payroll generation, PDF
// download, bulk operations, salary preview, gratuity,
// YTD, and payroll dashboard with full validation.
// ──────────────────────────────────────────────────────────────

import { Request, Response } from "express";
import { EnhancedPayrollService } from "../services/enhanced-payroll.service";
import { PayslipPDFService } from "../services/payslip-pdf.service";
import { StatutoryComplianceService } from "../services/statutory.service";
import { generateSalarySchemaV2 } from "../validators/hr.validators.v2";
import { successResponse, errorResponse } from "@circuvent/shared";

export class PayrollController {
  static async generateSlip(req: Request, res: Response): Promise<void> {
    try {
      const parsed = generateSalarySchemaV2.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(errorResponse(parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ")));
        return;
      }
      const actorId = (req as any).user?.userId;
      const result = await EnhancedPayrollService.generateSlip(parsed.data, actorId);
      res.status(201).json(successResponse(result, "Salary slip generated with full statutory breakdown"));
    } catch (error: any) {
      const status = error.message.includes("not found") ? 404 : error.message.includes("already exists") ? 409 : 500;
      res.status(status).json(errorResponse(error.message));
    }
  }

  static async bulkGenerate(req: Request, res: Response): Promise<void> {
    try {
      const { month, year, state } = req.body;
      if (!month || !year) { res.status(400).json(errorResponse("month and year required")); return; }
      const actorId = (req as any).user?.userId;
      const result = await EnhancedPayrollService.bulkGenerate(month, year, state || "Karnataka", actorId);
      res.json(successResponse(result, `Generated: ${result.generated}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async salaryPreview(req: Request, res: Response): Promise<void> {
    try {
      const { annualCTC, state, section80C, section80D, section24, hraExemption } = req.query;
      if (!annualCTC) { res.status(400).json(errorResponse("annualCTC required")); return; }

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
      res.json(successResponse(preview));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getPayrollDashboard(req: Request, res: Response): Promise<void> {
    try {
      const { month, year } = req.query;
      const result = await EnhancedPayrollService.getPayrollDashboard(
        month ? Number(month) : undefined,
        year ? Number(year) : undefined,
      );
      res.json(successResponse(result));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getEmployeeYTD(req: Request, res: Response): Promise<void> {
    try {
      const ytd = await EnhancedPayrollService.getEmployeeYTD(
        req.params.employeeId,
        req.query.financialYear as string,
      );
      res.json(successResponse(ytd));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async calculateGratuity(req: Request, res: Response): Promise<void> {
    try {
      const result = await EnhancedPayrollService.calculateEmployeeGratuity(req.params.employeeId);
      res.json(successResponse(result));
    } catch (error: any) {
      res.status(error.message.includes("not found") ? 404 : 500).json(errorResponse(error.message));
    }
  }

  static async markPaid(req: Request, res: Response): Promise<void> {
    try {
      const actorId = (req as any).user?.userId;
      const slip = await EnhancedPayrollService.markPaid(req.params.slipId, actorId);
      res.json(successResponse(slip, "Marked as paid"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async bulkMarkPaid(req: Request, res: Response): Promise<void> {
    try {
      const { month, year } = req.body;
      if (!month || !year) { res.status(400).json(errorResponse("month and year required")); return; }
      const actorId = (req as any).user?.userId;
      const count = await EnhancedPayrollService.bulkMarkPaid(month, year, actorId);
      res.json(successResponse({ paidCount: count }, `${count} slips marked paid`));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  // ── PDF endpoints ──

  static async generatePDF(req: Request, res: Response): Promise<void> {
    try {
      const actorId = (req as any).user?.userId;
      const result = await PayslipPDFService.generateAndStore(req.params.slipId, actorId);
      res.status(201).json(successResponse(result, "Payslip PDF generated"));
    } catch (error: any) {
      const status = error.message.includes("not found") ? 404 : error.message.includes("already") ? 409 : 500;
      res.status(status).json(errorResponse(error.message));
    }
  }

  static async bulkGeneratePDFs(req: Request, res: Response): Promise<void> {
    try {
      const { month, year } = req.body;
      if (!month || !year) { res.status(400).json(errorResponse("month and year required")); return; }
      const actorId = (req as any).user?.userId;
      const result = await PayslipPDFService.bulkGenerate(month, year, actorId);
      res.json(successResponse(result, `PDFs: ${result.generated} generated, ${result.skipped} skipped`));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async downloadPDF(req: Request, res: Response): Promise<void> {
    try {
      const { buffer, filename, checksum } = await PayslipPDFService.download(req.params.documentId);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("X-Checksum-SHA256", checksum);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(buffer);
    } catch (error: any) {
      res.status(404).json(errorResponse(error.message));
    }
  }

  // ── Statutory endpoints ──

  static async getComplianceStatus(req: Request, res: Response): Promise<void> {
    try {
      const { month, year } = req.query;
      const result = await StatutoryComplianceService.getComplianceStatus(
        Number(month) || new Date().getMonth() + 1,
        Number(year) || new Date().getFullYear(),
      );
      res.json(successResponse(result));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getUpcomingDeadlines(_req: Request, res: Response): Promise<void> {
    try {
      const deadlines = await StatutoryComplianceService.getUpcomingDeadlines();
      res.json(successResponse(deadlines));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getForm16Data(req: Request, res: Response): Promise<void> {
    try {
      const { financialYear } = req.query;
      if (!financialYear) { res.status(400).json(errorResponse("financialYear required")); return; }
      const data = await StatutoryComplianceService.getForm16Data(
        req.params.employeeId,
        financialYear as string,
      );
      res.json(successResponse(data));
    } catch (error: any) {
      res.status(error.message.includes("not found") ? 404 : 500).json(errorResponse(error.message));
    }
  }

  static async getStatutorySummary(req: Request, res: Response): Promise<void> {
    try {
      const summary = await StatutoryComplianceService.getEmployeeStatutorySummary(req.params.employeeId);
      res.json(successResponse(summary));
    } catch (error: any) {
      res.status(error.message.includes("not found") ? 404 : 500).json(errorResponse(error.message));
    }
  }

  static async getStatutoryConfig(req: Request, res: Response): Promise<void> {
    try {
      const { financialYear } = req.query;
      const fy = (financialYear as string) || StatutoryComplianceService.getSupportedPTStates()[0];
      const config = await StatutoryComplianceService.getConfig(
        (financialYear as string) || "2025-2026"
      );
      res.json(successResponse(config));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async updateStatutoryConfig(req: Request, res: Response): Promise<void> {
    try {
      const { financialYear } = req.params;
      const actorId = (req as any).user?.userId;
      const config = await StatutoryComplianceService.updateConfig(financialYear, req.body, actorId);
      res.json(successResponse(config, "Statutory config updated"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }
}
