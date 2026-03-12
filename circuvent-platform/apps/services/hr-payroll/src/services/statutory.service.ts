// ──────────────────────────────────────────────────────────────
// HR & Payroll — Statutory Compliance Service
// Manages statutory configuration, compliance deadlines,
// statutory remittance tracking, and Form 16 data.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { calculateTDS, compareRegimes } from "../engine/tds.calculator";
import { calculateEPF } from "../engine/epf.calculator";
import { calculateESI } from "../engine/esi.calculator";
import { calculateProfessionalTax, getSupportedStates } from "../engine/professional-tax.calculator";
import { calculateGratuity } from "../engine/gratuity.calculator";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

export interface ComplianceStatus {
  epf: { due: boolean; dueDate: string; amount: number; status: "PENDING" | "PAID" | "OVERDUE" };
  esi: { due: boolean; dueDate: string; amount: number; status: "PENDING" | "PAID" | "OVERDUE" };
  tds: { due: boolean; dueDate: string; amount: number; status: "PENDING" | "PAID" | "OVERDUE" };
  professionalTax: { due: boolean; dueDate: string; amount: number; status: "PENDING" | "PAID" | "OVERDUE" };
}

export class StatutoryComplianceService {
  /**
   * Get or create statutory config for a financial year.
   */
  static async getConfig(financialYear: string): Promise<any> {
    let config = await prisma.statutoryConfig.findUnique({ where: { financialYear } });
    if (!config) {
      config = await prisma.statutoryConfig.create({
        data: {
          financialYear,
          epfEmployeeRate: 0.12,
          epfEmployerRate: 0.12,
          epfWageCeiling: 15000,
          epsRate: 0.0833,
          esiEmployeeRate: 0.0075,
          esiEmployerRate: 0.0325,
          esiWageCeiling: 21000,
          ptMaxAnnual: 2500,
          gratuityRate: 0.0577,
          gratuityMinYears: 5,
          standardDeduction: 75000,
          cessRate: 0.04,
          isActive: true,
        },
      });
    }
    return config;
  }

  /**
   * Update statutory rates for a financial year.
   */
  static async updateConfig(financialYear: string, data: Record<string, unknown>, actorId: string): Promise<any> {
    const config = await prisma.statutoryConfig.upsert({
      where: { financialYear },
      update: data,
      create: { financialYear, ...data as any },
    });

    await createAuditLog({
      userId: actorId,
      action: "UPDATE",
      entity: "StatutoryConfig",
      entityId: config.id,
      newValue: data,
    });

    return config;
  }

  /**
   * Get monthly compliance status — what's due, what's paid.
   */
  static async getComplianceStatus(month: number, year: number): Promise<{
    period: string;
    status: ComplianceStatus;
    totals: {
      epfTotal: number;
      esiTotal: number;
      tdsTotal: number;
      ptTotal: number;
      grandTotal: number;
    };
    employeesProcessed: number;
  }> {
    const slips = await prisma.salarySlip.findMany({
      where: { month, year },
      select: {
        pfDeduction: true, esiDeduction: true, tds: true, professionalTax: true,
        grossSalary: true, basePay: true,
      },
    });

    const epfTotal = slips.reduce((sum, s) => sum + Number(s.pfDeduction) * 2, 0); // Employee + Employer
    const esiTotal = slips.reduce((sum, s) => {
      const empESI = Number(s.esiDeduction);
      const empGross = Number(s.grossSalary);
      const employerESI = empGross <= 21000 ? Math.ceil(empGross * 0.0325) : 0;
      return sum + empESI + employerESI;
    }, 0);
    const tdsTotal = slips.reduce((sum, s) => sum + Number(s.tds), 0);
    const ptTotal = slips.reduce((sum, s) => sum + Number(s.professionalTax), 0);

    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const now = new Date();

    const epfDueDate = new Date(nextYear, nextMonth - 1, 15);
    const esiDueDate = new Date(nextYear, nextMonth - 1, 15);
    const tdsDueDate = new Date(nextYear, nextMonth - 1, 7);
    const ptDueDate = new Date(nextYear, nextMonth - 1, 15);

    const getStatus = (dueDate: Date): "PENDING" | "PAID" | "OVERDUE" => {
      if (now > dueDate) return "OVERDUE";
      return "PENDING";
    };

    return {
      period: `${new Date(2000, month - 1).toLocaleString("en", { month: "long" })} ${year}`,
      status: {
        epf: { due: true, dueDate: epfDueDate.toISOString().split("T")[0], amount: epfTotal, status: getStatus(epfDueDate) },
        esi: { due: esiTotal > 0, dueDate: esiDueDate.toISOString().split("T")[0], amount: esiTotal, status: getStatus(esiDueDate) },
        tds: { due: true, dueDate: tdsDueDate.toISOString().split("T")[0], amount: tdsTotal, status: getStatus(tdsDueDate) },
        professionalTax: { due: ptTotal > 0, dueDate: ptDueDate.toISOString().split("T")[0], amount: ptTotal, status: getStatus(ptDueDate) },
      },
      totals: { epfTotal, esiTotal, tdsTotal, ptTotal, grandTotal: epfTotal + esiTotal + tdsTotal + ptTotal },
      employeesProcessed: slips.length,
    };
  }

  /**
   * Generate Form 16 data for an employee.
   */
  static async getForm16Data(employeeId: string, financialYear: string): Promise<{
    employee: any;
    annualSalary: number;
    totalTDS: number;
    taxComputation: any;
    quarterlyTDS: { quarter: string; tds: number }[];
    monthlyBreakdown: any[];
  }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
    if (!employee) throw new Error("Employee not found");

    const [fyStartYear] = financialYear.split("-").map(Number);

