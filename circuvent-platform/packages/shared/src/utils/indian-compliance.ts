// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Indian Statutory Compliance Utilities
// Income Tax (Old & New Regime FY 2025-26), EPF, ESI,
// Professional Tax, Gratuity, Bonus, HRA, LTA, TDS,
// PAN/Aadhaar/GSTIN validation, minimum wages.
// ──────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

type TaxRegime = "OLD" | "NEW";
type SkillLevel = "UNSKILLED" | "SEMI_SKILLED" | "SKILLED" | "HIGHLY_SKILLED";

interface TaxSlab {
  from: number;
  to: number;
  rate: number;
}

interface TaxBreakdown {
  regime: TaxRegime;
  grossIncome: number;
  taxableIncome: number;
  slabs: Array<{ slab: string; taxableAmount: number; tax: number }>;
  totalTax: number;
  surcharge: number;
  cess: number;
  totalTaxLiability: number;
}

interface EPFContribution {
  employeeShare: number;
  employerEPF: number;
  employerEPS: number;
  totalEmployer: number;
  total: number;
  rate: { employee: number; employerEPF: number; employerEPS: number };
}

interface ESIContribution {
  applicable: boolean;
  employeeShare: number;
  employerShare: number;
  total: number;
  rate: { employee: number; employer: number };
}

interface HRAExemption {
  actualHRAPaid: number;
  rentPaidMinus10: number;
  percentOfBasic: number;
  exemption: number;
  taxableHRA: number;
}

interface TDSResult {
  section: string;
  grossAmount: number;
  tdsRate: number;
  tdsAmount: number;
  netAmount: number;
}

// ══════════════════════════════════════════════════════════════
// Income Tax — FY 2025-26 (AY 2026-27)
// ══════════════════════════════════════════════════════════════

const OLD_REGIME_SLABS: TaxSlab[] = [
  { from: 0, to: 250000, rate: 0 },
  { from: 250001, to: 500000, rate: 5 },
  { from: 500001, to: 1000000, rate: 20 },
  { from: 1000001, to: Infinity, rate: 30 },
];

const NEW_REGIME_SLABS: TaxSlab[] = [
  { from: 0, to: 400000, rate: 0 },
  { from: 400001, to: 800000, rate: 5 },
  { from: 800001, to: 1200000, rate: 10 },
  { from: 1200001, to: 1600000, rate: 15 },
  { from: 1600001, to: 2000000, rate: 20 },
  { from: 2000001, to: 2400000, rate: 25 },
  { from: 2400001, to: Infinity, rate: 30 },
];

export function calculateIncomeTax(income: number, regime: TaxRegime): TaxBreakdown {
  const slabs = regime === "OLD" ? OLD_REGIME_SLABS : NEW_REGIME_SLABS;
  const standardDeduction = regime === "NEW" ? 75000 : 50000;
  const taxableIncome = Math.max(0, income - standardDeduction);

  const slabResults: TaxBreakdown["slabs"] = [];
  let totalTax = 0;

  for (const slab of slabs) {
    if (taxableIncome <= slab.from) break;
    const taxable = Math.min(taxableIncome, slab.to) - slab.from + (slab.from === 0 ? 0 : 0);
    const amount = Math.min(taxableIncome - slab.from, (slab.to === Infinity ? taxableIncome : slab.to) - slab.from);
    if (amount <= 0) continue;

    const tax = (amount * slab.rate) / 100;
    totalTax += tax;

    slabResults.push({
      slab: `₹${slab.from.toLocaleString("en-IN")} - ₹${slab.to === Infinity ? "Above" : slab.to.toLocaleString("en-IN")}`,
      taxableAmount: Math.round(amount),
      tax: Math.round(tax),
    });
  }

  // Rebate u/s 87A — New regime: up to ₹60,000 rebate if income ≤ ₹12,00,000
  if (regime === "NEW" && taxableIncome <= 1200000) {
    totalTax = 0;
  }
  // Old regime: up to ₹12,500 rebate if income ≤ ₹5,00,000
  if (regime === "OLD" && taxableIncome <= 500000) {
    totalTax = 0;
  }

  // Surcharge
  let surcharge = 0;
  if (taxableIncome > 50000000) surcharge = totalTax * 0.37;
  else if (taxableIncome > 20000000) surcharge = totalTax * 0.25;
  else if (taxableIncome > 10000000) surcharge = totalTax * 0.15;
  else if (taxableIncome > 5000000) surcharge = totalTax * 0.10;

  // Health & Education Cess — 4%
  const cess = (totalTax + surcharge) * 0.04;

  return {
    regime,
    grossIncome: income,
    taxableIncome: Math.round(taxableIncome),
    slabs: slabResults,
    totalTax: Math.round(totalTax),
    surcharge: Math.round(surcharge),
    cess: Math.round(cess),
    totalTaxLiability: Math.round(totalTax + surcharge + cess),
  };
}

