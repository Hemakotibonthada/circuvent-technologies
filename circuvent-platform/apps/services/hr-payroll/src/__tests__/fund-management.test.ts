// ──────────────────────────────────────────────────────────────
// HR & Payroll — Fund Management Service Test Suite
// Tests fund creation, debit/credit, transfers, balance
// reconciliation, spending limits, budget vs actual, fund
// freeze/unfreeze, and fiscal period closing.
// ──────────────────────────────────────────────────────────────

import { FundManagementService } from "../services/fund-management.service";

// ══════════════════════════════════════════════════════════════
// Mock Dependencies
// ══════════════════════════════════════════════════════════════

const mockFund = {
  id: "fund-001",
  name: "Engineering Operations",
  code: "FND-ENG-OPS",
  category: "OPERATIONAL",
  description: "Engineering department operational fund",
  totalBudget: 1000000,
  allocatedAmount: 200000,
  spentAmount: 100000,
  remainingAmount: 700000,
  currency: "INR",
  fiscalYear: "FY 2025-26",
  department: "Engineering",
  projectId: null,
  managerId: "mgr-001",
  isActive: true,
  startDate: new Date("2025-04-01"),
  endDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockFund2 = {
  ...mockFund,
  id: "fund-002",
  name: "Marketing Budget",
  code: "FND-MKT",
  category: "DEPARTMENT",
  department: "Marketing",
  totalBudget: 500000,
  remainingAmount: 400000,
  spentAmount: 50000,
  allocatedAmount: 50000,
};

const mockTransaction = {
  id: "txn-001",
  fundId: "fund-001",
  transactionType: "CREDIT",
  amount: 100000,
  description: "Initial deposit",
  status: "COMPLETED",
  processedAt: new Date(),
  processedBy: "mgr-001",
  balanceBefore: 0,
  balanceAfter: 100000,
  createdAt: new Date(),
};

const mockAllocation = {
  id: "alloc-001",
  fundId: "fund-001",
  allocatedTo: "Engineering",
  allocationType: "DEPARTMENT",
  amount: 100000,
  purpose: "Q1 budget",
  approvedBy: "mgr-001",
  startDate: new Date(),
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  fund: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  fundTransaction: {
    create: jest.fn(),
    findMany: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  fundAllocation: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
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

function resetMocks() {
  jest.clearAllMocks();
  mockPrisma.fund.findUnique.mockResolvedValue(mockFund);
  mockPrisma.fund.findFirst.mockResolvedValue(mockFund);
  mockPrisma.fund.create.mockResolvedValue(mockFund);
  mockPrisma.fund.update.mockResolvedValue(mockFund);
  mockPrisma.fund.findMany.mockResolvedValue([mockFund, mockFund2]);
  mockPrisma.fundTransaction.create.mockResolvedValue(mockTransaction);
  mockPrisma.fundTransaction.findMany.mockResolvedValue([mockTransaction]);
  mockPrisma.fundTransaction.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  mockPrisma.fundTransaction.groupBy.mockResolvedValue([]);
  mockPrisma.fundAllocation.create.mockResolvedValue(mockAllocation);
  mockPrisma.fundAllocation.findMany.mockResolvedValue([mockAllocation]);
}

beforeEach(resetMocks);

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("FundManagementService", () => {
  // ──────────────────────────────────────────────────────────
  // Fund Creation
  // ──────────────────────────────────────────────────────────

  describe("createFund", () => {
    it("should create a fund with initial balance", async () => {
      const result = await FundManagementService.createFund(
        "Engineering Fund", "OPERATIONAL", 500000, "mgr-001"
      );

      expect(mockPrisma.fund.create).toHaveBeenCalled();
      const createData = mockPrisma.fund.create.mock.calls[0][0].data;
      expect(createData.name).toBe("Engineering Fund");
      expect(createData.totalBudget).toBe(500000);
      expect(createData.remainingAmount).toBe(500000);
      expect(createData.managerId).toBe("mgr-001");
    });

    it("should create initial credit transaction for non-zero balance", async () => {
      await FundManagementService.createFund("Fund A", "OPERATIONAL", 100000, "mgr-001");

      expect(mockPrisma.fundTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          transactionType: "CREDIT",
          amount: 100000,
          description: "Initial fund balance",
        }),
      }));
    });

    it("should not create transaction for zero balance fund", async () => {
      await FundManagementService.createFund("Empty Fund", "EMERGENCY", 0, "mgr-001");
      expect(mockPrisma.fundTransaction.create).not.toHaveBeenCalled();
    });

    it("should throw for negative initial balance", async () => {
      await expect(
        FundManagementService.createFund("Bad Fund", "OPERATIONAL", -1000, "mgr-001")
      ).rejects.toThrow("Initial balance cannot be negative");
    });
  });

  // ──────────────────────────────────────────────────────────
  // Balance
  // ──────────────────────────────────────────────────────────

  describe("getFundBalance", () => {
    it("should calculate balance from transactions", async () => {
      mockPrisma.fundTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 500000 } })  // credits
        .mockResolvedValueOnce({ _sum: { amount: 200000 } }); // debits

      const result = await FundManagementService.getFundBalance("fund-001");

      expect(result.balance).toBe(300000);
      expect(result.spent).toBe(200000);
      expect(result.remaining).toBe(300000);
    });

    it("should throw if fund not found", async () => {
      mockPrisma.fund.findUnique.mockResolvedValue(null);
      await expect(
        FundManagementService.getFundBalance("bad-id")
      ).rejects.toThrow("Fund not found");
    });

    it("should handle zero transactions", async () => {
      mockPrisma.fundTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } });

      const result = await FundManagementService.getFundBalance("fund-001");
      expect(result.balance).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Debit / Credit
  // ──────────────────────────────────────────────────────────

  describe("debitFund", () => {
    it("should create a debit transaction", async () => {
      await FundManagementService.debitFund("fund-001", 50000, "Office supplies", "OPERATIONAL");

      expect(mockPrisma.fundTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          fundId: "fund-001",
          transactionType: "DEBIT",
          amount: 50000,
          balanceBefore: 700000,
          balanceAfter: 650000,
        }),
      }));
      expect(mockPrisma.fund.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          spentAmount: { increment: 50000 },
          remainingAmount: { decrement: 50000 },
        }),
      }));
    });

    it("should throw if fund not active", async () => {
      mockPrisma.fund.findUnique.mockResolvedValue({ ...mockFund, isActive: false });
      await expect(
        FundManagementService.debitFund("fund-001", 10000, "test")
      ).rejects.toThrow("Fund is not active");
    });

    it("should throw if insufficient balance", async () => {
      mockPrisma.fund.findUnique.mockResolvedValue({ ...mockFund, remainingAmount: 1000 });
      await expect(
        FundManagementService.debitFund("fund-001", 50000, "test")
      ).rejects.toThrow("Insufficient fund balance");
    });
  });

  describe("creditFund", () => {
    it("should create a credit transaction", async () => {
      await FundManagementService.creditFund("fund-001", 100000, "Budget top-up", "OPERATIONAL");

      expect(mockPrisma.fundTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          fundId: "fund-001",
          transactionType: "CREDIT",
          amount: 100000,
          balanceBefore: 700000,
          balanceAfter: 800000,
        }),
      }));
    });

    it("should throw if fund not active", async () => {
      mockPrisma.fund.findUnique.mockResolvedValue({ ...mockFund, isActive: false });
      await expect(
        FundManagementService.creditFund("fund-001", 50000, "test")
      ).rejects.toThrow("Fund is not active");
    });
  });

  // ──────────────────────────────────────────────────────────
  // Fund Transfer
  // ──────────────────────────────────────────────────────────

  describe("transferBetweenFunds", () => {
    it("should debit source and credit destination", async () => {
      mockPrisma.fund.findUnique
        .mockResolvedValueOnce(mockFund)  // source
        .mockResolvedValueOnce(mockFund2); // dest

      const result = await FundManagementService.transferBetweenFunds(
        "fund-001", "fund-002", 100000, "Budget reallocation"
      );

      expect(result.debitTxn).toBeDefined();
      expect(result.creditTxn).toBeDefined();
      expect(mockPrisma.fundTransaction.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.fund.update).toHaveBeenCalledTimes(2);
    });

    it("should throw if source fund insufficient balance", async () => {
      const lowBalanceFund = { ...mockFund, remainingAmount: 5000 };
      mockPrisma.fund.findUnique
        .mockResolvedValueOnce(lowBalanceFund)
        .mockResolvedValueOnce(mockFund2);

      await expect(
        FundManagementService.transferBetweenFunds("fund-001", "fund-002", 100000, "test")
      ).rejects.toThrow("Insufficient balance");
    });

    it("should throw if source fund not active", async () => {
      mockPrisma.fund.findUnique
        .mockResolvedValueOnce({ ...mockFund, isActive: false })
        .mockResolvedValueOnce(mockFund2);

      await expect(
        FundManagementService.transferBetweenFunds("fund-001", "fund-002", 10000, "test")
      ).rejects.toThrow("Source fund is not active");
    });

    it("should throw if destination fund not active", async () => {
      mockPrisma.fund.findUnique
        .mockResolvedValueOnce(mockFund)
        .mockResolvedValueOnce({ ...mockFund2, isActive: false });

      await expect(
        FundManagementService.transferBetweenFunds("fund-001", "fund-002", 10000, "test")
      ).rejects.toThrow("Destination fund is not active");
    });
  });

  // ──────────────────────────────────────────────────────────
  // Reconciliation
  // ──────────────────────────────────────────────────────────

  describe("reconcileFund", () => {
    it("should recalculate balance from all transactions", async () => {
      mockPrisma.fundTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 800000 } })  // credits
        .mockResolvedValueOnce({ _sum: { amount: 250000 } })  // debits
        .mockResolvedValueOnce({ _sum: { amount: 50000 } });  // transfer out

      const result = await FundManagementService.reconcileFund("fund-001");

      expect(result.balance).toBe(550000);
      expect(result.discrepancy).toBe(550000 - 700000);
      expect(mockPrisma.fund.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ remainingAmount: 550000 }),
      }));
    });

    it("should handle fund with no transactions", async () => {
      mockPrisma.fundTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } });

      const result = await FundManagementService.reconcileFund("fund-001");
      expect(result.balance).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Spending Limits
  // ──────────────────────────────────────────────────────────

  describe("setSpendingLimit / checkSpendingLimit", () => {
    it("should set spending limits for a fund", async () => {
      const result = await FundManagementService.setSpendingLimit("fund-001", 50000, 500000);

      expect(result.fundId).toBe("fund-001");
      expect(result.dailyLimit).toBe(50000);
      expect(result.monthlyLimit).toBe(500000);
    });

    it("should allow transactions within limits", async () => {
      await FundManagementService.setSpendingLimit("fund-001", 100000, 1000000);
      mockPrisma.fundTransaction.aggregate.mockResolvedValue({ _sum: { amount: 10000 } });

      const result = await FundManagementService.checkSpendingLimit("fund-001", 5000);
      expect(result.allowed).toBe(true);
    });

    it("should throw when daily limit exceeded", async () => {
      await FundManagementService.setSpendingLimit("fund-001", 20000, 500000);
      mockPrisma.fundTransaction.aggregate.mockResolvedValue({ _sum: { amount: 18000 } });

      await expect(
        FundManagementService.checkSpendingLimit("fund-001", 5000)
      ).rejects.toThrow("Daily spending limit exceeded");
    });

    it("should throw when monthly limit exceeded", async () => {
      await FundManagementService.setSpendingLimit("fund-001", 100000, 50000);
      mockPrisma.fundTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 5000 } })   // daily
        .mockResolvedValueOnce({ _sum: { amount: 48000 } }); // monthly

      await expect(
        FundManagementService.checkSpendingLimit("fund-001", 5000)
      ).rejects.toThrow("Monthly spending limit exceeded");
    });

    it("should allow if no limits set", async () => {
      const result = await FundManagementService.checkSpendingLimit("fund-no-limit", 100000);
      expect(result.allowed).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Budget vs Actual
  // ──────────────────────────────────────────────────────────

  describe("generateBudgetVsActualReport", () => {
    it("should generate variance analysis", async () => {
      mockPrisma.fundTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 500000 } })  // credits
        .mockResolvedValueOnce({ _sum: { amount: 300000 } }); // debits
      mockPrisma.fundTransaction.groupBy.mockResolvedValue([
        { referenceType: "PurchaseRequest", _sum: { amount: 200000 } },
        { referenceType: "General", _sum: { amount: 100000 } },
      ]);

      const report = await FundManagementService.generateBudgetVsActualReport("fund-001", "FY 2025-26");

      expect(report.fundId).toBe("fund-001");
      expect(report.budget).toBe(1000000);
      expect(report.spent).toBe(300000);
      expect(report.variance).toBe(700000);
      expect(report.byCategory).toHaveLength(2);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Fund Freeze / Unfreeze
  // ──────────────────────────────────────────────────────────

  describe("freezeFund / unfreezeFund", () => {
    it("should freeze a fund", async () => {
      const result = await FundManagementService.freezeFund("fund-001", "Audit investigation");
      expect(result.status).toBe("FROZEN");
      expect(result.reason).toBe("Audit investigation");
    });

    it("should prevent debit on frozen fund", async () => {
      await FundManagementService.freezeFund("fund-001", "Audit");
      await expect(
        FundManagementService.debitFund("fund-001", 10000, "test")
      ).rejects.toThrow("Fund is frozen");
    });

    it("should prevent credit on frozen fund", async () => {
      await FundManagementService.freezeFund("fund-001", "Audit");
      await expect(
        FundManagementService.creditFund("fund-001", 10000, "test")
      ).rejects.toThrow("Fund is frozen");
    });

    it("should unfreeze a fund", async () => {
      await FundManagementService.freezeFund("fund-001", "Audit");
      const result = await FundManagementService.unfreezeFund("fund-001");
      expect(result.status).toBe("ACTIVE");
    });

    it("should allow transactions after unfreezing", async () => {
      await FundManagementService.freezeFund("fund-001", "Audit");
      await FundManagementService.unfreezeFund("fund-001");

      // Should not throw
      await FundManagementService.debitFund("fund-001", 10000, "test");
      expect(mockPrisma.fundTransaction.create).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────
  // Fiscal Period Closing
  // ──────────────────────────────────────────────────────────

  describe("closeFiscalPeriod", () => {
    it("should generate month-end summary", async () => {
      mockPrisma.fundTransaction.findMany.mockResolvedValue([
        { ...mockTransaction, transactionType: "CREDIT", amount: 200000 },
        { ...mockTransaction, transactionType: "DEBIT", amount: 80000 },
      ]);
      mockPrisma.fundTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 500000 } })  // prior credits
        .mockResolvedValueOnce({ _sum: { amount: 100000 } }); // prior debits

      const result = await FundManagementService.closeFiscalPeriod("fund-001", 2026, 3);

      expect(result.fundId).toBe("fund-001");
      expect(result.year).toBe(2026);
      expect(result.month).toBe(3);
      expect(result.openingBalance).toBe(400000);
      expect(result.totalCredits).toBe(200000);
      expect(result.totalDebits).toBe(80000);
      expect(result.closingBalance).toBe(520000);
      expect(result.transactionCount).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Fund Dashboard
  // ──────────────────────────────────────────────────────────

  describe("getFundDashboard", () => {
    it("should return all funds summary", async () => {
      mockPrisma.fund.findMany.mockResolvedValue([
        { ...mockFund, _count: { transactions: 10, allocations: 3 } },
        { ...mockFund2, _count: { transactions: 5, allocations: 2 } },
      ]);
      mockPrisma.fundTransaction.findMany.mockResolvedValue([mockTransaction]);

      const dashboard = await FundManagementService.getFundDashboard();

      expect(dashboard.totalFunds).toBe(2);
      expect(dashboard.totalBudget).toBeGreaterThan(0);
      expect(dashboard.recentTransactions).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────────────
  // Allocations
  // ──────────────────────────────────────────────────────────

  describe("allocateFunds", () => {
    it("should create an allocation", async () => {
      await FundManagementService.allocateFunds(
        "fund-001", "Engineering", 100000, "Q3 budget"
      );

      expect(mockPrisma.fundAllocation.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          fundId: "fund-001",
          allocatedTo: "Engineering",
          amount: 100000,
          purpose: "Q3 budget",
        }),
      }));
      expect(mockPrisma.fund.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          allocatedAmount: { increment: 100000 },
          remainingAmount: { decrement: 100000 },
        }),
      }));
    });

    it("should throw if insufficient balance for allocation", async () => {
      mockPrisma.fund.findUnique.mockResolvedValue({ ...mockFund, remainingAmount: 5000 });
      await expect(
        FundManagementService.allocateFunds("fund-001", "Engineering", 100000, "Over-allocate")
      ).rejects.toThrow("Insufficient fund balance");
    });
  });

  // ──────────────────────────────────────────────────────────
  // Audit Trail
  // ──────────────────────────────────────────────────────────

  describe("getAuditTrail", () => {
    it("should return combined transactions and allocations", async () => {
      mockPrisma.fundTransaction.findMany.mockResolvedValue([mockTransaction]);
      mockPrisma.fundAllocation.findMany.mockResolvedValue([mockAllocation]);

      const trail = await FundManagementService.getAuditTrail("fund-001");

      expect(trail.length).toBeGreaterThanOrEqual(2);
      expect(trail.some((t: any) => t.type === "TRANSACTION")).toBe(true);
      expect(trail.some((t: any) => t.type === "ALLOCATION")).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Fund Reports
  // ──────────────────────────────────────────────────────────

  describe("generateFundReport", () => {
    it("should generate SUMMARY report", async () => {
      mockPrisma.fundTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 500000 } })
        .mockResolvedValueOnce({ _sum: { amount: 200000 } });

      const report = await FundManagementService.generateFundReport("fund-001", "SUMMARY");

      expect(report.reportType).toBe("SUMMARY");
      expect(report.data.fundName).toBe("Engineering Operations");
      expect(report.data.totalBudget).toBe(1000000);
    });

    it("should generate BALANCE_SHEET report", async () => {
      mockPrisma.fundTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 500000 } })
        .mockResolvedValueOnce({ _sum: { amount: 200000 } });

      const report = await FundManagementService.generateFundReport("fund-001", "BALANCE_SHEET");

      expect(report.reportType).toBe("BALANCE_SHEET");
      expect(report.data.assets).toBeDefined();
      expect(report.data.liabilities).toBeDefined();
    });

    it("should generate INCOME_EXPENSE report", async () => {
      mockPrisma.fundTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 500000 } })
        .mockResolvedValueOnce({ _sum: { amount: 200000 } });
      mockPrisma.fundTransaction.findMany
        .mockResolvedValueOnce([{ ...mockTransaction, amount: 300000 }])
        .mockResolvedValueOnce([{ ...mockTransaction, transactionType: "DEBIT", amount: 100000 }]);

      const report = await FundManagementService.generateFundReport("fund-001", "INCOME_EXPENSE");

      expect(report.reportType).toBe("INCOME_EXPENSE");
      expect(report.data.income).toBeDefined();
      expect(report.data.expenses).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────────────
  // Auto Allocate
  // ──────────────────────────────────────────────────────────

  describe("autoAllocateMonthlyBudgets", () => {
    it("should create allocations based on last month pattern", async () => {
      mockPrisma.fundAllocation.findMany.mockResolvedValue([
        { ...mockAllocation, amount: 50000 },
      ]);

      const result = await FundManagementService.autoAllocateMonthlyBudgets();

      expect(result.allocationsCreated).toBeGreaterThanOrEqual(0);
      expect(typeof result.totalAllocated).toBe("number");
    });
  });

  // ──────────────────────────────────────────────────────────
  // Department & Project Spending
  // ──────────────────────────────────────────────────────────

  describe("getDepartmentSpending", () => {
    it("should return spending for a department", async () => {
      mockPrisma.fund.findMany.mockResolvedValue([{ id: "fund-001" }]);
      mockPrisma.fundTransaction.findMany.mockResolvedValue([
        { ...mockTransaction, transactionType: "DEBIT", amount: 50000, referenceType: "PurchaseRequest" },
      ]);

      const result = await FundManagementService.getDepartmentSpending("Engineering", "2026-03");

      expect(result.department).toBe("Engineering");
      expect(result.totalSpent).toBe(50000);
    });

    it("should return zero if no funds for department", async () => {
      mockPrisma.fund.findMany.mockResolvedValue([]);
      const result = await FundManagementService.getDepartmentSpending("Unknown", "2026-03");
      expect(result.totalSpent).toBe(0);
    });
  });

  describe("getProjectSpending", () => {
    it("should return project budget consumption", async () => {
      mockPrisma.fund.findFirst.mockResolvedValue(mockFund);
      mockPrisma.fundTransaction.findMany.mockResolvedValue([mockTransaction]);

      const result = await FundManagementService.getProjectSpending("project-001");

      expect(result.totalBudget).toBe(1000000);
      expect(result.transactions).toHaveLength(1);
    });

    it("should return zeros if no fund for project", async () => {
      mockPrisma.fund.findFirst.mockResolvedValue(null);
      const result = await FundManagementService.getProjectSpending("bad-project");
      expect(result.totalBudget).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Fund Statement
  // ──────────────────────────────────────────────────────────

  describe("getFundStatement", () => {
    it("should return transaction history for date range", async () => {
      mockPrisma.fundTransaction.findMany.mockResolvedValue([mockTransaction]);
      mockPrisma.fundTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 200000 } })  // credits in range
        .mockResolvedValueOnce({ _sum: { amount: 50000 } })   // debits in range
        .mockResolvedValueOnce({ _sum: { amount: 300000 } })  // prior credits
        .mockResolvedValueOnce({ _sum: { amount: 100000 } }); // prior debits

      const statement = await FundManagementService.getFundStatement(
        "fund-001", "2026-03-01", "2026-03-31"
      );

      expect(statement.fundName).toBe("Engineering Operations");
      expect(statement.openingBalance).toBe(200000);
      expect(statement.totalCredits).toBe(200000);
      expect(statement.totalDebits).toBe(50000);
      expect(statement.closingBalance).toBe(350000);
    });
  });
});
