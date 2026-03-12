// ══════════════════════════════════════════════════════════════════════════════
// HR Payroll — Leave Accrual Domain Service
// Calculates leave balances, accrual policies, carry-forward logic,
// and leave encashment for Indian labor law compliance.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Leave policy configuration per leave type.
 */
export interface LeavePolicy {
  leaveType: string;
  annualEntitlement: number;     // Total leaves per year
  accrualFrequency: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  accrualPerPeriod: number;      // Leaves accrued per period
  maxCarryForward: number;       // Max leaves that can be carried to next year
  maxAccumulation: number;       // Cap on total accumulated balance
  encashmentAllowed: boolean;    // Whether unused leaves can be encashed
  encashmentMinBalance: number;  // Minimum balance required for encashment
  probationEligible: boolean;    // Available during probation?
  genderRestriction: "ALL" | "MALE" | "FEMALE";
  minServiceMonths: number;      // Months of service before eligibility
  minConsecutiveDays: number;    // Min consecutive days for this leave type
  maxConsecutiveDays: number;    // Max consecutive days allowed
  requiresApproval: boolean;
  requiresDocumentation: boolean; // e.g., medical certificate for sick leave
  documentAfterDays: number;     // Required after N consecutive days
}

/**
 * Individual employee leave balance.
 */
export interface LeaveBalance {
  employeeId: string;
  leaveType: string;
  opening: number;         // Balance at start of year
  accrued: number;         // Total accrued so far this year
  used: number;            // Total approved leaves taken
  pending: number;         // Leaves in pending approval
  carryForward: number;    // From previous year
  adjustments: number;     // Manual adjustments (+/-)
  available: number;       // Computed: opening + accrued + carryForward + adjustments - used - pending
  encashable: number;      // Leaves eligible for encashment
}

/**
 * Leave accrual result for a period.
 */
export interface AccrualResult {
  employeeId: string;
  period: string;
  leaveType: string;
  accruedAmount: number;
  newBalance: number;
  isEligible: boolean;
  reason?: string;
}

/** Standard Indian leave policies */
export const STANDARD_LEAVE_POLICIES: LeavePolicy[] = [
  {
    leaveType: "CASUAL", annualEntitlement: 12, accrualFrequency: "MONTHLY", accrualPerPeriod: 1,
    maxCarryForward: 0, maxAccumulation: 12, encashmentAllowed: false, encashmentMinBalance: 0,
    probationEligible: true, genderRestriction: "ALL", minServiceMonths: 0,
    minConsecutiveDays: 0.5, maxConsecutiveDays: 3, requiresApproval: true,
    requiresDocumentation: false, documentAfterDays: 3,
  },
  {
    leaveType: "SICK", annualEntitlement: 12, accrualFrequency: "MONTHLY", accrualPerPeriod: 1,
    maxCarryForward: 6, maxAccumulation: 24, encashmentAllowed: false, encashmentMinBalance: 0,
    probationEligible: true, genderRestriction: "ALL", minServiceMonths: 0,
    minConsecutiveDays: 0.5, maxConsecutiveDays: 10, requiresApproval: true,
    requiresDocumentation: true, documentAfterDays: 2,
  },
  {
    leaveType: "EARNED", annualEntitlement: 15, accrualFrequency: "MONTHLY", accrualPerPeriod: 1.25,
    maxCarryForward: 30, maxAccumulation: 45, encashmentAllowed: true, encashmentMinBalance: 15,
    probationEligible: false, genderRestriction: "ALL", minServiceMonths: 12,
    minConsecutiveDays: 1, maxConsecutiveDays: 30, requiresApproval: true,
    requiresDocumentation: false, documentAfterDays: 0,
  },
  {
    leaveType: "MATERNITY", annualEntitlement: 182, accrualFrequency: "ANNUAL", accrualPerPeriod: 182,
    maxCarryForward: 0, maxAccumulation: 182, encashmentAllowed: false, encashmentMinBalance: 0,
    probationEligible: false, genderRestriction: "FEMALE", minServiceMonths: 3,
    minConsecutiveDays: 1, maxConsecutiveDays: 182, requiresApproval: true,
    requiresDocumentation: true, documentAfterDays: 0,
  },
  {
    leaveType: "PATERNITY", annualEntitlement: 15, accrualFrequency: "ANNUAL", accrualPerPeriod: 15,
    maxCarryForward: 0, maxAccumulation: 15, encashmentAllowed: false, encashmentMinBalance: 0,
    probationEligible: false, genderRestriction: "MALE", minServiceMonths: 6,
    minConsecutiveDays: 1, maxConsecutiveDays: 15, requiresApproval: true,
    requiresDocumentation: true, documentAfterDays: 0,
  },
  {
    leaveType: "COMPENSATORY", annualEntitlement: 0, accrualFrequency: "MONTHLY", accrualPerPeriod: 0,
    maxCarryForward: 0, maxAccumulation: 10, encashmentAllowed: false, encashmentMinBalance: 0,
    probationEligible: true, genderRestriction: "ALL", minServiceMonths: 0,
    minConsecutiveDays: 0.5, maxConsecutiveDays: 3, requiresApproval: true,
    requiresDocumentation: false, documentAfterDays: 0,
  },
  {
    leaveType: "UNPAID", annualEntitlement: 365, accrualFrequency: "ANNUAL", accrualPerPeriod: 365,
    maxCarryForward: 0, maxAccumulation: 365, encashmentAllowed: false, encashmentMinBalance: 0,
    probationEligible: true, genderRestriction: "ALL", minServiceMonths: 0,
    minConsecutiveDays: 1, maxConsecutiveDays: 90, requiresApproval: true,
    requiresDocumentation: false, documentAfterDays: 0,
  },
];

