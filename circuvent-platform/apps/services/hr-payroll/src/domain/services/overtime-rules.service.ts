// ══════════════════════════════════════════════════════════════════════════════
// HR Payroll — Overtime Rules Domain Service
// Calculates overtime pay, compensatory off, and shift differential
// per Indian labor law (Factories Act / Shop Establishments Act).
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Work session data for overtime calculation.
 */
export interface WorkSession {
  employeeId: string;
  date: Date;
  checkIn: Date;
  checkOut: Date;
  totalHours: number;
  isHoliday: boolean;
  isWeekend: boolean;
  shiftType: "DAY" | "EVENING" | "NIGHT" | "GENERAL";
}

/**
 * Overtime computation result.
 */
export interface OvertimeResult {
  employeeId: string;
  period: string;
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  nightShiftHours: number;
  regularPay: number;
  overtimePay: number;
  holidayPay: number;
  nightDifferential: number;
  compOffEarned: number;
  totalPay: number;
  breakdown: Array<{
    date: string;
    hours: number;
    type: "REGULAR" | "OVERTIME" | "HOLIDAY" | "NIGHT_SHIFT";
    rate: number;
    amount: number;
  }>;
}

/**
 * Overtime policy configuration.
 */
export interface OvertimePolicy {
  /** Standard work hours per day */
  standardHoursPerDay: number;
  /** Standard work hours per week */
  standardHoursPerWeek: number;
  /** Overtime rate multiplier (e.g., 2.0 = double pay) */
  overtimeMultiplier: number;
  /** Holiday work rate multiplier */
  holidayMultiplier: number;
  /** Night shift differential percentage */
  nightDifferentialPercent: number;
  /** Whether comp-off is offered instead of OT pay for holidays */
  compOffForHolidays: boolean;
  /** Maximum overtime hours per week */
  maxOvertimePerWeek: number;
  /** Maximum overtime hours per month */
  maxOvertimePerMonth: number;
  /** Minimum gap between shifts (hours) */
  minInterShiftGap: number;
}

/** Indian labor law–compliant default policy */
const DEFAULT_POLICY: OvertimePolicy = {
  standardHoursPerDay: 8,
  standardHoursPerWeek: 48,
  overtimeMultiplier: 2.0,      // Double rate per Factories Act
  holidayMultiplier: 2.0,       // Double rate for holiday work
  nightDifferentialPercent: 10,  // 10% extra for night shifts
  compOffForHolidays: true,
  maxOvertimePerWeek: 12,
  maxOvertimePerMonth: 50,
  minInterShiftGap: 10.5,       // Minimum 10.5 hours between shifts
};

/**
 * Overtime Rules Domain Service.
 *
 * Implements Indian labor law compliance:
 * - Factories Act 1948: OT at 2x normal rate
 * - Max 48 hours/week, max 9 hours/day
 * - Spread-over not exceeding 10.5 hours
 * - Night shift differential (10% extra)
 * - Holiday work: 2x pay OR compensatory off
 * - Weekly off: mandatory 1 day per week
 *
 * @example
 * ```ts
 * const service = new OvertimeRulesService();
 * const result = service.computeOvertime(sessions, monthlyBasePay, "March 2026");
 * console.log(result.overtimePay); // ₹12,500
 * console.log(result.compOffEarned); // 2 days
 * ```
 */
export class OvertimeRulesService {