// ══════════════════════════════════════════════════════════════
// EPF (Employees' Provident Fund)
// ══════════════════════════════════════════════════════════════

export function calculateEPFContribution(basic: number): EPFContribution {
  const epfWage = Math.min(basic, 15000); // Statutory ceiling

  const employeeRate = 12;
  const employerEPFRate = 3.67;
  const employerEPSRate = 8.33;

  const employeeShare = Math.round((basic * employeeRate) / 100);
  const employerEPF = Math.round((basic * employerEPFRate) / 100);
  const employerEPS = Math.round((epfWage * employerEPSRate) / 100);

  return {
    employeeShare,
    employerEPF,
    employerEPS,
    totalEmployer: employerEPF + employerEPS,
    total: employeeShare + employerEPF + employerEPS,
    rate: { employee: employeeRate, employerEPF: employerEPFRate, employerEPS: employerEPSRate },
  };
}

// ══════════════════════════════════════════════════════════════
// ESI (Employees' State Insurance)
// ══════════════════════════════════════════════════════════════

export function calculateESIContribution(gross: number): ESIContribution {
  const applicable = gross <= 21000;
  if (!applicable) {
    return { applicable: false, employeeShare: 0, employerShare: 0, total: 0, rate: { employee: 0.75, employer: 3.25 } };
  }

  const employeeRate = 0.75;
  const employerRate = 3.25;
  const employeeShare = Math.round((gross * employeeRate) / 100);
  const employerShare = Math.round((gross * employerRate) / 100);

  return {
    applicable: true,
    employeeShare,
    employerShare,
    total: employeeShare + employerShare,
    rate: { employee: employeeRate, employer: employerRate },
  };
}

// ══════════════════════════════════════════════════════════════
// Professional Tax — State-wise
// ══════════════════════════════════════════════════════════════

const PT_RATES: Record<string, Array<{ upTo: number; tax: number }>> = {
  MAHARASHTRA: [
    { upTo: 7500, tax: 0 },
    { upTo: 10000, tax: 175 },
    { upTo: Infinity, tax: 200 }, // ₹300 in Feb
  ],
  KARNATAKA: [
    { upTo: 15000, tax: 0 },
    { upTo: 25000, tax: 200 },
    { upTo: Infinity, tax: 200 },
  ],
  TELANGANA: [
    { upTo: 15000, tax: 0 },
    { upTo: 20000, tax: 150 },
    { upTo: Infinity, tax: 200 },
  ],
  ANDHRA_PRADESH: [
    { upTo: 15000, tax: 0 },
    { upTo: 20000, tax: 150 },
    { upTo: Infinity, tax: 200 },
  ],
  WEST_BENGAL: [
    { upTo: 10000, tax: 0 },
    { upTo: 15000, tax: 110 },
    { upTo: 25000, tax: 130 },
    { upTo: 40000, tax: 150 },
    { upTo: Infinity, tax: 200 },
  ],
  TAMIL_NADU: [
    { upTo: 21000, tax: 0 },
    { upTo: 30000, tax: 135 },
    { upTo: 45000, tax: 315 },
    { upTo: 60000, tax: 690 },
    { upTo: 75000, tax: 1025 },
    { upTo: Infinity, tax: 1250 },
  ],
  GUJARAT: [
    { upTo: 6000, tax: 0 },
    { upTo: 9000, tax: 80 },
    { upTo: 12000, tax: 150 },
    { upTo: Infinity, tax: 200 },
  ],
  MADHYA_PRADESH: [
    { upTo: 18750, tax: 0 },
    { upTo: 25000, tax: 125 },
    { upTo: Infinity, tax: 208 },
  ],
  KERALA: [
    { upTo: 12000, tax: 0 },
    { upTo: 18000, tax: 120 },
    { upTo: 25000, tax: 180 },
    { upTo: 30000, tax: 250 },
    { upTo: Infinity, tax: 250 },
  ],
};

