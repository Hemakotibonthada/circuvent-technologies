// ══════════════════════════════════════════════════════════════════════════════
// HR Payroll — Salary Calculator Domain Service
// Comprehensive Indian payroll calculation with statutory compliance.
// Pure domain logic — computes gross-to-net with all deductions.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Salary structure input.
 */
export interface SalaryInput {
  annualCTC: number;
  state: string; // For professional tax slab
  regime: "OLD" | "NEW";
  pfContribution?: number; // Override, otherwise 12% of basic
  esiContribution?: number;
  isESIEligible?: boolean; // Gross <= 21000
  bonus?: number;
  otherDeductions?: number;
}

/**
 * Complete salary breakdown result.
 */
export interface SalaryBreakdown {
  // Earnings
  basePay: number;        // 50% of CTC
  hra: number;            // 20% of CTC
  da: number;             // 10% of CTC
  specialAllowance: number; // Balance
  bonus: number;
  grossSalary: number;

  // Deductions
  pfEmployee: number;      // 12% of basic (capped at 1800/month)
  pfEmployer: number;      // 12% of basic (employer portion)
  esiEmployee: number;     // 0.75% of gross (if eligible)
  esiEmployer: number;     // 3.25% of gross (employer)
  professionalTax: number; // State-specific monthly
  tds: number;             // Income tax
  otherDeductions: number;
  totalDeductions: number;

  // Net
  netSalary: number;
  ctcPerMonth: number;
  takeHomePercentage: number;

  // Employer cost
  employerPF: number;
  employerESI: number;
  totalEmployerCost: number;
}

/**
 * Tax comparison between OLD and NEW regimes.
 */
export interface RegimeComparison {
  old: { taxableIncome: number; tax: number; cess: number; totalTax: number; effectiveRate: number };
  new: { taxableIncome: number; tax: number; cess: number; totalTax: number; effectiveRate: number };
  recommendation: "OLD" | "NEW";
  savings: number;
  savingsPerMonth: number;
}

/** Professional Tax monthly slabs by state */
const PT_SLABS: Record<string, Array<{ min: number; max: number; tax: number }>> = {
  KA: [{ min: 0, max: 15000, tax: 0 }, { min: 15001, max: Infinity, tax: 200 }],
  MH: [{ min: 0, max: 10000, tax: 0 }, { min: 10001, max: 15000, tax: 175 }, { min: 15001, max: Infinity, tax: 200 }],
  TN: [{ min: 0, max: 21000, tax: 0 }, { min: 21001, max: Infinity, tax: 208 }],
  TG: [{ min: 0, max: 15000, tax: 0 }, { min: 15001, max: 20000, tax: 150 }, { min: 20001, max: Infinity, tax: 200 }],
  DEFAULT: [{ min: 0, max: 15000, tax: 0 }, { min: 15001, max: Infinity, tax: 200 }],
};

/** NEW regime tax slabs (FY 2025-26) */
const NEW_REGIME_SLABS: Array<{ min: number; max: number; rate: number }> = [
  { min: 0, max: 300000, rate: 0 },
  { min: 300001, max: 700000, rate: 5 },
  { min: 700001, max: 1000000, rate: 10 },
  { min: 1000001, max: 1200000, rate: 15 },
  { min: 1200001, max: 1500000, rate: 20 },
  { min: 1500001, max: Infinity, rate: 30 },
];

/** OLD regime tax slabs */
const OLD_REGIME_SLABS: Array<{ min: number; max: number; rate: number }> = [
  { min: 0, max: 250000, rate: 0 },
  { min: 250001, max: 500000, rate: 5 },
  { min: 500001, max: 1000000, rate: 20 },
  { min: 1000001, max: Infinity, rate: 30 },
];

/** Standard deduction under NEW regime */
const STANDARD_DEDUCTION_NEW = 75000;
const STANDARD_DEDUCTION_OLD = 50000;

/** EPF basic wage ceiling (monthly) */
const PF_CEILING_MONTHLY = 15000;

/** ESI eligibility ceiling (monthly gross) */
const ESI_CEILING = 21000;

/**
 * Salary Calculator Domain Service.
 *
 * Handles the complete Indian payroll calculation flow:
 * 1. CTC → Salary Structure (basic, HRA, DA, special allowance)
 * 2. EPF computation (12% of basic, capped at ₹15,000 basic)
 * 3. ESI computation (0.75% + 3.25% if eligible)
 * 4. Professional Tax (state-specific slabs)
 * 5. TDS (income tax under OLD or NEW regime)
 * 6. Net salary = Gross - all deductions
 *
 * @example
 * ```ts
 * const calculator = new SalaryCalculatorService();
 * const breakdown = calculator.calculate({
 *   annualCTC: 1200000,
 *   state: "KA",
 *   regime: "NEW",
 * });
 * console.log(breakdown.netSalary);         // ~83,416
 * console.log(breakdown.takeHomePercentage); // ~83.4%
 * ```
 */
export class SalaryCalculatorService {

