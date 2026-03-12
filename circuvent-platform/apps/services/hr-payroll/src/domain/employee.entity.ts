// ──────────────────────────────────────────────────────────────
// HR & Payroll — Employee Domain Entity
// Encapsulates employee lifecycle, statutory eligibility,
// leave balance calculation, and compliance validations.
// ──────────────────────────────────────────────────────────────

export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";

export interface EmployeeProps {
  id: string;
  employeeCode: string;
  userId: string;
  employmentType: EmploymentType;
  designation: string;
  department: string;
  dateOfJoining: Date;
  dateOfLeaving: Date | null;
  baseSalary: number;
  currency: string;
  panNumber: string | null;
  aadhaarNumber: string | null;
  uanNumber: string | null;
}

export class EmployeeEntity {
  constructor(private props: EmployeeProps) {}

  get id() { return this.props.id; }
  get employeeCode() { return this.props.employeeCode; }
  get department() { return this.props.department; }
  get baseSalary() { return this.props.baseSalary; }
  get dateOfJoining() { return this.props.dateOfJoining; }
  get isActive() { return !this.props.dateOfLeaving; }

  getYearsOfService(asOfDate: Date = new Date()): number {
    const endDate = this.props.dateOfLeaving || asOfDate;
    const ms = endDate.getTime() - this.props.dateOfJoining.getTime();
    return Math.round((ms / (1000 * 60 * 60 * 24 * 365.25)) * 100) / 100;
  }

  getCompletedYearsOfService(asOfDate: Date = new Date()): number {
    const years = this.getYearsOfService(asOfDate);
    const fullYears = Math.floor(years);
    const remainingMonths = (years - fullYears) * 12;
    return remainingMonths >= 6 ? fullYears + 1 : fullYears;
  }

  isEligibleForGratuity(minYears = 5): boolean {
    return this.getCompletedYearsOfService() >= minYears;
  }

  isEligibleForESI(): boolean {
    return (this.props.baseSalary / 12) <= 21000;
  }

  isProbationComplete(probationMonths = 6): boolean {
    const monthsWorked = this.getYearsOfService() * 12;
    return monthsWorked >= probationMonths;
  }

  getMonthlySalary(): number {
    return Math.round(this.props.baseSalary / 12);
  }

  isInRnDDepartment(): boolean {
    const dept = this.props.department.toLowerCase();
    return dept.includes("r&d") || dept.includes("engineering") || dept.includes("research");
  }

  hasPAN(): boolean {
    return !!this.props.panNumber && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(this.props.panNumber);
  }

  hasUAN(): boolean {
    return !!this.props.uanNumber && this.props.uanNumber.length >= 10;
  }

  getComplianceChecklist(): { item: string; status: "OK" | "MISSING" | "WARNING" }[] {
    return [
      { item: "PAN Number", status: this.hasPAN() ? "OK" : "MISSING" },
      { item: "UAN (PF)", status: this.hasUAN() ? "OK" : this.props.employmentType === "FULL_TIME" ? "MISSING" : "WARNING" },
      { item: "Aadhaar", status: this.props.aadhaarNumber ? "OK" : "WARNING" },
      { item: "Bank Account", status: "OK" }, // Simplified
      { item: "Probation", status: this.isProbationComplete() ? "OK" : "WARNING" },
    ];
  }

  /**
   * Calculate earned leave balance.
   * India standard: 1 day per 20 days worked (approximately 15/year for full-time).
   */
  calculateEarnedLeaveBalance(usedDays: number, asOfDate: Date = new Date()): number {
    const monthsWorked = Math.floor(this.getYearsOfService(asOfDate) * 12);
    const earned = Math.floor(monthsWorked * 1.25); // ~15 days/year
    return Math.max(0, earned - usedDays);
  }

  calculateSickLeaveBalance(usedDays: number): number {
    const annualSickLeave = this.props.employmentType === "FULL_TIME" ? 12 : 6;
    const yearsWorked = Math.floor(this.getYearsOfService());
    const totalEntitled = annualSickLeave * Math.max(1, yearsWorked);
    return Math.max(0, Math.min(totalEntitled, annualSickLeave * 3) - usedDays); // Max accumulation: 3 years
  }

  calculateCasualLeaveBalance(usedDays: number): number {
    const annualCasualLeave = this.props.employmentType === "FULL_TIME" ? 12 : 6;
    return Math.max(0, annualCasualLeave - usedDays); // Does not carry forward
  }
}

// ── Salary Slip Value Object ──

export interface SalarySlipProps {
  id: string;
  employeeId: string;
  month: number;
  year: number;
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
  isPaid: boolean;
  paidAt: Date | null;
}

export class SalarySlipValueObject {
  constructor(private props: SalarySlipProps) {}

  get periodLabel(): string {
    return `${new Date(2000, this.props.month - 1).toLocaleString("en", { month: "long" })} ${this.props.year}`;
  }

  get deductionPercentage(): number {
    if (this.props.grossSalary === 0) return 0;
    return Math.round((this.props.totalDeductions / this.props.grossSalary) * 10000) / 100;
  }

  get takeHomeRatio(): number {
    if (this.props.grossSalary === 0) return 0;
    return Math.round((this.props.netSalary / this.props.grossSalary) * 10000) / 100;
  }

  isHighDeduction(): boolean {
    return this.deductionPercentage > 35;
  }
}