/**
 * Leave Accrual Domain Service.
 *
 * Handles:
 * 1. Monthly/quarterly/annual leave accrual computation
 * 2. Balance calculation (available = opening + accrued + cf - used - pending)
 * 3. Carry-forward computation at year-end
 * 4. Leave encashment eligibility and value calculation
 * 5. Policy validation (min/max days, documentation requirements)
 * 6. Probation period restrictions
 *
 * @example
 * ```ts
 * const service = new LeaveAccrualService();
 * const balances = service.computeBalance(employeeData, usageData, policies);
 * const encashment = service.calculateEncashment("emp-001", 10, 100000);
 * ```
 */
export class LeaveAccrualService {

  /**
   * Computes all leave balances for an employee.
   */
  computeBalances(
    employeeId: string,
    serviceMonths: number,
    gender: "MALE" | "FEMALE" | "OTHER",
    isOnProbation: boolean,
    currentMonth: number,
    usedLeaves: Record<string, number>,
    pendingLeaves: Record<string, number>,
    carryForwards: Record<string, number>,
    adjustments: Record<string, number>,
    policies: LeavePolicy[] = STANDARD_LEAVE_POLICIES,
  ): LeaveBalance[] {
    return policies
      .filter(p => this.isEligibleForPolicy(p, gender, serviceMonths, isOnProbation))
      .map(policy => {
        const used = usedLeaves[policy.leaveType] || 0;
        const pending = pendingLeaves[policy.leaveType] || 0;
        const cf = Math.min(carryForwards[policy.leaveType] || 0, policy.maxCarryForward);
        const adj = adjustments[policy.leaveType] || 0;
        const accrued = this.computeAccrual(policy, currentMonth);
        const available = Math.max(0, Math.min(
          accrued + cf + adj - used - pending,
          policy.maxAccumulation
        ));
        const encashable = policy.encashmentAllowed
          ? Math.max(0, available - policy.encashmentMinBalance)
          : 0;

        return {
          employeeId,
          leaveType: policy.leaveType,
          opening: 0,
          accrued,
          used,
          pending,
          carryForward: cf,
          adjustments: adj,
          available,
          encashable,
        };
      });
  }

