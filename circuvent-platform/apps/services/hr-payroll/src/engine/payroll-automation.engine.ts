// ──────────────────────────────────────────────────────────────
// HR & Payroll — Payroll Automation Engine
// Complete Indian payroll computation: CTC breakdown, HRA/LTA
// exemptions, Section 80C/80D/80CCD deductions, TDS (old vs
// new regime), EPF/ESI contributions, professional tax,
// gratuity, leave encashment, payslip generation, and bulk
// payroll processing.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export interface SalaryConfig {
  basicPercent: number;    // e.g. 0.50
  hraPercent: number;      // e.g. 0.20
  daPercent: number;       // e.g. 0.10
  specialPercent: number;  // e.g. 0.20
  isMetro: boolean;
  state: string;
  regime: "OLD" | "NEW";
}

export interface SalaryBreakdown {
  annualCTC: number;
  monthlyCTC: number;
  basic: number;
  hra: number;
  da: number;
  specialAllowance: number;
  grossSalary: number;
  epfEmployee: number;
  epfEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  professionalTax: number;
  tds: number;
  totalDeductions: number;
  netSalary: number;
  totalEmployerCost: number;
}

export interface ExemptionResult {
  exemptionName: string;
  section: string;
  declaredAmount: number;
  eligibleAmount: number;
  maxAllowed: number;
  exemptAmount: number;
}

export interface TaxSlabResult {
  slab: string;
  lowerLimit: number;
  upperLimit: number;
  rate: number;
  taxableInSlab: number;
  taxOnSlab: number;
}

export interface TaxComparison {
  oldRegimeTax: number;
  newRegimeTax: number;
  savings: number;
  recommendedRegime: "OLD" | "NEW";
  oldRegimeDetails: { taxableIncome: number; slabs: TaxSlabResult[] };
  newRegimeDetails: { taxableIncome: number; slabs: TaxSlabResult[] };
}

export interface PayslipData {
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  month: number;
  year: number;
  earnings: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
  ytdGross: number;
  ytdDeductions: number;
  ytdNet: number;
}

export interface BulkPayrollResult {
  month: number;
  year: number;
  totalProcessed: number;
  totalFailed: number;
  totalNetPayout: number;
  totalGross: number;
  results: { employeeId: string; status: "SUCCESS" | "FAILED"; netSalary?: number; error?: string }[];
}

// ══════════════════════════════════════════════════════════════
// Tax Slabs — FY 2025-26
// ══════════════════════════════════════════════════════════════

const NEW_REGIME_SLABS = [
  { min: 0,       max: 400000,    rate: 0 },
  { min: 400001,  max: 800000,    rate: 0.05 },
  { min: 800001,  max: 1200000,   rate: 0.10 },
  { min: 1200001, max: 1600000,   rate: 0.15 },
  { min: 1600001, max: 2000000,   rate: 0.20 },
  { min: 2000001, max: 2400000,   rate: 0.25 },
  { min: 2400001, max: Infinity,  rate: 0.30 },
];

const OLD_REGIME_SLABS = [
  { min: 0,       max: 250000,    rate: 0 },
  { min: 250001,  max: 500000,    rate: 0.05 },
  { min: 500001,  max: 1000000,   rate: 0.20 },
  { min: 1000001, max: Infinity,  rate: 0.30 },
];

// ══════════════════════════════════════════════════════════════
// Professional Tax Slabs (State-wise Monthly)
// ══════════════════════════════════════════════════════════════

