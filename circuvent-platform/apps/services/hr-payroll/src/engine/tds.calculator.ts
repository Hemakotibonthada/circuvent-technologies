// ──────────────────────────────────────────────────────────────
// Circuvent Platform — TDS (Tax Deducted at Source) Calculator
// Implements India Income Tax computation for New & Old regimes.
// FY 2025-26 slabs with Section 87A rebate, cess, surcharge.
// ──────────────────────────────────────────────────────────────

export interface TDSConfig {
  standardDeduction: number;    // ₹75,000 (New), ₹50,000 (Old)
  cessRate: number;             // 0.04 (4%)
  rebateLimit: number;          // ₹7,00,000 (New), ₹5,00,000 (Old)
  surchargeSlabs: { min: number; max: number; rate: number }[];
}

export interface TDSInput {
  annualGrossSalary: number;
  regime: "OLD" | "NEW";
  section80C?: number;          // Max ₹1,50,000
  section80D?: number;          // Max ₹25,000 / ₹50,000
  section24?: number;           // Home loan interest
  hraExemption?: number;
  npsEmployeeContribution?: number; // 80CCD(1B) — max ₹50,000
  otherDeductions?: number;
}

export interface TDSResult {
  regime: "OLD" | "NEW";
  grossSalary: number;
  standardDeduction: number;
  totalExemptions: number;
  taxableIncome: number;
  taxOnIncome: number;
  surcharge: number;
  cess: number;
  totalTax: number;
  rebateApplied: boolean;
  rebateAmount: number;
  netTax: number;
  monthlyTDS: number;
  effectiveRate: number;
  slabBreakdown: { slab: string; taxableInSlab: number; rate: number; tax: number }[];
}

// FY 2025-26 New Tax Regime Slabs
const NEW_REGIME_SLABS = [
  { min: 0,       max: 400000,  rate: 0 },
  { min: 400001,  max: 800000,  rate: 0.05 },
  { min: 800001,  max: 1200000, rate: 0.10 },
  { min: 1200001, max: 1600000, rate: 0.15 },
  { min: 1600001, max: 2000000, rate: 0.20 },
  { min: 2000001, max: 2400000, rate: 0.25 },
  { min: 2400001, max: Infinity, rate: 0.30 },
];

// FY 2025-26 Old Tax Regime Slabs
const OLD_REGIME_SLABS = [
  { min: 0,       max: 250000,  rate: 0 },
  { min: 250001,  max: 500000,  rate: 0.05 },
  { min: 500001,  max: 1000000, rate: 0.20 },
  { min: 1000001, max: Infinity, rate: 0.30 },
];

const SURCHARGE_SLABS = [
  { min: 0,        max: 5000000,   rate: 0 },
  { min: 5000001,  max: 10000000,  rate: 0.10 },
  { min: 10000001, max: 20000000,  rate: 0.15 },
  { min: 20000001, max: 50000000,  rate: 0.25 },
  { min: 50000001, max: Infinity,  rate: 0.37 },
];

const NEW_REGIME_SURCHARGE_SLABS = [
  { min: 0,        max: 5000000,   rate: 0 },
  { min: 5000001,  max: 10000000,  rate: 0.10 },
  { min: 10000001, max: 20000000,  rate: 0.15 },
  { min: 20000001, max: Infinity,  rate: 0.25 }, // Capped at 25% for new regime
];