  /**
   * Runs monthly leave accrual for all employees.
   */
  runMonthlyAccrual(
    employees: Array<{
      id: string;
      serviceMonths: number;
      gender: "MALE" | "FEMALE" | "OTHER";
      isOnProbation: boolean;
    }>,
    month: number,
    policies: LeavePolicy[] = STANDARD_LEAVE_POLICIES,
  ): AccrualResult[] {
    const results: AccrualResult[] = [];
    const monthlyPolicies = policies.filter(p => p.accrualFrequency === "MONTHLY");

    for (const emp of employees) {
      for (const policy of monthlyPolicies) {
        const isEligible = this.isEligibleForPolicy(policy, emp.gender, emp.serviceMonths, emp.isOnProbation);
        results.push({
          employeeId: emp.id,
          period: `M${month}`,
          leaveType: policy.leaveType,
          accruedAmount: isEligible ? policy.accrualPerPeriod : 0,
          newBalance: isEligible ? policy.accrualPerPeriod * month : 0,
          isEligible,
          reason: isEligible ? undefined : this.getIneligibilityReason(policy, emp.gender, emp.serviceMonths, emp.isOnProbation),
        });
      }
    }

    return results;
  }

  /**
   * Computes year-end carry-forward for all leave types.
   */
  computeCarryForward(
    balances: LeaveBalance[],
    policies: LeavePolicy[] = STANDARD_LEAVE_POLICIES,
  ): Array<{ leaveType: string; currentBalance: number; carryForward: number; lapsed: number }> {
    return balances.map(balance => {
      const policy = policies.find(p => p.leaveType === balance.leaveType);
      if (!policy) return { leaveType: balance.leaveType, currentBalance: balance.available, carryForward: 0, lapsed: balance.available };

      const cf = Math.min(balance.available, policy.maxCarryForward);
      return {
        leaveType: balance.leaveType,
        currentBalance: balance.available,
        carryForward: cf,
        lapsed: Math.max(0, balance.available - cf),
      };
    });
  }

  /**
   * Calculates leave encashment value.
   * @param dailyRate Employee's per-day salary (annual / 365 or monthly / 30)
   */
  calculateEncashment(
    leaveType: string,
    daysToEncash: number,
    dailyRate: number,
    policies: LeavePolicy[] = STANDARD_LEAVE_POLICIES,
  ): {
    allowed: boolean;
    daysEncashed: number;
    grossAmount: number;
    tdsDeduction: number;
    netAmount: number;
    reason?: string;
  } {
    const policy = policies.find(p => p.leaveType === leaveType);
    if (!policy) return { allowed: false, daysEncashed: 0, grossAmount: 0, tdsDeduction: 0, netAmount: 0, reason: "Unknown leave type" };
    if (!policy.encashmentAllowed) return { allowed: false, daysEncashed: 0, grossAmount: 0, tdsDeduction: 0, netAmount: 0, reason: `${leaveType} leaves cannot be encashed` };
    if (daysToEncash <= 0) return { allowed: false, daysEncashed: 0, grossAmount: 0, tdsDeduction: 0, netAmount: 0, reason: "No days to encash" };

    const grossAmount = Math.round(daysToEncash * dailyRate);
    const tdsRate = grossAmount > 300000 ? 0.30 : grossAmount > 100000 ? 0.20 : 0.10;
    const tdsDeduction = Math.round(grossAmount * tdsRate);

    return {
      allowed: true,
      daysEncashed: daysToEncash,
      grossAmount,
      tdsDeduction,
      netAmount: grossAmount - tdsDeduction,
    };
  }