  /**
   * Computes overtime pay for a period based on work sessions.
   *
   * @param sessions Work sessions for the period
   * @param monthlyBasePay Employee's monthly base pay (for hourly rate)
   * @param period Period label (e.g., "March 2026")
   * @param policy Overtime policy (defaults to Indian labor law)
   */
  computeOvertime(
    sessions: WorkSession[],
    monthlyBasePay: number,
    period: string,
    policy: OvertimePolicy = DEFAULT_POLICY,
  ): OvertimeResult {
    const hourlyRate = monthlyBasePay / (policy.standardHoursPerDay * 26); // 26 working days
    const breakdown: OvertimeResult["breakdown"] = [];
    let regularHours = 0;
    let overtimeHours = 0;
    let holidayHours = 0;
    let nightShiftHours = 0;
    let compOffEarned = 0;

    for (const session of sessions) {
      const dateStr = session.date.toISOString().split("T")[0];

      if (session.isHoliday || session.isWeekend) {
        // Holiday/weekend work
        holidayHours += session.totalHours;
        const rate = hourlyRate * policy.holidayMultiplier;
        breakdown.push({
          date: dateStr, hours: session.totalHours,
          type: "HOLIDAY", rate, amount: Math.round(session.totalHours * rate),
        });

        if (policy.compOffForHolidays && session.totalHours >= policy.standardHoursPerDay / 2) {
          compOffEarned += session.totalHours >= policy.standardHoursPerDay ? 1 : 0.5;
        }
      } else {
        // Regular workday
        const regularForDay = Math.min(session.totalHours, policy.standardHoursPerDay);
        const otForDay = Math.max(0, session.totalHours - policy.standardHoursPerDay);

        regularHours += regularForDay;
        breakdown.push({
          date: dateStr, hours: regularForDay,
          type: "REGULAR", rate: hourlyRate, amount: Math.round(regularForDay * hourlyRate),
        });

        if (otForDay > 0) {
          overtimeHours += otForDay;
          const otRate = hourlyRate * policy.overtimeMultiplier;
          breakdown.push({
            date: dateStr, hours: otForDay,
            type: "OVERTIME", rate: otRate, amount: Math.round(otForDay * otRate),
          });
        }

        // Night shift detection
        if (session.shiftType === "NIGHT") {
          nightShiftHours += session.totalHours;
          breakdown.push({
            date: dateStr, hours: session.totalHours,
            type: "NIGHT_SHIFT", rate: hourlyRate * (policy.nightDifferentialPercent / 100),
            amount: Math.round(session.totalHours * hourlyRate * (policy.nightDifferentialPercent / 100)),
          });
        }
      }
    }

    const regularPay = Math.round(regularHours * hourlyRate);
    const overtimePay = Math.round(overtimeHours * hourlyRate * policy.overtimeMultiplier);
    const holidayPay = Math.round(holidayHours * hourlyRate * policy.holidayMultiplier);
    const nightDifferential = Math.round(nightShiftHours * hourlyRate * (policy.nightDifferentialPercent / 100));

    return {
      employeeId: sessions[0]?.employeeId || "",
      period,
      regularHours: Math.round(regularHours * 10) / 10,
      overtimeHours: Math.round(overtimeHours * 10) / 10,
      holidayHours: Math.round(holidayHours * 10) / 10,
      nightShiftHours: Math.round(nightShiftHours * 10) / 10,
      regularPay, overtimePay, holidayPay, nightDifferential,
      compOffEarned,
      totalPay: regularPay + overtimePay + holidayPay + nightDifferential,
      breakdown,
    };
  }

