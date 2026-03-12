// ──────────────────────────────────────────────────────────────
// HR & Payroll — Enhanced Payroll Service (Phase 2)
// Integrates statutory engine calculators, payslip PDF
// generation, and multi-level expense approval workflows.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";
import { buildSalaryStructure, FullSalaryResult } from "../engine/salary-structure.builder";
import { compareRegimes } from "../engine/tds.calculator";
import { calculateGratuity, GratuityResult } from "../engine/gratuity.calculator";
import { getSupportedStates } from "../engine/professional-tax.calculator";

const prisma = new PrismaClient();

export interface PayrollGenerationInput {
  employeeId: string;
  month: number;
  year: number;
  lopDays?: number;
  totalWorkingDays?: number;
  bonus?: number;
  state?: string;
  regime?: "OLD" | "NEW";
}

export class EnhancedPayrollService {
  /**
   * Generates a salary slip using the full statutory engine.
   */
  static async generateSlip(input: PayrollGenerationInput, actorId: string): Promise<any> {
    // Check for existing slip
    const existing = await prisma.salarySlip.findUnique({
      where: {
        employeeId_month_year: {
          employeeId: input.employeeId,
          month: input.month,
          year: input.year,
        },
      },
    });
    if (existing) throw new Error("Salary slip already exists for this period");

    // Fetch employee details
    const employee = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        taxDeclarations: {
          where: { financialYear: this.getCurrentFY() },
          take: 1,
        },
      },
    });
    if (!employee) throw new Error("Employee not found");

    // Get tax declaration deductions if available
    const taxDecl = employee.taxDeclarations[0];

    // Build full salary structure using statutory engine
    const salary = buildSalaryStructure({
      annualCTC: Number(employee.baseSalary),
      regime: (input.regime || taxDecl?.regime || "NEW") as "OLD" | "NEW",
      state: input.state || "Karnataka",
      month: input.month,
      lopDays: input.lopDays,
      totalWorkingDays: input.totalWorkingDays,
      bonus: input.bonus,
      section80C: taxDecl ? Number(taxDecl.section80C) : undefined,
      section80D: taxDecl ? Number(taxDecl.section80D) : undefined,
      section24: taxDecl ? Number(taxDecl.section24) : undefined,
      hraExemption: taxDecl ? Number(taxDecl.hra_exemption) : undefined,
    });

    // Create salary slip record
    const slip = await prisma.salarySlip.create({
      data: {
        employeeId: input.employeeId,
        month: input.month,
        year: input.year,
        basePay: salary.monthly.basePay,
        hra: salary.monthly.hra,
        da: salary.monthly.da,
        specialAllowance: salary.monthly.specialAllowance,
        bonus: salary.monthly.bonus,
        grossSalary: salary.monthly.adjustedGross,
        pfDeduction: salary.deductions.epfEmployee,
        esiDeduction: salary.deductions.esiEmployee,
        professionalTax: salary.deductions.professionalTax,
        tds: salary.deductions.tds,
        otherDeductions: 0,
        totalDeductions: salary.deductions.totalDeductions,
        netSalary: salary.netSalary,
        currency: employee.currency,
      },
    });

    // Create R&D tax record if employee is in R&D department
    if (employee.department?.toLowerCase().includes("r&d") || employee.department?.toLowerCase().includes("engineering")) {
      const fy = this.getCurrentFY();
      await prisma.rnDTaxRecord.create({
        data: {
          financialYear: fy,
          category: "SALARY",
          description: `R&D salary: ${employee.user.firstName} ${employee.user.lastName} - ${this.getMonthName(input.month)} ${input.year}`,
          amount: salary.monthly.adjustedGross,
          sourceEntity: "salary",
          sourceEntityId: slip.id,
        },
      }).catch(() => {}); // Non-blocking
    }

    await createAuditLog({
      userId: actorId,
      action: "CREATE",
      entity: "SalarySlip",
      entityId: slip.id,
      newValue: { employeeId: input.employeeId, month: input.month, year: input.year, netSalary: salary.netSalary },
    });

    return {
      slip,
      breakdown: salary,
    };
  }

  /**
   * Bulk generate salary slips for all active employees.
   */
  static async bulkGenerate(month: number, year: number, state: string, actorId: string): Promise<{
    generated: number;
    skipped: number;
    errors: { employeeId: string; error: string }[];
  }> {
    const employees = await prisma.employee.findMany({
      where: { dateOfLeaving: null },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    const results = { generated: 0, skipped: 0, errors: [] as { employeeId: string; error: string }[] };

    for (const emp of employees) {
      try {
        const existing = await prisma.salarySlip.findUnique({
          where: { employeeId_month_year: { employeeId: emp.id, month, year } },
        });

        if (existing) {
          results.skipped++;
          continue;
        }

        await this.generateSlip({
          employeeId: emp.id,
          month,
          year,
          state,
        }, actorId);

        results.generated++;
      } catch (error: any) {
        results.errors.push({ employeeId: emp.id, error: error.message });
      }
    }

    await createAuditLog({
      userId: actorId,
      action: "CREATE",
      entity: "SalarySlip",
      metadata: { action: "BULK_GENERATE", month, year, ...results },
    });

    return results;
  }

  /**
   * Advanced salary preview with both regimes compared.
   */
  static async salaryPreview(annualCTC: number, state: string, deductions?: {
    section80C?: number;
    section80D?: number;
    section24?: number;
    hraExemption?: number;
  }): Promise<{
    newRegime: FullSalaryResult;
    oldRegime: FullSalaryResult;
    comparison: {
      newRegimeMonthlyTDS: number;
      oldRegimeMonthlyTDS: number;
      recommendation: "NEW" | "OLD";
      annualSavings: number;
    };
    supportedStates: string[];
  }> {
    const newRegime = buildSalaryStructure({
      annualCTC,
      regime: "NEW",
      state,
      month: new Date().getMonth() + 1,
      ...deductions,
    });

    const oldRegime = buildSalaryStructure({
      annualCTC,
      regime: "OLD",
      state,
      month: new Date().getMonth() + 1,
      ...deductions,
    });

    const regimeComparison = compareRegimes(annualCTC, deductions);

    return {
      newRegime,
      oldRegime,
      comparison: {
        newRegimeMonthlyTDS: newRegime.tds.monthlyTDS,
        oldRegimeMonthlyTDS: oldRegime.tds.monthlyTDS,
        recommendation: regimeComparison.recommendation,
        annualSavings: regimeComparison.savings,
      },
      supportedStates: getSupportedStates(),
    };
  }

  /**
   * Calculate gratuity for an employee.
   */
  static async calculateEmployeeGratuity(employeeId: string): Promise<GratuityResult> {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new Error("Employee not found");

    const baseSalary = Number(employee.baseSalary) / 12 * 0.5; // Monthly basic
    const da = Number(employee.baseSalary) / 12 * 0.1; // Monthly DA

    return calculateGratuity(
      baseSalary,
      da,
      employee.dateOfJoining,
      employee.dateOfLeaving || new Date()
    );
  }

  /**
   * Mark salary slip as paid and record payment.
   */
  static async markPaid(slipId: string, actorId: string): Promise<any> {
    const slip = await prisma.salarySlip.update({
      where: { id: slipId },
      data: { isPaid: true, paidAt: new Date() },
    });

    await createAuditLog({
      userId: actorId,
      action: "UPDATE",
      entity: "SalarySlip",
      entityId: slipId,
      newValue: { isPaid: true, paidAt: new Date().toISOString() },
    });

    return slip;
  }

  /**
   * Bulk mark all unpaid slips for a period as paid.
   */
  static async bulkMarkPaid(month: number, year: number, actorId: string): Promise<number> {
    const result = await prisma.salarySlip.updateMany({
      where: { month, year, isPaid: false },
      data: { isPaid: true, paidAt: new Date() },
    });

    await createAuditLog({
      userId: actorId,
      action: "UPDATE",
      entity: "SalarySlip",
      metadata: { action: "BULK_PAID", month, year, count: result.count },
    });

    return result.count;
  }

  /**
   * Get payroll summary dashboard data.
   */
  static async getPayrollDashboard(month?: number, year?: number): Promise<any> {
    const targetMonth = month || new Date().getMonth() + 1;
    const targetYear = year || new Date().getFullYear();

    const [
      totalEmployees,
      slipsGenerated,
      slipsPaid,
      totalGross,
      totalDeductions,
      totalNet,
      byDepartment,
      pendingExpenses,
      upcomingLeaves,
    ] = await Promise.all([
      prisma.employee.count({ where: { dateOfLeaving: null } }),
      prisma.salarySlip.count({ where: { month: targetMonth, year: targetYear } }),
      prisma.salarySlip.count({ where: { month: targetMonth, year: targetYear, isPaid: true } }),
      prisma.salarySlip.aggregate({
        where: { month: targetMonth, year: targetYear },
        _sum: { grossSalary: true },
      }),
      prisma.salarySlip.aggregate({
        where: { month: targetMonth, year: targetYear },
        _sum: { totalDeductions: true },
      }),
      prisma.salarySlip.aggregate({
        where: { month: targetMonth, year: targetYear },
        _sum: { netSalary: true },
      }),
      prisma.employee.groupBy({
        by: ["department"],
        where: { dateOfLeaving: null },
        _count: { id: true },
        _sum: { baseSalary: true },
      }),
      prisma.expenseClaim.count({ where: { status: { in: ["SUBMITTED", "DRAFT"] } } }),
      prisma.leaveRecord.count({
        where: {
          status: "APPROVED",
          startDate: { gte: new Date() },
          endDate: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      period: { month: targetMonth, year: targetYear, monthName: this.getMonthName(targetMonth) },
      employees: totalEmployees,
      payroll: {
        slipsGenerated,
        slipsPaid,
        slipsPending: slipsGenerated - slipsPaid,
        totalGross: Number(totalGross._sum.grossSalary || 0),
        totalDeductions: Number(totalDeductions._sum.totalDeductions || 0),
        totalNet: Number(totalNet._sum.netSalary || 0),
      },
      byDepartment: byDepartment.map((d) => ({
        department: d.department,
        headcount: d._count.id,
        totalCTC: Number(d._sum.baseSalary || 0),
      })),
      pendingExpenses,
      upcomingLeaves,
    };
  }

  /**
   * Get Year-to-Date (YTD) summary for an employee.
   */
  static async getEmployeeYTD(employeeId: string, financialYear?: string): Promise<any> {
    const fy = financialYear || this.getCurrentFY();
    const [fyStart, fyEnd] = fy.split("-").map(Number);
    const startMonth = 4; // April
    const startYear = fyStart;

    // Get all slips in this financial year
    const slips = await prisma.salarySlip.findMany({
      where: {
        employeeId,
        OR: [
          { year: startYear, month: { gte: startMonth } },
          { year: fyEnd, month: { lt: startMonth } },
        ],
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });

    const ytd = {
      financialYear: fy,
      totalMonths: slips.length,
      grossEarnings: slips.reduce((sum, s) => sum + Number(s.grossSalary), 0),
      totalDeductions: slips.reduce((sum, s) => sum + Number(s.totalDeductions), 0),
      netPayments: slips.reduce((sum, s) => sum + Number(s.netSalary), 0),
      pfAccumulated: slips.reduce((sum, s) => sum + Number(s.pfDeduction), 0),
      tdsDeducted: slips.reduce((sum, s) => sum + Number(s.tds), 0),
      esiPaid: slips.reduce((sum, s) => sum + Number(s.esiDeduction), 0),
      professionalTaxPaid: slips.reduce((sum, s) => sum + Number(s.professionalTax), 0),
      monthlyBreakdown: slips.map((s) => ({
        month: s.month,
        year: s.year,
        gross: Number(s.grossSalary),
        net: Number(s.netSalary),
        tds: Number(s.tds),
        pf: Number(s.pfDeduction),
        isPaid: s.isPaid,
      })),
    };

    return ytd;
  }

  private static getCurrentFY(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return month < 3 ? `${year - 1}-${year}` : `${year}-${year + 1}`;
  }

  private static getMonthName(month: number): string {
    return new Date(2000, month - 1).toLocaleString("en", { month: "long" });
  }
}
