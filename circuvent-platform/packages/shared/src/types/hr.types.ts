// ──────────────────────────────────────────────────────────────
// Circuvent Platform — HR & Payroll Domain Types
// India statutory compliance types.
// ──────────────────────────────────────────────────────────────

export interface SalaryStructure {
  basePay: number;
  hra: number;
  da: number;
  specialAllowance: number;
  bonus: number;
  grossSalary: number;
}

export interface StatutoryDeductions {
  epfEmployee: number;
  epfEmployer: number;
  epsContribution: number;
  esiEmployee: number;
  esiEmployer: number;
  professionalTax: number;
  tds: number;
  totalEmployeeDeductions: number;
  totalEmployerContributions: number;
}

export interface SalaryComputation {
  structure: SalaryStructure;
  deductions: StatutoryDeductions;
  netSalary: number;
  ctcMonthly: number;
  ctcAnnual: number;
}

export interface TaxSlabEntry {
  min: number;
  max: number;
  rate: number;
}

export interface TDSComputationInput {
  annualGrossSalary: number;
  regime: "OLD" | "NEW";
  financialYear: string;
  standardDeduction: number;
  section80C?: number;
  section80D?: number;
  section24?: number;
  hraExemption?: number;
  otherDeductions?: number;
}

export interface TDSComputationResult {
  taxableIncome: number;
  taxBeforeCess: number;
  cess: number;
  surcharge: number;
  totalTax: number;
  monthlyTDS: number;
  effectiveRate: number;
  slabBreakdown: { slab: string; taxableAmount: number; tax: number }[];
}

export interface EPFComputation {
  epfWage: number;
  employeeContribution: number;
  employerEPFContribution: number;
  employerEPSContribution: number;
  adminCharges: number;
  edliCharges: number;
  totalEmployerCost: number;
}

export interface ESIComputation {
  applicableGross: number;
  isEligible: boolean;
  employeeContribution: number;
  employerContribution: number;
}

export interface ProfessionalTaxResult {
  state: string;
  monthlySalary: number;
  monthlyTax: number;
  annualTax: number;
}

export interface GratuityComputation {
  isEligible: boolean;
  yearsOfService: number;
  lastDrawnSalary: number;
  gratuityAmount: number;
  cappedAmount: number; // Max ₹25,00,000
  taxExemptAmount: number;
}

export interface PayslipData {
  employee: {
    code: string;
    name: string;
    designation: string;
    department: string;
    pan: string;
    uan: string;
    bankAccount: string;
    bankIFSC: string;
  };
  company: {
    name: string;
    address: string;
    cin: string;
    gstin: string;
  };
  period: { month: number; year: number; totalDays: number; workedDays: number; lopDays: number };
  earnings: SalaryStructure;
  deductions: StatutoryDeductions;
  netSalary: number;
  yearToDate: {
    grossEarnings: number;
    totalDeductions: number;
    netPayments: number;
    pfAccumulated: number;
    tdsDeducted: number;
  };
}

export type ApprovalActionType = "APPROVED" | "REJECTED" | "ESCALATED" | "RETURNED";

export interface ApprovalRequest {
  workflowId: string;
  approverId: string;
  action: ApprovalActionType;
  comments?: string;
}

export interface ExpensePolicy {
  maxSingleExpense: number;
  maxMonthlyTotal: number;
  requiresL2Above: number;
  requiresL3Above: number;
  rndAutoTag: boolean;
  allowedCategories: string[];
}

export const DEFAULT_EXPENSE_POLICY: ExpensePolicy = {
  maxSingleExpense: 100000,
  maxMonthlyTotal: 500000,
  requiresL2Above: 25000,
  requiresL3Above: 100000,
  rndAutoTag: true,
  allowedCategories: [
    "TRAVEL", "EQUIPMENT", "SOFTWARE_LICENSE", "COMPONENTS",
    "CONFERENCE", "TRAINING", "OFFICE_SUPPLIES", "CLOUD_SERVICES",
    "PROTOTYPE", "TESTING", "CONSULTING", "OTHER",
  ],
};
