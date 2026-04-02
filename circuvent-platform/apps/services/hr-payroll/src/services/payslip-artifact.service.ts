// ──────────────────────────────────────────────────────────────
// HR & Payroll — Payslip Artifact Service
// Manages payslip document generation, directory management,
// and monthly payroll document runs. Ported from HT repo
// payslipArtifactService.
// ──────────────────────────────────────────────────────────────

import { mkdir } from "fs/promises";
import path from "path";
import {
  generatePayslip,
  type EmployeeProfile,
  type PayslipDetail,
  type TimesheetSummary,
} from "../engine/payroll-calculation.engine";

const GENERATED_DIR = path.join("generated", "payslips");

export const ensureUploadDirectory = async (basePath: string): Promise<string> => {
  const targetDir = path.resolve(basePath, GENERATED_DIR);
  await mkdir(targetDir, { recursive: true });
  return targetDir;
};

export interface PayslipEmployeeContext extends EmployeeProfile {
  fullName: string;
  email: string;
  jobTitle?: string | null;
  department?: string | null;
  location?: string | null;
  accountNumber?: string | null;
  accountHolderName?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  ifscCode?: string | null;
}

export interface PayrollTimesheetSummary extends TimesheetSummary {
  employeeId: EmployeeProfile["employeeId"];
  periodLabel: string;
}

export interface PayslipDocumentPayload {
  netPay: number;
  period: string;
  details?: PayslipDetail;
}

export const createPayslipDocument = async (
  employee: PayslipEmployeeContext,
  payslipData: PayslipDocumentPayload,
  basePath: string = process.cwd(),
): Promise<string> => {
  const absoluteDir = await ensureUploadDirectory(basePath);
  const safeEmployeeId = String(employee.employeeId).replace(/[^a-zA-Z0-9_-]/g, "");
  const timestamp = Date.now();
  const filename = `${timestamp}-${safeEmployeeId || "employee"}-payslip.pdf`;

  const absolutePath = path.join(absoluteDir, filename);

  // PDF generation placeholder — in production this renders
  // the document to `absolutePath` using the PDF engine.
  void absolutePath;

  return path.posix.join("generated", "payslips", filename);
};

const calculatePayrollPlaceholder = (
  employee: PayslipEmployeeContext,
  summary: PayrollTimesheetSummary,
): PayslipDocumentPayload => {
  const payslip = generatePayslip(employee, summary);
  return {
    netPay: payslip.netPay,
    period: summary.periodLabel,
    details: payslip,
  };
};

export const runMonthlyPayroll = async (
  employees: PayslipEmployeeContext[],
  summaries: PayrollTimesheetSummary[],
  basePath: string = process.cwd(),
): Promise<string[]> => {
  const summaryMap = new Map<EmployeeProfile["employeeId"], PayrollTimesheetSummary>();
  summaries.forEach((summary) => {
    summaryMap.set(summary.employeeId, summary);
  });

  const generatedPaths: string[] = [];

  for (const employee of employees) {
    const summary = summaryMap.get(employee.employeeId);
    if (!summary) continue;

    const payslipData = calculatePayrollPlaceholder(employee, summary);
    const relativePath = await createPayslipDocument(employee, payslipData, basePath);
    generatedPaths.push(relativePath);
  }

  return generatedPaths;
};
