// ──────────────────────────────────────────────────────────────
// HR Payroll — Statutory Compliance Routes
// REST endpoints for statutory config, compliance status,
// Form 16 data, deadline calendar, and employee statutory
// summary. Separated from payroll routes for clarity.
// ──────────────────────────────────────────────────────────────

import { Router } from "express";
import { PayrollController } from "../controllers/payroll.controller";

const router = Router();

// ── Compliance Dashboard ──
router.get("/status", PayrollController.getComplianceStatus);
router.get("/deadlines", PayrollController.getUpcomingDeadlines);

// ── Statutory Config ──
router.get("/config", PayrollController.getStatutoryConfig);
router.put("/config/:financialYear", PayrollController.updateStatutoryConfig);

// ── Employee Statutory ──
router.get("/employee/:employeeId/summary", PayrollController.getStatutorySummary);
router.get("/employee/:employeeId/form16", PayrollController.getForm16Data);
router.get("/employee/:employeeId/gratuity", PayrollController.calculateGratuity);
router.get("/employee/:employeeId/ytd", PayrollController.getEmployeeYTD);

// ── Salary Calculator ──
router.get("/salary-preview", PayrollController.salaryPreview);

export { router as statutoryRouter };