export function calculateProfessionalTax(state: string, gross: number): number {
  const stateKey = state.toUpperCase().replace(/\s+/g, "_");
  const rates = PT_RATES[stateKey];
  if (!rates) return 0; // States like Delhi, Haryana don't levy PT

  for (const slab of rates) {
    if (gross <= slab.upTo) {
      return slab.tax;
    }
  }
  return rates[rates.length - 1].tax;
}

// ══════════════════════════════════════════════════════════════
// Gratuity — Payment of Gratuity Act, 1972
// ══════════════════════════════════════════════════════════════

export function calculateGratuity(lastBasicPlusDa: number, yearsOfService: number): number {
  if (yearsOfService < 5) return 0;
  // Formula: (Last Basic + DA) × 15/26 × Years of Service
  const gratuity = (lastBasicPlusDa * 15 * yearsOfService) / 26;
  // Max ceiling: ₹25,00,000
  return Math.round(Math.min(gratuity, 2500000));
}

// ══════════════════════════════════════════════════════════════
// Bonus — Payment of Bonus Act, 1965
// ══════════════════════════════════════════════════════════════

export function calculateBonus(salary: number, yearsOfService: number): number {
  if (yearsOfService < 1) return 0;
  // Minimum bonus: 8.33% of salary (capped at ₹7,000/month or actual salary)
  const cappedSalary = Math.min(salary, 7000);
  const minBonus = Math.round((cappedSalary * 8.33) / 100);
  // Maximum bonus: 20% of salary
  const maxBonus = Math.round((cappedSalary * 20) / 100);

  return minBonus; // Return statutory minimum; actual depends on company profits
}

// ══════════════════════════════════════════════════════════════
// Minimum Wages — Central Advisory Board (indicative)
// ══════════════════════════════════════════════════════════════

const MINIMUM_WAGES: Record<string, Record<SkillLevel, number>> = {
  DELHI: { UNSKILLED: 17494, SEMI_SKILLED: 19279, SKILLED: 21215, HIGHLY_SKILLED: 23428 },
  MAHARASHTRA: { UNSKILLED: 13200, SEMI_SKILLED: 14400, SKILLED: 15600, HIGHLY_SKILLED: 18000 },
  KARNATAKA: { UNSKILLED: 12000, SEMI_SKILLED: 13500, SKILLED: 15000, HIGHLY_SKILLED: 17000 },
  TAMIL_NADU: { UNSKILLED: 11200, SEMI_SKILLED: 12800, SKILLED: 14500, HIGHLY_SKILLED: 16000 },
  TELANGANA: { UNSKILLED: 12500, SEMI_SKILLED: 14000, SKILLED: 15500, HIGHLY_SKILLED: 17500 },
  KERALA: { UNSKILLED: 13000, SEMI_SKILLED: 14500, SKILLED: 16000, HIGHLY_SKILLED: 18000 },
  WEST_BENGAL: { UNSKILLED: 10500, SEMI_SKILLED: 12000, SKILLED: 13500, HIGHLY_SKILLED: 15500 },
  GUJARAT: { UNSKILLED: 11800, SEMI_SKILLED: 13200, SKILLED: 14800, HIGHLY_SKILLED: 16500 },
  RAJASTHAN: { UNSKILLED: 11000, SEMI_SKILLED: 12500, SKILLED: 14000, HIGHLY_SKILLED: 16000 },
  UTTAR_PRADESH: { UNSKILLED: 10500, SEMI_SKILLED: 11800, SKILLED: 13200, HIGHLY_SKILLED: 15000 },
};

export function getMinimumWage(state: string, skillLevel: SkillLevel): number {
  const stateKey = state.toUpperCase().replace(/\s+/g, "_");
  return MINIMUM_WAGES[stateKey]?.[skillLevel] ?? 10000; // Central default
}

