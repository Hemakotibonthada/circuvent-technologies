// ──────────────────────────────────────────────────────────────
// HR & Payroll — Exit Management Service Test Suite
// Tests for exit initiation, 25+ item checklist, notice period,
// asset return, access revocation, knowledge transfer, final
// settlement, FnF statement, analytics, and alumni profiles.
// ──────────────────────────────────────────────────────────────

import { ExitManagementService } from "../services/exit-management.service";

// ══════════════════════════════════════════════════════════════
// Mock Dependencies
// ══════════════════════════════════════════════════════════════

const mockPrisma = {
  employee: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  generatedDocument: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  notification: { create: jest.fn() },
  resignation: { findFirst: jest.fn() },
  asset: { findMany: jest.fn() },
  assetRequest: { create: jest.fn() },
  refreshToken: { deleteMany: jest.fn() },
  goal: { findMany: jest.fn(), update: jest.fn() },
  leaveRecord: { findMany: jest.fn() },
  expenseClaim: { findMany: jest.fn() },
  salaryAdvance: { findMany: jest.fn() },
  fund: { findFirst: jest.fn(), update: jest.fn() },
  fundTransaction: { create: jest.fn() },
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

jest.mock("@circuvent/audit", () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}));

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function mockEmployee(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id || "emp-1",
    userId: overrides.userId || "user-1",
    employeeCode: overrides.employeeCode || "CIR-EMP-001",
    employmentType: overrides.employmentType || "FULL_TIME",
    designation: overrides.designation || "SDE-2",
    department: overrides.department || "Engineering",
    dateOfJoining: overrides.dateOfJoining || new Date("2020-01-15"),
    dateOfLeaving: overrides.dateOfLeaving || null,
    baseSalary: overrides.baseSalary || 1200000,
    currency: "INR",
    status: overrides.status || "ACTIVE",
    bankAccountNo: overrides.bankAccountNo || "1234567890",
    bankIFSC: overrides.bankIFSC || "ICIC0001234",
    user: overrides.user || { id: "user-1", firstName: "Alice", lastName: "Dev", email: "alice@circuvent.io" },
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("ExitManagementService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────
  // Initiate Exit
  // ────────────────────────────────────────────────────────────
  describe("initiateExit", () => {
    it("should create an exit workflow successfully", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce(null); // no existing workflow
      mockPrisma.resignation.findFirst.mockResolvedValue(null);
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "wf-1" });
      mockPrisma.user.findMany.mockResolvedValue([{ id: "admin-1" }]);
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await ExitManagementService.initiateExit("emp-1", "VOLUNTARY", "Better opportunities");

      expect(result.employeeId).toBe("emp-1");
      expect(result.exitType).toBe("VOLUNTARY");
      expect(result.status).toBe("INITIATED");
      expect(result.noticePeriodDays).toBe(60); // FULL_TIME = 60 days
      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });

    it("should throw when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        ExitManagementService.initiateExit("bad-id", "VOLUNTARY", "Reason")
      ).rejects.toThrow("Employee not found");
    });

    it("should throw when employee already has exit date", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ dateOfLeaving: new Date() })
      );

      await expect(
        ExitManagementService.initiateExit("emp-1", "VOLUNTARY", "Reason")
      ).rejects.toThrow("Employee already has an exit date set");
    });

    it("should throw when exit workflow already exists", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.generatedDocument.findFirst.mockResolvedValue({ id: "existing-wf" });

      await expect(
        ExitManagementService.initiateExit("emp-1", "VOLUNTARY", "Reason")
      ).rejects.toThrow("exit workflow is already in progress");
    });

    it("should throw for empty reason", async () => {
      await expect(
        ExitManagementService.initiateExit("emp-1", "VOLUNTARY", "")
      ).rejects.toThrow("Exit reason must be at least 5 characters");
    });

    it("should link existing resignation", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce(null);
      mockPrisma.resignation.findFirst.mockResolvedValue({ id: "res-1" });
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "wf-2" });
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await ExitManagementService.initiateExit("emp-1", "VOLUNTARY", "Personal reasons");

      expect(result.resignationId).toBe("res-1");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Exit Checklist (25+ items)
  // ────────────────────────────────────────────────────────────
  describe("createExitChecklist", () => {
    it("should create a checklist with 27 items", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "cl-1" });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      const result = await ExitManagementService.createExitChecklist("emp-1");

      expect(result.items.length).toBe(27);
      expect(result.totalItems).toBe(27);
    });

    it("should cover all 5 categories", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "cl-1" });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      const result = await ExitManagementService.createExitChecklist("emp-1");
      const categories = new Set(result.items.map((i) => i.category));

      expect(categories.has("IT")).toBe(true);
      expect(categories.has("HR")).toBe(true);
      expect(categories.has("FINANCE")).toBe(true);
      expect(categories.has("ADMIN")).toBe(true);
      expect(categories.has("TEAM")).toBe(true);
      expect(categories.size).toBe(5);
    });

    it("should have all items initially uncompleted", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "cl-1" });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      const result = await ExitManagementService.createExitChecklist("emp-1");

      for (const item of result.items) {
        expect(item.isCompleted).toBe(false);
      }
    });

    it("should assign priority levels to items", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "cl-1" });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      const result = await ExitManagementService.createExitChecklist("emp-1");
      const highPriority = result.items.filter((i: any) => i.priority === "HIGH");
      const lowPriority = result.items.filter((i: any) => i.priority === "LOW");

      expect(highPriority.length).toBeGreaterThan(10);
      expect(lowPriority.length).toBeGreaterThan(0);
    });

    it("should throw when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        ExitManagementService.createExitChecklist("bad-id")
      ).rejects.toThrow("Employee not found");
    });

    it("should assign unique IDs to checklist items", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "cl-1" });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      const result = await ExitManagementService.createExitChecklist("emp-1");
      const ids = new Set(result.items.map((i) => i.id));

      expect(ids.size).toBe(27);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Notice Period Calculation
  // ────────────────────────────────────────────────────────────
  describe("calculateNoticePeriod", () => {
    it("should return 60 days for FULL_TIME", () => {
      expect(ExitManagementService.calculateNoticePeriod("FULL_TIME")).toBe(60);
    });

    it("should return 30 days for PART_TIME", () => {
      expect(ExitManagementService.calculateNoticePeriod("PART_TIME")).toBe(30);
    });

    it("should return 30 days for CONTRACT", () => {
      expect(ExitManagementService.calculateNoticePeriod("CONTRACT")).toBe(30);
    });

    it("should return 15 days for INTERN", () => {
      expect(ExitManagementService.calculateNoticePeriod("INTERN")).toBe(15);
    });

    it("should return 90 days for SENIOR_MANAGEMENT", () => {
      expect(ExitManagementService.calculateNoticePeriod("SENIOR_MANAGEMENT")).toBe(90);
    });

    it("should default to 30 days for unknown types", () => {
      expect(ExitManagementService.calculateNoticePeriod("UNKNOWN")).toBe(30);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Final Settlement Calculation
  // ────────────────────────────────────────────────────────────
  describe("calculateFinalSettlement", () => {
    it("should compute settlement components correctly", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ dateOfJoining: new Date("2018-01-01"), baseSalary: 1200000 })
      );
      mockPrisma.leaveRecord.findMany.mockResolvedValue([
        { totalDays: 10, status: "APPROVED" },
      ]);
      mockPrisma.expenseClaim.findMany.mockResolvedValue([]);
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([]);
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      const result = await ExitManagementService.calculateFinalSettlement("emp-1");

      expect(result.employeeId).toBe("emp-1");
      expect(result.employeeName).toBe("Alice Dev");
      expect(result.components.pendingSalary).toBeGreaterThan(0);
      expect(result.components.leaveEncashment).toBeGreaterThan(0);
      expect(result.netSettlement).toBeDefined();
      expect(result.totalPayable).toBeGreaterThan(0);
    });

    it("should include gratuity for tenure >= 5 years", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ dateOfJoining: new Date("2018-01-01"), baseSalary: 1200000 })
      );
      mockPrisma.leaveRecord.findMany.mockResolvedValue([]);
      mockPrisma.expenseClaim.findMany.mockResolvedValue([]);
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([]);
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      const result = await ExitManagementService.calculateFinalSettlement("emp-1");

      expect(result.components.gratuity).toBeGreaterThan(0);
      expect(result.tenureYears).toBeGreaterThanOrEqual(5);
    });

    it("should not include gratuity for tenure < 5 years", async () => {
      const recentDate = new Date();
      recentDate.setFullYear(recentDate.getFullYear() - 2);

      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ dateOfJoining: recentDate, baseSalary: 600000 })
      );
      mockPrisma.leaveRecord.findMany.mockResolvedValue([]);
      mockPrisma.expenseClaim.findMany.mockResolvedValue([]);
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([]);
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      const result = await ExitManagementService.calculateFinalSettlement("emp-1");

      expect(result.components.gratuity).toBe(0);
      expect(result.tenureYears).toBeLessThan(5);
    });

    it("should deduct salary advances", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.leaveRecord.findMany.mockResolvedValue([]);
      mockPrisma.expenseClaim.findMany.mockResolvedValue([]);
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([
        { amount: 50000, status: "DISBURSED" },
      ]);
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      const result = await ExitManagementService.calculateFinalSettlement("emp-1");

      expect(result.components.advanceRecovery).toBe(50000);
      expect(result.totalDeductions).toBeGreaterThanOrEqual(50000);
    });

    it("should throw when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        ExitManagementService.calculateFinalSettlement("bad-id")
      ).rejects.toThrow("Employee not found");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Asset Return
  // ────────────────────────────────────────────────────────────
  describe("initiateAssetReturn", () => {
    it("should create return requests for assigned assets", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.asset.findMany.mockResolvedValue([
        { id: "asset-1", assetCode: "LPT-001", name: "MacBook Pro", category: "LAPTOP" },
        { id: "asset-2", assetCode: "MON-001", name: "Dell Monitor", category: "MONITOR" },
      ]);
      mockPrisma.assetRequest.create.mockResolvedValue({ id: "req-1" });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      const result = await ExitManagementService.initiateAssetReturn("emp-1");

      expect(result.assetsFound).toBe(2);
      expect(result.returnRequests.length).toBe(2);
      expect(mockPrisma.assetRequest.create).toHaveBeenCalledTimes(2);
    });

    it("should handle employee with no assigned assets", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.asset.findMany.mockResolvedValue([]);
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      const result = await ExitManagementService.initiateAssetReturn("emp-1");

      expect(result.assetsFound).toBe(0);
      expect(result.returnRequests.length).toBe(0);
    });

    it("should throw when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        ExitManagementService.initiateAssetReturn("bad-id")
      ).rejects.toThrow("Employee not found");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Revoke System Access
  // ────────────────────────────────────────────────────────────
  describe("revokeSystemAccess", () => {
    it("should deactivate user and revoke tokens", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await ExitManagementService.revokeSystemAccess("emp-1");

      expect(result.success).toBe(true);
      expect(result.actionsPerformed).toContain("User account deactivated");
      expect(result.actionsPerformed).toContain("All refresh tokens revoked");
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "INACTIVE" },
        })
      );
    });

    it("should throw when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        ExitManagementService.revokeSystemAccess("bad-id")
      ).rejects.toThrow("Employee not found");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Exit Analytics
  // ────────────────────────────────────────────────────────────
  describe("generateExitAnalytics", () => {
    it("should return comprehensive analytics", async () => {
      mockPrisma.generatedDocument.findMany.mockResolvedValue([
        { id: "wf-1", entityId: "emp-1", createdAt: new Date(), data: { exitType: "VOLUNTARY", reason: "Better pay", noticePeriodDays: 60, settlementAmount: 200000 } },
        { id: "wf-2", entityId: "emp-2", createdAt: new Date(), data: { exitType: "VOLUNTARY", reason: "Relocation", noticePeriodDays: 30, settlementAmount: 150000 } },
      ]);
      mockPrisma.employee.count.mockResolvedValue(50);
      mockPrisma.employee.findMany.mockResolvedValue([
        { dateOfJoining: new Date("2022-01-01"), dateOfLeaving: new Date("2025-06-01"), department: "Engineering" },
        { dateOfJoining: new Date("2023-03-01"), dateOfLeaving: new Date("2025-09-01"), department: "Design" },
      ]);

      const result = await ExitManagementService.generateExitAnalytics();

      expect(result.totalExits).toBe(2);
      expect(result.avgTenure).toBeGreaterThan(0);
      expect(result.byReason.length).toBeGreaterThan(0);
      expect(result.byExitType.length).toBeGreaterThan(0);
      expect(result.monthlyTrend.length).toBe(12);
      expect(result.avgSettlementAmount).toBe(175000);
    });

    it("should handle no exits gracefully", async () => {
      mockPrisma.generatedDocument.findMany.mockResolvedValue([]);
      mockPrisma.employee.count.mockResolvedValue(50);
      mockPrisma.employee.findMany.mockResolvedValue([]);

      const result = await ExitManagementService.generateExitAnalytics();

      expect(result.totalExits).toBe(0);
      expect(result.attritionRate).toBe(0);
      expect(result.avgSettlementAmount).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Knowledge Transfer
  // ────────────────────────────────────────────────────────────
  describe("initiateKnowledgeTransfer", () => {
    it("should transfer tasks and schedule KT sessions", async () => {
      mockPrisma.employee.findUnique
        .mockResolvedValueOnce(mockEmployee({ id: "emp-exit" }))
        .mockResolvedValueOnce(mockEmployee({ id: "emp-successor", user: { id: "u-succ", firstName: "Bob", lastName: "Jr" } }));
      mockPrisma.goal.findMany.mockResolvedValue([
        { id: "g-1", title: "Fix API bug" },
        { id: "g-2", title: "Deploy v2" },
      ]);
      mockPrisma.goal.update.mockResolvedValue({});
      mockPrisma.notification.create.mockResolvedValue({});
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      const result = await ExitManagementService.initiateKnowledgeTransfer("emp-exit", "emp-successor");

      expect(result.success).toBe(true);
      expect(result.tasksToTransfer).toBe(2);
      expect(result.ktSessionsPlanned).toBe(4);
      expect(mockPrisma.goal.update).toHaveBeenCalledTimes(2);
    });

    it("should throw when successor not found", async () => {
      mockPrisma.employee.findUnique
        .mockResolvedValueOnce(mockEmployee())
        .mockResolvedValueOnce(null);

      await expect(
        ExitManagementService.initiateKnowledgeTransfer("emp-1", "bad-succ")
      ).rejects.toThrow("Successor not found");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Settlement Payment
  // ────────────────────────────────────────────────────────────
  describe("processSettlementPayment", () => {
    it("should process settlement and debit fund", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.fund.findFirst.mockResolvedValue({
        id: "fund-1", remainingAmount: 5000000, category: "OPERATIONAL",
      });
      mockPrisma.fundTransaction.create.mockResolvedValue({ id: "txn-1" });
      mockPrisma.fund.update.mockResolvedValue({});
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      const result = await ExitManagementService.processSettlementPayment("emp-1", 200000);

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe("txn-1");
      expect(result.reference).toContain("FNF-CIR-EMP-001");
    });

    it("should throw for zero amount", async () => {
      await expect(
        ExitManagementService.processSettlementPayment("emp-1", 0)
      ).rejects.toThrow("Settlement amount must be positive");
    });

    it("should throw when insufficient funds", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.fund.findFirst.mockResolvedValue(null);

      await expect(
        ExitManagementService.processSettlementPayment("emp-1", 200000)
      ).rejects.toThrow("Insufficient funds");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Buyout Notice Period
  // ────────────────────────────────────────────────────────────
  describe("buyOutNoticePeriod", () => {
    it("should calculate buyout amount correctly", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ baseSalary: 1200000 }));
      mockPrisma.generatedDocument.findFirst.mockResolvedValue({
        id: "wf-1",
        data: { status: "INITIATED" },
      });
      mockPrisma.generatedDocument.update.mockResolvedValue({});

      const result = await ExitManagementService.buyOutNoticePeriod("emp-1", 30);

      expect(result.success).toBe(true);
      expect(result.buyoutAmount).toBeGreaterThan(0);
      // 1200000 / 365 * 30 ≈ 98,630
      expect(result.buyoutAmount).toBeCloseTo(98630.14, 0);
    });

    it("should throw for 0 remaining days", async () => {
      await expect(
        ExitManagementService.buyOutNoticePeriod("emp-1", 0)
      ).rejects.toThrow("Days remaining must be positive");
    });
  });

  // ────────────────────────────────────────────────────────────
  // FnF Statement
  // ────────────────────────────────────────────────────────────
  describe("generateFnFStatement", () => {
    it("should return valid HTML content", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ dateOfJoining: new Date("2020-01-01"), baseSalary: 1200000 })
      );
      mockPrisma.leaveRecord.findMany.mockResolvedValue([]);
      mockPrisma.expenseClaim.findMany.mockResolvedValue([]);
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([]);
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "doc-fnf" });

      const html = await ExitManagementService.generateFnFStatement("emp-1");

      expect(html).toContain("Full & Final Settlement");
      expect(html).toContain("Alice Dev");
      expect(html).toContain("CIR-EMP-001");
      expect(html).toContain("Circuvent Technologies");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Alumni Profile
  // ────────────────────────────────────────────────────────────
  describe("generateAlumniProfile", () => {
    it("should generate alumni profile for departed employee", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ dateOfLeaving: new Date("2025-06-30"), dateOfJoining: new Date("2020-01-01") })
      );
      mockPrisma.goal.findMany.mockResolvedValue([
        { title: "Led API redesign" },
        { title: "Mentored 3 juniors" },
      ]);
      mockPrisma.generatedDocument.findFirst.mockResolvedValue({
        data: { exitType: "VOLUNTARY" },
      });
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "alumni-1" });

      const result = await ExitManagementService.generateAlumniProfile("emp-1");

      expect(result.employeeName).toBe("Alice Dev");
      expect(result.tenureYears).toBeGreaterThan(5);
      expect(result.achievements.length).toBe(2);
      expect(result.exitType).toBe("VOLUNTARY");
    });

    it("should throw when employee has not exited", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ dateOfLeaving: null }));

      await expect(
        ExitManagementService.generateAlumniProfile("emp-1")
      ).rejects.toThrow("Employee has not yet exited");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Exit Progress
  // ────────────────────────────────────────────────────────────
  describe("getExitProgress", () => {
    it("should calculate progress percentage", async () => {
      const items = Array.from({ length: 27 }, (_, i) => ({
        id: `exit-emp-1-${i + 1}`,
        title: `Item ${i + 1}`,
        category: "IT",
        priority: "HIGH",
        isCompleted: i < 10,
      }));

      mockPrisma.generatedDocument.findFirst.mockResolvedValue({
        id: "cl-1",
        data: { items },
      });

      const result = await ExitManagementService.getExitProgress("emp-1");

      expect(result.totalItems).toBe(27);
      expect(result.completedItems).toBe(10);
      expect(result.percentage).toBe(37);
      expect(result.pendingByCategory.length).toBeGreaterThan(0);
    });

    it("should throw when no checklist exists", async () => {
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      await expect(
        ExitManagementService.getExitProgress("emp-1")
      ).rejects.toThrow("Exit checklist not found");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Schedule Exit Interview
  // ────────────────────────────────────────────────────────────
  describe("scheduleExitInterview", () => {
    it("should schedule interview and notify both parties", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.user.findUnique.mockResolvedValue({ id: "interviewer-1", firstName: "HR", lastName: "Manager" });
      mockPrisma.notification.create.mockResolvedValue({});
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      const result = await ExitManagementService.scheduleExitInterview("emp-1", "interviewer-1", futureDate);

      expect(result.success).toBe(true);
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2);
    });

    it("should throw for past date", async () => {
      const pastDate = new Date("2020-01-01");

      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.user.findUnique.mockResolvedValue({ id: "int-1", firstName: "HR", lastName: "MGR" });

      await expect(
        ExitManagementService.scheduleExitInterview("emp-1", "int-1", pastDate)
      ).rejects.toThrow("Interview date must be in the future");
    });
  });
});
