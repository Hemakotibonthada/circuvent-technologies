// ──────────────────────────────────────────────────────────────
// HR & Payroll — Analytics Service Test Suite
// Tests for all 10 analytics methods: retention, department
// performance, salary benchmark, leave patterns, expense
// analysis, attendance, hiring funnel, training effectiveness,
// recognition trends, and payroll projections.
// ──────────────────────────────────────────────────────────────

import { AnalyticsService } from "../services/analytics.service";

// ══════════════════════════════════════════════════════════════
// Mock PrismaClient
// ══════════════════════════════════════════════════════════════

const mockPrisma = {
  employee: {
    count: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  resignation: { count: jest.fn() },
  goal: { aggregate: jest.fn() },
  timesheet: { aggregate: jest.fn() },
  recognition: { count: jest.fn(), findMany: jest.fn() },
  performanceReview: { aggregate: jest.fn() },
  trainingEnrollment: { count: jest.fn(), findMany: jest.fn() },
  leaveRecord: { findMany: jest.fn(), aggregate: jest.fn() },
  expenseClaim: { findMany: jest.fn(), aggregate: jest.fn() },
  attendanceLog: {
    findMany: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  application: { findMany: jest.fn() },
  jobPosting: { count: jest.fn() },
  trainingProgram: { count: jest.fn() },
  user: { findMany: jest.fn() },
  salarySlip: { aggregate: jest.fn() },
  notification: { groupBy: jest.fn() },
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
  Prisma: {},
}));

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function createDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