    // Get all salary slips in the FY
    const slips = await prisma.salarySlip.findMany({
      where: {
        employeeId,
        OR: [
          { year: fyStartYear, month: { gte: 4 } },
          { year: fyStartYear + 1, month: { lte: 3 } },
        ],
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });

    const annualSalary = slips.reduce((sum, s) => sum + Number(s.grossSalary), 0);
    const totalTDS = slips.reduce((sum, s) => sum + Number(s.tds), 0);

    // Tax computation
    const taxDecl = await prisma.taxDeclaration.findFirst({
      where: { employeeId, financialYear },
    });

    const taxComputation = calculateTDS({
      annualGrossSalary: Number(employee.baseSalary),
      regime: (taxDecl?.regime || "NEW") as "OLD" | "NEW",
      section80C: taxDecl ? Number(taxDecl.section80C) : undefined,
      section80D: taxDecl ? Number(taxDecl.section80D) : undefined,
      section24: taxDecl ? Number(taxDecl.section24) : undefined,
      hraExemption: taxDecl ? Number(taxDecl.hra_exemption) : undefined,
    });

    // Quarterly TDS
    const q1 = slips.filter((s) => s.year === fyStartYear && s.month >= 4 && s.month <= 6).reduce((sum, s) => sum + Number(s.tds), 0);
    const q2 = slips.filter((s) => s.year === fyStartYear && s.month >= 7 && s.month <= 9).reduce((sum, s) => sum + Number(s.tds), 0);
    const q3 = slips.filter((s) => s.year === fyStartYear && s.month >= 10 && s.month <= 12).reduce((sum, s) => sum + Number(s.tds), 0);
    const q4 = slips.filter((s) => s.year === fyStartYear + 1 && s.month >= 1 && s.month <= 3).reduce((sum, s) => sum + Number(s.tds), 0);

    return {
      employee: {
        code: employee.employeeCode,
        name: `${employee.user.firstName} ${employee.user.lastName}`,
        pan: employee.panNumber,
        designation: employee.designation,
        department: employee.department,
      },
      annualSalary,
      totalTDS,
      taxComputation,
      quarterlyTDS: [
        { quarter: "Q1 (Apr-Jun)", tds: q1 },
        { quarter: "Q2 (Jul-Sep)", tds: q2 },
        { quarter: "Q3 (Oct-Dec)", tds: q3 },
        { quarter: "Q4 (Jan-Mar)", tds: q4 },
      ],
      monthlyBreakdown: slips.map((s) => ({
        month: s.month, year: s.year,
        gross: Number(s.grossSalary),
        pf: Number(s.pfDeduction),
        tds: Number(s.tds),
        net: Number(s.netSalary),
      })),
    };
  }

  /**
   * Get all compliance deadlines for current month.
   */
  static async getUpcomingDeadlines(): Promise<{
    deadlines: { name: string; dueDate: string; type: string; status: string }[];
    overdueCount: number;
  }> {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const deadlines = [
      { name: `TDS Deposit - ${new Date(2000, currentMonth - 1).toLocaleString("en", { month: "short" })}`, dueDate: `${currentYear}-${String(currentMonth).padStart(2, "0")}-07`, type: "TDS" },
      { name: `EPF/EPS Remittance`, dueDate: `${currentYear}-${String(currentMonth).padStart(2, "0")}-15`, type: "EPF" },
      { name: `ESI Contribution`, dueDate: `${currentYear}-${String(currentMonth).padStart(2, "0")}-15`, type: "ESI" },
      { name: `Professional Tax`, dueDate: `${currentYear}-${String(currentMonth).padStart(2, "0")}-15`, type: "PT" },
      { name: `GSTR-3B Filing`, dueDate: `${currentYear}-${String(currentMonth).padStart(2, "0")}-20`, type: "GST" },
    ].map((d) => ({
      ...d,
      status: new Date(d.dueDate) < now ? "OVERDUE" : new Date(d.dueDate).getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000 ? "DUE_SOON" : "UPCOMING",
    }));

    return {
      deadlines,
      overdueCount: deadlines.filter((d) => d.status === "OVERDUE").length,
    };
  }

  /**
   * Get supported states for Professional Tax.
   */
  static getSupportedPTStates(): string[] {
    return getSupportedStates();
  }

  /**
   * Calculate comprehensive salary for an employee (all statutory included).
   */
  static async getEmployeeStatutorySummary(employeeId: string): Promise<any> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!employee) throw new Error("Employee not found");

    const annualCTC = Number(employee.baseSalary);
    const monthlyBasic = Math.round(annualCTC / 12 * 0.5);
    const monthlyDA = Math.round(annualCTC / 12 * 0.1);
    const monthlyGross = Math.round(annualCTC / 12);

    const epf = calculateEPF(monthlyBasic, monthlyDA);
    const esi = calculateESI(monthlyGross);
    const tdsNew = calculateTDS({ annualGrossSalary: annualCTC, regime: "NEW" });
    const tdsOld = calculateTDS({ annualGrossSalary: annualCTC, regime: "OLD" });
    const pt = calculateProfessionalTax(monthlyGross, "Karnataka");
    const gratuity = calculateGratuity(
      monthlyBasic, monthlyDA,
      employee.dateOfJoining, employee.dateOfLeaving || new Date()
    );

    const regimeComparison = compareRegimes(annualCTC);

    return {
      employee: {
        code: employee.employeeCode,
        name: `${employee.user.firstName} ${employee.user.lastName}`,
        annualCTC, monthlyBasic, monthlyDA, monthlyGross,
      },
      epf, esi, tdsNew, tdsOld, professionalTax: pt, gratuity,
      regimeRecommendation: regimeComparison.recommendation,
      annualSavings: regimeComparison.savings,
    };
  }
}
