// ──────────────────────────────────────────────────────────────
// HR & Payroll — Indian Labor Law Compliance Service
// Validates employee data, salary structures, leave policies,
// and working conditions against Indian labour legislation:
//   - Minimum Wages Act, 1948
//   - Factories Act, 1948
//   - EPF & Miscellaneous Provisions Act, 1952
//   - ESI Act, 1948
//   - Payment of Gratuity Act, 1972
//   - Maternity Benefit Act, 1961
//   - Payment of Bonus Act, 1965
//   - Shop & Establishment Acts (state-wise)
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type ComplianceStatus = "PASS" | "FAIL" | "WARNING";

export interface ComplianceResult {
  rule: string;
  act: string;
  status: ComplianceStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface ComplianceReport {
  employeeId: string;
  employeeName: string;
  generatedAt: string;
  overallStatus: ComplianceStatus;
  passCount: number;
  failCount: number;
  warningCount: number;
  results: ComplianceResult[];
}

export interface EmployeeComplianceInput {
  id: string;
  name: string;
  gender: string;
  baseSalary: number;
  grossSalary: number;
  department: string;
  state: string;
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";
  joiningDate: Date;
  isPregnant?: boolean;
  hasChildren?: boolean;
  childCount?: number;
}

// ══════════════════════════════════════════════════════════════
// State Minimum Wages (Monthly, Unskilled — FY 2025-26)
// Source: Central/State Government Notifications
// ══════════════════════════════════════════════════════════════

const STATE_MINIMUM_WAGES: Record<string, { daily: number; monthly: number; effectiveFrom: string }> = {
  "Andhra Pradesh":    { daily: 485, monthly: 12610, effectiveFrom: "2025-04-01" },
  "Arunachal Pradesh": { daily: 380, monthly: 9880, effectiveFrom: "2025-04-01" },
  "Assam":             { daily: 397, monthly: 10322, effectiveFrom: "2025-04-01" },
  "Bihar":             { daily: 370, monthly: 9620, effectiveFrom: "2025-04-01" },
  "Chhattisgarh":      { daily: 391, monthly: 10166, effectiveFrom: "2025-04-01" },
  "Delhi":             { daily: 750, monthly: 19500, effectiveFrom: "2025-04-01" },
  "Goa":               { daily: 480, monthly: 12480, effectiveFrom: "2025-04-01" },
  "Gujarat":           { daily: 440, monthly: 11440, effectiveFrom: "2025-04-01" },
  "Haryana":           { daily: 433, monthly: 11258, effectiveFrom: "2025-04-01" },
  "Himachal Pradesh":  { daily: 400, monthly: 10400, effectiveFrom: "2025-04-01" },
  "Jharkhand":         { daily: 380, monthly: 9880, effectiveFrom: "2025-04-01" },
  "Karnataka":         { daily: 536, monthly: 13936, effectiveFrom: "2025-04-01" },
  "Kerala":            { daily: 600, monthly: 15600, effectiveFrom: "2025-04-01" },
  "Madhya Pradesh":    { daily: 390, monthly: 10140, effectiveFrom: "2025-04-01" },
  "Maharashtra":       { daily: 565, monthly: 14690, effectiveFrom: "2025-04-01" },
  "Manipur":           { daily: 375, monthly: 9750, effectiveFrom: "2025-04-01" },
  "Meghalaya":         { daily: 380, monthly: 9880, effectiveFrom: "2025-04-01" },
  "Mizoram":           { daily: 380, monthly: 9880, effectiveFrom: "2025-04-01" },
  "Nagaland":          { daily: 380, monthly: 9880, effectiveFrom: "2025-04-01" },
  "Odisha":            { daily: 385, monthly: 10010, effectiveFrom: "2025-04-01" },
  "Punjab":            { daily: 441, monthly: 11466, effectiveFrom: "2025-04-01" },
  "Rajasthan":         { daily: 420, monthly: 10920, effectiveFrom: "2025-04-01" },
  "Sikkim":            { daily: 400, monthly: 10400, effectiveFrom: "2025-04-01" },
  "Tamil Nadu":        { daily: 510, monthly: 13260, effectiveFrom: "2025-04-01" },
  "Telangana":         { daily: 490, monthly: 12740, effectiveFrom: "2025-04-01" },
  "Tripura":           { daily: 380, monthly: 9880, effectiveFrom: "2025-04-01" },
  "Uttar Pradesh":     { daily: 410, monthly: 10660, effectiveFrom: "2025-04-01" },
  "Uttarakhand":       { daily: 420, monthly: 10920, effectiveFrom: "2025-04-01" },
  "West Bengal":       { daily: 399, monthly: 10374, effectiveFrom: "2025-04-01" },
};

// ══════════════════════════════════════════════════════════════
// Compliance Checks
// ══════════════════════════════════════════════════════════════

/**
 * Check if salary meets the state minimum wage.
 */
export function checkMinimumWage(state: string, monthlySalary: number): ComplianceResult {
  const wages = STATE_MINIMUM_WAGES[state];
  if (!wages) {
    return {
      rule: "Minimum Wage Check",
      act: "Minimum Wages Act, 1948",
      status: "WARNING",
      message: `Minimum wage data not available for state: ${state}. Manual verification required.`,
      details: { state, salary: monthlySalary },
    };
  }

  if (monthlySalary >= wages.monthly) {
    return {
      rule: "Minimum Wage Check",
      act: "Minimum Wages Act, 1948",
      status: "PASS",
      message: `Salary ₹${monthlySalary.toLocaleString("en-IN")} meets minimum wage ₹${wages.monthly.toLocaleString("en-IN")} for ${state}.`,
      details: { state, salary: monthlySalary, minimumWage: wages.monthly, surplus: monthlySalary - wages.monthly },
    };
  }

  return {
    rule: "Minimum Wage Check",
    act: "Minimum Wages Act, 1948",
    status: "FAIL",
    message: `Salary ₹${monthlySalary.toLocaleString("en-IN")} is below minimum wage ₹${wages.monthly.toLocaleString("en-IN")} for ${state}.`,
    details: { state, salary: monthlySalary, minimumWage: wages.monthly, deficit: wages.monthly - monthlySalary },
  };
}

/**
 * Check overtime compliance under the Factories Act, 1948.
 * Max 48 hours/week, overtime at 2× rate, max 50 hours OT/quarter.
 */
export function checkOvertimeCompliance(
  weeklyHours: number,
  employmentType: string,
  quarterlyOvertimeHours: number = 0
): ComplianceResult {
  const MAX_WEEKLY_HOURS = 48;
  const MAX_QUARTERLY_OT = 50;

  if (employmentType === "INTERN") {
    return {
      rule: "Overtime Compliance",
      act: "Factories Act, 1948",
      status: weeklyHours <= MAX_WEEKLY_HOURS ? "PASS" : "FAIL",
      message: weeklyHours <= MAX_WEEKLY_HOURS
        ? "Intern working hours within limits."
        : "Interns should not work overtime. Weekly hours exceeded.",
      details: { weeklyHours, maxWeeklyHours: MAX_WEEKLY_HOURS },
    };
  }

  const issues: string[] = [];
  if (weeklyHours > MAX_WEEKLY_HOURS) {
    issues.push(`Weekly hours (${weeklyHours}) exceed ${MAX_WEEKLY_HOURS}h limit.`);
  }
  if (quarterlyOvertimeHours > MAX_QUARTERLY_OT) {
    issues.push(`Quarterly OT (${quarterlyOvertimeHours}h) exceeds ${MAX_QUARTERLY_OT}h cap.`);
  }

  return {
    rule: "Overtime Compliance",
    act: "Factories Act, 1948",
    status: issues.length === 0 ? "PASS" : "FAIL",
    message: issues.length === 0
      ? `Working hours compliant. Weekly: ${weeklyHours}h, Quarterly OT: ${quarterlyOvertimeHours}h.`
      : issues.join(" "),
    details: { weeklyHours, quarterlyOvertimeHours, MAX_WEEKLY_HOURS, MAX_QUARTERLY_OT },
  };
}

/**
 * Check leave entitlement compliance.
 * Minimum: 12 Earned Leave, 12 Casual Leave, 12 Sick Leave per year.
 */
export function checkLeaveCompliance(
  leavePolicy: { earnedLeave: number; casualLeave: number; sickLeave: number }
): ComplianceResult {
  const MIN_EARNED = 12;
  const MIN_CASUAL = 12;
  const MIN_SICK = 12;

  const issues: string[] = [];
  if (leavePolicy.earnedLeave < MIN_EARNED) {
    issues.push(`Earned leave (${leavePolicy.earnedLeave}) below minimum ${MIN_EARNED}.`);
  }
  if (leavePolicy.casualLeave < MIN_CASUAL) {
    issues.push(`Casual leave (${leavePolicy.casualLeave}) below minimum ${MIN_CASUAL}.`);
  }
  if (leavePolicy.sickLeave < MIN_SICK) {
    issues.push(`Sick leave (${leavePolicy.sickLeave}) below minimum ${MIN_SICK}.`);
  }

  return {
    rule: "Leave Entitlement",
    act: "Factories Act, 1948 / Shop & Establishment Act",
    status: issues.length === 0 ? "PASS" : "FAIL",
    message: issues.length === 0
      ? "Leave entitlements meet statutory minimums."
      : issues.join(" "),
    details: { ...leavePolicy, MIN_EARNED, MIN_CASUAL, MIN_SICK },
  };
}

/**
 * Check EPF (Provident Fund) compliance.
 * Mandatory if basic + DA > ₹15,000/month (employee contribution = 12%).
 */
export function checkPFCompliance(
  basicSalary: number,
  da: number = 0,
  actualPFDeduction: number = 0
): ComplianceResult {
  const pfWage = basicSalary + da;
  const expectedContribution = Math.round(pfWage * 0.12);
  const isEligible = true; // All orgs with 20+ employees must comply

  if (actualPFDeduction < expectedContribution * 0.95) {
    return {
      rule: "EPF Contribution",
      act: "EPF & Miscellaneous Provisions Act, 1952",
      status: "FAIL",
      message: `PF deduction ₹${actualPFDeduction} is less than required ₹${expectedContribution} (12% of ₹${pfWage}).`,
      details: { pfWage, expectedContribution, actualPFDeduction },
    };
  }

  return {
    rule: "EPF Contribution",
    act: "EPF & Miscellaneous Provisions Act, 1952",
    status: "PASS",
    message: `EPF contribution ₹${actualPFDeduction} is compliant (12% of PF wages ₹${pfWage}).`,
    details: { pfWage, expectedContribution, actualPFDeduction },
  };
}

/**
 * Check ESI eligibility and contribution.
 * Applicable if gross salary ≤ ₹21,000/month.
 * Employee: 0.75%, Employer: 3.25%.
 */
export function checkESICompliance(
  grossSalary: number,
  actualESIDeduction: number = 0
): ComplianceResult {
  const ESI_WAGE_CEILING = 21000;
  const ESI_EMPLOYEE_RATE = 0.0075;

  if (grossSalary > ESI_WAGE_CEILING) {
    return {
      rule: "ESI Eligibility",
      act: "ESI Act, 1948",
      status: "PASS",
      message: `Gross salary ₹${grossSalary.toLocaleString("en-IN")} exceeds ESI ceiling ₹${ESI_WAGE_CEILING.toLocaleString("en-IN")}. ESI not applicable.`,
      details: { grossSalary, ceiling: ESI_WAGE_CEILING, applicable: false },
    };
  }

  const expectedESI = Math.round(grossSalary * ESI_EMPLOYEE_RATE);
  const isCompliant = actualESIDeduction >= expectedESI * 0.95;

  return {
    rule: "ESI Contribution",
    act: "ESI Act, 1948",
    status: isCompliant ? "PASS" : "FAIL",
    message: isCompliant
      ? `ESI deduction ₹${actualESIDeduction} is compliant (0.75% of ₹${grossSalary}).`
      : `ESI deduction ₹${actualESIDeduction} is below required ₹${expectedESI}.`,
    details: { grossSalary, expectedESI, actualESIDeduction, applicable: true },
  };
}

/**
 * Check gratuity eligibility under Payment of Gratuity Act, 1972.
 * Eligible after 5 years of continuous service.
 */
export function checkGratuityEligibility(
  yearsOfService: number,
  lastDrawnSalary: number = 0
): ComplianceResult {
  const MIN_YEARS = 5;
  const isEligible = yearsOfService >= MIN_YEARS;
  const gratuityAmount = isEligible
    ? Math.round((lastDrawnSalary * 15 * yearsOfService) / 26)
    : 0;
  const MAX_GRATUITY = 2500000; // ₹25 lakh cap

  return {
    rule: "Gratuity Eligibility",
    act: "Payment of Gratuity Act, 1972",
    status: isEligible ? "PASS" : "WARNING",
    message: isEligible
      ? `Eligible for gratuity of ₹${Math.min(gratuityAmount, MAX_GRATUITY).toLocaleString("en-IN")} (${yearsOfService} years of service).`
      : `Not yet eligible for gratuity. ${MIN_YEARS - yearsOfService} more years required.`,
    details: {
      yearsOfService,
      minYears: MIN_YEARS,
      isEligible,
      estimatedGratuity: Math.min(gratuityAmount, MAX_GRATUITY),
      maxGratuity: MAX_GRATUITY,
    },
  };
}

/**
 * Check Maternity Benefit Act compliance.
 * 26 weeks paid leave for first two children, 12 weeks for third+.
 */
export function checkMaternityBenefits(
  employee: Pick<EmployeeComplianceInput, "gender" | "isPregnant" | "childCount">
): ComplianceResult {
  if (employee.gender !== "FEMALE" && employee.gender !== "F") {
    return {
      rule: "Maternity Benefits",
      act: "Maternity Benefit Act, 1961",
      status: "PASS",
      message: "Not applicable for this employee.",
      details: { applicable: false },
    };
  }

  const childCount = employee.childCount || 0;
  const entitledWeeks = childCount < 2 ? 26 : 12;

  return {
    rule: "Maternity Benefits",
    act: "Maternity Benefit Act, 1961",
    status: "PASS",
    message: `Entitled to ${entitledWeeks} weeks paid maternity leave${employee.isPregnant ? " (currently applicable)" : ""}.`,
    details: {
      applicable: true,
      entitledWeeks,
      childCount,
      isPregnant: employee.isPregnant || false,
    },
  };
}

/**
 * Check Shop & Establishment Act compliance for working hours.
 * Typically: 9 hours/day, 48 hours/week, with mandatory rest day.
 */
export function checkShopActCompliance(
  dailyHours: number,
  weeklyHours: number,
  restDaysPerWeek: number = 1
): ComplianceResult {
  const MAX_DAILY = 9;
  const MAX_WEEKLY = 48;
  const MIN_REST_DAYS = 1;

  const issues: string[] = [];
  if (dailyHours > MAX_DAILY) {
    issues.push(`Daily hours (${dailyHours}) exceed ${MAX_DAILY}h limit.`);
  }
  if (weeklyHours > MAX_WEEKLY) {
    issues.push(`Weekly hours (${weeklyHours}) exceed ${MAX_WEEKLY}h limit.`);
  }
  if (restDaysPerWeek < MIN_REST_DAYS) {
    issues.push(`Rest days (${restDaysPerWeek}) below minimum ${MIN_REST_DAYS}/week.`);
  }

  return {
    rule: "Working Hours Compliance",
    act: "Shop & Establishment Act",
    status: issues.length === 0 ? "PASS" : "FAIL",
    message: issues.length === 0
      ? `Working hours compliant: ${dailyHours}h/day, ${weeklyHours}h/week, ${restDaysPerWeek} rest day(s).`
      : issues.join(" "),
    details: { dailyHours, weeklyHours, restDaysPerWeek, MAX_DAILY, MAX_WEEKLY },
  };
}

/**
 * Check bonus eligibility under Payment of Bonus Act, 1965.
 * Applicable to employees earning ≤ ₹21,000/month, with min 30 days service.
 * Minimum bonus: 8.33% of salary, maximum: 20%.
 */
export function checkBonusEligibility(
  monthlySalary: number,
  yearsOfService: number,
  bonusPaid: number = 0
): ComplianceResult {
  const BONUS_CEILING = 21000;
  const MIN_BONUS_RATE = 0.0833;
  const MAX_BONUS_RATE = 0.20;
  const MIN_DAYS_SERVICE = 30;

  if (monthlySalary > BONUS_CEILING) {
    return {
      rule: "Bonus Eligibility",
      act: "Payment of Bonus Act, 1965",
      status: "PASS",
      message: `Salary ₹${monthlySalary.toLocaleString("en-IN")} exceeds bonus ceiling ₹${BONUS_CEILING.toLocaleString("en-IN")}. Statutory bonus not mandatory.`,
      details: { monthlySalary, BONUS_CEILING, applicable: false },
    };
  }

  if (yearsOfService < MIN_DAYS_SERVICE / 365) {
    return {
      rule: "Bonus Eligibility",
      act: "Payment of Bonus Act, 1965",
      status: "WARNING",
      message: "Employee has served less than 30 days. Bonus not applicable yet.",
      details: { yearsOfService, MIN_DAYS_SERVICE },
    };
  }

  const annualSalary = monthlySalary * 12;
  const minBonus = Math.round(annualSalary * MIN_BONUS_RATE);
  const isCompliant = bonusPaid >= minBonus * 0.95;

  return {
    rule: "Bonus Eligibility",
    act: "Payment of Bonus Act, 1965",
    status: isCompliant ? "PASS" : "FAIL",
    message: isCompliant
      ? `Bonus ₹${bonusPaid.toLocaleString("en-IN")} meets minimum 8.33% requirement (₹${minBonus.toLocaleString("en-IN")}).`
      : `Bonus ₹${bonusPaid.toLocaleString("en-IN")} is below statutory minimum ₹${minBonus.toLocaleString("en-IN")} (8.33% of annual salary).`,
    details: {
      monthlySalary,
      annualSalary,
      minBonus,
      maxBonus: Math.round(annualSalary * MAX_BONUS_RATE),
      bonusPaid,
    },
  };
}

/**
 * Generate a comprehensive compliance report for an employee.
 */
export async function generateComplianceReport(
  employee: EmployeeComplianceInput
): Promise<ComplianceReport> {
  const now = new Date();
  const joiningDate = new Date(employee.joiningDate);
  const yearsOfService = (now.getTime() - joiningDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

  // Fetch actual deductions from latest salary slip if available
  const latestSlip = await prisma.salarySlip.findFirst({
    where: { employee: { userId: employee.id } },
    orderBy: { createdAt: "desc" },
  });

  const pfDeduction = latestSlip ? Number(latestSlip.pfDeduction) : 0;
  const esiDeduction = latestSlip ? Number(latestSlip.esiDeduction) : 0;
  const basicSalary = latestSlip ? Number(latestSlip.basePay) : employee.baseSalary * 0.5;
  const da = latestSlip ? Number(latestSlip.da) : employee.baseSalary * 0.1;

  const results: ComplianceResult[] = [
    checkMinimumWage(employee.state, employee.baseSalary),
    checkPFCompliance(basicSalary, da, pfDeduction),
    checkESICompliance(employee.grossSalary, esiDeduction),
    checkGratuityEligibility(yearsOfService, basicSalary + da),
    checkMaternityBenefits(employee),
    checkBonusEligibility(employee.baseSalary, yearsOfService),
    checkLeaveCompliance({ earnedLeave: 15, casualLeave: 12, sickLeave: 12 }),
    checkOvertimeCompliance(40, employee.employmentType),
    checkShopActCompliance(8, 40, 2),
  ];

  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  const warningCount = results.filter((r) => r.status === "WARNING").length;

  const overallStatus: ComplianceStatus = failCount > 0 ? "FAIL" : warningCount > 0 ? "WARNING" : "PASS";

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    generatedAt: now.toISOString(),
    overallStatus,
    passCount,
    failCount,
    warningCount,
    results,
  };
}

/**
 * Return all Indian states' minimum wage data.
 */
export function getStateMinimumWages(): Record<string, { daily: number; monthly: number; effectiveFrom: string }> {
  return { ...STATE_MINIMUM_WAGES };
}