export function calculateTDS(input: TDSInput): TDSResult {
  const isNewRegime = input.regime === "NEW";
  const slabs = isNewRegime ? NEW_REGIME_SLABS : OLD_REGIME_SLABS;

  // Standard deduction
  const standardDeduction = isNewRegime ? 75000 : 50000;

  // Exemptions / deductions (only for Old Regime)
  let totalExemptions = 0;
  if (!isNewRegime) {
    totalExemptions =
      Math.min(input.section80C || 0, 150000) +
      Math.min(input.section80D || 0, 50000) +
      (input.section24 || 0) +
      (input.hraExemption || 0) +
      Math.min(input.npsEmployeeContribution || 0, 50000) +
      (input.otherDeductions || 0);
  }

  // Taxable income
  const taxableIncome = Math.max(0, input.annualGrossSalary - standardDeduction - totalExemptions);

  // Calculate tax slab-wise
  let taxOnIncome = 0;
  const slabBreakdown: TDSResult["slabBreakdown"] = [];

  for (const slab of slabs) {
    if (taxableIncome <= slab.min) break;

    const effectiveMax = slab.max === Infinity ? taxableIncome : slab.max;
    const taxableInSlab = Math.min(taxableIncome, effectiveMax) - slab.min + (slab.min === 0 ? 0 : 0);
    const actualTaxableInSlab = Math.max(0, Math.min(taxableIncome - slab.min + 1, effectiveMax - slab.min + 1));

    if (actualTaxableInSlab > 0) {
      const tax = Math.round(actualTaxableInSlab * slab.rate);
      taxOnIncome += tax;
      slabBreakdown.push({
        slab: slab.max === Infinity ? `Above ₹${(slab.min - 1).toLocaleString("en-IN")}` : `₹${slab.min.toLocaleString("en-IN")} - ₹${slab.max.toLocaleString("en-IN")}`,
        taxableInSlab: actualTaxableInSlab,
        rate: slab.rate,
        tax,
      });
    }
  }

  // Section 87A Rebate
  const rebateLimit = isNewRegime ? 700000 : 500000;
  let rebateAmount = 0;
  let rebateApplied = false;

  if (taxableIncome <= rebateLimit) {
    rebateAmount = Math.min(taxOnIncome, isNewRegime ? 25000 : 12500);
    rebateApplied = true;
  }

  const taxAfterRebate = Math.max(0, taxOnIncome - rebateAmount);

  // Surcharge
  const surchargeSlabs = isNewRegime ? NEW_REGIME_SURCHARGE_SLABS : SURCHARGE_SLABS;
  let surchargeRate = 0;
  for (const slab of surchargeSlabs) {
    if (taxableIncome >= slab.min && taxableIncome <= (slab.max === Infinity ? Infinity : slab.max)) {
      surchargeRate = slab.rate;
      break;
    }
  }
  const surcharge = Math.round(taxAfterRebate * surchargeRate);

  // Marginal relief for surcharge (simplified)
  // If income just crosses surcharge threshold, limit surcharge

  // Health & Education Cess: 4%
  const cess = Math.round((taxAfterRebate + surcharge) * 0.04);

  const totalTax = taxOnIncome;
  const netTax = Math.max(0, taxAfterRebate + surcharge + cess);
  const monthlyTDS = Math.round(netTax / 12);
  const effectiveRate = input.annualGrossSalary > 0
    ? Math.round((netTax / input.annualGrossSalary) * 10000) / 100
    : 0;

  return {
    regime: input.regime,
    grossSalary: input.annualGrossSalary,
    standardDeduction,
    totalExemptions,
    taxableIncome,
    taxOnIncome,
    surcharge,
    cess,
    totalTax,
    rebateApplied,
    rebateAmount,
    netTax,
    monthlyTDS,
    effectiveRate,
    slabBreakdown,
  };
}

export function compareRegimes(annualGross: number, deductions?: Partial<TDSInput>): {
  newRegime: TDSResult;
  oldRegime: TDSResult;
  recommendation: "NEW" | "OLD";
  savings: number;
} {
  const newRegime = calculateTDS({ ...deductions, annualGrossSalary: annualGross, regime: "NEW" });
  const oldRegime = calculateTDS({ ...deductions, annualGrossSalary: annualGross, regime: "OLD" });

  const savings = Math.abs(newRegime.netTax - oldRegime.netTax);
  const recommendation = newRegime.netTax <= oldRegime.netTax ? "NEW" : "OLD";

  return { newRegime, oldRegime, recommendation, savings };
}