const PROFESSIONAL_TAX_SLABS: Record<string, { min: number; max: number; tax: number }[]> = {
  "Karnataka": [
    { min: 0, max: 15000, tax: 0 },
    { min: 15001, max: Infinity, tax: 200 },
  ],
  "Maharashtra": [
    { min: 0, max: 7500, tax: 0 },
    { min: 7501, max: 10000, tax: 175 },
    { min: 10001, max: Infinity, tax: 200 },   // Feb: 300
  ],
  "Tamil Nadu": [
    { min: 0, max: 21000, tax: 0 },
    { min: 21001, max: 30000, tax: 100 },
    { min: 30001, max: 45000, tax: 235 },
    { min: 45001, max: 60000, tax: 510 },
    { min: 60001, max: 75000, tax: 760 },
    { min: 75001, max: Infinity, tax: 1095 },
  ],
  "West Bengal": [
    { min: 0, max: 10000, tax: 0 },
    { min: 10001, max: 15000, tax: 110 },
    { min: 15001, max: 25000, tax: 130 },
    { min: 25001, max: 40000, tax: 150 },
    { min: 40001, max: Infinity, tax: 200 },
  ],
  "Telangana": [
    { min: 0, max: 15000, tax: 0 },
    { min: 15001, max: 20000, tax: 150 },
    { min: 20001, max: Infinity, tax: 200 },
  ],
  "Delhi": [
    { min: 0, max: Infinity, tax: 0 },  // Delhi has no PT
  ],
  "Gujarat": [
    { min: 0, max: 5999, tax: 0 },
    { min: 6000, max: 8999, tax: 80 },
    { min: 9000, max: 11999, tax: 150 },
    { min: 12000, max: Infinity, tax: 200 },
  ],
};

/** Metro cities for HRA classification. */
const METRO_CITIES = ["Mumbai", "Delhi", "Kolkata", "Chennai", "Bengaluru", "Bangalore", "Hyderabad", "Pune", "Ahmedabad"];

// ══════════════════════════════════════════════════════════════
// Payroll Automation Engine
// ══════════════════════════════════════════════════════════════

export class PayrollAutomationEngine {
  /**
   * Full CTC breakdown with all statutory deductions.
   */
  static calculateSalaryBreakdown(
    annualCTC: number,
    config: Partial<SalaryConfig> = {}
  ): SalaryBreakdown {
    const cfg: SalaryConfig = {
      basicPercent: config.basicPercent ?? 0.50,
      hraPercent: config.hraPercent ?? 0.20,
      daPercent: config.daPercent ?? 0.10,
      specialPercent: config.specialPercent ?? 0.20,
      isMetro: config.isMetro ?? true,
      state: config.state ?? "Karnataka",
      regime: config.regime ?? "NEW",
    };

    const monthlyCTC = Math.round(annualCTC / 12);
    const basic = Math.round(monthlyCTC * cfg.basicPercent);
    const hra = Math.round(monthlyCTC * cfg.hraPercent);
    const da = Math.round(monthlyCTC * cfg.daPercent);
    const specialAllowance = Math.round(monthlyCTC * cfg.specialPercent);
    const grossSalary = basic + hra + da + specialAllowance;

    const epfWage = basic + da;
    const epfEmployee = Math.round(epfWage * 0.12);
    const epfEmployer = Math.round(epfWage * 0.12);

    const ESI_CEILING = 21000;
    const esiEmployee = grossSalary <= ESI_CEILING ? Math.round(grossSalary * 0.0075) : 0;
    const esiEmployer = grossSalary <= ESI_CEILING ? Math.round(grossSalary * 0.0325) : 0;

    const professionalTax = this.calculateProfessionalTax(cfg.state, grossSalary);
    const annualTaxable = Math.max(0, annualCTC - (cfg.regime === "NEW" ? 75000 : 50000));
    const tds = Math.round(this.computeTaxOnIncome(annualTaxable, cfg.regime) / 12);

    const totalDeductions = epfEmployee + esiEmployee + professionalTax + tds;
    const netSalary = grossSalary - totalDeductions;
    const totalEmployerCost = grossSalary + epfEmployer + esiEmployer;

    return {
      annualCTC,
      monthlyCTC,
      basic,
      hra,
      da,
      specialAllowance,
      grossSalary,
      epfEmployee,
      epfEmployer,
      esiEmployee,
      esiEmployer,
      professionalTax,
      tds,
      totalDeductions,
      netSalary,
      totalEmployerCost,
    };
  }

  /**
   * HRA exemption under Section 10(13A).
   * Least of: (a) actual HRA, (b) 50% or 40% of basic, (c) rent - 10% of basic.
   */
  static calculateHRA(
    basicMonthly: number,
    isMetro: boolean,
    monthlyRent: number,
    actualHRA: number = 0
  ): ExemptionResult {
    const hraPercent = isMetro ? 0.50 : 0.40;
    const percentOfBasic = Math.round(basicMonthly * hraPercent);
    const rentMinusBasic = Math.max(0, monthlyRent - Math.round(basicMonthly * 0.10));
    const hraReceived = actualHRA || Math.round(basicMonthly * 0.40);

    const annual = Math.min(hraReceived, percentOfBasic, rentMinusBasic) * 12;

    return {
      exemptionName: "HRA Exemption",
      section: "Section 10(13A)",
      declaredAmount: monthlyRent * 12,
      eligibleAmount: annual,
      maxAllowed: hraReceived * 12,
      exemptAmount: annual,
    };
  }

