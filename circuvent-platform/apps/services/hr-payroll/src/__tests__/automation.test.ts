// ──────────────────────────────────────────────────────────────
// HR & Payroll — Automation Service Test Suite
// Tests for scheduled automation tasks: auto-approve leaves,
// auto-process payroll, auto-assign shifts, auto-depreciate
// assets, auto-send reminders, auto-close surveys, auto-
// escalate grievances, auto-generate reports, and cron defs.
// ──────────────────────────────────────────────────────────────

import {
  AutomationService,
  LeaveAutoApprovalRules,
  CronScheduleEntry,
} from "../services/automation.service";

// ══════════════════════════════════════════════════════════════
// Mock Dependencies
// ══════════════════════════════════════════════════════════════

const mockPrisma = {
  leaveRecord: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    aggregate: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  employee: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  notification: { create: jest.fn(), createMany: jest.fn() },
  salarySlip: {
    findUnique: jest.fn(),
    create: jest.fn(),
    aggregate: jest.fn(),
  },
  shiftDefinition: { findMany: jest.fn() },
  shiftSchedule: { findUnique: jest.fn(), create: jest.fn() },
  asset: { findMany: jest.fn() },
  timesheet: { findMany: jest.fn() },
  user: { findMany: jest.fn() },
  performanceReview: { findMany: jest.fn() },
  employeeDocument: { findMany: jest.fn() },
  expenseClaim: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
  survey: { findMany: jest.fn(), update: jest.fn() },
  grievance: { findMany: jest.fn(), update: jest.fn() },
  helpTicket: { count: jest.fn() },
  attendanceLog: { groupBy: jest.fn(), aggregate: jest.fn() },
  recognition: { count: jest.fn() },
  trainingEnrollment: { count: jest.fn() },
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
  Prisma: {},
}));

