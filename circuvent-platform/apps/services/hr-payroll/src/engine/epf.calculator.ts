// ──────────────────────────────────────────────────────────────
// Circuvent Platform — EPF (Employee Provident Fund) Calculator
// Implements the full EPF calculation per Indian PF Act:
//   - Employee contribution: 12% of PF wage (capped at ₹15,000)
//   - Employer EPF: 3.67% of PF wage
//   - Employer EPS: 8.33% of PF wage (capped at ₹15,000)
//   - Admin charges: 0.50%
//   - EDLI: 0.50%
// ──────────────────────────────────────────────────────────────

export interface EPFConfig {
  employeeRate: number;        // 0.12
  employerEPFRate: number;     // typically total employer rate minus EPS
  epsRate: number;             // 0.0833
  wageCeiling: number;         // ₹15,000
  adminChargeRate: number;     // 0.005
  edliChargeRate: number;      // 0.005
}

export interface EPFResult {
  pfWage: number;
  basicSalary: number;
  isAboveCeiling: boolean;
  employeeContribution: number;
  employerEPFContribution: number;
  employerEPSContribution: number;
  adminCharges: number;
  edliCharges: number;
  totalEmployerCost: number;
  totalContribution: number;
}

const DEFAULT_CONFIG: EPFConfig = {
  employeeRate: 0.12,
  employerEPFRate: 0.0367,
  epsRate: 0.0833,
  wageCeiling: 15000,
  adminChargeRate: 0.005,
  edliChargeRate: 0.005,
};

export function calculateEPF(
  basicSalary: number,
  da: number = 0,
  config: Partial<EPFConfig> = {}
): EPFResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // PF wage = Basic + DA (or Basic alone if DA not applicable)
  const pfWage = basicSalary + da;
  const isAboveCeiling = pfWage > cfg.wageCeiling;

  // For employee contribution: 12% of PF wage
  // If PF wage > ceiling, contribution is on full PF wage (voluntary)
  // but EPS is capped at ceiling
  const effectivePfWage = pfWage; // Employee can contribute on full wage

  const employeeContribution = Math.round(effectivePfWage * cfg.employeeRate);

  // EPS contribution: 8.33% capped at ceiling
  const epsWage = Math.min(pfWage, cfg.wageCeiling);
  const employerEPSContribution = Math.round(epsWage * cfg.epsRate);

  // Employer EPF = (12% of PF wage) - EPS contribution
  const totalEmployerPF = Math.round(pfWage * 0.12);
  const employerEPFContribution = totalEmployerPF - employerEPSContribution;

  // Admin charges: 0.50% of PF wage
  const adminCharges = Math.round(pfWage * cfg.adminChargeRate);

  // EDLI: 0.50% of PF wage, max ₹15,000 wage
  const edliWage = Math.min(pfWage, cfg.wageCeiling);
  const edliCharges = Math.round(edliWage * cfg.edliChargeRate);

  const totalEmployerCost = employerEPFContribution + employerEPSContribution + adminCharges + edliCharges;
  const totalContribution = employeeContribution + totalEmployerCost;

  return {
    pfWage, basicSalary, isAboveCeiling,
    employeeContribution, employerEPFContribution, employerEPSContribution,
    adminCharges, edliCharges, totalEmployerCost, totalContribution,
  };
}