  /**
   * LTA exemption (available twice in a block of 4 years).
   */
  static calculateLTA(amount: number, claimCountInBlock: number): ExemptionResult {
    const MAX_CLAIMS_PER_BLOCK = 2;
    const eligible = claimCountInBlock < MAX_CLAIMS_PER_BLOCK;

    return {
      exemptionName: "Leave Travel Allowance",
      section: "Section 10(5)",
      declaredAmount: amount,
      eligibleAmount: eligible ? amount : 0,
      maxAllowed: amount,
      exemptAmount: eligible ? amount : 0,
    };
  }

  /**
   * Section 80C deduction (max ₹1,50,000).
   */
  static calculateSection80C(investments: {
    ppf?: number;
    elss?: number;
    nsc?: number;
    lifeInsurance?: number;
    tuitionFees?: number;
    homeLoanPrincipal?: number;
    epfContribution?: number;
    sukanya?: number;
    fdr5Year?: number;
  }): ExemptionResult {
    const MAX_80C = 150000;
    const total = Object.values(investments).reduce((s, v) => s + (v || 0), 0);
    const eligible = Math.min(total, MAX_80C);

    return {
      exemptionName: "Section 80C Deductions",
      section: "Section 80C",
      declaredAmount: total,
      eligibleAmount: eligible,
      maxAllowed: MAX_80C,
      exemptAmount: eligible,
    };
  }

  /**
   * Section 80D deduction for medical insurance.
   * Self: max ₹25,000 (₹50,000 if senior citizen).
   * Parents: max ₹25,000 (₹50,000 if senior citizen).
   */
  static calculateSection80D(medicalInsurance: {
    selfPremium?: number;
    parentsPremium?: number;
    selfIsSenior?: boolean;
    parentsAreSenior?: boolean;
    preventiveCheckup?: number;
  }): ExemptionResult {
    const MAX_SELF = medicalInsurance.selfIsSenior ? 50000 : 25000;
    const MAX_PARENTS = medicalInsurance.parentsAreSenior ? 50000 : 25000;
    const MAX_CHECKUP = 5000;

    const selfAmount = Math.min((medicalInsurance.selfPremium || 0), MAX_SELF);
    const parentsAmount = Math.min((medicalInsurance.parentsPremium || 0), MAX_PARENTS);
    const checkup = Math.min((medicalInsurance.preventiveCheckup || 0), MAX_CHECKUP);
    const total = selfAmount + parentsAmount + checkup;
    const maxAllowed = MAX_SELF + MAX_PARENTS + MAX_CHECKUP;

    return {
      exemptionName: "Medical Insurance Premium",
      section: "Section 80D",
      declaredAmount: (medicalInsurance.selfPremium || 0) + (medicalInsurance.parentsPremium || 0),
      eligibleAmount: total,
      maxAllowed,
      exemptAmount: total,
    };
  }

  /**
   * NPS contribution under Section 80CCD(1B) — additional ₹50,000.
   */
  static calculateNPS(contribution: number): ExemptionResult {
    const MAX_NPS = 50000;
    const eligible = Math.min(contribution, MAX_NPS);

    return {
      exemptionName: "NPS Contribution",
      section: "Section 80CCD(1B)",
      declaredAmount: contribution,
      eligibleAmount: eligible,
      maxAllowed: MAX_NPS,
      exemptAmount: eligible,
    };
  }

  /**
   * State-wise professional tax calculation.
   */
  static calculateProfessionalTax(state: string, grossMonthly: number): number {
    const slabs = PROFESSIONAL_TAX_SLABS[state];
    if (!slabs) return 200; // Default ₹200 for unknown states

    for (const slab of slabs) {
      if (grossMonthly >= slab.min && grossMonthly <= slab.max) {
        return slab.tax;
      }
    }
    return 200;
  }

