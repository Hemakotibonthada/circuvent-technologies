// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Overtime Rules Service
// Tests overtime computation, compliance validation, payroll summary.
// ══════════════════════════════════════════════════════════════════════════════

import { OvertimeRulesService, WorkSession } from "../../../src/domain/services/overtime-rules.service";

function createSession(overrides: Partial<WorkSession> & { date: Date }): WorkSession {
  const checkIn = new Date(overrides.date);
  checkIn.setHours(9, 0, 0);
  const totalHours = overrides.totalHours ?? 8;
  const checkOut = new Date(checkIn.getTime() + totalHours * 3600000);
  return {
    employeeId: "emp-001",
    checkIn, checkOut, totalHours,
    isHoliday: false, isWeekend: false,
    shiftType: "GENERAL",
    ...overrides,
  };
}

describe("OvertimeRulesService", () => {
  let service: OvertimeRulesService;

  beforeEach(() => { service = new OvertimeRulesService(); });

  describe("Overtime Computation", () => {
    it("should calculate zero OT for standard 8h day", () => {
      const sessions = [createSession({ date: new Date("2026-03-02"), totalHours: 8 })];
      const result = service.computeOvertime(sessions, 50000, "March 2026");
      expect(result.overtimeHours).toBe(0);
      expect(result.overtimePay).toBe(0);
    });

    it("should calculate OT for hours beyond 8h standard", () => {
      const sessions = [createSession({ date: new Date("2026-03-02"), totalHours: 10 })];
      const result = service.computeOvertime(sessions, 50000, "March 2026");
      expect(result.overtimeHours).toBe(2);
      expect(result.overtimePay).toBeGreaterThan(0);
    });

    it("should apply 2x rate for overtime (Factories Act)", () => {
      const sessions = [createSession({ date: new Date("2026-03-02"), totalHours: 10 })];
      const result = service.computeOvertime(sessions, 50000, "March 2026");
      // OT pay should be roughly 2x the regular hourly rate * 2 hours
      const hourlyRate = 50000 / (8 * 26);
      const expectedOT = Math.round(2 * hourlyRate * 2);
      expect(result.overtimePay).toBeCloseTo(expectedOT, -1);
    });

    it("should apply holiday rate for holiday work", () => {
      const sessions = [createSession({ date: new Date("2026-03-06"), totalHours: 8, isHoliday: true })];
      const result = service.computeOvertime(sessions, 50000, "March 2026");
      expect(result.holidayHours).toBe(8);
      expect(result.holidayPay).toBeGreaterThan(0);
    });

    it("should earn comp-off for holiday work", () => {
      const sessions = [createSession({ date: new Date("2026-03-06"), totalHours: 8, isHoliday: true })];
      const result = service.computeOvertime(sessions, 50000, "March 2026");
      expect(result.compOffEarned).toBe(1);
    });

    it("should earn 0.5 comp-off for half-day holiday work", () => {
      const sessions = [createSession({ date: new Date("2026-03-06"), totalHours: 5, isHoliday: true })];
      const result = service.computeOvertime(sessions, 50000, "March 2026");
      expect(result.compOffEarned).toBe(0.5);
    });

    it("should apply night differential", () => {
      const sessions = [createSession({ date: new Date("2026-03-02"), totalHours: 8, shiftType: "NIGHT" })];
      const result = service.computeOvertime(sessions, 50000, "March 2026");
      expect(result.nightShiftHours).toBe(8);
      expect(result.nightDifferential).toBeGreaterThan(0);
    });

    it("should handle multiple sessions in a period", () => {
      const sessions = [
        createSession({ date: new Date("2026-03-02"), totalHours: 9 }),
        createSession({ date: new Date("2026-03-03"), totalHours: 10 }),
        createSession({ date: new Date("2026-03-04"), totalHours: 8 }),
        createSession({ date: new Date("2026-03-06"), totalHours: 6, isHoliday: true }),
      ];
      const result = service.computeOvertime(sessions, 50000, "March 2026");
      expect(result.regularHours).toBe(24); // 8 + 8 + 8
      expect(result.overtimeHours).toBe(3); // 1 + 2
      expect(result.holidayHours).toBe(6);
      expect(result.breakdown.length).toBeGreaterThan(0);
    });
  });

  describe("Compliance Validation", () => {
    it("should detect weekly OT exceeding limit", () => {
      // 6 days x 10 hours = 12h OT per week
      const sessions = Array.from({ length: 6 }, (_, i) =>
        createSession({ date: new Date(`2026-03-${2 + i}`), totalHours: 10 })
      );
      sessions.push(createSession({ date: new Date("2026-03-08"), totalHours: 10 })); // 7th day

      const result = service.validateCompliance(sessions);
      // Should detect either weekly OT or no rest day
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it("should detect missing weekly rest day", () => {
      const sessions = Array.from({ length: 7 }, (_, i) =>
        createSession({ date: new Date(`2026-03-${2 + i}`), totalHours: 8 })
      );
      const result = service.validateCompliance(sessions);
      const restViolation = result.violations.find((v: any) => v.rule === "WEEKLY_REST");
      expect(restViolation).toBeDefined();
    });

    it("should detect daily hours exceeding 12h", () => {
      const sessions = [createSession({ date: new Date("2026-03-02"), totalHours: 14 })];
      const result = service.validateCompliance(sessions);
      const dailyViolation = result.violations.find((v: any) => v.rule === "MAX_DAILY_HOURS");
      expect(dailyViolation).toBeDefined();
    });

    it("should pass for compliant work schedule", () => {
      const sessions = Array.from({ length: 5 }, (_, i) =>
        createSession({ date: new Date(`2026-03-${2 + i}`), totalHours: 8 })
      );
      const result = service.validateCompliance(sessions);
      expect(result.compliant).toBe(true);
    });
  });

  describe("Payroll Summary", () => {
    it("should aggregate overtime across employees", () => {
      const results = [
        service.computeOvertime(
          [createSession({ date: new Date("2026-03-02"), totalHours: 10, employeeId: "e1" } as any)],
          50000, "March 2026"
        ),
        service.computeOvertime(
          [createSession({ date: new Date("2026-03-02"), totalHours: 12, employeeId: "e2" } as any)],
          60000, "March 2026"
        ),
      ];

      const summary = service.generatePayrollSummary(results);
      expect(summary.totalEmployees).toBe(2);
      expect(summary.totalOvertimeHours).toBeGreaterThan(0);
      expect(summary.totalOvertimePay).toBeGreaterThan(0);
      expect(summary.topOvertimeEmployees.length).toBe(2);
    });
  });
});
