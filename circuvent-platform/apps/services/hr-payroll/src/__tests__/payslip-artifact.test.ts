// ──────────────────────────────────────────────────────────────
// Payslip Artifact Service — Unit Tests
// Tests directory creation, filename generation, and monthly
// payroll document runs. Ported from HT repo.
// ──────────────────────────────────────────────────────────────

import path from "path";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  mkdir: vi.fn<[string, { recursive?: boolean }?], Promise<void>>(),
}));

vi.mock("fs/promises", () => ({
  mkdir: mocks.mkdir,
}));

import {
  ensureUploadDirectory,
  createPayslipDocument,
  runMonthlyPayroll,
  type PayslipEmployeeContext,
  type PayrollTimesheetSummary,
} from "../services/payslip-artifact.service";

describe("payslipArtifactService", () => {
  const basePath = path.join(process.cwd(), "tmp-output");

  beforeEach(() => {
    mocks.mkdir.mockClear();
    mocks.mkdir.mockResolvedValue(undefined);
  });

  it("ensures upload directory is created recursively", async () => {
    const expectedDir = path.resolve(basePath, "generated", "payslips");
    const result = await ensureUploadDirectory(basePath);

    expect(mocks.mkdir).toHaveBeenCalledTimes(1);
    expect(mocks.mkdir).toHaveBeenCalledWith(expectedDir, { recursive: true });
    expect(result).toBe(expectedDir);
  });

  it("creates a deterministic payslip filename and returns relative path", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    const employee: PayslipEmployeeContext = {
      employeeId: "EMP-001",
      annualCTC: 600_000,
      mandatoryDeductions: {
        uan: "111122223333",
        pan: "ABCDE1234F",
        taxRegime: "old",
      },
      fullName: "Jamie Payroll",
      email: "jamie@example.com",
    };

    const relativePath = await createPayslipDocument(
      employee,
      { netPay: 42_000, period: "April 2024" },
      basePath,
    );

    expect(relativePath).toBe("generated/payslips/1700000000000-EMP-001-payslip.pdf");
    nowSpy.mockRestore();
  });

  it("runs payroll for employees and returns generated paths", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_100_000);

    const employees: PayslipEmployeeContext[] = [
      {
        employeeId: "EMP-002",
        annualCTC: 720_000,
        mandatoryDeductions: {
          uan: "999988887777",
          pan: "PQRSX1234Z",
          taxRegime: "new",
        },
        fullName: "Alex Payroll",
        email: "alex@example.com",
      },
    ];

    const summaries: PayrollTimesheetSummary[] = [
      {
        employeeId: "EMP-002",
        periodLabel: "May 2024",
        totalWorkDays: 20,
        totalPaidLeaveDays: 4,
        totalLOPDays: 2,
        totalDaysInMonth: 31,
      },
    ];

    const results = await runMonthlyPayroll(employees, summaries, basePath);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatch(/generated\/payslips\/1700000100000-EMP-002-payslip\.pdf$/);

    nowSpy.mockRestore();
  });

  it("skips employees without matching timesheet summaries", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_200_000);

    const employees: PayslipEmployeeContext[] = [
      {
        employeeId: "EMP-003",
        annualCTC: 480_000,
        mandatoryDeductions: { uan: "111100002222", pan: "ABCDE5678F", taxRegime: "unspecified" },
        fullName: "Sam NoTimesheet",
        email: "sam@example.com",
      },
    ];

    const summaries: PayrollTimesheetSummary[] = []; // No matching summaries

    const results = await runMonthlyPayroll(employees, summaries, basePath);

    expect(results).toHaveLength(0);
    nowSpy.mockRestore();
  });
});