// ══════════════════════════════════════════════════════════════
// HRA Exemption — Section 10(13A)
// ══════════════════════════════════════════════════════════════

export function calculateHRA(
  basicSalary: number,
  isMetro: boolean,
  rentPaid: number,
): HRAExemption {
  // Least of:
  // 1. Actual HRA received (assumed 50% or 40% of basic)
  const hraPercent = isMetro ? 50 : 40;
  const actualHRAPaid = Math.round((basicSalary * hraPercent) / 100);

  // 2. Rent paid - 10% of basic
  const rentPaidMinus10 = Math.max(0, rentPaid - Math.round(basicSalary * 0.10));

  // 3. 50% of basic (metro) or 40% (non-metro)
  const percentOfBasic = Math.round((basicSalary * hraPercent) / 100);

  const exemption = Math.min(actualHRAPaid, rentPaidMinus10, percentOfBasic);
  const taxableHRA = actualHRAPaid - exemption;

  return { actualHRAPaid, rentPaidMinus10, percentOfBasic, exemption, taxableHRA };
}

// ══════════════════════════════════════════════════════════════
// LTA (Leave Travel Allowance)
// ══════════════════════════════════════════════════════════════

export function calculateLTA(amount: number, claimsInBlock: number): { exemption: number; taxable: number } {
  // LTA exempt for max 2 journeys in a 4-year block
  if (claimsInBlock >= 2) {
    return { exemption: 0, taxable: amount };
  }
  return { exemption: amount, taxable: 0 };
}

// ══════════════════════════════════════════════════════════════
// Validators
// ══════════════════════════════════════════════════════════════

export function validatePAN(pan: string): boolean {
  // PAN: 5 letters + 4 digits + 1 letter
  // 4th char indicates type: C=Company, P=Person, H=HUF, etc.
  return /^[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]$/.test(pan.toUpperCase());
}

export function validateAadhaar(aadhaar: string): boolean {
  // 12-digit number, can't start with 0 or 1
  const cleaned = aadhaar.replace(/\s+/g, "");
  if (!/^[2-9]\d{11}$/.test(cleaned)) return false;

  // Verhoeff checksum validation
  return verhoeffCheck(cleaned);
}

export function validateGSTIN(gstin: string): boolean {
  // 15 characters: 2 state code + 10 PAN + 1 entity + 1 'Z' + 1 checksum
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][A-Z\d]$/.test(gstin.toUpperCase())) return false;

  const stateCode = parseInt(gstin.slice(0, 2), 10);
  return stateCode >= 1 && stateCode <= 37;
}

// ══════════════════════════════════════════════════════════════
// Indian States & UTs
// ══════════════════════════════════════════════════════════════

export function getIndianStates(): Array<{ code: string; name: string; type: "STATE" | "UT" }> {
  return [
    { code: "AP", name: "Andhra Pradesh", type: "STATE" },
    { code: "AR", name: "Arunachal Pradesh", type: "STATE" },
    { code: "AS", name: "Assam", type: "STATE" },
    { code: "BR", name: "Bihar", type: "STATE" },
    { code: "CG", name: "Chhattisgarh", type: "STATE" },
    { code: "GA", name: "Goa", type: "STATE" },
    { code: "GJ", name: "Gujarat", type: "STATE" },
    { code: "HR", name: "Haryana", type: "STATE" },
    { code: "HP", name: "Himachal Pradesh", type: "STATE" },
    { code: "JH", name: "Jharkhand", type: "STATE" },
    { code: "KA", name: "Karnataka", type: "STATE" },
    { code: "KL", name: "Kerala", type: "STATE" },
    { code: "MP", name: "Madhya Pradesh", type: "STATE" },
    { code: "MH", name: "Maharashtra", type: "STATE" },
    { code: "MN", name: "Manipur", type: "STATE" },
    { code: "ML", name: "Meghalaya", type: "STATE" },
    { code: "MZ", name: "Mizoram", type: "STATE" },
    { code: "NL", name: "Nagaland", type: "STATE" },
    { code: "OD", name: "Odisha", type: "STATE" },
    { code: "PB", name: "Punjab", type: "STATE" },
    { code: "RJ", name: "Rajasthan", type: "STATE" },
    { code: "SK", name: "Sikkim", type: "STATE" },
    { code: "TN", name: "Tamil Nadu", type: "STATE" },
    { code: "TS", name: "Telangana", type: "STATE" },
    { code: "TR", name: "Tripura", type: "STATE" },
    { code: "UK", name: "Uttarakhand", type: "STATE" },
    { code: "UP", name: "Uttar Pradesh", type: "STATE" },
    { code: "WB", name: "West Bengal", type: "STATE" },
    { code: "AN", name: "Andaman and Nicobar Islands", type: "UT" },
    { code: "CH", name: "Chandigarh", type: "UT" },
    { code: "DN", name: "Dadra and Nagar Haveli and Daman and Diu", type: "UT" },
    { code: "DL", name: "Delhi", type: "UT" },
    { code: "JK", name: "Jammu and Kashmir", type: "UT" },
    { code: "LA", name: "Ladakh", type: "UT" },
    { code: "LD", name: "Lakshadweep", type: "UT" },
    { code: "PY", name: "Puducherry", type: "UT" },
  ];
}

