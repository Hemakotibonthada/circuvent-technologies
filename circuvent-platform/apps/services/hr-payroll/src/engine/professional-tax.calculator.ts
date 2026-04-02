// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Professional Tax Calculator
// State-wise monthly PT slabs for India.
// Covers Karnataka, Maharashtra, Gujarat, Telangana, etc.
// ──────────────────────────────────────────────────────────────

export interface PTSlab {
  minSalary: number;
  maxSalary: number;
  monthlyTax: number;
}

export interface PTResult {
  state: string;
  grossSalary: number;
  monthlyTax: number;
  annualTax: number;
  slabApplied: string;
}

// State-wise Professional Tax slabs (FY 2025-26)
const PT_SLABS: Record<string, PTSlab[]> = {
  Karnataka: [
    { minSalary: 0,     maxSalary: 15000,  monthlyTax: 0 },
    { minSalary: 15001, maxSalary: 25000,  monthlyTax: 200 },
    { minSalary: 25001, maxSalary: Infinity, monthlyTax: 200 },
    // Feb month: ₹300 to make annual ₹2,500
  ],
  Maharashtra: [
    { minSalary: 0,     maxSalary: 7500,   monthlyTax: 0 },
    { minSalary: 7501,  maxSalary: 10000,  monthlyTax: 175 },
    { minSalary: 10001, maxSalary: Infinity, monthlyTax: 200 },
    // Feb: ₹300 for > ₹10,000
  ],
  "Andhra Pradesh": [
    { minSalary: 0,     maxSalary: 15000,  monthlyTax: 0 },
    { minSalary: 15001, maxSalary: 20000,  monthlyTax: 150 },
    { minSalary: 20001, maxSalary: Infinity, monthlyTax: 200 },
  ],
  Telangana: [
    { minSalary: 0,     maxSalary: 15000,  monthlyTax: 0 },
    { minSalary: 15001, maxSalary: 20000,  monthlyTax: 150 },
    { minSalary: 20001, maxSalary: Infinity, monthlyTax: 200 },
  ],
  Gujarat: [
    { minSalary: 0,     maxSalary: 5999,   monthlyTax: 0 },
    { minSalary: 6000,  maxSalary: 8999,   monthlyTax: 80 },
    { minSalary: 9000,  maxSalary: 11999,  monthlyTax: 150 },
    { minSalary: 12000, maxSalary: Infinity, monthlyTax: 200 },
  ],
  "West Bengal": [
    { minSalary: 0,     maxSalary: 10000,  monthlyTax: 0 },
    { minSalary: 10001, maxSalary: 15000,  monthlyTax: 110 },
    { minSalary: 15001, maxSalary: 25000,  monthlyTax: 130 },
    { minSalary: 25001, maxSalary: 40000,  monthlyTax: 150 },
    { minSalary: 40001, maxSalary: Infinity, monthlyTax: 200 },
  ],
  "Tamil Nadu": [
    { minSalary: 0,     maxSalary: 21000,  monthlyTax: 0 },
    { minSalary: 21001, maxSalary: 30000,  monthlyTax: 100 },
    { minSalary: 30001, maxSalary: 45000,  monthlyTax: 235 },
    { minSalary: 45001, maxSalary: 60000,  monthlyTax: 510 },
    { minSalary: 60001, maxSalary: 75000,  monthlyTax: 760 },
    { minSalary: 75001, maxSalary: Infinity, monthlyTax: 1095 },
  ],
  Delhi: [
    // Delhi does not levy Professional Tax
    { minSalary: 0, maxSalary: Infinity, monthlyTax: 0 },
  ],
};

// Default for states without specific slabs
const DEFAULT_PT_SLABS: PTSlab[] = [
  { minSalary: 0,     maxSalary: 10000,   monthlyTax: 0 },
  { minSalary: 10001, maxSalary: 15000,   monthlyTax: 150 },
  { minSalary: 15001, maxSalary: Infinity, monthlyTax: 200 },
];

export function calculateProfessionalTax(
  monthlySalary: number,
  state: string,
  month?: number // 1-12, for Feb adjustment
): PTResult {
  const slabs = PT_SLABS[state] || DEFAULT_PT_SLABS;

  let monthlyTax = 0;
  let slabApplied = "Exempt";

  for (const slab of slabs) {
    if (monthlySalary >= slab.minSalary && monthlySalary <= (slab.maxSalary === Infinity ? Infinity : slab.maxSalary)) {
      monthlyTax = slab.monthlyTax;
      slabApplied = slab.maxSalary === Infinity
        ? `₹${slab.minSalary.toLocaleString("en-IN")}+`
        : `₹${slab.minSalary.toLocaleString("en-IN")} - ₹${slab.maxSalary.toLocaleString("en-IN")}`;
      break;
    }
  }

  // February adjustment for Karnataka/Maharashtra to hit ₹2,500 annual cap
  const isAdjustmentMonth = month === 2;
  const maxAnnualPT = 2500;

  if (isAdjustmentMonth && monthlyTax > 0 && (state === "Karnataka" || state === "Maharashtra")) {
    const normalMonthsTotal = monthlyTax * 11;
    const remaining = maxAnnualPT - normalMonthsTotal;
    monthlyTax = Math.max(0, remaining);
  }

  const annualTax = Math.min(monthlyTax * 12, maxAnnualPT);

  return {
    state,
    grossSalary: monthlySalary,
    monthlyTax,
    annualTax,
    slabApplied,
  };
}

export function getSupportedStates(): string[] {
  return Object.keys(PT_SLABS);
}