  /**
   * Validates work sessions against labor law compliance.
   */
  validateCompliance(
    sessions: WorkSession[],
    policy: OvertimePolicy = DEFAULT_POLICY,
  ): { compliant: boolean; violations: Array<{ rule: string; details: string; severity: "WARNING" | "VIOLATION" }> } {
    const violations: Array<{ rule: string; details: string; severity: "WARNING" | "VIOLATION" }> = [];

    // Weekly OT check
    const weeklyGroups = this.groupByWeek(sessions);
    for (const [week, weekSessions] of weeklyGroups) {
      const weeklyHours = weekSessions.reduce((s, ws) => s + ws.totalHours, 0);
      const weeklyOT = Math.max(0, weeklyHours - policy.standardHoursPerWeek);

      if (weeklyOT > policy.maxOvertimePerWeek) {
        violations.push({
          rule: "MAX_WEEKLY_OT",
          details: `Week ${week}: ${weeklyOT.toFixed(1)}h OT exceeds ${policy.maxOvertimePerWeek}h limit`,
          severity: "VIOLATION",
        });
      }

      // Weekly off check
      const workDays = new Set(weekSessions.map(s => s.date.toISOString().split("T")[0]));
      if (workDays.size >= 7) {
        violations.push({
          rule: "WEEKLY_REST",
          details: `Week ${week}: No weekly rest day — all 7 days worked`,
          severity: "VIOLATION",
        });
      }
    }

    // Monthly OT check
    const monthlyOT = sessions
      .filter(s => !s.isHoliday && !s.isWeekend)
      .reduce((s, ws) => s + Math.max(0, ws.totalHours - policy.standardHoursPerDay), 0);
    if (monthlyOT > policy.maxOvertimePerMonth) {
      violations.push({
        rule: "MAX_MONTHLY_OT",
        details: `${monthlyOT.toFixed(1)}h monthly OT exceeds ${policy.maxOvertimePerMonth}h limit`,
        severity: "VIOLATION",
      });
    }

    // Daily hours check
    for (const session of sessions) {
      if (session.totalHours > 12) {
        violations.push({
          rule: "MAX_DAILY_HOURS",
          details: `${session.date.toISOString().split("T")[0]}: ${session.totalHours.toFixed(1)}h exceeds 12h daily maximum`,
          severity: "VIOLATION",
        });
      }
    }

    // Inter-shift gap check
    const sorted = [...sessions].sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());
    for (let i = 1; i < sorted.length; i++) {
      const gapHours = (sorted[i].checkIn.getTime() - sorted[i - 1].checkOut.getTime()) / 3600000;
      if (gapHours < policy.minInterShiftGap && gapHours >= 0) {
        violations.push({
          rule: "MIN_INTER_SHIFT_GAP",
          details: `${sorted[i].date.toISOString().split("T")[0]}: ${gapHours.toFixed(1)}h gap below ${policy.minInterShiftGap}h minimum`,
          severity: "WARNING",
        });
      }
    }

    return { compliant: violations.filter(v => v.severity === "VIOLATION").length === 0, violations };
  }

  /**
   * Generates overtime summary for payroll integration.
   */
  generatePayrollSummary(
    results: OvertimeResult[],
  ): {
    totalEmployees: number;
    totalOvertimeHours: number;
    totalOvertimePay: number;
    totalHolidayPay: number;
    totalNightDifferential: number;
    totalCompOff: number;
    grandTotal: number;
    topOvertimeEmployees: Array<{ employeeId: string; hours: number; pay: number }>;
  } {
    const totalOvertimeHours = results.reduce((s, r) => s + r.overtimeHours, 0);
    const totalOvertimePay = results.reduce((s, r) => s + r.overtimePay, 0);
    const totalHolidayPay = results.reduce((s, r) => s + r.holidayPay, 0);
    const totalNightDifferential = results.reduce((s, r) => s + r.nightDifferential, 0);
    const totalCompOff = results.reduce((s, r) => s + r.compOffEarned, 0);

    const topEmployees = results
      .filter(r => r.overtimeHours > 0)
      .sort((a, b) => b.overtimeHours - a.overtimeHours)
      .slice(0, 10)
      .map(r => ({ employeeId: r.employeeId, hours: r.overtimeHours, pay: r.overtimePay }));

    return {
      totalEmployees: results.length,
      totalOvertimeHours: Math.round(totalOvertimeHours * 10) / 10,
      totalOvertimePay,
      totalHolidayPay,
      totalNightDifferential,
      totalCompOff,
      grandTotal: totalOvertimePay + totalHolidayPay + totalNightDifferential,
      topOvertimeEmployees: topEmployees,
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private groupByWeek(sessions: WorkSession[]): Map<string, WorkSession[]> {
    const groups = new Map<string, WorkSession[]>();
    for (const session of sessions) {
      const weekStart = new Date(session.date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const key = weekStart.toISOString().split("T")[0];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(session);
    }
    return groups;
  }
}