// ══════════════════════════════════════════════════════════════
// TDS — Tax Deducted at Source
// ══════════════════════════════════════════════════════════════

const TDS_RATES: Record<string, { rate: number; description: string }> = {
  "192": { rate: 0, description: "Salary" }, // As per slab rates
  "194A": { rate: 10, description: "Interest other than on securities" },
  "194B": { rate: 30, description: "Lottery / Crossword puzzles" },
  "194C": { rate: 1, description: "Payment to contractor (Individual)" },
  "194C_COMPANY": { rate: 2, description: "Payment to contractor (Company)" },
  "194H": { rate: 5, description: "Commission / Brokerage" },
  "194I_LAND": { rate: 10, description: "Rent — land/building/furniture" },
  "194I_PLANT": { rate: 2, description: "Rent — plant/machinery/equipment" },
  "194J_PROFESSIONAL": { rate: 10, description: "Professional fees" },
  "194J_TECHNICAL": { rate: 2, description: "Technical services / royalty" },
  "194N": { rate: 2, description: "Cash withdrawal > ₹1 crore" },
  "194O": { rate: 1, description: "E-commerce participant" },
  "195": { rate: 20, description: "Payment to NRI (default)" },
};

export function calculateTDS(income: number, section: string): TDSResult {
  const rule = TDS_RATES[section];
  if (!rule) {
    return { section, grossAmount: income, tdsRate: 10, tdsAmount: Math.round(income * 0.10), netAmount: Math.round(income * 0.90) };
  }

  const tdsAmount = Math.round((income * rule.rate) / 100);
  return {
    section,
    grossAmount: income,
    tdsRate: rule.rate,
    tdsAmount,
    netAmount: income - tdsAmount,
  };
}

// ══════════════════════════════════════════════════════════════
// Leave Encashment
// ══════════════════════════════════════════════════════════════

export function calculateLeaveEncashment(
  basicPlusDa: number,
  leaveBalance: number,
  maxDays: number,
): { days: number; amount: number; taxExempt: number } {
  const daysToEncash = Math.min(leaveBalance, maxDays);
  const dailyRate = basicPlusDa / 30;
  const amount = Math.round(dailyRate * daysToEncash);

  // Tax exemption: Least of
  // 1. Actual encashment amount
  // 2. 10 months' average basic
  // 3. Cash equivalent of earned leave (max 30 days per year)
  // 4. ₹25,00,000 (as per Budget 2023)
  const tenMonths = Math.round(basicPlusDa * 10);
  const taxExempt = Math.min(amount, tenMonths, 2500000);

  return { days: daysToEncash, amount, taxExempt };
}

// ══════════════════════════════════════════════════════════════
// Verhoeff Algorithm (for Aadhaar validation)
// ══════════════════════════════════════════════════════════════

const VERHOEFF_D: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

function verhoeffCheck(num: string): boolean {
  let c = 0;
  const digits = num.split("").reverse().map(Number);
  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digits[i]]];
  }
  return c === 0;
}