jest.mock("@circuvent/audit", () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}));

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function createDate(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

const defaultRules: LeaveAutoApprovalRules = {
  maxDays: 1,
  allowedTypes: ["CASUAL", "SICK"],
  requireMinBalance: true,
  minBalanceThreshold: 2,
  autoApproverLabel: "SYSTEM_AUTO",
};

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("AutomationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────
  // Auto-Approve Leaves
  // ────────────────────────────────────────────────────────────
  describe("autoApproveLeaves", () => {
    it("should auto-approve eligible leaves", async () => {
      mockPrisma.leaveRecord.findMany.mockResolvedValue([
        {
          id: "lv-1", employeeId: "e1", leaveType: "CASUAL", totalDays: 1,
          employee: { id: "e1", employeeCode: "CT-001", department: "Engineering", userId: "u1" },
        },
      ]);
      mockPrisma.leaveRecord.aggregate.mockResolvedValue({ _sum: { totalDays: 3 } });
      mockPrisma.leaveRecord.update.mockResolvedValue({});
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await AutomationService.autoApproveLeaves(defaultRules);

      expect(result.approved).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.details.length).toBe(1);
      expect(result.details[0].reason).toContain("Auto-approved");
      expect(mockPrisma.leaveRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "lv-1" },
          data: expect.objectContaining({ status: "APPROVED" }),
        })
      );
    });

    it("should skip leaves with insufficient balance", async () => {
      mockPrisma.leaveRecord.findMany.mockResolvedValue([
        {
          id: "lv-2", employeeId: "e1", leaveType: "CASUAL", totalDays: 1,
          employee: { id: "e1", employeeCode: "CT-001", department: "HR", userId: "u1" },
        },
      ]);
      mockPrisma.leaveRecord.aggregate.mockResolvedValue({ _sum: { totalDays: 11 } });

      const result = await AutomationService.autoApproveLeaves(defaultRules);

      expect(result.approved).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.details[0].reason).toContain("Insufficient balance");
    });

    it("should handle no pending leaves", async () => {
      mockPrisma.leaveRecord.findMany.mockResolvedValue([]);

      const result = await AutomationService.autoApproveLeaves(defaultRules);

      expect(result.approved).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.details).toEqual([]);
    });

    it("should skip balance check when not required", async () => {
      const rulesNoBalance = { ...defaultRules, requireMinBalance: false };
      mockPrisma.leaveRecord.findMany.mockResolvedValue([
        {
          id: "lv-3", employeeId: "e1", leaveType: "SICK", totalDays: 1,
          employee: { id: "e1", employeeCode: "CT-001", department: "Eng", userId: "u1" },
        },
      ]);
      mockPrisma.leaveRecord.update.mockResolvedValue({});
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await AutomationService.autoApproveLeaves(rulesNoBalance);

      expect(result.approved).toBe(1);
      expect(mockPrisma.leaveRecord.aggregate).not.toHaveBeenCalled();
    });

    it("should exclude departments when specified in rules", async () => {
      const rulesExclude: LeaveAutoApprovalRules = {
        ...defaultRules,
        excludeDepartments: ["C-Suite"],
      };
      mockPrisma.leaveRecord.findMany.mockResolvedValue([]);

      await AutomationService.autoApproveLeaves(rulesExclude);

      expect(mockPrisma.leaveRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employee: { department: { notIn: ["C-Suite"] } },
          }),
        })
      );
    });

    it("should send notification on approval", async () => {
      mockPrisma.leaveRecord.findMany.mockResolvedValue([
        {
          id: "lv-4", employeeId: "e1", leaveType: "CASUAL", totalDays: 1,
          employee: { id: "e1", employeeCode: "CT-001", department: "Eng", userId: "u1" },
        },
      ]);
      mockPrisma.leaveRecord.aggregate.mockResolvedValue({ _sum: { totalDays: 2 } });
      mockPrisma.leaveRecord.update.mockResolvedValue({});
      mockPrisma.notification.create.mockResolvedValue({});

      await AutomationService.autoApproveLeaves(defaultRules);

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "u1",
            title: "Leave Auto-Approved",
          }),
        })
      );
    });

    it("should handle per-leave processing errors gracefully", async () => {
      mockPrisma.leaveRecord.findMany.mockResolvedValue([
        {
          id: "lv-err", employeeId: "e1", leaveType: "CASUAL", totalDays: 1,
          employee: { id: "e1", employeeCode: "CT-001", department: "Eng", userId: "u1" },
        },
      ]);
      mockPrisma.leaveRecord.aggregate.mockResolvedValue({ _sum: { totalDays: 0 } });
      mockPrisma.leaveRecord.update.mockRejectedValue(new Error("DB write error"));

      const result = await AutomationService.autoApproveLeaves(defaultRules);

      expect(result.skipped).toBe(1);
      expect(result.details[0].reason).toContain("Error");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Auto-Process Payroll
  // ────────────────────────────────────────────────────────────
  describe("autoProcessPayroll", () => {
    it("should process payroll for all active employees", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: "e1", baseSalary: 600000, currency: "INR",
          user: { id: "u1", firstName: "Alice", lastName: "Dev", email: "alice@test.com" },
        },
      ]);
      mockPrisma.salarySlip.findUnique.mockResolvedValue(null);
      mockPrisma.salarySlip.create.mockResolvedValue({});
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await AutomationService.autoProcessPayroll(3, 2025);

      expect(result.processedCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      expect(result.errorCount).toBe(0);
      expect(result.totalGrossPaid).toBeGreaterThan(0);
      expect(result.totalNetPaid).toBeGreaterThan(0);
      expect(result.totalNetPaid).toBeLessThan(result.totalGrossPaid);
    });

    it("should skip existing salary slips", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: "e1", baseSalary: 600000, currency: "INR",
          user: { id: "u1", firstName: "A", lastName: "B", email: "a@b.com" },
        },
      ]);
      mockPrisma.salarySlip.findUnique.mockResolvedValue({ id: "existing" });

      const result = await AutomationService.autoProcessPayroll(3, 2025);

      expect(result.processedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(mockPrisma.salarySlip.create).not.toHaveBeenCalled();
    });

    it("should handle per-employee errors", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: "e-bad", baseSalary: null, currency: "INR",
          user: { id: "u1", firstName: "Err", lastName: "Or", email: "err@test.com" },
        },
      ]);
      mockPrisma.salarySlip.findUnique.mockResolvedValue(null);
      mockPrisma.salarySlip.create.mockRejectedValue(new Error("Invalid data"));

      const result = await AutomationService.autoProcessPayroll(1, 2025);

      expect(result.errorCount).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].employeeId).toBe("e-bad");
    });

    it("should calculate PF capped at ₹15,000 base", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: "e1", baseSalary: 2400000, currency: "INR",
          user: { id: "u1", firstName: "A", lastName: "B", email: "a@b.com" },
        },
      ]);
      mockPrisma.salarySlip.findUnique.mockResolvedValue(null);
      mockPrisma.salarySlip.create.mockResolvedValue({});
      mockPrisma.notification.create.mockResolvedValue({});

      await AutomationService.autoProcessPayroll(6, 2025);

      const createCall = mockPrisma.salarySlip.create.mock.calls[0][0];
      // PF should be 12% of min(basePay, 15000), max 1800
      expect(createCall.data.pfDeduction).toBeLessThanOrEqual(1800);
    });

    it("should not generate ESI when gross > 21000", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: "e1", baseSalary: 600000, currency: "INR",
          user: { id: "u1", firstName: "A", lastName: "B", email: "a@b.com" },
        },
      ]);
      mockPrisma.salarySlip.findUnique.mockResolvedValue(null);
      mockPrisma.salarySlip.create.mockResolvedValue({});
      mockPrisma.notification.create.mockResolvedValue({});

      await AutomationService.autoProcessPayroll(6, 2025);

      const createCall = mockPrisma.salarySlip.create.mock.calls[0][0];
      expect(createCall.data.esiDeduction).toBe(0);
    });

    it("should handle empty employee list", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([]);

      const result = await AutomationService.autoProcessPayroll(1, 2025);

      expect(result.processedCount).toBe(0);
      expect(result.totalGrossPaid).toBe(0);
      expect(result.totalNetPaid).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Auto-Assign Shifts
  // ────────────────────────────────────────────────────────────
  describe("autoAssignShifts", () => {
    const weekStart = createDate(2025, 3, 10); // Monday

    it("should assign shifts in round-robin fashion", async () => {
      mockPrisma.shiftDefinition.findMany.mockResolvedValue([
        { id: "s1", name: "Morning", startTime: "09:00", isActive: true },
        { id: "s2", name: "Evening", startTime: "14:00", isActive: true },
      ]);
      mockPrisma.employee.findMany.mockResolvedValue([
        { id: "e1", employeeCode: "CT-001", user: { firstName: "A", lastName: "B" } },
      ]);
      mockPrisma.shiftSchedule.findUnique.mockResolvedValue(null);
      mockPrisma.leaveRecord.findFirst.mockResolvedValue(null);
      mockPrisma.shiftSchedule.create.mockResolvedValue({});

      const result = await AutomationService.autoAssignShifts("Engineering", weekStart);

      expect(result.assignedCount).toBeGreaterThan(0);
      expect(result.assignments.length).toBe(result.assignedCount);
    });

    it("should skip weekends", async () => {
      mockPrisma.shiftDefinition.findMany.mockResolvedValue([
        { id: "s1", name: "Day", startTime: "09:00", isActive: true },
      ]);
      mockPrisma.employee.findMany.mockResolvedValue([
        { id: "e1", employeeCode: "CT-001", user: { firstName: "A", lastName: "B" } },
      ]);
      mockPrisma.shiftSchedule.findUnique.mockResolvedValue(null);
      mockPrisma.leaveRecord.findFirst.mockResolvedValue(null);
      mockPrisma.shiftSchedule.create.mockResolvedValue({});

      const result = await AutomationService.autoAssignShifts("Eng", weekStart);

      // 5 weekdays only
      expect(result.assignedCount).toBeLessThanOrEqual(5);
    });

    it("should skip employees already assigned", async () => {
      mockPrisma.shiftDefinition.findMany.mockResolvedValue([
        { id: "s1", name: "Day", startTime: "09:00", isActive: true },
      ]);
      mockPrisma.employee.findMany.mockResolvedValue([
        { id: "e1", employeeCode: "CT-001", user: { firstName: "A", lastName: "B" } },
      ]);
      mockPrisma.shiftSchedule.findUnique.mockResolvedValue({ id: "existing" });

      const result = await AutomationService.autoAssignShifts("Eng", weekStart);

      expect(result.assignedCount).toBe(0);
      expect(result.skippedCount).toBeGreaterThan(0);
    });

    it("should skip employees on leave", async () => {
      mockPrisma.shiftDefinition.findMany.mockResolvedValue([
        { id: "s1", name: "Day", startTime: "09:00", isActive: true },
      ]);
      mockPrisma.employee.findMany.mockResolvedValue([
        { id: "e1", employeeCode: "CT-001", user: { firstName: "A", lastName: "B" } },
      ]);
      mockPrisma.shiftSchedule.findUnique.mockResolvedValue(null);
      mockPrisma.leaveRecord.findFirst.mockResolvedValue({ id: "leave-1" });

      const result = await AutomationService.autoAssignShifts("Eng", weekStart);

      expect(result.assignedCount).toBe(0);
      expect(result.skippedCount).toBe(5);
    });

    it("should throw when no shift definitions exist", async () => {
      mockPrisma.shiftDefinition.findMany.mockResolvedValue([]);

      await expect(
        AutomationService.autoAssignShifts("Eng", weekStart)
      ).rejects.toThrow("No active shift definitions found");
    });

    it("should throw when no employees in department", async () => {
      mockPrisma.shiftDefinition.findMany.mockResolvedValue([
        { id: "s1", name: "Day", startTime: "09:00", isActive: true },
      ]);
      mockPrisma.employee.findMany.mockResolvedValue([]);

      await expect(
        AutomationService.autoAssignShifts("Empty", weekStart)
      ).rejects.toThrow("No active employees found");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Auto-Depreciate Assets
  // ────────────────────────────────────────────────────────────
  describe("autoDepreciateAssets", () => {
    it("should calculate straight-line depreciation for assets", async () => {
      mockPrisma.asset.findMany.mockResolvedValue([
        {
          id: "a1", assetCode: "AST-001", name: "MacBook Pro",
          category: "Laptop", purchaseDate: createDate(2023, 1, 1),
          purchasePrice: 120000, status: "ALLOCATED",
        },
      ]);

      const result = await AutomationService.autoDepreciateAssets();

      expect(result.processedCount).toBe(1);
      expect(result.totalDepreciation).toBeGreaterThan(0);
      expect(result.items.length).toBe(1);

      const item = result.items[0];
      expect(item.assetCode).toBe("AST-001");
      expect(item.originalValue).toBe(120000);
      expect(item.currentValue).toBeLessThan(120000);
      expect(item.depreciationAmount).toBeGreaterThan(0);
    });

    it("should handle no depreciable assets", async () => {
      mockPrisma.asset.findMany.mockResolvedValue([]);

      const result = await AutomationService.autoDepreciateAssets();

      expect(result.processedCount).toBe(0);
      expect(result.totalDepreciation).toBe(0);
      expect(result.items).toEqual([]);
    });

    it("should use 5-year life for furniture", async () => {
      mockPrisma.asset.findMany.mockResolvedValue([
        {
          id: "a2", assetCode: "AST-002", name: "Standing Desk",
          category: "Furniture", purchaseDate: createDate(2024, 1, 1),
          purchasePrice: 30000, status: "ALLOCATED",
        },
      ]);

      const result = await AutomationService.autoDepreciateAssets();

      // Annual depreciation = (30000 - 1500) / 5 = 5700, monthly = 475
      const item = result.items[0];
      expect(item.depreciationAmount).toBeCloseTo(475, 0);
    });

    it("should not depreciate below salvage value (5%)", async () => {
      mockPrisma.asset.findMany.mockResolvedValue([
        {
          id: "a3", assetCode: "AST-003", name: "Old Mouse",
          category: "Mouse", purchaseDate: createDate(2015, 1, 1),
          purchasePrice: 1000, status: "AVAILABLE",
        },
      ]);

      const result = await AutomationService.autoDepreciateAssets();

      expect(result.items[0].currentValue).toBeGreaterThanOrEqual(50); // 5% of 1000
    });

    it("should skip assets without purchase date or price", async () => {
      mockPrisma.asset.findMany.mockResolvedValue([
        {
          id: "a4", assetCode: "AST-004", name: "Mystery",
          category: "Other", purchaseDate: null,
          purchasePrice: null, status: "AVAILABLE",
        },
      ]);

      const result = await AutomationService.autoDepreciateAssets();

      expect(result.processedCount).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Auto-Send Reminders
  // ────────────────────────────────────────────────────────────
  describe("autoSendReminders", () => {
    it("should send reminders for overdue items", async () => {
      mockPrisma.timesheet.findMany.mockResolvedValue([
        {
          id: "ts-1", weekStart: createDate(2025, 2, 1), weekEnd: createDate(2025, 2, 7),
          employee: { userId: "u1", user: { id: "u1", firstName: "Alice" } },
        },
      ]);
      mockPrisma.leaveRecord.findMany.mockResolvedValue([]);
      mockPrisma.expenseClaim.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.findMany.mockResolvedValue([]);
      mockPrisma.employeeDocument.findMany.mockResolvedValue([]);
      mockPrisma.notification.create.mockResolvedValue({});
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await AutomationService.autoSendReminders();

      expect(result.overdueTimesheets).toBe(1);
      expect(result.totalNotificationsSent).toBeGreaterThanOrEqual(1);
    });

    it("should remind managers about pending leave approvals > 48 hours", async () => {
      const twoAgo = new Date();
      twoAgo.setDate(twoAgo.getDate() - 3);

      mockPrisma.timesheet.findMany.mockResolvedValue([]);
      mockPrisma.leaveRecord.findMany.mockResolvedValue([
        {
          id: "lv-1", createdAt: twoAgo,
          employee: {
            department: "Eng", userId: "u1",
            user: { firstName: "A", lastName: "B" },
          },
        },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: "mgr-1" }]);
      mockPrisma.expenseClaim.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.findMany.mockResolvedValue([]);
      mockPrisma.employeeDocument.findMany.mockResolvedValue([]);
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await AutomationService.autoSendReminders();

      expect(result.pendingLeaveApprovals).toBe(1);
    });

    it("should handle zero overdue items", async () => {
      mockPrisma.timesheet.findMany.mockResolvedValue([]);
      mockPrisma.leaveRecord.findMany.mockResolvedValue([]);
      mockPrisma.expenseClaim.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.findMany.mockResolvedValue([]);
      mockPrisma.employeeDocument.findMany.mockResolvedValue([]);

      const result = await AutomationService.autoSendReminders();

      expect(result.overdueTimesheets).toBe(0);
      expect(result.pendingLeaveApprovals).toBe(0);
      expect(result.totalNotificationsSent).toBe(0);
    });

    it("should detect expiring documents within 7 days", async () => {
      const in5Days = new Date();
      in5Days.setDate(in5Days.getDate() + 5);

      mockPrisma.timesheet.findMany.mockResolvedValue([]);
      mockPrisma.leaveRecord.findMany.mockResolvedValue([]);
      mockPrisma.expenseClaim.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.findMany.mockResolvedValue([]);
      mockPrisma.employeeDocument.findMany.mockResolvedValue([
        {
          id: "doc-1", title: "Passport", expiresAt: in5Days,
          employee: { userId: "u1", user: { id: "u1", firstName: "Alice" } },
        },
      ]);
      mockPrisma.notification.create.mockResolvedValue({});
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await AutomationService.autoSendReminders();

      expect(result.expiringDocuments).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Auto-Close Surveys
  // ────────────────────────────────────────────────────────────
  describe("autoCloseSurveys", () => {
    it("should close surveys past their end date", async () => {
      mockPrisma.survey.findMany.mockResolvedValue([
        {
          id: "srv-1", title: "Q4 Survey", status: "ACTIVE",
          endDate: createDate(2025, 2, 15),
          _count: { responses: 42, questions: 10 },
        },
      ]);
      mockPrisma.survey.update.mockResolvedValue({});

      const result = await AutomationService.autoCloseSurveys();

      expect(result.closed).toBe(1);
      expect(result.details.length).toBe(1);
      expect(result.details[0]).toContain("Q4 Survey");
      expect(result.details[0]).toContain("42 responses");
      expect(mockPrisma.survey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "srv-1" },
          data: { status: "CLOSED" },
        })
      );
    });

    it("should handle no expired surveys", async () => {
      mockPrisma.survey.findMany.mockResolvedValue([]);

      const result = await AutomationService.autoCloseSurveys();

      expect(result.closed).toBe(0);
      expect(result.details).toEqual([]);
    });

    it("should close multiple surveys at once", async () => {
      mockPrisma.survey.findMany.mockResolvedValue([
        { id: "s1", title: "Survey A", status: "ACTIVE", endDate: createDate(2025, 1, 1), _count: { responses: 10, questions: 5 } },
        { id: "s2", title: "Survey B", status: "ACTIVE", endDate: createDate(2025, 2, 1), _count: { responses: 20, questions: 8 } },
      ]);
      mockPrisma.survey.update.mockResolvedValue({});

      const result = await AutomationService.autoCloseSurveys();

      expect(result.closed).toBe(2);
      expect(result.details.length).toBe(2);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Auto-Escalate Grievances
  // ────────────────────────────────────────────────────────────
  describe("autoEscalateGrievances", () => {
    it("should escalate overdue grievances", async () => {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      mockPrisma.grievance.findMany.mockResolvedValue([
        {
          id: "g1", grievanceCode: "GRV-001", status: "OPEN",
          priority: "LOW", createdAt: tenDaysAgo,
        },
      ]);
      mockPrisma.grievance.update.mockResolvedValue({});
      mockPrisma.user.findMany.mockResolvedValue([{ id: "hr-1" }]);
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await AutomationService.autoEscalateGrievances(7);

      expect(result.escalated).toBe(1);
      expect(result.details[0].grievanceCode).toBe("GRV-001");
      expect(result.details[0].daysPending).toBeGreaterThanOrEqual(10);
      expect(mockPrisma.grievance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "ESCALATED",
            priority: "MEDIUM", // LOW → MEDIUM
          }),
        })
      );
    });

    it("should escalate MEDIUM priority to HIGH", async () => {
      const old = new Date();
      old.setDate(old.getDate() - 14);

      mockPrisma.grievance.findMany.mockResolvedValue([
        { id: "g2", grievanceCode: "GRV-002", status: "INVESTIGATING", priority: "MEDIUM", createdAt: old },
      ]);
      mockPrisma.grievance.update.mockResolvedValue({});
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await AutomationService.autoEscalateGrievances(7);

      expect(result.escalated).toBe(1);
      expect(mockPrisma.grievance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priority: "HIGH" }),
        })
      );
    });

    it("should escalate HIGH priority to CRITICAL", async () => {
      const old = new Date();
      old.setDate(old.getDate() - 20);

      mockPrisma.grievance.findMany.mockResolvedValue([
        { id: "g3", grievanceCode: "GRV-003", status: "OPEN", priority: "HIGH", createdAt: old },
      ]);
      mockPrisma.grievance.update.mockResolvedValue({});
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await AutomationService.autoEscalateGrievances(7);

      expect(mockPrisma.grievance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priority: "CRITICAL" }),
        })
      );
    });

    it("should handle no overdue grievances", async () => {
      mockPrisma.grievance.findMany.mockResolvedValue([]);

      const result = await AutomationService.autoEscalateGrievances(7);

      expect(result.escalated).toBe(0);
      expect(result.details).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Auto-Generate Reports
  // ────────────────────────────────────────────────────────────
  describe("autoGenerateReports", () => {
    it("should generate a weekly report", async () => {
      mockPrisma.leaveRecord.count.mockResolvedValue(5);
      mockPrisma.expenseClaim.count.mockResolvedValue(3);
      mockPrisma.helpTicket.count.mockResolvedValue(8);
      mockPrisma.employee.count
        .mockResolvedValueOnce(2)  // newHires
        .mockResolvedValueOnce(1); // exits

      const result = await AutomationService.autoGenerateReports("weekly");

      expect(result.reportType).toBe("weekly");
      expect(result.generatedAt).toBeInstanceOf(Date);
      expect(result.data.weeklyHighlights).toBeDefined();
      expect(result.data.weeklyHighlights.newLeaves).toBe(5);
    });

    it("should generate a payroll report", async () => {
      mockPrisma.salarySlip.aggregate.mockResolvedValue({
        _sum: { grossSalary: 500000, netSalary: 400000, totalDeductions: 100000, pfDeduction: 20000, tds: 15000 },
        _count: { id: 10 },
        _avg: { netSalary: 40000 },
      });

      const result = await AutomationService.autoGenerateReports("payroll");

      expect(result.reportType).toBe("payroll");
      expect(result.data.payrollSummary).toBeDefined();
      expect(result.data.payrollSummary.slipsGenerated).toBe(10);
    });

    it("should generate an attendance report", async () => {
      mockPrisma.attendanceLog.groupBy.mockResolvedValue([
        { status: "PRESENT", _count: { id: 200 } },
        { status: "ABSENT", _count: { id: 10 } },
      ]);
      mockPrisma.attendanceLog.aggregate.mockResolvedValue({ _avg: { totalHours: 8.2 } });

      const result = await AutomationService.autoGenerateReports("attendance");

      expect(result.reportType).toBe("attendance");
      expect(result.data.attendanceSummary).toBeDefined();
    });

    it("should generate a leave report", async () => {
      mockPrisma.leaveRecord.groupBy.mockResolvedValue([
        { leaveType: "CASUAL", status: "APPROVED", _count: { id: 15 }, _sum: { totalDays: 22 } },
        { leaveType: "SICK", status: "PENDING", _count: { id: 3 }, _sum: { totalDays: 5 } },
      ]);

      const result = await AutomationService.autoGenerateReports("leave");

      expect(result.reportType).toBe("leave");
      expect(result.data.leaveSummary).toBeDefined();
      expect(result.data.leaveSummary.length).toBe(2);
    });

    it("should generate a monthly report", async () => {
      mockPrisma.employee.count.mockResolvedValue(50);
      mockPrisma.leaveRecord.groupBy.mockResolvedValue([]);
      mockPrisma.expenseClaim.aggregate.mockResolvedValue({
        _sum: { totalAmount: 100000 },
        _count: { id: 15 },
      });
      mockPrisma.trainingEnrollment.count.mockResolvedValue(5);
      mockPrisma.recognition.count.mockResolvedValue(20);

      const result = await AutomationService.autoGenerateReports("monthly");

      expect(result.reportType).toBe("monthly");
      expect(result.data.monthlySummary).toBeDefined();
      expect(result.data.monthlySummary.headcount).toBe(50);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Cron Schedule Definitions
  // ────────────────────────────────────────────────────────────
  describe("cronSchedule", () => {
    it("should define 9 cron entries", () => {
      const schedule = AutomationService.cronSchedule;

      expect(schedule.length).toBe(9);
    });

    it("should have all entries enabled by default", () => {
      for (const entry of AutomationService.cronSchedule) {
        expect(entry.enabled).toBe(true);
      }
    });

    it("should contain valid cron expressions", () => {
      const cronRegex = /^(\S+\s){4}\S+$/;
      for (const entry of AutomationService.cronSchedule) {
        expect(entry.cron).toMatch(cronRegex);
      }
    });

    it("should include all automation tasks", () => {
      const tasks = AutomationService.cronSchedule.map((e: any) => e.task);

      expect(tasks).toContain("autoApproveLeaves");
      expect(tasks).toContain("autoProcessPayroll");
      expect(tasks).toContain("autoAssignShifts");
      expect(tasks).toContain("autoDepreciateAssets");
      expect(tasks).toContain("autoSendReminders");
      expect(tasks).toContain("autoCloseSurveys");
      expect(tasks).toContain("autoEscalateGrievances");
    });

    it("each entry should have a description", () => {
      for (const entry of AutomationService.cronSchedule) {
        expect(entry.description).toBeTruthy();
        expect(entry.description.length).toBeGreaterThan(10);
      }
    });

    it("payroll should run on 25th of month", () => {
      const payroll = AutomationService.cronSchedule.find((e: any) => e.task === "autoProcessPayroll");

      expect(payroll).toBeDefined();
      expect(payroll!.cron).toContain("25");
    });

    it("shift assignment should run on Fridays", () => {
      const shift = AutomationService.cronSchedule.find((e: any) => e.task === "autoAssignShifts");

      expect(shift).toBeDefined();
      expect(shift!.cron).toContain("5"); // Friday = 5
    });
  });
});