  /**
   * EPF contribution calculation.
   * Employee: 12% of (Basic + DA), Employer: 12% (split EPF 3.67% + EPS 8.33%).
   */
  static calculateEPFContribution(
    basicMonthly: number,
    daMonthly: number = 0
  ): { employee: number; employerEPF: number; employerEPS: number; total: number } {
    const pfWage = basicMonthly + daMonthly;
    const employee = Math.round(pfWage * 0.12);
    const epsCeiling = Math.min(pfWage, 15000);
    const employerEPS = Math.round(epsCeiling * 0.0833);
    const employerEPF = Math.round(pfWage * 0.12) - employerEPS;

    return {
      employee,
      employerEPF,
      employerEPS,
      total: employee + employerEPF + employerEPS,
    };
  }

  /**
   * ESI contribution. Applicable if gross ≤ ₹21,000.
   */
  static calculateESIContribution(
    grossMonthly: number
  ): { applicable: boolean; employee: number; employer: number; total: number } {
    const CEILING = 21000;
    if (grossMonthly > CEILING) {
      return { applicable: false, employee: 0, employer: 0, total: 0 };
    }
    const employee = Math.round(grossMonthly * 0.0075);
    const employer = Math.round(grossMonthly * 0.0325);

    return { applicable: true, employee, employer, total: employee + employer };
  }

  /**
   * TDS calculation comparing old vs new regime.
   */
  static calculateTDS(
    annualTaxableIncome: number,
    regime: "OLD" | "NEW"
  ): { annualTax: number; monthlyTDS: number; effectiveRate: number; slabs: TaxSlabResult[] } {
    const standardDeduction = regime === "NEW" ? 75000 : 50000;
    const taxable = Math.max(0, annualTaxableIncome - standardDeduction);
    const slabResults = this.computeSlabBreakdown(taxable, regime);
    const taxOnIncome = slabResults.reduce((s, sr) => s + sr.taxOnSlab, 0);

    // Cess: 4%
    const cess = Math.round(taxOnIncome * 0.04);
    const totalTax = taxOnIncome + cess;

    // Rebate under 87A
    const rebateLimit = regime === "NEW" ? 700000 : 500000;
    const rebate = taxable <= rebateLimit ? Math.min(totalTax, regime === "NEW" ? 25000 : 12500) : 0;
    const netTax = Math.max(0, totalTax - rebate);

    return {
      annualTax: netTax,
      monthlyTDS: Math.round(netTax / 12),
      effectiveRate: annualTaxableIncome > 0 ? Math.round((netTax / annualTaxableIncome) * 10000) / 100 : 0,
      slabs: slabResults,
    };
  }

  /**
   * Gratuity calculation under Payment of Gratuity Act.
   * Formula: (Last drawn salary × 15 × years of service) / 26
   */
  static calculateGratuity(
    lastDrawnBasicPlusDA: number,
    yearsOfService: number
  ): { eligible: boolean; amount: number; cappedAmount: number } {
    const MAX_GRATUITY = 2500000;
    const eligible = yearsOfService >= 5;
    const raw = Math.round((lastDrawnBasicPlusDA * 15 * yearsOfService) / 26);
    const amount = Math.min(raw, MAX_GRATUITY);

    return { eligible, amount: eligible ? amount : 0, cappedAmount: MAX_GRATUITY };
  }

  /**
   * Leave encashment calculation.
   * (Basic + DA) / 30 × leave balance days
   */
  static calculateLeaveEncashment(
    basicPlusDA: number,
    leaveBalanceDays: number,
    maxEncashableDays: number = 300
  ): { dailyRate: number; encashableDays: number; amount: number } {
    const dailyRate = Math.round(basicPlusDA / 30);
    const encashableDays = Math.min(leaveBalanceDays, maxEncashableDays);

    return {
      dailyRate,
      encashableDays,
      amount: dailyRate * encashableDays,
    };
  }

