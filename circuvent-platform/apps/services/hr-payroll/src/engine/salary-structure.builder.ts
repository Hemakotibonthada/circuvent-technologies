// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Salary Structure Builder
// Orchestrates all statutory calculators to produce a complete
// monthly payslip computation from annual CTC.
// ──────────────────────────────────────────────────────────────

import { calculateEPF, EPFResult } from "./epf.calculator";
import { calculateESI, ESIResult } from "./esi.calculator";
import { calculateTDS, TDSResult } from "./tds.calculator";
import { calculateProfessionalTax, PTResult } from "./professional-tax.calculator";

export interface SalaryInput {
  annualCTC: number;
  regime: "OLD" | "NEW";
  state: string;
  month: number; // 1-12
  lopDays?: number;
  totalWorkingDays?: number;
  bonus?: number;
  section80C?: number;
  section80D?: number;
  section24?: number;
  hraExemption?: number;
}

export interface FullSalaryResult {
  monthly: {
    basePay: number;
    hra: number;
    da: number;
    specialAllowance: number;
    bonus: number;
    grossSalary: number;
    lopDeduction: number;
    adjustedGross: number;
  };
  epf: EPFResult;
  esi: ESIResult;
  tds: TDSResult;
  professionalTax: PTResult;
  deductions: {
    epfEmployee: number;
    esiEmployee: number;
    professionalTax: number;
    tds: number;
    totalDeductions: number;
  };
  employerCost: {
    epfEmployer: number;
    epsContribution: number;
    esiEmployer: number;
    adminCharges: number;
    edliCharges: number;
    totalEmployerCost: number;
  };
  netSalary: number;
  ctcMonthly: number;
}

export function buildSalaryStructure(input: SalaryInput): FullSalaryResult {
  const monthlyBase = input.annualCTC / 12;

  // Standard structure: 50% Basic, 20% HRA, 10% DA, 20% Special
  const basePay = Math.round(monthlyBase * 0.50);
  const hra = Math.round(monthlyBase * 0.20);
  const da = Math.round(monthlyBase * 0.10);
  const specialAllowance = Math.round(monthlyBase * 0.20);
  const bonus = input.bonus || 0;
  const grossSalary = basePay + hra + da + specialAllowance + bonus;

  // LOP adjustment
  const totalWorkingDays = input.totalWorkingDays || 30;
  const lopDays = input.lopDays || 0;
  const lopRatio = lopDays > 0 ? (totalWorkingDays - lopDays) / totalWorkingDays : 1;
  const adjustedGross = Math.round(grossSalary * lopRatio);
  const adjustedBasic = Math.round(basePay * lopRatio);
  const adjustedDA = Math.round(da * lopRatio);
  const lopDeduction = grossSalary - adjustedGross;

  // EPF
  const epf = calculateEPF(adjustedBasic, adjustedDA);

  // ESI
  const esi = calculateESI(adjustedGross);

  // TDS
  const tds = calculateTDS({
    annualGrossSalary: input.annualCTC,
    regime: input.regime,
    section80C: input.section80C,
    section80D: input.section80D,
    section24: input.section24,
    hraExemption: input.hraExemption,
  });

  // Professional Tax
  const pt = calculateProfessionalTax(adjustedGross, input.state, input.month);

  // Compute net
  const totalDeductions = epf.employeeContribution + esi.employeeContribution + pt.monthlyTax + tds.monthlyTDS;
  const netSalary = adjustedGross - totalDeductions;

  const totalEmployerCost = epf.employerEPFContribution + epf.employerEPSContribution +
    epf.adminCharges + epf.edliCharges + esi.employerContribution;

  const ctcMonthly = adjustedGross + totalEmployerCost;

  return {
    monthly: {
      basePay: Math.round(basePay * lopRatio),
      hra: Math.round(hra * lopRatio),
      da: adjustedDA,
      specialAllowance: Math.round(specialAllowance * lopRatio),
      bonus, grossSalary, lopDeduction,
      adjustedGross,
    },
    epf, esi, tds, professionalTax: pt,
    deductions: {
      epfEmployee: epf.employeeContribution,
      esiEmployee: esi.employeeContribution,
      professionalTax: pt.monthlyTax,
      tds: tds.monthlyTDS,
      totalDeductions,
    },
    employerCost: {
      epfEmployer: epf.employerEPFContribution,
      epsContribution: epf.employerEPSContribution,
      esiEmployer: esi.employerContribution,
      adminCharges: epf.adminCharges,
      edliCharges: epf.edliCharges,
      totalEmployerCost,
    },
    netSalary,
    ctcMonthly,
  };
}
