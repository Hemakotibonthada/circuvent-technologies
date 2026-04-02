// ──────────────────────────────────────────────────────────────
// HR & Payroll — Purchase Automation Service Test Suite
// Tests approval chain routing, auto-approve, multi-level
// approval, payment processing, budget checking, fund
// debit/credit, and expired request rejection.
// ──────────────────────────────────────────────────────────────

import { PurchaseAutomationService } from "../services/purchase-automation.service";

// ══════════════════════════════════════════════════════════════
// Mock Dependencies
// ══════════════════════════════════════════════════════════════

const mockEmployee = {
  id: "emp-001",
  userId: "user-001",
  employeeCode: "CIR-EMP-001",
  designation: "Software Engineer",
  department: "Engineering",
  bankAccountNo: "1234567890",
  user: {
    id: "user-001",
    firstName: "Rahul",
    lastName: "Kumar",
    email: "rahul@circuvent.com",
    role: "ENGINEER",
    department: "Engineering",
  },
};

const mockManager = {
  id: "mgr-001",
  role: "MANAGER",
  firstName: "Anita",
  lastName: "Patel",
};

const mockFinanceUser = {
  id: "fin-001",
  role: "HR_MANAGER",
  firstName: "Suresh",
  lastName: "Reddy",
};

const mockCEOUser = {
  id: "ceo-001",
  role: "CEO",
  firstName: "Vikram",
  lastName: "Shah",
};

const mockFund = {
  id: "fund-001",
  name: "Engineering Operations",
  category: "OPERATIONAL",
  totalBudget: 1000000,
  allocatedAmount: 200000,
  spentAmount: 100000,
  remainingAmount: 700000,
  isActive: true,
  department: "Engineering",
};

const mockBankAccount = {
  id: "bank-001",
  bankName: "HDFC Bank",
  accountNumber: "HDFC0001234",
  isDefault: true,
  isActive: true,
  balance: 5000000,
};

