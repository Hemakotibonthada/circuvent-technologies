// ──────────────────────────────────────────────────────────────
// HR & Payroll — Payroll Processing Service
// Full payroll lifecycle: initiation, gross/net computation,
// deductions (PF, ESI, TDS, PT), batch processing, variable
// pay, payroll hold/release, bank file generation, reconciliation,
// Form 16, dashboards, arrears, and reversion.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types & Interfaces
// ══════════════════════════════════════════════════════════════

export type PayrollStatus = "INITIATED" | "PROCESSING" | "COMPLETED" | "PAID" | "ON_HOLD" | "REVERTED";

export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: PayrollStatus;
  totalEmployees: number;
  processed: number;
  failed: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  initiatedAt: string;
  completedAt?: string;
}

export interface SalaryBreakdown {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  month: number;
  year: number;
  earnings: {
    basePay: number;
    hra: number;
    da: number;
    specialAllowance: number;
    conveyanceAllowance: number;
    medicalAllowance: number;
    bonus: number;
    overtime: number;
    variablePay: number;
  };
  deductions: {
    pfEmployee: number;
    pfEmployer: number;
    esiEmployee: number;
    esiEmployer: number;
    professionalTax: number;
    tds: number;
    loanDeduction: number;
    advanceRecovery: number;
    otherDeductions: number;
  };
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
  lopDays: number;
  payableDays: number;
}

export interface BankTransferFile {
  format: string;
  bankName: string;
  totalTransfers: number;
  totalAmount: number;
  records: Array<{
    employeeCode: string;
    employeeName: string;
    bankAccount: string;
    ifsc: string;
    amount: number;
    narration: string;
  }>;
  generatedAt: string;
  content: string; // File content string
}

export interface PayrollDashboard {
  month: number;
  year: number;
  monthName: string;
  totalEmployees: number;
  payrollStatus: PayrollStatus;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  totalPF: number;
  totalESI: number;
  totalTDS: number;
  totalPT: number;
  paidCount: number;
  pendingCount: number;
  onHoldCount: number;
  byDepartment: Array<{ department: string; headcount: number; totalNet: number; avgSalary: number }>;
  comparisonWithPrevious: {
    grossChange: number;
    netChange: number;
    headcountChange: number;
  };
}

export interface Form16Data {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  panNumber: string;
  financialYear: string;
  employer: {
    name: string;
    tan: string;
    pan: string;
  };
  partA: {
    quarterlyTDS: Array<{ quarter: string; taxDeducted: number; taxDeposited: number }>;
    totalTaxDeducted: number;
  };
  partB: {
    grossSalary: number;
    exemptions: number;
    netTaxableIncome: number;
    taxOnIncome: number;
    surcharge: number;
    educationCess: number;
    totalTaxPayable: number;
    reliefU89: number;
    netTaxPayable: number;
    totalTaxDeducted: number;
    refundDue: number;
  };
}

export interface PayrollReconciliation {
  month: number;
  year: number;
  totalSlips: number;
  totalPaid: number;
  totalPending: number;
  mismatches: Array<{
    employeeCode: string;
    employeeName: string;
    slipAmount: number;
    bankAmount: number;
    difference: number;
  }>;
  balanced: boolean;
}

// ══════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════

const PF_RATE_EMPLOYEE = 0.12;
const PF_RATE_EMPLOYER = 0.12;
const PF_CEILING = 15000; // Monthly basic ceiling for PF
const ESI_RATE_EMPLOYEE = 0.0075;
const ESI_RATE_EMPLOYER = 0.0325;
const ESI_CEILING = 21000; // Monthly gross ceiling for ESI

const PROFESSIONAL_TAX_SLABS: Record<string, number[][]> = {
  Karnataka: [[0, 15000, 0], [15001, 999999999, 200]],
  Maharashtra: [[0, 7500, 0], [7501, 10000, 175], [10001, 999999999, 200]],
  DEFAULT: [[0, 999999999, 200]],
};

// ══════════════════════════════════════════════════════════════
// Payroll Processing Service
// ══════════════════════════════════════════════════════════════

