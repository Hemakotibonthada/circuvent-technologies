// ──────────────────────────────────────────────────────────────
// Circuvent Platform — ESI (Employee State Insurance) Calculator
// ESI is applicable when monthly gross salary ≤ ₹21,000.
//   - Employee: 0.75%
//   - Employer: 3.25%
// Once salary exceeds ceiling, ESI is not deducted.
// ──────────────────────────────────────────────────────────────

export interface ESIConfig {
  employeeRate: number;   // 0.0075
  employerRate: number;   // 0.0325
  wageCeiling: number;    // ₹21,000
}

export interface ESIResult {
  grossSalary: number;
  isEligible: boolean;
  employeeContribution: number;
  employerContribution: number;
  totalContribution: number;
}

const DEFAULT_ESI_CONFIG: ESIConfig = {
  employeeRate: 0.0075,
  employerRate: 0.0325,
  wageCeiling: 21000,
};

export function calculateESI(
  grossSalary: number,
  config: Partial<ESIConfig> = {}
): ESIResult {
  const cfg = { ...DEFAULT_ESI_CONFIG, ...config };

  const isEligible = grossSalary <= cfg.wageCeiling;

  if (!isEligible) {
    return {
      grossSalary, isEligible,
      employeeContribution: 0,
      employerContribution: 0,
      totalContribution: 0,
    };
  }

  // Round to nearest rupee as per ESI practice
  const employeeContribution = Math.ceil(grossSalary * cfg.employeeRate);
  const employerContribution = Math.ceil(grossSalary * cfg.employerRate);

  return {
    grossSalary, isEligible,
    employeeContribution,
    employerContribution,
    totalContribution: employeeContribution + employerContribution,
  };
}
