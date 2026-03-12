// ──────────────────────────────────────────────────────────────
// Payroll Calculation Engine — Framework-agnostic Indian payroll
// computation ported from HT repo. Computes CTC breakdown,
// earnings, statutory deductions (EPF, PT, TDS), and generates
// deterministic payslip data from employee profiles and
// timesheet summaries.
// ──────────────────────────────────────────────────────────────

export type TaxRegime = "old" | "new" | "unspecified";

export interface MandatoryDeductions {
  uan: string;
  pan: string;
  taxRegime: TaxRegime;
}

export interface EmployeeProfile {
  employeeId: number | string;
  annualCTC: number;
  mandatoryDeductions: MandatoryDeductions;
}

export interface TimesheetSummary {
  totalWorkDays: number;
  totalLOPDays: number;
  totalPaidLeaveDays: number;
  totalDaysInMonth: number;
}

export interface EarningsComponent {
  component: string;
  amount: number;
}

export interface DeductionComponent {
  component: string;
  amount: number;
}

export interface PayslipDetail {
  employeeId: EmployeeProfile["employeeId"];
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  earningsBreakdown: EarningsComponent[];
  deductionBreakdown: DeductionComponent[];
  metadata: {
    payableDays: number;
    lopDays: number;
    totalDaysInMonth: number;
    monthlyCtc: number;
    taxRegime: TaxRegime;
  };
}

interface GrossPayResult {
  grossPay: number;
  earningsBreakdown: EarningsComponent[];
  basicPay: number;
  payableDays: number;
  monthlyCtc: number;
}

interface DeductionResult {
  totalDeductions: number;
  deductionBreakdown: DeductionComponent[];
}

const roundToTwo = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

const clampToNonNegative = (value: number): number => (value < 0 ? 0 : value);

// ── Salary Breakup (Indian standard ratios) ─────────────────
const SALARY_BREAKUP: Array<{ component: string; ratio: number }> = [
  { component: "Basic Pay", ratio: 0.45 },
  { component: "House Rent Allowance (HRA)", ratio: 0.20 },
  { component: "Special Allowance", ratio: 0.15 },
  { component: "Conveyance Allowance", ratio: 0.10 },
  { component: "Leave Travel Allowance", ratio: 0.05 },
  { component: "Performance Bonus", ratio: 0.05 },
];

// ── Statutory Constants ─────────────────────────────────────
const PF_CONTRIBUTION_RATE = 0.12;
const PF_MONTHLY_CAP = 1800;
const PROFESSIONAL_TAX_THRESHOLD = 15000;
const PROFESSIONAL_TAX_FLAT = 200;
const TDS_MONTHLY_EXEMPTION = 20000;
const TDS_RATE = 0.10;

// ── Gross Pay Calculator ────────────────────────────────────
export const calculateGrossPay = (
  profile: EmployeeProfile,
  summary: TimesheetSummary,
): GrossPayResult => {
  const totalDays = clampToNonNegative(summary.totalDaysInMonth);
  const monthlyCtc = totalDays > 0 ? roundToTwo(profile.annualCTC / 12) : 0;

  if (totalDays === 0 || monthlyCtc <= 0) {
    return {
      grossPay: 0,
      earningsBreakdown: SALARY_BREAKUP.map((item) => ({ component: item.component, amount: 0 })),
      basicPay: 0,
      payableDays: 0,
      monthlyCtc,
    };
  }

  const payableDaysRaw = clampToNonNegative(summary.totalWorkDays + summary.totalPaidLeaveDays);
  const payableDays = Math.min(payableDaysRaw, totalDays);
  const payRatio = payableDays / totalDays;
  const grossPay = roundToTwo(monthlyCtc * payRatio);

  let allocated = 0;
  const earningsBreakdown = SALARY_BREAKUP.map((item, index) => {
    let amount = roundToTwo(grossPay * item.ratio);
    if (index === SALARY_BREAKUP.length - 1) {
      amount = roundToTwo(grossPay - allocated);
    }
    allocated = roundToTwo(allocated + amount);
    return { component: item.component, amount };
  });

  const basicPayComponent = earningsBreakdown.find((item) => item.component === "Basic Pay");
  const basicPay = basicPayComponent?.amount ?? roundToTwo(grossPay * SALARY_BREAKUP[0]!.ratio);

  return { grossPay, earningsBreakdown, basicPay, payableDays, monthlyCtc };
};

// ── Deduction Calculator ────────────────────────────────────
export const calculateDeductions = (grossPay: number, basicPay: number): DeductionResult => {
  const eligibleBasic = clampToNonNegative(basicPay);
  const eligibleGross = clampToNonNegative(grossPay);

  const employeePf = roundToTwo(Math.min(eligibleBasic * PF_CONTRIBUTION_RATE, PF_MONTHLY_CAP));
  const professionalTax = eligibleGross > PROFESSIONAL_TAX_THRESHOLD ? PROFESSIONAL_TAX_FLAT : 0;
  const taxablePortion = clampToNonNegative(eligibleGross - TDS_MONTHLY_EXEMPTION);
  const tds = roundToTwo(taxablePortion * TDS_RATE);

  const deductionBreakdown: DeductionComponent[] = [
    { component: "Employee Provident Fund (12% of Basic, capped at ₹1,800)", amount: employeePf },
    { component: "Professional Tax (flat when Gross > ₹15,000)", amount: roundToTwo(professionalTax) },
    { component: "Tax Deducted at Source (10% above monthly exemption)", amount: tds },
  ];

  const totalDeductions = roundToTwo(deductionBreakdown.reduce((sum, item) => sum + item.amount, 0));

  return { totalDeductions, deductionBreakdown };
};

// ── Payslip Generator ───────────────────────────────────────
export const generatePayslip = (profile: EmployeeProfile, summary: TimesheetSummary): PayslipDetail => {
  const grossResult = calculateGrossPay(profile, summary);
  const deductionResult = calculateDeductions(grossResult.grossPay, grossResult.basicPay);
  const netPay = roundToTwo(clampToNonNegative(grossResult.grossPay - deductionResult.totalDeductions));

  return {
    employeeId: profile.employeeId,
    grossPay: grossResult.grossPay,
    totalDeductions: deductionResult.totalDeductions,
    netPay,
    earningsBreakdown: grossResult.earningsBreakdown,
    deductionBreakdown: deductionResult.deductionBreakdown,
    metadata: {
      payableDays: grossResult.payableDays,
      lopDays: clampToNonNegative(summary.totalLOPDays),
      totalDaysInMonth: clampToNonNegative(summary.totalDaysInMonth),
      monthlyCtc: roundToTwo(profile.annualCTC / 12),
      taxRegime: profile.mandatoryDeductions.taxRegime,
    },
  };
};