export class PayrollProcessingService {
  /**
   * Initiate a payroll run for a given month/year.
   */
  static async initiatePayroll(
    month: number,
    year: number
  ): Promise<PayrollRun> {
    if (month < 1 || month > 12) throw new Error("Invalid month");
    if (year < 2020 || year > 2030) throw new Error("Invalid year");

    // Check for existing payroll run
    const existing = await prisma.generatedDocument.findFirst({
      where: {
        entityType: "PayrollRun",
        category: "PAYROLL_RUN",
        data: { path: ["month"], equals: month },
      },
    });

    if (existing) {
      const data = existing.data as any;
      if (data.year === year && data.status !== "REVERTED") {
        throw new Error(`Payroll run already exists for ${month}/${year} with status: ${data.status}`);
      }
    }

    const totalEmployees = await prisma.employee.count({
      where: { dateOfLeaving: null },
    });

    const payrollRun: Omit<PayrollRun, "id"> = {
      month,
      year,
      status: "INITIATED",
      totalEmployees,
      processed: 0,
      failed: 0,
      totalGross: 0,
      totalDeductions: 0,
      totalNet: 0,
      initiatedAt: new Date().toISOString(),
    };

    const doc = await prisma.generatedDocument.create({
      data: {
        name: `Payroll Run — ${month}/${year}`,
        category: "PAYROLL_RUN",
        entityType: "PayrollRun",
        entityId: `payroll-${month}-${year}`,
        generatedBy: "SYSTEM",
        format: "JSON",
        data: payrollRun as any,
      },
    });

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "PayrollRun",
      entityId: doc.id,
      newValue: { month, year, totalEmployees },
    });

    return { ...payrollRun, id: doc.id };
  }

  /**
   * Calculate gross salary for an employee.
   */
  static async calculateGrossSalary(
    employeeId: string,
    month: number
  ): Promise<{
    basePay: number;
    hra: number;
    da: number;
    specialAllowance: number;
    conveyanceAllowance: number;
    medicalAllowance: number;
    grossSalary: number;
  }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) throw new Error("Employee not found");

    const annualCTC = Number(employee.baseSalary);
    const monthlyGross = annualCTC / 12;

    // Standard salary structure breakdown
    const basePay = Math.round(monthlyGross * 0.40 * 100) / 100;
    const hra = Math.round(basePay * 0.50 * 100) / 100; // 50% of basic for metro
    const da = Math.round(basePay * 0.10 * 100) / 100;
    const conveyanceAllowance = 1600;
    const medicalAllowance = 1250;
    const specialAllowance = Math.round(
      (monthlyGross - basePay - hra - da - conveyanceAllowance - medicalAllowance) * 100
    ) / 100;

    const grossSalary = basePay + hra + da + specialAllowance + conveyanceAllowance + medicalAllowance;

    return { basePay, hra, da, specialAllowance, conveyanceAllowance, medicalAllowance, grossSalary: Math.round(grossSalary * 100) / 100 };
  }

  /**
   * Calculate all deductions: PF, ESI, TDS, Professional Tax, loan deductions.
   */
  static async calculateDeductions(
    employeeId: string,
    month: number
  ): Promise<SalaryBreakdown["deductions"]> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) throw new Error("Employee not found");

    const gross = await this.calculateGrossSalary(employeeId, month);

    // PF calculation (12% of basic, capped at ₹15,000 basic)
    const pfBasic = Math.min(gross.basePay, PF_CEILING);
    const pfEmployee = Math.round(pfBasic * PF_RATE_EMPLOYEE * 100) / 100;
    const pfEmployer = Math.round(pfBasic * PF_RATE_EMPLOYER * 100) / 100;

    // ESI calculation (0.75% of gross, applicable if gross <= ₹21,000)
    const esiEmployee = gross.grossSalary <= ESI_CEILING
      ? Math.round(gross.grossSalary * ESI_RATE_EMPLOYEE * 100) / 100
      : 0;
    const esiEmployer = gross.grossSalary <= ESI_CEILING
      ? Math.round(gross.grossSalary * ESI_RATE_EMPLOYER * 100) / 100
      : 0;

    // Professional Tax
    const professionalTax = this.calculateProfessionalTax(gross.grossSalary, "Karnataka");

    // TDS — simplified monthly calculation
    const annualIncome = gross.grossSalary * 12;
    const taxableIncome = annualIncome - (pfEmployee * 12) - 50000; // Standard deduction ₹50,000
    const annualTax = this.computeIncomeTax(Math.max(0, taxableIncome));
    const tds = Math.round((annualTax / 12) * 100) / 100;

    // Loan / advance deduction
    const advances = await prisma.salaryAdvance.findMany({
      where: { employeeId, status: "DISBURSED" },
    });
    const advanceRecovery = advances.reduce((sum, adv) => {
      const monthlyInstallment = Number(adv.amount) / (adv.repaymentMonths || 3);
      return sum + Math.round(monthlyInstallment * 100) / 100;
    }, 0);

    return {
      pfEmployee,
      pfEmployer,
      esiEmployee,
      esiEmployer,
      professionalTax,
      tds,
      loanDeduction: 0,
      advanceRecovery,
      otherDeductions: 0,
    };
  }

  /**
   * Calculate net salary: gross - deductions.
   */
  static async calculateNetSalary(
    employeeId: string,
    month: number
  ): Promise<{ grossSalary: number; totalDeductions: number; netSalary: number }> {
    const gross = await this.calculateGrossSalary(employeeId, month);
    const deductions = await this.calculateDeductions(employeeId, month);

    const totalDeductions =
      deductions.pfEmployee +
      deductions.esiEmployee +
      deductions.professionalTax +
      deductions.tds +
      deductions.loanDeduction +
      deductions.advanceRecovery +
      deductions.otherDeductions;

    const netSalary = Math.round((gross.grossSalary - totalDeductions) * 100) / 100;

    return {
      grossSalary: gross.grossSalary,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      netSalary,
    };
  }

  /**
   * Process full payroll for a single employee — creates salary slip.
   */
  static async processPayrollForEmployee(
    employeeId: string,
    month: number,
    year: number
  ): Promise<SalaryBreakdown> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");

    // Check for existing slip
    const existing = await prisma.salarySlip.findUnique({
      where: { employeeId_month_year: { employeeId, month, year } },
    });

    if (existing) throw new Error("Salary slip already exists for this period");

    // Check if payroll is on hold
    const holdDoc = await prisma.generatedDocument.findFirst({
      where: {
        entityType: "PayrollHold",
        entityId: employeeId,
        category: "PAYROLL_HOLD",
        data: { path: ["month"], equals: month },
      },
    });
    if (holdDoc) {
      const holdData = holdDoc.data as any;
      if (holdData.year === year && holdData.released !== true) {
        throw new Error("Payroll is on hold for this employee");
      }
    }

    const gross = await this.calculateGrossSalary(employeeId, month);
    const deductions = await this.calculateDeductions(employeeId, month);

    const totalDeductions =
      deductions.pfEmployee +
      deductions.esiEmployee +
      deductions.professionalTax +
      deductions.tds +
      deductions.loanDeduction +
      deductions.advanceRecovery +
      deductions.otherDeductions;

    const netSalary = Math.round((gross.grossSalary - totalDeductions) * 100) / 100;

    // Create salary slip
    await prisma.salarySlip.create({
      data: {
        employeeId,
        month,
        year,
        basePay: gross.basePay,
        hra: gross.hra,
        da: gross.da,
        specialAllowance: gross.specialAllowance,
        bonus: 0,
        grossSalary: gross.grossSalary,
        pfDeduction: deductions.pfEmployee,
        esiDeduction: deductions.esiEmployee,
        professionalTax: deductions.professionalTax,
        tds: deductions.tds,
        otherDeductions: deductions.advanceRecovery + deductions.loanDeduction,
        totalDeductions,
        netSalary,
        currency: employee.currency,
      },
    });

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "SalarySlip",
      entityId: employeeId,
      newValue: { month, year, grossSalary: gross.grossSalary, netSalary },
    });

    return {
      employeeId,
      employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
      employeeCode: employee.employeeCode,
      month,
      year,
      earnings: {
        basePay: gross.basePay,
        hra: gross.hra,
        da: gross.da,
        specialAllowance: gross.specialAllowance,
        conveyanceAllowance: gross.conveyanceAllowance,
        medicalAllowance: gross.medicalAllowance,
        bonus: 0,
        overtime: 0,
        variablePay: 0,
      },
      deductions,
      grossSalary: gross.grossSalary,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      netSalary,
      lopDays: 0,
      payableDays: new Date(year, month, 0).getDate(),
    };
  }

  /**
   * Process batch payroll for all active employees.
   */
  static async processBatchPayroll(
    month: number,
    year: number
  ): Promise<{ processed: number; skipped: number; failed: number; errors: Array<{ employeeId: string; error: string }> }> {
    const employees = await prisma.employee.findMany({
      where: { dateOfLeaving: null },
      select: { id: true },
    });

    const results = { processed: 0, skipped: 0, failed: 0, errors: [] as Array<{ employeeId: string; error: string }> };

    for (const emp of employees) {
      try {
        await this.processPayrollForEmployee(emp.id, month, year);
        results.processed++;
      } catch (error: any) {
        if (error.message.includes("already exists")) {
          results.skipped++;
        } else if (error.message.includes("on hold")) {
          results.skipped++;
        } else {
          results.failed++;
          results.errors.push({ employeeId: emp.id, error: error.message });
        }
      }
    }

    // Update payroll run document
    const runDoc = await prisma.generatedDocument.findFirst({
      where: {
        entityType: "PayrollRun",
        category: "PAYROLL_RUN",
        data: { path: ["month"], equals: month },
      },
    });

    if (runDoc) {
      const runData = runDoc.data as any;
      if (runData.year === year) {
        // Compute totals
        const slips = await prisma.salarySlip.findMany({
          where: { month, year },
        });

        const totalGross = slips.reduce((sum, s) => sum + Number(s.grossSalary), 0);
        const totalDeductions = slips.reduce((sum, s) => sum + Number(s.totalDeductions), 0);
        const totalNet = slips.reduce((sum, s) => sum + Number(s.netSalary), 0);

        await prisma.generatedDocument.update({
          where: { id: runDoc.id },
          data: {
            data: {
              ...runData,
              status: "COMPLETED",
              processed: results.processed,
              failed: results.failed,
              totalGross,
              totalDeductions,
              totalNet,
              completedAt: new Date().toISOString(),
            },
          },
        });
      }
    }

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "PayrollRun",
      metadata: { month, year, ...results },
    });

    return results;
  }

  /**
   * Process supplementary payroll for specific employees (corrections).
   */
  static async processSupplementaryPayroll(
    employeeIds: string[],
    month: number,
    year: number
  ): Promise<{ processed: number; errors: Array<{ employeeId: string; error: string }> }> {
    const results = { processed: 0, errors: [] as Array<{ employeeId: string; error: string }> };

    for (const empId of employeeIds) {
      try {
        // Delete existing slip for reprocessing
        await prisma.salarySlip.deleteMany({
          where: { employeeId: empId, month, year },
        });

        await this.processPayrollForEmployee(empId, month, year);
        results.processed++;
      } catch (error: any) {
        results.errors.push({ employeeId: empId, error: error.message });
      }
    }

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "SalarySlip",
      metadata: { month, year, employeeIds, processed: results.processed },
    });

    return results;
  }

  /**
   * Apply variable pay (bonus, incentive, commission) to an employee.
   */
  static async applyVariablePay(
    employeeId: string,
    amount: number,
    type: "BONUS" | "INCENTIVE" | "COMMISSION"
  ): Promise<{ success: boolean; appliedAmount: number }> {
    if (amount <= 0) throw new Error("Variable pay amount must be positive");

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employeeCode: true, userId: true },
    });

    if (!employee) throw new Error("Employee not found");

    await prisma.generatedDocument.create({
      data: {
        name: `Variable Pay — ${employee.employeeCode} — ${type}`,
        category: "VARIABLE_PAY",
        entityType: "VariablePay",
        entityId: employeeId,
        generatedBy: "SYSTEM",
        format: "JSON",
        data: {
          employeeId,
          amount,
          type,
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
          appliedAt: new Date().toISOString(),
        } as any,
      },
    });

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "VariablePay",
      entityId: employeeId,
      newValue: { amount, type },
    });

    return { success: true, appliedAmount: amount };
  }

  /**
   * Put payroll on hold for an employee.
   */
  static async holdPayroll(
    employeeId: string,
    month: number,
    reason: string
  ): Promise<{ success: boolean }> {
    if (!reason) throw new Error("Hold reason is required");

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employeeCode: true },
    });

    if (!employee) throw new Error("Employee not found");

    await prisma.generatedDocument.create({
      data: {
        name: `Payroll Hold — ${employee.employeeCode}`,
        category: "PAYROLL_HOLD",
        entityType: "PayrollHold",
        entityId: employeeId,
        generatedBy: "SYSTEM",
        format: "JSON",
        data: {
          employeeId,
          month,
          year: new Date().getFullYear(),
          reason: reason.trim(),
          released: false,
          heldAt: new Date().toISOString(),
        } as any,
      },
    });

    await createAuditLog({
      userId: "SYSTEM",
      action: "UPDATE",
      entity: "SalarySlip",
      entityId: employeeId,
      newValue: { month, reason },
    });

    return { success: true };
  }

  /**
   * Release a previously held payroll.
   */
  static async releasePayroll(
    employeeId: string,
    month: number
  ): Promise<{ success: boolean }> {
    const holdDoc = await prisma.generatedDocument.findFirst({
      where: {
        entityType: "PayrollHold",
        entityId: employeeId,
        category: "PAYROLL_HOLD",
        data: { path: ["month"], equals: month },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!holdDoc) throw new Error("No payroll hold found for this employee");

    const data = holdDoc.data as any;
    await prisma.generatedDocument.update({
      where: { id: holdDoc.id },
      data: {
        data: { ...data, released: true, releasedAt: new Date().toISOString() },
      },
    });

    await createAuditLog({
      userId: "SYSTEM",
      action: "UPDATE",
      entity: "SalarySlip",
      entityId: employeeId,
      newValue: { month },
    });

    return { success: true };
  }

  /**
   * Generate a bank transfer file (NEFT/RTGS/IMPS format).
   */
  static async generateBankFile(
    month: number,
    year: number,
    format: "NEFT" | "RTGS" | "IMPS" = "NEFT"
  ): Promise<BankTransferFile> {
    const slips = await prisma.salarySlip.findMany({
      where: { month, year, isPaid: false },
      include: {
        employee: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    if (slips.length === 0) throw new Error("No unpaid salary slips found for this period");

    const records = slips
      .filter((s) => s.employee.bankAccountNo && s.employee.bankIFSC)
      .map((s) => ({
        employeeCode: s.employee.employeeCode,
        employeeName: `${s.employee.user.firstName} ${s.employee.user.lastName}`,
        bankAccount: s.employee.bankAccountNo!,
        ifsc: s.employee.bankIFSC!,
        amount: Number(s.netSalary),
        narration: `SAL-${month.toString().padStart(2, "0")}-${year}-${s.employee.employeeCode}`,
      }));

    const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);

    // Generate file content based on format
    let content = "";
    if (format === "NEFT") {
      const header = `H,CIRCUVENT_TECH,${new Date().toISOString().split("T")[0]},${records.length},${totalAmount.toFixed(2)}`;
      const rows = records.map(
        (r, i) => `D,${i + 1},${r.bankAccount},${r.ifsc},${r.employeeName},${r.amount.toFixed(2)},${r.narration}`
      );
      content = [header, ...rows].join("\n");
    } else {
      content = JSON.stringify({ format, records, totalAmount, date: new Date().toISOString() }, null, 2);
    }

    // Store generated file
    await prisma.generatedDocument.create({
      data: {
        name: `Bank File ${format} — ${month}/${year}`,
        category: "BANK_TRANSFER_FILE",
        entityType: "BankFile",
        entityId: `bank-${format}-${month}-${year}`,
        generatedBy: "SYSTEM",
        format: "TEXT",
        content,
        data: { format, month, year, totalTransfers: records.length, totalAmount } as any,
      },
    });

    return {
      format,
      bankName: "ICICI Bank",
      totalTransfers: records.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      records,
      generatedAt: new Date().toISOString(),
      content,
    };
  }

  /**
   * Reconcile payroll — verify all payslips match expected bank transfers.
   */
  static async reconcilePayroll(
    month: number,
    year: number
  ): Promise<PayrollReconciliation> {
    const slips = await prisma.salarySlip.findMany({
      where: { month, year },
      include: {
        employee: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    const totalSlips = slips.length;
    const totalPaid = slips.filter((s) => s.isPaid).length;
    const totalPending = totalSlips - totalPaid;

    // Check for amount mismatches (simulated — would connect to real bank data)
    const mismatches = slips
      .filter((s) => {
        // Simulated: flag any slip where deductions seem off
        const expectedNet = Number(s.grossSalary) - Number(s.totalDeductions);
        return Math.abs(expectedNet - Number(s.netSalary)) > 1;
      })
      .map((s) => ({
        employeeCode: s.employee.employeeCode,
        employeeName: `${s.employee.user.firstName} ${s.employee.user.lastName}`,
        slipAmount: Number(s.netSalary),
        bankAmount: Number(s.grossSalary) - Number(s.totalDeductions),
        difference: Math.abs(Number(s.netSalary) - (Number(s.grossSalary) - Number(s.totalDeductions))),
      }));

    return {
      month,
      year,
      totalSlips,
      totalPaid,
      totalPending,
      mismatches,
      balanced: mismatches.length === 0,
    };
  }

  /**
   * Generate payroll report — department-wise summary.
   */
  static async generatePayrollReport(
    month: number,
    year: number
  ): Promise<string> {
    const slips = await prisma.salarySlip.findMany({
      where: { month, year },
      include: {
        employee: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    const deptMap = new Map<string, { headcount: number; totalGross: number; totalNet: number; totalDeductions: number }>();

    for (const slip of slips) {
      const dept = slip.employee.department;
      const entry = deptMap.get(dept) || { headcount: 0, totalGross: 0, totalNet: 0, totalDeductions: 0 };
      entry.headcount++;
      entry.totalGross += Number(slip.grossSalary);
      entry.totalNet += Number(slip.netSalary);
      entry.totalDeductions += Number(slip.totalDeductions);
      deptMap.set(dept, entry);
    }

    const totalGross = slips.reduce((sum, s) => sum + Number(s.grossSalary), 0);
    const totalNet = slips.reduce((sum, s) => sum + Number(s.netSalary), 0);
    const totalDeductions = slips.reduce((sum, s) => sum + Number(s.totalDeductions), 0);
    const monthName = new Date(year, month - 1).toLocaleString("en", { month: "long" });

    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Payroll Report — ${monthName} ${year}</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; max-width: 900px; margin: 40px auto; }
        h1 { color: #1e3a5f; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .summary-card { background: #f5f7fa; padding: 15px 20px; border-radius: 8px; flex: 1; text-align: center; }
        .summary-value { font-size: 1.4em; font-weight: bold; color: #1e3a5f; }
        .summary-label { font-size: 0.85em; color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 10px 12px; text-align: right; border-bottom: 1px solid #e0e0e0; }
        th { background: #f5f7fa; text-align: left; }
        td:first-child { text-align: left; }
        .total-row { font-weight: bold; background: #eef3f8; }
      </style></head>
      <body>
        <h1>Payroll Report — ${monthName} ${year}</h1>

        <div class="summary">
          <div class="summary-card"><div class="summary-value">${slips.length}</div><div class="summary-label">Employees</div></div>
          <div class="summary-card"><div class="summary-value">₹${totalGross.toLocaleString("en-IN")}</div><div class="summary-label">Total Gross</div></div>
          <div class="summary-card"><div class="summary-value">₹${totalDeductions.toLocaleString("en-IN")}</div><div class="summary-label">Total Deductions</div></div>
          <div class="summary-card"><div class="summary-value">₹${totalNet.toLocaleString("en-IN")}</div><div class="summary-label">Total Net Pay</div></div>
        </div>

        <h2>Department Breakdown</h2>
        <table>
          <tr><th>Department</th><th>Headcount</th><th>Total Gross</th><th>Total Deductions</th><th>Total Net</th><th>Avg Salary</th></tr>
          ${Array.from(deptMap.entries()).map(([dept, d]) => `
            <tr>
              <td>${dept}</td><td>${d.headcount}</td>
              <td>₹${d.totalGross.toLocaleString("en-IN")}</td>
              <td>₹${d.totalDeductions.toLocaleString("en-IN")}</td>
              <td>₹${d.totalNet.toLocaleString("en-IN")}</td>
              <td>₹${Math.round(d.totalNet / d.headcount).toLocaleString("en-IN")}</td>
            </tr>
          `).join("")}
          <tr class="total-row">
            <td>Total</td><td>${slips.length}</td>
            <td>₹${totalGross.toLocaleString("en-IN")}</td>
            <td>₹${totalDeductions.toLocaleString("en-IN")}</td>
            <td>₹${totalNet.toLocaleString("en-IN")}</td>
            <td>₹${Math.round(totalNet / Math.max(1, slips.length)).toLocaleString("en-IN")}</td>
          </tr>
        </table>
      </body>
      </html>
    `;

    return html;
  }

  /**
   * Calculate Year-To-Date tax for an employee.
   */
  static async calculateYTDTax(employeeId: string): Promise<{
    financialYear: string;
    monthsProcessed: number;
    ytdGross: number;
    ytdPF: number;
    ytdESI: number;
    ytdPT: number;
    ytdTDS: number;
    ytdDeductions: number;
    projectedAnnualTax: number;
  }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) throw new Error("Employee not found");

    const now = new Date();
    const fyStart = now.getMonth() >= 3
      ? new Date(now.getFullYear(), 3, 1)
      : new Date(now.getFullYear() - 1, 3, 1);
    const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const financialYear = `FY${fy}-${String(fy + 1).slice(-2)}`;

    const slips = await prisma.salarySlip.findMany({
      where: {
        employeeId,
        year: { gte: fyStart.getFullYear() },
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });

    // Filter to current FY
    const fySlips = slips.filter((s) => {
      const slipDate = new Date(s.year, s.month - 1);
      return slipDate >= fyStart;
    });

    const ytdGross = fySlips.reduce((sum, s) => sum + Number(s.grossSalary), 0);
    const ytdPF = fySlips.reduce((sum, s) => sum + Number(s.pfDeduction), 0);
    const ytdESI = fySlips.reduce((sum, s) => sum + Number(s.esiDeduction), 0);
    const ytdPT = fySlips.reduce((sum, s) => sum + Number(s.professionalTax), 0);
    const ytdTDS = fySlips.reduce((sum, s) => sum + Number(s.tds), 0);
    const ytdDeductions = fySlips.reduce((sum, s) => sum + Number(s.totalDeductions), 0);

    const monthsProcessed = fySlips.length;
    const remainingMonths = Math.max(0, 12 - monthsProcessed);
    const monthlyAvgTDS = monthsProcessed > 0 ? ytdTDS / monthsProcessed : 0;
    const projectedAnnualTax = Math.round((ytdTDS + monthlyAvgTDS * remainingMonths) * 100) / 100;

    return {
      financialYear,
      monthsProcessed,
      ytdGross: Math.round(ytdGross * 100) / 100,
      ytdPF: Math.round(ytdPF * 100) / 100,
      ytdESI: Math.round(ytdESI * 100) / 100,
      ytdPT: Math.round(ytdPT * 100) / 100,
      ytdTDS: Math.round(ytdTDS * 100) / 100,
      ytdDeductions: Math.round(ytdDeductions * 100) / 100,
      projectedAnnualTax,
    };
  }

  /**
   * Generate Form 16 data for an employee.
   */
  static async generateForm16(
    employeeId: string,
    financialYear: string
  ): Promise<Form16Data> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");

    // Parse FY: "FY2025-26" => start April 2025, end March 2026
    const fyMatch = financialYear.match(/FY(\d{4})-(\d{2})/);
    if (!fyMatch) throw new Error("Invalid financial year format (expected: FY2025-26)");

    const fyStartYear = parseInt(fyMatch[1]);
    const months: Array<{ month: number; year: number }> = [];
    for (let m = 4; m <= 12; m++) months.push({ month: m, year: fyStartYear });
    for (let m = 1; m <= 3; m++) months.push({ month: m, year: fyStartYear + 1 });

    const slips = await prisma.salarySlip.findMany({
      where: {
        employeeId,
        OR: months.map((m) => ({ month: m.month, year: m.year })),
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });

    const grossSalary = slips.reduce((sum, s) => sum + Number(s.grossSalary), 0);
    const totalTDS = slips.reduce((sum, s) => sum + Number(s.tds), 0);
    const totalPF = slips.reduce((sum, s) => sum + Number(s.pfDeduction), 0);

    // Quarterly TDS breakdown
    const quarterlyTDS = [
      { quarter: "Q1 (Apr-Jun)", months: [4, 5, 6] },
      { quarter: "Q2 (Jul-Sep)", months: [7, 8, 9] },
      { quarter: "Q3 (Oct-Dec)", months: [10, 11, 12] },
      { quarter: "Q4 (Jan-Mar)", months: [1, 2, 3] },
    ].map((q) => {
      const qSlips = slips.filter((s) => q.months.includes(s.month));
      const taxDeducted = qSlips.reduce((sum, s) => sum + Number(s.tds), 0);
      return { quarter: q.quarter, taxDeducted, taxDeposited: taxDeducted };
    });

    // Standard deduction
    const standardDeduction = 50000;
    const taxableIncome = Math.max(0, grossSalary - totalPF - standardDeduction);
    const taxOnIncome = this.computeIncomeTax(taxableIncome);
    const educationCess = Math.round(taxOnIncome * 0.04 * 100) / 100;
    const totalTaxPayable = Math.round((taxOnIncome + educationCess) * 100) / 100;
    const refundDue = Math.max(0, Math.round((totalTDS - totalTaxPayable) * 100) / 100);

    return {
      employeeId,
      employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
      employeeCode: employee.employeeCode,
      panNumber: employee.panNumber || "N/A",
      financialYear,
      employer: {
        name: "Circuvent Technologies Pvt. Ltd.",
        tan: "BLRC00001A",
        pan: "AABCC1234D",
      },
      partA: {
        quarterlyTDS,
        totalTaxDeducted: Math.round(totalTDS * 100) / 100,
      },
      partB: {
        grossSalary: Math.round(grossSalary * 100) / 100,
        exemptions: 0,
        netTaxableIncome: Math.round(taxableIncome * 100) / 100,
        taxOnIncome: Math.round(taxOnIncome * 100) / 100,
        surcharge: 0,
        educationCess,
        totalTaxPayable,
        reliefU89: 0,
        netTaxPayable: totalTaxPayable,
        totalTaxDeducted: Math.round(totalTDS * 100) / 100,
        refundDue,
      },
    };
  }

  /**
   * Get payroll dashboard for a given month/year.
   */
  static async getPayrollDashboard(
    month: number,
    year: number
  ): Promise<PayrollDashboard> {
    const monthName = new Date(year, month - 1).toLocaleString("en", { month: "long" });

    const slips = await prisma.salarySlip.findMany({
      where: { month, year },
      include: { employee: { select: { department: true } } },
    });

    const totalGross = slips.reduce((sum, s) => sum + Number(s.grossSalary), 0);
    const totalDeductions = slips.reduce((sum, s) => sum + Number(s.totalDeductions), 0);
    const totalNet = slips.reduce((sum, s) => sum + Number(s.netSalary), 0);
    const totalPF = slips.reduce((sum, s) => sum + Number(s.pfDeduction), 0);
    const totalESI = slips.reduce((sum, s) => sum + Number(s.esiDeduction), 0);
    const totalTDS = slips.reduce((sum, s) => sum + Number(s.tds), 0);
    const totalPT = slips.reduce((sum, s) => sum + Number(s.professionalTax), 0);

    const paidCount = slips.filter((s) => s.isPaid).length;
    const pendingCount = slips.filter((s) => !s.isPaid).length;

    // On-hold count
    const holdDocs = await prisma.generatedDocument.findMany({
      where: {
        entityType: "PayrollHold",
        category: "PAYROLL_HOLD",
        data: { path: ["month"], equals: month },
      },
    });
    const onHoldCount = holdDocs.filter((d) => {
      const data = d.data as any;
      return data.year === year && !data.released;
    }).length;

    // By department
    const deptMap = new Map<string, { headcount: number; totalNet: number }>();
    for (const slip of slips) {
      const dept = slip.employee.department;
      const entry = deptMap.get(dept) || { headcount: 0, totalNet: 0 };
      entry.headcount++;
      entry.totalNet += Number(slip.netSalary);
      deptMap.set(dept, entry);
    }
    const byDepartment = Array.from(deptMap.entries())
      .map(([department, data]) => ({
        department,
        headcount: data.headcount,
        totalNet: Math.round(data.totalNet * 100) / 100,
        avgSalary: data.headcount > 0 ? Math.round((data.totalNet / data.headcount) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.totalNet - a.totalNet);

    // Compare with previous month
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevSlips = await prisma.salarySlip.findMany({
      where: { month: prevMonth, year: prevYear },
    });
    const prevGross = prevSlips.reduce((sum, s) => sum + Number(s.grossSalary), 0);
    const prevNet = prevSlips.reduce((sum, s) => sum + Number(s.netSalary), 0);

    // Get payroll run status
    const runDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "PayrollRun", category: "PAYROLL_RUN", data: { path: ["month"], equals: month } },
    });
    const payrollStatus: PayrollStatus = (runDoc?.data as any)?.status || "INITIATED";

    return {
      month,
      year,
      monthName,
      totalEmployees: slips.length,
      payrollStatus,
      totalGross: Math.round(totalGross * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      totalNet: Math.round(totalNet * 100) / 100,
      totalPF: Math.round(totalPF * 100) / 100,
      totalESI: Math.round(totalESI * 100) / 100,
      totalTDS: Math.round(totalTDS * 100) / 100,
      totalPT: Math.round(totalPT * 100) / 100,
      paidCount,
      pendingCount,
      onHoldCount,
      byDepartment,
      comparisonWithPrevious: {
        grossChange: prevGross > 0 ? Math.round(((totalGross - prevGross) / prevGross) * 100 * 10) / 10 : 0,
        netChange: prevNet > 0 ? Math.round(((totalNet - prevNet) / prevNet) * 100 * 10) / 10 : 0,
        headcountChange: slips.length - prevSlips.length,
      },
    };
  }

  /**
   * Revert a payslip.
   */
  static async revertPayroll(
    employeeId: string,
    month: number,
    reason: string
  ): Promise<{ success: boolean }> {
    if (!reason) throw new Error("Revert reason is required");

    const year = new Date().getFullYear();
    const slip = await prisma.salarySlip.findUnique({
      where: { employeeId_month_year: { employeeId, month, year } },
    });

    if (!slip) throw new Error("Salary slip not found for this period");

    await prisma.salarySlip.delete({
      where: { id: slip.id },
    });

    await createAuditLog({
      userId: "SYSTEM",
      action: "DELETE",
      entity: "SalarySlip",
      entityId: slip.id,
      newValue: { month, year, reason, netSalary: Number(slip.netSalary) },
    });

    return { success: true };
  }

  /**
   * Calculate arrears when salary is revised retroactively.
   */
  static async calculateArrears(
    employeeId: string,
    fromMonth: number,
    toMonth: number,
    newSalary: number
  ): Promise<{
    months: number;
    arrearPerMonth: number;
    totalArrears: number;
    details: Array<{ month: number; oldNet: number; newNet: number; difference: number }>;
  }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) throw new Error("Employee not found");

    const year = new Date().getFullYear();
    const oldAnnualSalary = Number(employee.baseSalary);
    const oldMonthlySalary = oldAnnualSalary / 12;
    const newMonthlySalary = newSalary / 12;
    const arrearPerMonth = Math.round((newMonthlySalary - oldMonthlySalary) * 100) / 100;

    const details: Array<{ month: number; oldNet: number; newNet: number; difference: number }> = [];
    let totalArrears = 0;

    for (let m = fromMonth; m <= toMonth; m++) {
      const slip = await prisma.salarySlip.findUnique({
        where: { employeeId_month_year: { employeeId, month: m, year } },
      });

      const oldNet = slip ? Number(slip.netSalary) : oldMonthlySalary * 0.7;
      const newNet = newMonthlySalary * 0.7; // Approximate (after ~30% deductions)
      const difference = Math.round((newNet - oldNet) * 100) / 100;

      details.push({ month: m, oldNet: Math.round(oldNet * 100) / 100, newNet: Math.round(newNet * 100) / 100, difference });
      totalArrears += difference;
    }

    return {
      months: toMonth - fromMonth + 1,
      arrearPerMonth,
      totalArrears: Math.round(totalArrears * 100) / 100,
      details,
    };
  }

  // ── Private Helpers ──

  private static calculateProfessionalTax(grossSalary: number, state: string): number {
    const slabs = PROFESSIONAL_TAX_SLABS[state] || PROFESSIONAL_TAX_SLABS["DEFAULT"];
    for (const [min, max, tax] of slabs) {
      if (grossSalary >= min && grossSalary <= max) {
        return tax;
      }
    }
    return 200;
  }

  private static computeIncomeTax(taxableIncome: number): number {
    // New Regime FY2025-26 slabs
    const slabs = [
      [0, 300000, 0],
      [300001, 700000, 0.05],
      [700001, 1000000, 0.10],
      [1000001, 1200000, 0.15],
      [1200001, 1500000, 0.20],
      [1500001, Infinity, 0.30],
    ];

    let tax = 0;
    let remaining = taxableIncome;

    for (const [min, max, rate] of slabs) {
      if (remaining <= 0) break;
      const slabWidth = (max as number) - (min as number) + 1;
      const taxable = Math.min(remaining, slabWidth);
      tax += taxable * (rate as number);
      remaining -= taxable;
    }

    // Rebate u/s 87A — if taxable income <= ₹7L, no tax
    if (taxableIncome <= 700000) {
      tax = 0;
    }

    return Math.round(tax * 100) / 100;
  }
}