let createdRequestId = "pr-001";
const mockPurchaseRequest = {
  id: createdRequestId,
  requestNumber: "PR-2026-0001",
  employeeId: "emp-001",
  department: "Engineering",
  title: "MacBook Pro for Development",
  description: "Need a laptop for project work",
  justification: "Current laptop is too slow",
  totalAmount: 150000,
  actualAmount: null,
  status: "SUBMITTED",
  urgency: "NORMAL",
  items: [
    { id: "item-001", name: "MacBook Pro M3", quantity: 1, unitPrice: 150000, totalPrice: 150000, category: "HARDWARE" },
  ],
  approvals: [],
  transactions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSmallRequest = {
  ...mockPurchaseRequest,
  id: "pr-002",
  totalAmount: 3000,
  status: "MANAGER_APPROVED",
  items: [{ id: "item-002", name: "USB Cable", quantity: 3, unitPrice: 1000, totalPrice: 3000, category: "HARDWARE" }],
};

const mockPrisma = {
  employee: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  purchaseRequest: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
  },
  purchaseItem: { create: jest.fn() },
  purchaseApproval: { create: jest.fn() },
  fund: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  fundTransaction: { create: jest.fn(), update: jest.fn() },
  companyBankAccount: { findFirst: jest.fn() },
  notification: { create: jest.fn() },
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

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
  mockPrisma.user.findUnique.mockResolvedValue(mockManager);
  mockPrisma.purchaseRequest.findUnique.mockResolvedValue(mockPurchaseRequest);
  mockPrisma.purchaseRequest.create.mockResolvedValue(mockPurchaseRequest);
  mockPrisma.purchaseRequest.update.mockResolvedValue(mockPurchaseRequest);
  mockPrisma.purchaseApproval.create.mockResolvedValue({ id: "approval-001" });
  mockPrisma.fund.findFirst.mockResolvedValue(mockFund);
  mockPrisma.fund.findUnique.mockResolvedValue(mockFund);
  mockPrisma.fund.update.mockResolvedValue(mockFund);
  mockPrisma.fundTransaction.create.mockResolvedValue({ id: "txn-001" });
  mockPrisma.companyBankAccount.findFirst.mockResolvedValue(mockBankAccount);
  mockPrisma.purchaseRequest.count.mockResolvedValue(0);
});

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("PurchaseAutomationService", () => {
  // ──────────────────────────────────────────────────────────
  // Approval Chain
  // ──────────────────────────────────────────────────────────

  describe("getApprovalChain", () => {
    it("should return empty chain for amounts below auto-approve threshold", () => {
      const chain = PurchaseAutomationService.getApprovalChain(3000);
      expect(chain).toHaveLength(0);
    });

    it("should require manager for amounts >= 5000", () => {
      const chain = PurchaseAutomationService.getApprovalChain(10000);
      expect(chain.some((s: any) => s.role === "MANAGER")).toBe(true);
    });

    it("should require finance for amounts >= 25000", () => {
      const chain = PurchaseAutomationService.getApprovalChain(50000);
      expect(chain.some((s: any) => s.role === "FINANCE")).toBe(true);
      expect(chain.some((s: any) => s.role === "MANAGER")).toBe(true);
    });

    it("should require CEO for amounts >= 100000", () => {
      const chain = PurchaseAutomationService.getApprovalChain(200000);
      expect(chain.some((s: any) => s.role === "CEO")).toBe(true);
      expect(chain.some((s: any) => s.role === "FINANCE")).toBe(true);
      expect(chain.some((s: any) => s.role === "MANAGER")).toBe(true);
    });

    it("should return all levels for very large amounts", () => {
      const chain = PurchaseAutomationService.getApprovalChain(500000);
      expect(chain.length).toBe(3);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Create Purchase Request
  // ──────────────────────────────────────────────────────────

  describe("createPurchaseRequest", () => {
    it("should create a purchase request with items", async () => {
      const result = await PurchaseAutomationService.createPurchaseRequest("emp-001", {
        title: "Office supplies",
        justification: "Running low on supplies",
        items: [
          { name: "Pens", quantity: 10, unitPrice: 50 },
          { name: "Notebooks", quantity: 5, unitPrice: 200 },
        ],
      });

      expect(mockPrisma.purchaseRequest.create).toHaveBeenCalled();
      const createData = mockPrisma.purchaseRequest.create.mock.calls[0][0].data;
      expect(createData.employeeId).toBe("emp-001");
      expect(createData.department).toBe("Engineering");
    });

    it("should auto-approve requests under 5000", async () => {
      mockPrisma.purchaseRequest.create.mockResolvedValue(mockSmallRequest);

      await PurchaseAutomationService.createPurchaseRequest("emp-001", {
        title: "USB Cables",
        justification: "For testing",
        items: [{ name: "USB Cable", quantity: 3, unitPrice: 1000 }],
      });

      const createData = mockPrisma.purchaseRequest.create.mock.calls[0][0].data;
      expect(createData.status).toBe("MANAGER_APPROVED");
      expect(mockPrisma.purchaseApproval.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          approverId: "SYSTEM",
          action: "APPROVED",
        }),
      }));
    });

    it("should throw if employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);
      await expect(
        PurchaseAutomationService.createPurchaseRequest("bad-emp", {
          title: "Test", justification: "Test", items: [{ name: "A", quantity: 1, unitPrice: 100 }],
        })
      ).rejects.toThrow("Employee not found");
    });

    it("should throw for zero total amount", async () => {
      await expect(
        PurchaseAutomationService.createPurchaseRequest("emp-001", {
          title: "Test", justification: "Test", items: [{ name: "A", quantity: 0, unitPrice: 0 }],
        })
      ).rejects.toThrow("Total amount must be positive");
    });
  });

  // ──────────────────────────────────────────────────────────
  // Approval Flow
  // ──────────────────────────────────────────────────────────

  describe("approvePurchaseRequest", () => {
    it("should approve and advance status", async () => {
      mockPrisma.purchaseRequest.update.mockResolvedValue({
        ...mockPurchaseRequest, status: "MANAGER_APPROVED",
      });

      const result = await PurchaseAutomationService.approvePurchaseRequest(
        "pr-001", "mgr-001", "Looks good"
      );

      expect(mockPrisma.purchaseApproval.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          purchaseRequestId: "pr-001",
          approverId: "mgr-001",
          action: "APPROVED",
        }),
      }));
    });

    it("should throw for not found request", async () => {
      mockPrisma.purchaseRequest.findUnique.mockResolvedValue(null);
      await expect(
        PurchaseAutomationService.approvePurchaseRequest("bad-id", "mgr-001")
      ).rejects.toThrow("Purchase request not found");
    });

    it("should throw for already rejected request", async () => {
      mockPrisma.purchaseRequest.findUnique.mockResolvedValue({
        ...mockPurchaseRequest, status: "REJECTED",
      });
      await expect(
        PurchaseAutomationService.approvePurchaseRequest("pr-001", "mgr-001")
      ).rejects.toThrow("Cannot approve");
    });

    it("should set finance approval fields when finance approves", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockFinanceUser);
      mockPrisma.purchaseRequest.findUnique.mockResolvedValue({
        ...mockPurchaseRequest,
        totalAmount: 50000,
        status: "MANAGER_APPROVED",
        approvals: [{ approverId: "mgr-001", approverRole: "MANAGER", action: "APPROVED" }],
      });

      await PurchaseAutomationService.approvePurchaseRequest("pr-001", "fin-001", "Budget verified");

      const updateData = mockPrisma.purchaseRequest.update.mock.calls[0][0].data;
      expect(updateData.financeApprovedBy).toBe("fin-001");
    });
  });

  describe("rejectPurchaseRequest", () => {
    it("should reject with reason", async () => {
      mockPrisma.purchaseRequest.update.mockResolvedValue({ ...mockPurchaseRequest, status: "REJECTED" });

      await PurchaseAutomationService.rejectPurchaseRequest(
        "pr-001", "mgr-001", "Budget constraints"
      );

      expect(mockPrisma.purchaseApproval.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ action: "REJECTED", comments: "Budget constraints" }),
      }));
      expect(mockPrisma.purchaseRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: "REJECTED", rejectionReason: "Budget constraints" }),
      }));
    });

    it("should throw for already rejected request", async () => {
      mockPrisma.purchaseRequest.findUnique.mockResolvedValue({ ...mockPurchaseRequest, status: "REJECTED" });
      await expect(
        PurchaseAutomationService.rejectPurchaseRequest("pr-001", "mgr-001", "Reason")
      ).rejects.toThrow("already REJECTED");
    });
  });

  // ──────────────────────────────────────────────────────────
  // Payment Processing
  // ──────────────────────────────────────────────────────────

  describe("processPayment", () => {
    it("should debit fund and update status", async () => {
      mockPrisma.purchaseRequest.update.mockResolvedValue({ ...mockPurchaseRequest, status: "REIMBURSED" });

      await PurchaseAutomationService.processPayment("pr-001");

      expect(mockPrisma.fundTransaction.create).toHaveBeenCalled();
      expect(mockPrisma.fund.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          spentAmount: { increment: 150000 },
          remainingAmount: { decrement: 150000 },
        }),
      }));
    });

    it("should throw if no bank account configured", async () => {
      mockPrisma.companyBankAccount.findFirst.mockResolvedValue(null);
      await expect(
        PurchaseAutomationService.processPayment("pr-001")
      ).rejects.toThrow("No default company bank account");
    });

    it("should throw if insufficient fund balance", async () => {
      mockPrisma.fund.findFirst.mockResolvedValue({ ...mockFund, remainingAmount: 1000 });
      await expect(
        PurchaseAutomationService.processPayment("pr-001")
      ).rejects.toThrow("Insufficient fund balance");
    });

    it("should use actualAmount if available", async () => {
      mockPrisma.purchaseRequest.findUnique.mockResolvedValue({
        ...mockPurchaseRequest, actualAmount: 140000,
      });
      mockPrisma.purchaseRequest.update.mockResolvedValue({ ...mockPurchaseRequest, status: "REIMBURSED" });

      await PurchaseAutomationService.processPayment("pr-001");

      const txnData = mockPrisma.fundTransaction.create.mock.calls[0][0].data;
      expect(txnData.amount).toBe(140000);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Budget Checking
  // ──────────────────────────────────────────────────────────

  describe("checkBudgetAvailability", () => {
    it("should return available if fund has sufficient balance", async () => {
      const result = await PurchaseAutomationService.checkBudgetAvailability("Engineering", 50000);
      expect(result.available).toBe(true);
      expect(result.fundId).toBe("fund-001");
      expect(result.shortfall).toBe(0);
    });

    it("should return unavailable if balance insufficient", async () => {
      mockPrisma.fund.findFirst.mockResolvedValue({ ...mockFund, remainingAmount: 10000 });
      const result = await PurchaseAutomationService.checkBudgetAvailability("Engineering", 50000);
      expect(result.available).toBe(false);
      expect(result.shortfall).toBe(40000);
    });

    it("should return unavailable if no fund found", async () => {
      mockPrisma.fund.findFirst.mockResolvedValue(null);
      const result = await PurchaseAutomationService.checkBudgetAvailability("Marketing", 10000);
      expect(result.available).toBe(false);
      expect(result.balance).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Fund Debit/Credit
  // ──────────────────────────────────────────────────────────

  describe("debitFund", () => {
    it("should create debit transaction", async () => {
      await PurchaseAutomationService.debitFund("fund-001", 10000, "Office supplies");

      expect(mockPrisma.fundTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          fundId: "fund-001",
          transactionType: "DEBIT",
          amount: 10000,
        }),
      }));
      expect(mockPrisma.fund.update).toHaveBeenCalled();
    });

    it("should throw if fund not found", async () => {
      mockPrisma.fund.findUnique.mockResolvedValue(null);
      await expect(
        PurchaseAutomationService.debitFund("bad-fund", 1000, "test")
      ).rejects.toThrow("Fund not found");
    });

    it("should throw if insufficient balance", async () => {
      mockPrisma.fund.findUnique.mockResolvedValue({ ...mockFund, remainingAmount: 100 });
      await expect(
        PurchaseAutomationService.debitFund("fund-001", 5000, "test")
      ).rejects.toThrow("Insufficient fund balance");
    });
  });

  describe("creditEmployeeAccount", () => {
    it("should create credit transaction for employee", async () => {
      await PurchaseAutomationService.creditEmployeeAccount("emp-001", 50000, "Reimbursement");

      expect(mockPrisma.fundTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          beneficiaryName: "Rahul Kumar",
          amount: 50000,
        }),
      }));
    });
  });

  // ──────────────────────────────────────────────────────────
  // Auto-reject
  // ──────────────────────────────────────────────────────────

  describe("autoRejectExpiredRequests", () => {
    it("should reject requests older than 30 days", async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);

      mockPrisma.purchaseRequest.findMany.mockResolvedValue([
        { id: "pr-old-1", requestNumber: "PR-2026-0100", createdAt: oldDate },
        { id: "pr-old-2", requestNumber: "PR-2026-0101", createdAt: oldDate },
      ]);
      mockPrisma.purchaseRequest.update.mockResolvedValue({});

      const result = await PurchaseAutomationService.autoRejectExpiredRequests();

      expect(result.rejectedCount).toBe(2);
      expect(result.rejectedIds).toHaveLength(2);
      expect(mockPrisma.purchaseRequest.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.purchaseApproval.create).toHaveBeenCalledTimes(2);
    });

    it("should return empty if no expired requests", async () => {
      mockPrisma.purchaseRequest.findMany.mockResolvedValue([]);
      const result = await PurchaseAutomationService.autoRejectExpiredRequests();
      expect(result.rejectedCount).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────
  // Other Operations
  // ──────────────────────────────────────────────────────────

  describe("cancelPurchaseRequest", () => {
    it("should cancel a draft/submitted request", async () => {
      await PurchaseAutomationService.cancelPurchaseRequest("pr-001", "Changed plans");
      expect(mockPrisma.purchaseRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: "CANCELLED" }),
      }));
    });

    it("should throw for non-cancellable statuses", async () => {
      mockPrisma.purchaseRequest.findUnique.mockResolvedValue({
        ...mockPurchaseRequest, status: "REIMBURSED",
      });
      await expect(
        PurchaseAutomationService.cancelPurchaseRequest("pr-001", "reason")
      ).rejects.toThrow("Cannot cancel");
    });
  });

  describe("addReceiptToPurchase", () => {
    it("should add receipt and update status", async () => {
      await PurchaseAutomationService.addReceiptToPurchase("pr-001", "https://receipt.url", 148000);
      expect(mockPrisma.purchaseRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          billUrl: "https://receipt.url",
          actualAmount: 148000,
          status: "BILL_SUBMITTED",
        }),
      }));
    });
  });

  describe("getMyPurchaseRequests", () => {
    it("should return requests for the requester", async () => {
      mockPrisma.purchaseRequest.findMany.mockResolvedValue([mockPurchaseRequest]);
      const result = await PurchaseAutomationService.getMyPurchaseRequests("emp-001");
      expect(result).toHaveLength(1);
      expect(mockPrisma.purchaseRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { employeeId: "emp-001" },
      }));
    });
  });

  describe("getPurchaseRequestStats", () => {
    it("should return comprehensive stats", async () => {
      mockPrisma.purchaseRequest.count
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(30)
        .mockResolvedValueOnce(5);
      mockPrisma.purchaseRequest.groupBy.mockResolvedValueOnce([
        { status: "SUBMITTED", _count: { id: 10 } },
        { status: "REIMBURSED", _count: { id: 30 } },
      ]).mockResolvedValueOnce([
        { department: "Engineering", _count: { id: 20 }, _sum: { totalAmount: 500000 } },
      ]);
      mockPrisma.purchaseRequest.aggregate.mockResolvedValue({ _sum: { totalAmount: 2000000 } });
      mockPrisma.purchaseRequest.findMany.mockResolvedValue([]);

      const stats = await PurchaseAutomationService.getPurchaseRequestStats();

      expect(stats.totalRequests).toBe(50);
      expect(stats.pendingCount).toBe(10);
      expect(stats.approvedCount).toBe(30);
      expect(stats.rejectedCount).toBe(5);
    });
  });

  describe("generatePurchaseReport", () => {
    it("should generate spending report", async () => {
      mockPrisma.purchaseRequest.findMany.mockResolvedValue([
        {
          id: "pr-001", employeeId: "emp-001", department: "Engineering",
          totalAmount: 50000, actualAmount: null, createdAt: new Date("2026-02-15"),
          items: [{ category: "HARDWARE", totalPrice: 50000 }],
        },
      ]);

      const report = await PurchaseAutomationService.generatePurchaseReport("2026-01-01", "2026-03-31");

      expect(report.totalSpent).toBe(50000);
      expect(report.totalRequests).toBe(1);
      expect(report.byDepartment).toHaveLength(1);
    });
  });
});