  /**
   * Validates a leave application against policy rules.
   */
  validateLeaveRequest(
    leaveType: string,
    startDate: Date,
    endDate: Date,
    availableBalance: number,
    isOnProbation: boolean,
    serviceMonths: number,
    consecutiveDaysApplied: number,
    policies: LeavePolicy[] = STANDARD_LEAVE_POLICIES,
  ): { valid: boolean; errors: string[] } {
    const policy = policies.find(p => p.leaveType === leaveType);
    if (!policy) return { valid: false, errors: ["Unknown leave type"] };

    const errors: string[] = [];
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;

    if (totalDays > availableBalance) errors.push(`Insufficient balance: ${availableBalance} available, ${totalDays} requested`);
    if (isOnProbation && !policy.probationEligible) errors.push(`${leaveType} leave not available during probation`);
    if (serviceMonths < policy.minServiceMonths) errors.push(`Requires ${policy.minServiceMonths} months of service (you have ${serviceMonths})`);
    if (totalDays < policy.minConsecutiveDays) errors.push(`Minimum ${policy.minConsecutiveDays} day(s) required`);
    if (totalDays > policy.maxConsecutiveDays) errors.push(`Maximum ${policy.maxConsecutiveDays} consecutive days allowed`);
    if (startDate < new Date()) errors.push("Cannot apply for past dates");

    if (policy.requiresDocumentation && totalDays > policy.documentAfterDays && policy.documentAfterDays > 0) {
      errors.push(`Medical certificate required for ${leaveType} leave > ${policy.documentAfterDays} days`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Generates a team leave calendar for a month.
   */
  generateTeamCalendar(
    teamLeaves: Array<{
      employeeId: string;
      employeeName: string;
      leaveType: string;
      startDate: Date;
      endDate: Date;
      status: string;
    }>,
    month: number,
    year: number,
  ): Array<{
    date: string;
    dayOfWeek: string;
    employeesOnLeave: Array<{ id: string; name: string; type: string }>;
    coverageImpact: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  }> {
    const daysInMonth = new Date(year, month, 0).getDate();
    const calendar = [];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dateStr = date.toISOString().split("T")[0];
      const dayOfWeek = dayNames[date.getDay()];

      const employeesOnLeave = teamLeaves
        .filter(l => l.status === "APPROVED" && l.startDate <= date && l.endDate >= date)
        .map(l => ({ id: l.employeeId, name: l.employeeName, type: l.leaveType }));

      const coverageImpact: "NONE" | "LOW" | "MEDIUM" | "HIGH" =
        employeesOnLeave.length === 0 ? "NONE" :
        employeesOnLeave.length <= 1 ? "LOW" :
        employeesOnLeave.length <= 3 ? "MEDIUM" : "HIGH";

      calendar.push({ date: dateStr, dayOfWeek, employeesOnLeave, coverageImpact });
    }

    return calendar;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private computeAccrual(policy: LeavePolicy, currentMonth: number): number {
    switch (policy.accrualFrequency) {
      case "MONTHLY": return Math.min(policy.accrualPerPeriod * currentMonth, policy.annualEntitlement);
      case "QUARTERLY": return Math.min(policy.accrualPerPeriod * Math.floor(currentMonth / 3), policy.annualEntitlement);
      case "ANNUAL": return policy.annualEntitlement;
      default: return 0;
    }
  }

  private isEligibleForPolicy(policy: LeavePolicy, gender: string, serviceMonths: number, isOnProbation: boolean): boolean {
    if (policy.genderRestriction !== "ALL" && policy.genderRestriction !== gender) return false;
    if (isOnProbation && !policy.probationEligible) return false;
    if (serviceMonths < policy.minServiceMonths) return false;
    return true;
  }

  private getIneligibilityReason(policy: LeavePolicy, gender: string, serviceMonths: number, isOnProbation: boolean): string {
    if (policy.genderRestriction !== "ALL" && policy.genderRestriction !== gender) return `${policy.leaveType} is for ${policy.genderRestriction} employees only`;
    if (isOnProbation && !policy.probationEligible) return `${policy.leaveType} not available during probation`;
    if (serviceMonths < policy.minServiceMonths) return `Requires ${policy.minServiceMonths} months of service`;
    return "Unknown";
  }
}