  /**
   * Calculates the complete salary breakdown from annual CTC.
   */
  calculate(input: SalaryInput): SalaryBreakdown {
    const monthlyCTC = input.annualCTC / 12;

    // Salary structure (standard Indian 50-20-10-20 split)
    const basePay = Math.round(monthlyCTC * 0.50);
    const hra = Math.round(monthlyCTC * 0.20);
    const da = Math.round(monthlyCTC * 0.10);
    const specialAllowance = Math.round(monthlyCTC - basePay - hra - da);
    const bonus = input.bonus || 0;
    const grossSalary = basePay + hra + da + specialAllowance + bonus;

    // EPF (12% of basic or 12% of ₹15,000 — whichever is lower)
    const pfBasic = Math.min(basePay, PF_CEILING_MONTHLY);
    const pfEmployee = input.pfContribution ?? Math.round(pfBasic * 0.12);
    const pfEmployer = Math.round(pfBasic * 0.12);

    // ESI (if gross <= 21,000)
    const isESIEligible = input.isESIEligible ?? grossSalary <= ESI_CEILING;
    const esiEmployee = isESIEligible ? Math.round(grossSalary * 0.0075) : 0;
    const esiEmployer = isESIEligible ? Math.round(grossSalary * 0.0325) : 0;

    // Professional Tax
    const professionalTax = this.calculatePT(grossSalary, input.state);

    // TDS (income tax per month)
    const annualTax = this.calculateTax(input.annualCTC, input.regime);
    const tds = Math.round(annualTax / 12);

    // Other deductions
    const otherDeductions = input.otherDeductions || 0;

    // Total deductions
    const totalDeductions = pfEmployee + esiEmployee + professionalTax + tds + otherDeductions;

    // Net salary
    const netSalary = grossSalary - totalDeductions;

    return {
      basePay, hra, da, specialAllowance, bonus, grossSalary,
      pfEmployee, pfEmployer, esiEmployee, esiEmployer,
      professionalTax, tds, otherDeductions, totalDeductions,
      netSalary,
      ctcPerMonth: monthlyCTC,
      takeHomePercentage: grossSalary > 0 ? Math.round((netSalary / grossSalary) * 1000) / 10 : 0,
      employerPF: pfEmployer,
      employerESI: esiEmployer,
      totalEmployerCost: grossSalary + pfEmployer + esiEmployer,
    };
  }

  /**
   * Compares OLD vs NEW tax regime for a given CTC.
   */
  compareRegimes(annualCTC: number, deductions80C: number = 150000): RegimeComparison {
    // OLD regime gets 80C, 80D deductions
    const oldTaxableBase = annualCTC - STANDARD_DEDUCTION_OLD - deductions80C;
    const oldTaxable = Math.max(0, oldTaxableBase);
    const oldTax = this.computeSlabTax(oldTaxable, OLD_REGIME_SLABS);
    const oldCess = Math.round(oldTax * 0.04);

    // NEW regime gets standard deduction only
    const newTaxableBase = annualCTC - STANDARD_DEDUCTION_NEW;
    const newTaxable = Math.max(0, newTaxableBase);
    const newTax = this.computeSlabTax(newTaxable, NEW_REGIME_SLABS);
    const newCess = Math.round(newTax * 0.04);

    const oldTotal = oldTax + oldCess;
    const newTotal = newTax + newCess;

    return {
      old: {
        taxableIncome: oldTaxable,
        tax: oldTax,
        cess: oldCess,
        totalTax: oldTotal,
        effectiveRate: annualCTC > 0 ? Math.round((oldTotal / annualCTC) * 10000) / 100 : 0,
      },
      new: {
        taxableIncome: newTaxable,
        tax: newTax,
        cess: newCess,
        totalTax: newTotal,
        effectiveRate: annualCTC > 0 ? Math.round((newTotal / annualCTC) * 10000) / 100 : 0,
      },
      recommendation: oldTotal <= newTotal ? "OLD" : "NEW",
      savings: Math.abs(oldTotal - newTotal),
      savingsPerMonth: Math.round(Math.abs(oldTotal - newTotal) / 12),
    };
  }

  /**
   * Calculates annual income tax for a given CTC and regime.
   */
  calculateTax(annualCTC: number, regime: "OLD" | "NEW"): number {
    const slabs = regime === "NEW" ? NEW_REGIME_SLABS : OLD_REGIME_SLABS;
    const standardDeduction = regime === "NEW" ? STANDARD_DEDUCTION_NEW : STANDARD_DEDUCTION_OLD;
    const taxable = Math.max(0, annualCTC - standardDeduction);
    const tax = this.computeSlabTax(taxable, slabs);
    const cess = Math.round(tax * 0.04);
    return tax + cess;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private calculatePT(monthlyGross: number, state: string): number {
    const slabs = PT_SLABS[state] || PT_SLABS.DEFAULT;
    for (const slab of slabs) {
      if (monthlyGross >= slab.min && monthlyGross <= slab.max) {
        return slab.tax;
      }
    }
    return 0;
  }

  private computeSlabTax(taxableIncome: number, slabs: Array<{ min: number; max: number; rate: number }>): number {
    let tax = 0;
    let remaining = taxableIncome;

    for (const slab of slabs) {
      if (remaining <= 0) break;
      const slabWidth = slab.max === Infinity ? remaining : Math.min(remaining, slab.max - slab.min + 1);
      const taxInSlab = Math.round(slabWidth * (slab.rate / 100));
      tax += taxInSlab;
      remaining -= slabWidth;
    }

    return tax;
  }
}