  /**
   * Generate complete payslip data for an employee.
   */
  static async generatePayslipData(
    employeeId: string,
    month: number,
    year: number
  ): Promise<PayslipData> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        salarySlips: { where: { year }, select: { grossSalary: true, totalDeductions: true, netSalary: true } },
      },
    });

    if (!employee) throw new Error(`Employee ${employeeId} not found`);

    const annualCTC = Number(employee.baseSalary);
    const breakdown = this.calculateSalaryBreakdown(annualCTC, {
      state: "Karnataka",
      regime: "NEW",
    });

    const ytdSlips = employee.salarySlips || [];
    const ytdGross = ytdSlips.reduce((s, sl) => s + Number(sl.grossSalary), 0) + breakdown.grossSalary;
    const ytdDeductions = ytdSlips.reduce((s, sl) => s + Number(sl.totalDeductions), 0) + breakdown.totalDeductions;

    return {
      employeeId,
      employeeName: `${employee.user?.firstName || ""} ${employee.user?.lastName || ""}`.trim(),
      department: employee.department || "N/A",
      designation: employee.designation || "N/A",
      month,
      year,
      earnings: [
        { label: "Basic Pay", amount: breakdown.basic },
        { label: "House Rent Allowance", amount: breakdown.hra },
        { label: "Dearness Allowance", amount: breakdown.da },
        { label: "Special Allowance", amount: breakdown.specialAllowance },
      ],
      deductions: [
        { label: "Provident Fund", amount: breakdown.epfEmployee },
        { label: "ESI", amount: breakdown.esiEmployee },
        { label: "Professional Tax", amount: breakdown.professionalTax },
        { label: "TDS", amount: breakdown.tds },
      ],
      grossSalary: breakdown.grossSalary,
      totalDeductions: breakdown.totalDeductions,
      netSalary: breakdown.netSalary,
      ytdGross,
      ytdDeductions,
      ytdNet: ytdGross - ytdDeductions,
    };
  }

  /**
   * Process payroll for all active employees for a given month.
   */
  static async processBulkPayroll(
    month: number,
    year: number,
    actorId: string = "system"
  ): Promise<BulkPayrollResult> {
    const employees = await prisma.employee.findMany({
      where: { dateOfLeaving: null },
      select: { id: true, baseSalary: true, department: true },
    });

    const results: BulkPayrollResult["results"] = [];
    let totalGross = 0;
    let totalNet = 0;
    let totalFailed = 0;

    for (const emp of employees) {
      try {
        // Check if already processed
        const existing = await prisma.salarySlip.findUnique({
          where: { employeeId_month_year: { employeeId: emp.id, month, year } },
        });

        if (existing) {
          results.push({ employeeId: emp.id, status: "SUCCESS", netSalary: Number(existing.netSalary) });
          totalGross += Number(existing.grossSalary);
          totalNet += Number(existing.netSalary);
          continue;
        }

        const breakdown = this.calculateSalaryBreakdown(Number(emp.baseSalary), {
          state: "Karnataka",
          regime: "NEW",
        });

        const slip = await prisma.salarySlip.create({
          data: {
            employeeId: emp.id,
            month,
            year,
            basePay: breakdown.basic,
            hra: breakdown.hra,
            da: breakdown.da,
            specialAllowance: breakdown.specialAllowance,
            bonus: 0,
            grossSalary: breakdown.grossSalary,
            pfDeduction: breakdown.epfEmployee,
            esiDeduction: breakdown.esiEmployee,
            professionalTax: breakdown.professionalTax,
            tds: breakdown.tds,
            otherDeductions: 0,
            totalDeductions: breakdown.totalDeductions,
            netSalary: breakdown.netSalary,
            currency: "INR",
          },
        });

        results.push({ employeeId: emp.id, status: "SUCCESS", netSalary: breakdown.netSalary });
        totalGross += breakdown.grossSalary;
        totalNet += breakdown.netSalary;
      } catch (error) {
        totalFailed++;
        results.push({
          employeeId: emp.id,
          status: "FAILED",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    await createAuditLog({
      userId: actorId,
      action: "CREATE",
      entity: "SalarySlip",
      entityId: `payroll_${year}_${month}`,
      newValue: { month, year, processed: results.length - totalFailed, failed: totalFailed },
    });

    return {
      month,
      year,
      totalProcessed: results.length - totalFailed,
      totalFailed,
      totalNetPayout: totalNet,
      totalGross,
      results,
    };
  }

  /**
   * Calculate total CTC from individual components.
   */
  static calculateCTC(components: {
    basic: number;
    hra: number;
    da?: number;
    specialAllowance?: number;
    bonus?: number;
    epfEmployer?: number;
    esiEmployer?: number;
    gratuity?: number;
    otherBenefits?: number;
  }): number {
    return (
      (components.basic || 0) +
      (components.hra || 0) +
      (components.da || 0) +
      (components.specialAllowance || 0) +
      (components.bonus || 0) +
      (components.epfEmployer || 0) +
      (components.esiEmployer || 0) +
      (components.gratuity || 0) +
      (components.otherBenefits || 0)
    ) * 12;
  }

  /**
   * Compare old vs new regime and recommend optimal choice.
   */
  static optimizeTaxRegime(
    annualGrossIncome: number,
    deductions: {
      section80C?: number;
      section80D?: number;
      section24?: number;
      nps?: number;
      hraExemption?: number;
      otherExemptions?: number;
    } = {}
  ): TaxComparison {
    // Old regime: more deductions allowed
    const totalOldDeductions =
      Math.min(deductions.section80C || 0, 150000) +
      Math.min(deductions.section80D || 0, 75000) +
      (deductions.section24 || 0) +
      Math.min(deductions.nps || 0, 50000) +
      (deductions.hraExemption || 0) +
      (deductions.otherExemptions || 0);

    const oldTaxable = Math.max(0, annualGrossIncome - 50000 - totalOldDeductions);
    const newTaxable = Math.max(0, annualGrossIncome - 75000);

    const oldSlabs = this.computeSlabBreakdown(oldTaxable, "OLD");
    const newSlabs = this.computeSlabBreakdown(newTaxable, "NEW");

    const oldTax = this.applyRebateAndCess(oldSlabs.reduce((s, sl) => s + sl.taxOnSlab, 0), oldTaxable, "OLD");
    const newTax = this.applyRebateAndCess(newSlabs.reduce((s, sl) => s + sl.taxOnSlab, 0), newTaxable, "NEW");

    return {
      oldRegimeTax: oldTax,
      newRegimeTax: newTax,
      savings: Math.abs(oldTax - newTax),
      recommendedRegime: oldTax <= newTax ? "OLD" : "NEW",
      oldRegimeDetails: { taxableIncome: oldTaxable, slabs: oldSlabs },
      newRegimeDetails: { taxableIncome: newTaxable, slabs: newSlabs },
    };
  }

  // ══════════════════════════════════════════════════════════════
  // Private Helpers
  // ══════════════════════════════════════════════════════════════

  private static computeTaxOnIncome(taxable: number, regime: "OLD" | "NEW"): number {
    const slabs = regime === "NEW" ? NEW_REGIME_SLABS : OLD_REGIME_SLABS;
    let tax = 0;
    for (const slab of slabs) {
      if (taxable <= 0) break;
      const range = Math.min(taxable, slab.max) - slab.min + 1;
      if (range > 0) {
        tax += range * slab.rate;
        taxable -= range;
      }
    }
    return Math.round(tax);
  }

  private static computeSlabBreakdown(taxable: number, regime: "OLD" | "NEW"): TaxSlabResult[] {
    const slabs = regime === "NEW" ? NEW_REGIME_SLABS : OLD_REGIME_SLABS;
    const results: TaxSlabResult[] = [];

    let remaining = taxable;
    for (const slab of slabs) {
      const slabRange = slab.max === Infinity ? remaining : slab.max - slab.min + 1;
      const taxableInSlab = Math.min(Math.max(0, remaining), slabRange);
      const taxOnSlab = Math.round(taxableInSlab * slab.rate);

      results.push({
        slab: slab.max === Infinity ? `Above ₹${(slab.min - 1).toLocaleString("en-IN")}` : `₹${slab.min.toLocaleString("en-IN")} - ₹${slab.max.toLocaleString("en-IN")}`,
        lowerLimit: slab.min,
        upperLimit: slab.max,
        rate: slab.rate,
        taxableInSlab,
        taxOnSlab,
      });

      remaining -= taxableInSlab;
      if (remaining <= 0) break;
    }

    return results;
  }

  private static applyRebateAndCess(tax: number, taxable: number, regime: "OLD" | "NEW"): number {
    const cess = Math.round(tax * 0.04);
    const total = tax + cess;

    const rebateLimit = regime === "NEW" ? 700000 : 500000;
    const maxRebate = regime === "NEW" ? 25000 : 12500;
    const rebate = taxable <= rebateLimit ? Math.min(total, maxRebate) : 0;

    return Math.max(0, total - rebate);
  }
}