function makeEmployee(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id || "emp-1",
    employeeCode: overrides.employeeCode || "CT-001",
    department: overrides.department || "Engineering",
    designation: overrides.designation || "SDE-1",
    baseSalary: overrides.baseSalary ?? 600000,
    dateOfJoining: overrides.dateOfJoining || createDate(2023, 1, 15),
    dateOfLeaving: overrides.dateOfLeaving || null,
    status: overrides.status || "ACTIVE",
    userId: overrides.userId || "user-1",
    user: overrides.user || { firstName: "Test", lastName: "User" },
    ...(overrides.extra || {}),
  };
}

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("AnalyticsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────
  // 1. Employee Retention
  // ────────────────────────────────────────────────────────────
  describe("employeeRetention", () => {
    const period = {
      startDate: createDate(2025, 1, 1),
      endDate: createDate(2025, 6, 30),
    };

    it("should calculate retention rate correctly", async () => {
      mockPrisma.employee.count
        .mockResolvedValueOnce(100) // startHeadcount
        .mockResolvedValueOnce(95)  // endHeadcount
        .mockResolvedValueOnce(10)  // newHires
        .mockResolvedValueOnce(7);  // exits
      mockPrisma.resignation.count.mockResolvedValue(5);
      mockPrisma.employee.findMany.mockResolvedValue([
        { dateOfJoining: createDate(2022, 6, 1) },
        { dateOfJoining: createDate(2023, 3, 15) },
      ]);

      const result = await AnalyticsService.employeeRetention(period);

      expect(result.startHeadcount).toBe(100);
      expect(result.endHeadcount).toBe(95);
      expect(result.newHires).toBe(10);
      expect(result.exits).toBe(7);
      expect(result.voluntaryExits).toBe(5);
      expect(result.retentionRate).toBeGreaterThan(0);
      expect(result.retentionRate).toBeLessThanOrEqual(100);
      expect(result.avgTenureMonths).toBeGreaterThan(0);
      expect(result.period.start).toEqual(period.startDate);
      expect(result.period.end).toEqual(period.endDate);
    });

    it("should return 100% retention when no exits", async () => {
      mockPrisma.employee.count
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(55)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(0); // zero exits
      mockPrisma.resignation.count.mockResolvedValue(0);
      mockPrisma.employee.findMany.mockResolvedValue([
        { dateOfJoining: createDate(2024, 1, 1) },
      ]);

      const result = await AnalyticsService.employeeRetention(period);

      expect(result.exits).toBe(0);
      expect(result.retentionRate).toBe(100);
    });

    it("should handle zero headcount gracefully", async () => {
      mockPrisma.employee.count.mockResolvedValue(0);
      mockPrisma.resignation.count.mockResolvedValue(0);
      mockPrisma.employee.findMany.mockResolvedValue([]);

      const result = await AnalyticsService.employeeRetention(period);

      expect(result.startHeadcount).toBe(0);
      expect(result.endHeadcount).toBe(0);
      expect(result.avgTenureMonths).toBe(0);
      expect(result.retentionRate).toBe(100);
    });

    it("should include monthly retention trend", async () => {
      mockPrisma.employee.count.mockResolvedValue(50);
      mockPrisma.resignation.count.mockResolvedValue(0);
      mockPrisma.employee.findMany.mockResolvedValue([
        { dateOfJoining: createDate(2024, 6, 1) },
      ]);

      const result = await AnalyticsService.employeeRetention(period);

      expect(result.retentionTrend).toBeDefined();
      expect(Array.isArray(result.retentionTrend)).toBe(true);
      for (const point of result.retentionTrend) {
        expect(point).toHaveProperty("month");
        expect(point).toHaveProperty("rate");
        expect(point).toHaveProperty("headcount");
        expect(point.rate).toBeLessThanOrEqual(100);
      }
    });

    it("should compute average tenure for a single employee", async () => {
      const joiningDate = createDate(2023, 1, 1);
      mockPrisma.employee.count.mockResolvedValue(1);
      mockPrisma.resignation.count.mockResolvedValue(0);
      mockPrisma.employee.findMany.mockResolvedValue([{ dateOfJoining: joiningDate }]);

      const result = await AnalyticsService.employeeRetention(period);

      expect(result.avgTenureMonths).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 2. Department Performance
  // ────────────────────────────────────────────────────────────
  describe("departmentPerformance", () => {
    it("should return performance metrics for each department", async () => {
      mockPrisma.employee.groupBy.mockResolvedValue([
        { department: "Engineering", _count: { id: 20 } },
        { department: "Design", _count: { id: 5 } },
      ]);
      mockPrisma.goal.aggregate.mockResolvedValue({ _avg: { progress: 72 } });
      mockPrisma.timesheet.aggregate.mockResolvedValue({ _avg: { totalHours: 38.5 } });
      mockPrisma.recognition.count.mockResolvedValue(15);
      mockPrisma.user.findMany.mockResolvedValue([{ id: "u1" }]);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { overallRating: 3.8 } });
      mockPrisma.trainingEnrollment.count.mockResolvedValue(10);
      mockPrisma.leaveRecord.aggregate.mockResolvedValue({ _sum: { totalDays: 48 } });

      const result = await AnalyticsService.departmentPerformance();

      expect(result.length).toBe(2);
      for (const dept of result) {
        expect(dept).toHaveProperty("department");
        expect(dept).toHaveProperty("headcount");
        expect(dept).toHaveProperty("avgGoalCompletion");
        expect(dept).toHaveProperty("avgTimesheetHours");
        expect(dept).toHaveProperty("recognitionCount");
        expect(dept).toHaveProperty("avgPerformanceRating");
        expect(dept).toHaveProperty("trainingCompletion");
        expect(dept).toHaveProperty("leaveUtilization");
        expect(dept).toHaveProperty("performanceScore");
        expect(dept.performanceScore).toBeGreaterThanOrEqual(0);
      }
    });

    it("should sort departments by performance score descending", async () => {
      mockPrisma.employee.groupBy.mockResolvedValue([
        { department: "Low", _count: { id: 5 } },
        { department: "High", _count: { id: 10 } },
      ]);
      mockPrisma.goal.aggregate
        .mockResolvedValueOnce({ _avg: { progress: 30 } })
        .mockResolvedValueOnce({ _avg: { progress: 90 } });
      mockPrisma.timesheet.aggregate.mockResolvedValue({ _avg: { totalHours: 40 } });
      mockPrisma.recognition.count.mockResolvedValue(5);
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.aggregate
        .mockResolvedValueOnce({ _avg: { overallRating: 2.0 } })
        .mockResolvedValueOnce({ _avg: { overallRating: 4.5 } });
      mockPrisma.trainingEnrollment.count.mockResolvedValue(3);
      mockPrisma.leaveRecord.aggregate.mockResolvedValue({ _sum: { totalDays: 10 } });

      const result = await AnalyticsService.departmentPerformance();

      expect(result[0].performanceScore).toBeGreaterThanOrEqual(result[1].performanceScore);
    });

    it("should handle empty departments", async () => {
      mockPrisma.employee.groupBy.mockResolvedValue([]);

      const result = await AnalyticsService.departmentPerformance();

      expect(result).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 3. Salary Benchmark
  // ────────────────────────────────────────────────────────────
  describe("salaryBenchmark", () => {
    it("should compute min, max, avg, median, percentiles", async () => {
      mockPrisma.employee.groupBy.mockResolvedValue([
        { department: "Engineering", _count: { id: 4 } },
      ]);
      mockPrisma.employee.findMany.mockResolvedValue([
        { baseSalary: 400000, designation: "SDE-1" },
        { baseSalary: 600000, designation: "SDE-1" },
        { baseSalary: 800000, designation: "SDE-2" },
        { baseSalary: 1200000, designation: "Tech Lead" },
      ]);

      const result = await AnalyticsService.salaryBenchmark();

      expect(result.length).toBe(1);
      const dept = result[0];
      expect(dept.department).toBe("Engineering");
      expect(dept.headcount).toBe(4);
      expect(dept.min).toBe(400000);
      expect(dept.max).toBe(1200000);
      expect(dept.avg).toBe(750000);
      expect(dept.median).toBe(700000);
      expect(dept.totalCost).toBe(3000000);
      expect(dept.byDesignation.length).toBeGreaterThan(0);
    });

    it("should handle single employee in benchmark", async () => {
      mockPrisma.employee.groupBy.mockResolvedValue([
        { department: "Solo", _count: { id: 1 } },
      ]);
      mockPrisma.employee.findMany.mockResolvedValue([
        { baseSalary: 500000, designation: "Manager" },
      ]);

      const result = await AnalyticsService.salaryBenchmark();

      expect(result.length).toBe(1);
      expect(result[0].min).toBe(500000);
      expect(result[0].max).toBe(500000);
      expect(result[0].avg).toBe(500000);
      expect(result[0].median).toBe(500000);
    });

    it("should skip departments with zero employees", async () => {
      mockPrisma.employee.groupBy.mockResolvedValue([
        { department: "Empty", _count: { id: 0 } },
      ]);
      mockPrisma.employee.findMany.mockResolvedValue([]);

      const result = await AnalyticsService.salaryBenchmark();

      expect(result.length).toBe(0);
    });

    it("should filter by department when specified", async () => {
      mockPrisma.employee.groupBy.mockResolvedValue([
        { department: "Engineering", _count: { id: 3 } },
      ]);
      mockPrisma.employee.findMany.mockResolvedValue([
        { baseSalary: 500000, designation: "SDE-1" },
        { baseSalary: 700000, designation: "SDE-2" },
        { baseSalary: 900000, designation: "SDE-3" },
      ]);

      const result = await AnalyticsService.salaryBenchmark("Engineering");

      expect(result.length).toBe(1);
      expect(result[0].department).toBe("Engineering");
    });

    it("should compute correct designation breakdown", async () => {
      mockPrisma.employee.groupBy.mockResolvedValue([
        { department: "Eng", _count: { id: 4 } },
      ]);
      mockPrisma.employee.findMany.mockResolvedValue([
        { baseSalary: 500000, designation: "SDE-1" },
        { baseSalary: 550000, designation: "SDE-1" },
        { baseSalary: 800000, designation: "SDE-2" },
        { baseSalary: 1200000, designation: "Lead" },
      ]);

      const result = await AnalyticsService.salaryBenchmark();
      const desigs = result[0].byDesignation;

      expect(desigs.length).toBe(3);
      const sde1 = desigs.find((d: any) => d.designation === "SDE-1");
      expect(sde1?.count).toBe(2);
      expect(sde1?.avg).toBe(525000);
      expect(sde1?.min).toBe(500000);
      expect(sde1?.max).toBe(550000);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 4. Leave Pattern Analysis
  // ────────────────────────────────────────────────────────────
  describe("leavePatternAnalysis", () => {
    it("should analyze leave patterns for a given year", async () => {
      mockPrisma.employee.count.mockResolvedValue(50);
      mockPrisma.leaveRecord.findMany.mockResolvedValue([
        {
          id: "l1", employeeId: "e1", leaveType: "CASUAL",
          startDate: createDate(2025, 3, 10), endDate: createDate(2025, 3, 11),
          totalDays: 2,
          employee: { employeeCode: "CT-001", user: { firstName: "Alice", lastName: "Dev" } },
        },
        {
          id: "l2", employeeId: "e2", leaveType: "SICK",
          startDate: createDate(2025, 7, 1), endDate: createDate(2025, 7, 3),
          totalDays: 3,
          employee: { employeeCode: "CT-002", user: { firstName: "Bob", lastName: "Test" } },
        },
      ]);

      const result = await AnalyticsService.leavePatternAnalysis(2025);

      expect(result.totalLeavesTaken).toBe(2);
      expect(result.avgLeavesPerEmployee).toBeGreaterThan(0);
      expect(result.peakLeaveMonths.length).toBeGreaterThan(0);
      expect(result.leaveTypeDistribution.length).toBe(2);
      expect(result.frequentLeaveTakers.length).toBe(2);
      expect(result.dayOfWeekPattern.length).toBe(7);
      expect(result.monthlyTrend.length).toBe(12);
    });

    it("should handle empty leave data", async () => {
      mockPrisma.employee.count.mockResolvedValue(10);
      mockPrisma.leaveRecord.findMany.mockResolvedValue([]);

      const result = await AnalyticsService.leavePatternAnalysis(2025);

      expect(result.totalLeavesTaken).toBe(0);
      expect(result.avgLeavesPerEmployee).toBe(0);
      expect(result.peakLeaveMonths).toEqual([]);
      expect(result.leaveTypeDistribution).toEqual([]);
      expect(result.frequentLeaveTakers).toEqual([]);
    });

    it("should use current year when no year is provided", async () => {
      mockPrisma.employee.count.mockResolvedValue(5);
      mockPrisma.leaveRecord.findMany.mockResolvedValue([]);

      const result = await AnalyticsService.leavePatternAnalysis();

      expect(result.monthlyTrend.length).toBe(12);
    });

    it("should sort frequent leave takers by total days descending", async () => {
      const leaves = [
        { id: "l1", employeeId: "e1", leaveType: "CASUAL", startDate: createDate(2025, 2, 5), totalDays: 1, employee: { employeeCode: "CT-001", user: { firstName: "A", lastName: "A" } } },
        { id: "l2", employeeId: "e1", leaveType: "CASUAL", startDate: createDate(2025, 3, 10), totalDays: 3, employee: { employeeCode: "CT-001", user: { firstName: "A", lastName: "A" } } },
        { id: "l3", employeeId: "e2", leaveType: "SICK", startDate: createDate(2025, 4, 1), totalDays: 1, employee: { employeeCode: "CT-002", user: { firstName: "B", lastName: "B" } } },
      ];
      mockPrisma.employee.count.mockResolvedValue(10);
      mockPrisma.leaveRecord.findMany.mockResolvedValue(leaves);

      const result = await AnalyticsService.leavePatternAnalysis(2025);

      expect(result.frequentLeaveTakers[0].totalDays).toBeGreaterThanOrEqual(
        result.frequentLeaveTakers[1].totalDays
      );
    });
  });

  // ────────────────────────────────────────────────────────────
  // 5. Expense Analysis
  // ────────────────────────────────────────────────────────────
  describe("expenseAnalysis", () => {
    const period = {
      startDate: createDate(2025, 1, 1),
      endDate: createDate(2025, 6, 30),
    };

    it("should aggregate expense data correctly", async () => {
      mockPrisma.expenseClaim.findMany.mockResolvedValue([
        {
          id: "exp-1", employeeId: "e1", totalAmount: 5000, isRnDExpense: false,
          createdAt: createDate(2025, 2, 10),
          employee: { department: "Engineering", employeeCode: "CT-001", user: { firstName: "A", lastName: "B" } },
          items: [{ description: "Travel cab", amount: 3000, isRnDRelated: false }, { description: "Hotel stay", amount: 2000, isRnDRelated: false }],
        },
        {
          id: "exp-2", employeeId: "e2", totalAmount: 15000, isRnDExpense: true,
          createdAt: createDate(2025, 3, 15),
          employee: { department: "R&D", employeeCode: "CT-002", user: { firstName: "C", lastName: "D" } },
          items: [{ description: "Cloud infra", amount: 15000, isRnDRelated: true }],
        },
      ]);
      mockPrisma.expenseClaim.aggregate.mockResolvedValue({ _sum: { totalAmount: 8000 } });

      const result = await AnalyticsService.expenseAnalysis(period);

      expect(result.totalExpenses).toBe(20000);
      expect(result.claimCount).toBe(2);
      expect(result.avgClaimAmount).toBe(10000);
      expect(result.rndExpenses).toBe(15000);
      expect(result.byDepartment.length).toBe(2);
      expect(result.topSpenders.length).toBe(2);
    });

    it("should handle empty expense data", async () => {
      mockPrisma.expenseClaim.findMany.mockResolvedValue([]);
      mockPrisma.expenseClaim.aggregate.mockResolvedValue({ _sum: { totalAmount: 0 } });

      const result = await AnalyticsService.expenseAnalysis(period);

      expect(result.totalExpenses).toBe(0);
      expect(result.claimCount).toBe(0);
      expect(result.avgClaimAmount).toBe(0);
    });

    it("should limit top spenders to 10", async () => {
      const claims = Array.from({ length: 15 }, (_, i) => ({
        id: `exp-${i}`, employeeId: `e${i}`, totalAmount: (i + 1) * 1000,
        isRnDExpense: false, createdAt: createDate(2025, 2, 1),
        employee: { department: "Eng", employeeCode: `CT-${i}`, user: { firstName: `F${i}`, lastName: `L${i}` } },
        items: [{ description: "General", amount: (i + 1) * 1000, isRnDRelated: false }],
      }));
      mockPrisma.expenseClaim.findMany.mockResolvedValue(claims);
      mockPrisma.expenseClaim.aggregate.mockResolvedValue({ _sum: { totalAmount: 0 } });

      const result = await AnalyticsService.expenseAnalysis(period);

      expect(result.topSpenders.length).toBe(10);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 6. Attendance Analysis
  // ────────────────────────────────────────────────────────────
  describe("attendanceAnalysis", () => {
    it("should compute attendance metrics from logs", async () => {
      mockPrisma.attendanceLog.findMany.mockResolvedValue([
        { status: "PRESENT", totalHours: 8.5, checkIn: new Date("2025-03-10T09:00:00"), checkOut: new Date("2025-03-10T17:30:00"), date: createDate(2025, 3, 10), employee: { department: "Engineering" } },
        { status: "PRESENT", totalHours: 9.0, checkIn: new Date("2025-03-10T08:30:00"), checkOut: new Date("2025-03-10T17:30:00"), date: createDate(2025, 3, 10), employee: { department: "Engineering" } },
        { status: "ABSENT", totalHours: null, checkIn: null, checkOut: null, date: createDate(2025, 3, 11), employee: { department: "Design" } },
        { status: "WORK_FROM_HOME", totalHours: 7.5, checkIn: new Date("2025-03-12T09:30:00"), checkOut: new Date("2025-03-12T17:00:00"), date: createDate(2025, 3, 12), employee: { department: "Engineering" } },
      ]);

      const result = await AnalyticsService.attendanceAnalysis({
        startDate: createDate(2025, 3, 1),
        endDate: createDate(2025, 3, 31),
      });

      expect(result.totalRecords).toBe(4);
      expect(result.onTimeRate).toBe(75); // 3 present/wfh out of 4
      expect(result.absenteeRate).toBe(25);
      expect(result.wfhRate).toBe(25);
      expect(result.avgWorkingHours).toBeGreaterThan(0);
      expect(result.statusBreakdown.length).toBeGreaterThan(0);
      expect(result.departmentAttendance.length).toBe(2);
      expect(result.weekdayPattern.length).toBe(7);
    });

    it("should handle empty attendance data", async () => {
      mockPrisma.attendanceLog.findMany.mockResolvedValue([]);

      const result = await AnalyticsService.attendanceAnalysis({
        startDate: createDate(2025, 1, 1),
        endDate: createDate(2025, 1, 31),
      });

      expect(result.totalRecords).toBe(0);
      expect(result.onTimeRate).toBe(0);
      expect(result.avgWorkingHours).toBe(0);
      expect(result.absenteeRate).toBe(0);
    });

    it("should detect late arrivals (after 10:00)", async () => {
      mockPrisma.attendanceLog.findMany.mockResolvedValue([
        { status: "PRESENT", totalHours: 7, checkIn: new Date("2025-03-10T10:30:00"), checkOut: new Date("2025-03-10T17:30:00"), date: createDate(2025, 3, 10), employee: { department: "Eng" } },
        { status: "PRESENT", totalHours: 8, checkIn: new Date("2025-03-10T09:00:00"), checkOut: new Date("2025-03-10T17:00:00"), date: createDate(2025, 3, 10), employee: { department: "Eng" } },
      ]);

      const result = await AnalyticsService.attendanceAnalysis();

      expect(result.lateArrivals).toBe(1);
    });

    it("should detect early departures (before 17:00)", async () => {
      mockPrisma.attendanceLog.findMany.mockResolvedValue([
        { status: "PRESENT", totalHours: 6, checkIn: new Date("2025-03-10T09:00:00"), checkOut: new Date("2025-03-10T15:00:00"), date: createDate(2025, 3, 10), employee: { department: "Eng" } },
      ]);

      const result = await AnalyticsService.attendanceAnalysis();

      expect(result.earlyDepartures).toBe(1);
    });

    it("should default to current month when no period is given", async () => {
      mockPrisma.attendanceLog.findMany.mockResolvedValue([]);

      const result = await AnalyticsService.attendanceAnalysis();

      expect(result.totalRecords).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 7. Hiring Funnel
  // ────────────────────────────────────────────────────────────
  describe("hiringFunnel", () => {
    it("should compute hiring funnel stages and conversion rates", async () => {
      mockPrisma.application.findMany.mockResolvedValue([
        { status: "HIRED", hiredAt: createDate(2025, 4, 1), appliedAt: createDate(2025, 2, 1), job: { division: "Product", department: "Eng" }, candidate: { source: "LinkedIn" } },
        { status: "SCREENING", hiredAt: null, appliedAt: createDate(2025, 3, 1), job: { division: "Product", department: "Eng" }, candidate: { source: "Referral" } },
        { status: "APPLIED", hiredAt: null, appliedAt: createDate(2025, 3, 10), job: { division: "Ops", department: "HR" }, candidate: { source: "LinkedIn" } },
      ]);
      mockPrisma.jobPosting.count.mockResolvedValue(5);

      const result = await AnalyticsService.hiringFunnel();

      expect(result.totalApplications).toBe(3);
      expect(result.totalHired).toBe(1);
      expect(result.overallConversionRate).toBeGreaterThan(0);
      expect(result.stages.length).toBeGreaterThan(0);
      expect(result.byDivision.length).toBeGreaterThan(0);
      expect(result.sourceEffectiveness.length).toBeGreaterThan(0);
      expect(result.openPositions).toBe(5);
    });

    it("should return zero conversion when no applications", async () => {
      mockPrisma.application.findMany.mockResolvedValue([]);
      mockPrisma.jobPosting.count.mockResolvedValue(0);

      const result = await AnalyticsService.hiringFunnel();

      expect(result.totalApplications).toBe(0);
      expect(result.totalHired).toBe(0);
      expect(result.overallConversionRate).toBe(0);
    });

    it("should calculate avg time to hire", async () => {
      const hired = createDate(2025, 5, 1);
      const applied = createDate(2025, 3, 1);
      mockPrisma.application.findMany.mockResolvedValue([
        { status: "HIRED", hiredAt: hired, appliedAt: applied, job: { division: "Eng", department: "Eng" }, candidate: { source: "Direct" } },
      ]);
      mockPrisma.jobPosting.count.mockResolvedValue(1);

      const result = await AnalyticsService.hiringFunnel();

      expect(result.avgTimeToHire).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 8. Training Effectiveness
  // ────────────────────────────────────────────────────────────
  describe("trainingEffectiveness", () => {
    it("should compute training metrics", async () => {
      mockPrisma.trainingProgram.count.mockResolvedValue(10);
      mockPrisma.trainingEnrollment.findMany.mockResolvedValue([
        {
          id: "te1", employeeId: "e1", status: "COMPLETED", score: 85, progress: 100,
          program: { category: "TECHNICAL", mandatory: true },
          employee: { employeeCode: "CT-001", performanceReviews: [{ overallRating: 4.2 }] },
        },
        {
          id: "te2", employeeId: "e2", status: "IN_PROGRESS", score: null, progress: 50,
          program: { category: "COMPLIANCE", mandatory: true },
          employee: { employeeCode: "CT-002", performanceReviews: [] },
        },
        {
          id: "te3", employeeId: "e3", status: "DROPPED", score: null, progress: 10,
          program: { category: "TECHNICAL", mandatory: false },
          employee: { employeeCode: "CT-003", performanceReviews: [] },
        },
      ]);

      const result = await AnalyticsService.trainingEffectiveness();

      expect(result.totalPrograms).toBe(10);
      expect(result.totalEnrollments).toBe(3);
      expect(result.completionRate).toBe(33); // 1 of 3
      expect(result.avgScore).toBe(85);
      expect(result.dropoutRate).toBe(33);
      expect(result.byCategory.length).toBeGreaterThan(0);
      expect(result.mandatoryComplianceRate).toBe(50); // 1 of 2 mandatory
    });

    it("should handle empty training data", async () => {
      mockPrisma.trainingProgram.count.mockResolvedValue(0);
      mockPrisma.trainingEnrollment.findMany.mockResolvedValue([]);

      const result = await AnalyticsService.trainingEffectiveness();

      expect(result.totalPrograms).toBe(0);
      expect(result.totalEnrollments).toBe(0);
      expect(result.completionRate).toBe(0);
      expect(result.avgScore).toBe(0);
      expect(result.mandatoryComplianceRate).toBe(100);
    });

    it("should correlate training with performance", async () => {
      mockPrisma.trainingProgram.count.mockResolvedValue(5);
      mockPrisma.trainingEnrollment.findMany.mockResolvedValue([
        {
          id: "te1", employeeId: "e1", status: "COMPLETED", score: 90, progress: 100,
          program: { category: "TECH", mandatory: false },
          employee: { employeeCode: "CT-001", performanceReviews: [{ overallRating: 4.5 }] },
        },
        {
          id: "te2", employeeId: "e1", status: "COMPLETED", score: 88, progress: 100,
          program: { category: "SOFT", mandatory: false },
          employee: { employeeCode: "CT-001", performanceReviews: [{ overallRating: 4.5 }] },
        },
      ]);

      const result = await AnalyticsService.trainingEffectiveness();

      expect(result.performanceCorrelation.length).toBe(1);
      expect(result.performanceCorrelation[0].trainingsCompleted).toBe(2);
      expect(result.performanceCorrelation[0].avgTrainingScore).toBe(89);
      expect(result.performanceCorrelation[0].performanceRating).toBe(4.5);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 9. Recognition Analytics
  // ────────────────────────────────────────────────────────────
  describe("recognitionAnalytics", () => {
    it("should aggregate recognition data", async () => {
      mockPrisma.recognition.findMany.mockResolvedValue([
        { id: "r1", giverId: "u1", receiverId: "u2", points: 10, category: "TEAMWORK", type: "KUDOS", createdAt: createDate(2025, 2, 10) },
        { id: "r2", giverId: "u2", receiverId: "u1", points: 20, category: "INNOVATION", type: "AWARD", createdAt: createDate(2025, 5, 15) },
        { id: "r3", giverId: "u1", receiverId: "u3", points: 5, category: "TEAMWORK", type: "KUDOS", createdAt: createDate(2025, 2, 20) },
      ]);
      mockPrisma.employee.count.mockResolvedValue(10);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "u1", firstName: "Alice", lastName: "Dev" },
        { id: "u2", firstName: "Bob", lastName: "PM" },
        { id: "u3", firstName: "Charlie", lastName: "QA" },
      ]);

      const deptUsers = [
        { id: "u1", department: "Eng" },
        { id: "u2", department: "Product" },
        { id: "u3", department: "Eng" },
      ];
      mockPrisma.user.findMany
        .mockResolvedValueOnce([
          { id: "u1", firstName: "Alice", lastName: "Dev" },
          { id: "u2", firstName: "Bob", lastName: "PM" },
          { id: "u3", firstName: "Charlie", lastName: "QA" },
        ])
        .mockResolvedValueOnce(deptUsers);

      const result = await AnalyticsService.recognitionAnalytics(2025);

      expect(result.totalRecognitions).toBe(3);
      expect(result.totalPoints).toBe(35);
      expect(result.avgPerEmployee).toBeGreaterThan(0);
      expect(result.topGivers.length).toBeGreaterThan(0);
      expect(result.topReceivers.length).toBeGreaterThan(0);
      expect(result.byCategory.length).toBe(2);
      expect(result.byType.length).toBe(2);
      expect(result.monthlyTrend.length).toBe(12);
    });

    it("should handle no recognitions", async () => {
      mockPrisma.recognition.findMany.mockResolvedValue([]);
      mockPrisma.employee.count.mockResolvedValue(5);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await AnalyticsService.recognitionAnalytics(2025);

      expect(result.totalRecognitions).toBe(0);
      expect(result.totalPoints).toBe(0);
      expect(result.avgPerEmployee).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 10. Payroll Projection
  // ────────────────────────────────────────────────────────────
  describe("payrollProjection", () => {
    it("should project future payroll costs", async () => {
      const aggregateResult = {
        _sum: { grossSalary: 500000, netSalary: 400000, totalDeductions: 100000 },
        _count: { id: 10 },
      };
      mockPrisma.salarySlip.aggregate.mockResolvedValue(aggregateResult);
      mockPrisma.employee.groupBy.mockResolvedValue([
        { department: "Engineering", _count: { id: 8 }, _sum: { baseSalary: 4800000 } },
        { department: "Design", _count: { id: 2 }, _sum: { baseSalary: 960000 } },
      ]);
      mockPrisma.employee.count.mockResolvedValue(10);

      const result = await AnalyticsService.payrollProjection(6);

      expect(result.currentMonthlyPayroll).toBeDefined();
      expect(result.projections.length).toBe(6);
      expect(result.annualProjection).toBeGreaterThan(0);
      expect(result.departmentBreakdown.length).toBe(2);
      for (const p of result.projections) {
        expect(p).toHaveProperty("month");
        expect(p).toHaveProperty("projectedGross");
        expect(p).toHaveProperty("projectedNet");
        expect(p).toHaveProperty("projectedDeductions");
        expect(p).toHaveProperty("headcount");
      }
    });

    it("should handle no historical payroll data", async () => {
      mockPrisma.salarySlip.aggregate.mockResolvedValue({
        _sum: { grossSalary: 0, netSalary: 0, totalDeductions: 0 },
        _count: { id: 0 },
      });
      mockPrisma.employee.groupBy.mockResolvedValue([]);
      mockPrisma.employee.count.mockResolvedValue(0);

      const result = await AnalyticsService.payrollProjection(3);

      expect(result.projections.length).toBe(3);
      expect(result.growthRate).toBe(0);
    });

    it("should compute growth rate from historical data", async () => {
      // First call returns low value, last returns higher
      let callIdx = 0;
      mockPrisma.salarySlip.aggregate.mockImplementation(() => {
        callIdx++;
        const gross = callIdx <= 3 ? 400000 : 500000;
        return Promise.resolve({
          _sum: { grossSalary: gross, netSalary: gross * 0.8, totalDeductions: gross * 0.2 },
          _count: { id: 10 },
        });
      });
      mockPrisma.employee.groupBy.mockResolvedValue([]);
      mockPrisma.employee.count.mockResolvedValue(10);

      const result = await AnalyticsService.payrollProjection(6);

      expect(result.growthRate).toBeDefined();
      expect(typeof result.growthRate).toBe("number");
    });

    it("should include department breakdown with monthly costs", async () => {
      mockPrisma.salarySlip.aggregate.mockResolvedValue({
        _sum: { grossSalary: 1000000, netSalary: 800000, totalDeductions: 200000 },
        _count: { id: 20 },
      });
      mockPrisma.employee.groupBy.mockResolvedValue([
        { department: "Eng", _count: { id: 15 }, _sum: { baseSalary: 9000000 } },
        { department: "HR", _count: { id: 5 }, _sum: { baseSalary: 2400000 } },
      ]);
      mockPrisma.employee.count.mockResolvedValue(20);

      const result = await AnalyticsService.payrollProjection();

      expect(result.departmentBreakdown.length).toBe(2);
      const eng = result.departmentBreakdown.find((d: any) => d.department === "Eng");
      expect(eng?.headcount).toBe(15);
      expect(eng?.monthlyCost).toBe(750000);
    });
  });
});
