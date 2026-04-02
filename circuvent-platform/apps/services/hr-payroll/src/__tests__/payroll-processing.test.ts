// ──────────────────────────────────────────────────────────────
// HR & Payroll — Payroll Processing Service Test Suite
// Tests for payroll initiation, gross salary, deductions (PF,
// ESI, TDS, PT), net salary, batch processing, supplementary
// payroll, bank file generation, Form 16, hold/release, revert,
// arrears, and dashboard.
// ──────────────────────────────────────────────────────────────

import { PayrollProcessingService } from "../services/payroll-processing.service";

// ══════════════════════════════════════════════════════════════
// Mock Dependencies
// ══════════════════════════════════════════════════════════════

const mockPrisma = {
  employee: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  salarySlip: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  salaryAdvance: { findMany: jest.fn() },
  generatedDocument: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
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

function mockEmployee(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id || "emp-1",
    userId: overrides.userId || "user-1",
    employeeCode: overrides.employeeCode || "CIR-EMP-001",
    employmentType: overrides.employmentType || "FULL_TIME",
    designation: overrides.designation || "SDE-2",
    department: overrides.department || "Engineering",
    dateOfJoining: overrides.dateOfJoining || new Date("2022-06-01"),
    dateOfLeaving: overrides.dateOfLeaving || null,
    baseSalary: overrides.baseSalary ?? 1200000,
    currency: "INR",
    panNumber: overrides.panNumber || "ABCDE1234F",
    bankAccountNo: overrides.bankAccountNo || "9876543210",
    bankIFSC: overrides.bankIFSC || "ICIC0001234",
    user: overrides.user || { firstName: "Alice", lastName: "Dev", email: "alice@circuvent.io" },
    ...overrides,
  };
}

function mockSlip(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id || "slip-1",
    employeeId: overrides.employeeId || "emp-1",
    month: overrides.month || 3,
    year: overrides.year || 2026,
    basePay: overrides.basePay || 40000,
    hra: overrides.hra || 20000,
    da: overrides.da || 4000,
    specialAllowance: overrides.specialAllowance || 30150,
    bonus: overrides.bonus || 0,
    grossSalary: overrides.grossSalary || 100000,
    pfDeduction: overrides.pfDeduction || 1800,
    esiDeduction: overrides.esiDeduction || 0,
    professionalTax: overrides.professionalTax || 200,
    tds: overrides.tds || 8000,
    otherDeductions: overrides.otherDeductions || 0,
    totalDeductions: overrides.totalDeductions || 10000,
    netSalary: overrides.netSalary || 90000,
    isPaid: overrides.isPaid ?? false,
    currency: "INR",
    employee: overrides.employee || {
      ...mockEmployee(),
      user: { firstName: "Alice", lastName: "Dev" },
    },
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("PayrollProcessingService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────
  // Initiate Payroll
  // ────────────────────────────────────────────────────────────
  describe("initiatePayroll", () => {
    it("should create a payroll run", async () => {
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);
      mockPrisma.employee.count.mockResolvedValue(50);
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "run-1" });

      const result = await PayrollProcessingService.initiatePayroll(3, 2026);

      expect(result.month).toBe(3);
      expect(result.year).toBe(2026);
      expect(result.status).toBe("INITIATED");
      expect(result.totalEmployees).toBe(50);
    });

    it("should throw for invalid month", async () => {
      await expect(
        PayrollProcessingService.initiatePayroll(13, 2026)
      ).rejects.toThrow("Invalid month");
    });

    it("should throw if payroll already exists", async () => {
      mockPrisma.generatedDocument.findFirst.mockResolvedValue({
        id: "existing",
        data: { month: 3, year: 2026, status: "COMPLETED" },
      });

      await expect(
        PayrollProcessingService.initiatePayroll(3, 2026)
      ).rejects.toThrow("Payroll run already exists");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Gross Salary Calculation
  // ────────────────────────────────────────────────────────────
  describe("calculateGrossSalary", () => {
    it("should compute correct salary breakdown for ₹12L CTC", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ baseSalary: 1200000 }));

      const result = await PayrollProcessingService.calculateGrossSalary("emp-1", 3);

      const monthlyGross = 1200000 / 12; // 100,000
      expect(result.basePay).toBeCloseTo(monthlyGross * 0.40, 0); // 40,000
      expect(result.hra).toBeCloseTo(result.basePay * 0.50, 0); // 20,000
      expect(result.da).toBeCloseTo(result.basePay * 0.10, 0); // 4,000
      expect(result.conveyanceAllowance).toBe(1600);
      expect(result.medicalAllowance).toBe(1250);
      expect(result.grossSalary).toBeCloseTo(monthlyGross, 0);
    });

    it("should compute correct breakdown for ₹6L CTC", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ baseSalary: 600000 }));

      const result = await PayrollProcessingService.calculateGrossSalary("emp-1", 3);

      expect(result.basePay).toBeCloseTo(20000, 0);
      expect(result.grossSalary).toBeCloseTo(50000, 0);
    });

    it("should throw when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        PayrollProcessingService.calculateGrossSalary("bad-id", 3)
      ).rejects.toThrow("Employee not found");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Deductions (PF, ESI, TDS, PT)
  // ────────────────────────────────────────────────────────────
  describe("calculateDeductions", () => {
    it("should calculate PF at 12% of basic (capped at ₹15,000)", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ baseSalary: 1200000 }));
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([]);

      const result = await PayrollProcessingService.calculateDeductions("emp-1", 3);

      // Basic = 40,000, PF ceiling = 15,000 -> PF = 15000 * 0.12 = 1,800
      expect(result.pfEmployee).toBe(1800);
      expect(result.pfEmployer).toBe(1800);
    });

    it("should not deduct ESI when gross > ₹21,000", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ baseSalary: 1200000 }));
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([]);

      const result = await PayrollProcessingService.calculateDeductions("emp-1", 3);

      expect(result.esiEmployee).toBe(0);
      expect(result.esiEmployer).toBe(0);
    });

    it("should deduct ESI when gross <= ₹21,000", async () => {
      // CTC = 240,000 -> monthly gross = 20,000
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ baseSalary: 240000 }));
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([]);

      const result = await PayrollProcessingService.calculateDeductions("emp-1", 3);

      expect(result.esiEmployee).toBeGreaterThan(0);
      expect(result.esiEmployee).toBeCloseTo(20000 * 0.0075, 0); // 150
    });

    it("should calculate professional tax as ₹200 for Karnataka", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ baseSalary: 1200000 }));
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([]);

      const result = await PayrollProcessingService.calculateDeductions("emp-1", 3);

      expect(result.professionalTax).toBe(200);
    });

    it("should calculate TDS based on new regime slabs", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ baseSalary: 1200000 }));
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([]);

      const result = await PayrollProcessingService.calculateDeductions("emp-1", 3);

      // TDS should be positive for ₹12L salary
      expect(result.tds).toBeGreaterThan(0);
    });

    it("should have 0 TDS for salary under ₹7L (rebate 87A)", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ baseSalary: 500000 }));
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([]);

      const result = await PayrollProcessingService.calculateDeductions("emp-1", 3);

      expect(result.tds).toBe(0);
    });

    it("should deduct salary advance recovery", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ baseSalary: 1200000 }));
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([
        { amount: 30000, repaymentMonths: 3, status: "DISBURSED" },
      ]);

      const result = await PayrollProcessingService.calculateDeductions("emp-1", 3);

      expect(result.advanceRecovery).toBe(10000); // 30000 / 3 months
    });

    it("should throw when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        PayrollProcessingService.calculateDeductions("bad-id", 3)
      ).rejects.toThrow("Employee not found");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Net Salary
  // ────────────────────────────────────────────────────────────
  describe("calculateNetSalary", () => {
    it("should compute net = gross - deductions", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ baseSalary: 1200000 }));
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([]);

      const result = await PayrollProcessingService.calculateNetSalary("emp-1", 3);

      expect(result.grossSalary).toBeCloseTo(100000, -1);
      expect(result.totalDeductions).toBeGreaterThan(0);
      expect(result.netSalary).toBe(result.grossSalary - result.totalDeductions);
      expect(result.netSalary).toBeGreaterThan(0);
    });

    it("should have net < gross", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ baseSalary: 1200000 }));
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([]);

      const result = await PayrollProcessingService.calculateNetSalary("emp-1", 3);

      expect(result.netSalary).toBeLessThan(result.grossSalary);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Process Payroll for Employee
  // ────────────────────────────────────────────────────────────
  describe("processPayrollForEmployee", () => {
    it("should create a salary slip", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ baseSalary: 1200000 }));
      mockPrisma.salarySlip.findUnique.mockResolvedValue(null);
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null); // no hold
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([]);
      mockPrisma.salarySlip.create.mockResolvedValue({ id: "slip-new" });

      const result = await PayrollProcessingService.processPayrollForEmployee("emp-1", 3, 2026);

      expect(result.employeeId).toBe("emp-1");
      expect(result.month).toBe(3);
      expect(result.year).toBe(2026);
      expect(result.grossSalary).toBeGreaterThan(0);
      expect(result.netSalary).toBeGreaterThan(0);
      expect(mockPrisma.salarySlip.create).toHaveBeenCalled();
    });

    it("should throw when slip already exists", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.salarySlip.findUnique.mockResolvedValue({ id: "existing-slip" });

      await expect(
        PayrollProcessingService.processPayrollForEmployee("emp-1", 3, 2026)
      ).rejects.toThrow("Salary slip already exists");
    });

    it("should throw when payroll is on hold", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.salarySlip.findUnique.mockResolvedValue(null);
      mockPrisma.generatedDocument.findFirst.mockResolvedValue({
        data: { month: 3, year: 2026, released: false },
      });

      await expect(
        PayrollProcessingService.processPayrollForEmployee("emp-1", 3, 2026)
      ).rejects.toThrow("Payroll is on hold");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Batch Processing
  // ────────────────────────────────────────────────────────────
  describe("processBatchPayroll", () => {
    it("should process payroll for all active employees", async () => {
      mockPrisma.employee.findMany
        .mockResolvedValueOnce([{ id: "emp-1" }, { id: "emp-2" }]); // batch
      mockPrisma.employee.findUnique
        .mockResolvedValue(mockEmployee({ baseSalary: 1200000 }));
      mockPrisma.salarySlip.findUnique.mockResolvedValue(null);
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([]);
      mockPrisma.salarySlip.create.mockResolvedValue({ id: "slip-x" });
      mockPrisma.salarySlip.findMany.mockResolvedValue([
        mockSlip({ grossSalary: 100000, netSalary: 85000, totalDeductions: 15000 }),
        mockSlip({ grossSalary: 100000, netSalary: 85000, totalDeductions: 15000 }),
      ]);
      mockPrisma.generatedDocument.update.mockResolvedValue({});

      const result = await PayrollProcessingService.processBatchPayroll(3, 2026);

      expect(result.processed).toBe(2);
      expect(result.failed).toBe(0);
    });

    it("should skip already-processed employees", async () => {
      mockPrisma.employee.findMany.mockResolvedValueOnce([{ id: "emp-1" }]);
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.salarySlip.findUnique.mockResolvedValue({ id: "existing-slip" });
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);
      mockPrisma.salarySlip.findMany.mockResolvedValue([]);

      const result = await PayrollProcessingService.processBatchPayroll(3, 2026);

      expect(result.processed).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Supplementary Payroll
  // ────────────────────────────────────────────────────────────
  describe("processSupplementaryPayroll", () => {
    it("should delete and reprocess slips", async () => {
      mockPrisma.salarySlip.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ baseSalary: 1200000 }));
      mockPrisma.salarySlip.findUnique.mockResolvedValue(null);
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);
      mockPrisma.salaryAdvance.findMany.mockResolvedValue([]);
      mockPrisma.salarySlip.create.mockResolvedValue({ id: "new-slip" });

      const result = await PayrollProcessingService.processSupplementaryPayroll(["emp-1"], 3, 2026);

      expect(result.processed).toBe(1);
      expect(mockPrisma.salarySlip.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.salarySlip.create).toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────
  // Variable Pay
  // ────────────────────────────────────────────────────────────
  describe("applyVariablePay", () => {
    it("should record variable pay", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "vp-1" });

      const result = await PayrollProcessingService.applyVariablePay("emp-1", 50000, "BONUS");

      expect(result.success).toBe(true);
      expect(result.appliedAmount).toBe(50000);
    });

    it("should throw for negative amount", async () => {
      await expect(
        PayrollProcessingService.applyVariablePay("emp-1", -100, "BONUS")
      ).rejects.toThrow("Variable pay amount must be positive");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Hold / Release Payroll
  // ────────────────────────────────────────────────────────────
  describe("holdPayroll", () => {
    it("should place payroll on hold", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "hold-1" });

      const result = await PayrollProcessingService.holdPayroll("emp-1", 3, "Under investigation");

      expect(result.success).toBe(true);
    });

    it("should throw without reason", async () => {
      await expect(
        PayrollProcessingService.holdPayroll("emp-1", 3, "")
      ).rejects.toThrow("Hold reason is required");
    });
  });

  describe("releasePayroll", () => {
    it("should release held payroll", async () => {
      mockPrisma.generatedDocument.findFirst.mockResolvedValue({
        id: "hold-1",
        data: { month: 3, released: false },
      });
      mockPrisma.generatedDocument.update.mockResolvedValue({});

      const result = await PayrollProcessingService.releasePayroll("emp-1", 3);

      expect(result.success).toBe(true);
      expect(mockPrisma.generatedDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            data: expect.objectContaining({ released: true }),
          }),
        })
      );
    });

    it("should throw when no hold exists", async () => {
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      await expect(
        PayrollProcessingService.releasePayroll("emp-1", 3)
      ).rejects.toThrow("No payroll hold found");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Bank File Generation
  // ────────────────────────────────────────────────────────────
  describe("generateBankFile", () => {
    it("should generate NEFT bank file", async () => {
      mockPrisma.salarySlip.findMany.mockResolvedValue([
        mockSlip({ netSalary: 85000 }),
        mockSlip({ employeeId: "emp-2", netSalary: 75000, employee: { ...mockEmployee({ employeeCode: "CIR-EMP-002" }), user: { firstName: "Bob", lastName: "Eng" } } }),
      ]);
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "bf-1" });

      const result = await PayrollProcessingService.generateBankFile(3, 2026, "NEFT");

      expect(result.format).toBe("NEFT");
      expect(result.totalTransfers).toBe(2);
      expect(result.totalAmount).toBe(160000);
      expect(result.content).toContain("CIRCUVENT_TECH");
      expect(result.records.length).toBe(2);
    });

    it("should throw when no unpaid slips exist", async () => {
      mockPrisma.salarySlip.findMany.mockResolvedValue([]);

      await expect(
        PayrollProcessingService.generateBankFile(3, 2026)
      ).rejects.toThrow("No unpaid salary slips found");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Reconciliation
  // ────────────────────────────────────────────────────────────
  describe("reconcilePayroll", () => {
    it("should return balanced reconciliation", async () => {
      mockPrisma.salarySlip.findMany.mockResolvedValue([
        mockSlip({ isPaid: true, grossSalary: 100000, totalDeductions: 10000, netSalary: 90000 }),
      ]);

      const result = await PayrollProcessingService.reconcilePayroll(3, 2026);

      expect(result.totalSlips).toBe(1);
      expect(result.totalPaid).toBe(1);
      expect(result.balanced).toBe(true);
      expect(result.mismatches.length).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Form 16 Generation
  // ────────────────────────────────────────────────────────────
  describe("generateForm16", () => {
    it("should generate Form 16 data", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ panNumber: "ABCDE1234F" }));
      mockPrisma.salarySlip.findMany.mockResolvedValue([
        mockSlip({ month: 4, year: 2025, grossSalary: 100000, tds: 5000, pfDeduction: 1800 }),
        mockSlip({ month: 5, year: 2025, grossSalary: 100000, tds: 5000, pfDeduction: 1800 }),
        mockSlip({ month: 6, year: 2025, grossSalary: 100000, tds: 5000, pfDeduction: 1800 }),
      ]);

      const result = await PayrollProcessingService.generateForm16("emp-1", "FY2025-26");

      expect(result.financialYear).toBe("FY2025-26");
      expect(result.panNumber).toBe("ABCDE1234F");
      expect(result.employer.name).toContain("Circuvent");
      expect(result.partA.quarterlyTDS.length).toBe(4);
      expect(result.partA.totalTaxDeducted).toBe(15000); // 3 months * 5000
      expect(result.partB.grossSalary).toBe(300000); // 3 months * 100000
    });

    it("should throw for invalid FY format", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());

      await expect(
        PayrollProcessingService.generateForm16("emp-1", "2025-26")
      ).rejects.toThrow("Invalid financial year format");
    });

    it("should throw when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        PayrollProcessingService.generateForm16("bad-id", "FY2025-26")
      ).rejects.toThrow("Employee not found");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Payroll Dashboard
  // ────────────────────────────────────────────────────────────
  describe("getPayrollDashboard", () => {
    it("should return dashboard metrics", async () => {
      mockPrisma.salarySlip.findMany
        .mockResolvedValueOnce([
          mockSlip({ grossSalary: 100000, netSalary: 85000, totalDeductions: 15000, isPaid: true, pfDeduction: 1800, esiDeduction: 0, tds: 8000, professionalTax: 200, employee: { department: "Engineering" } }),
          mockSlip({ grossSalary: 80000, netSalary: 68000, totalDeductions: 12000, isPaid: false, pfDeduction: 1800, esiDeduction: 0, tds: 5000, professionalTax: 200, employee: { department: "Design" } }),
        ])
        .mockResolvedValueOnce([ // previous month
          mockSlip({ grossSalary: 95000, netSalary: 82000, totalDeductions: 13000 }),
        ]);
      mockPrisma.generatedDocument.findMany.mockResolvedValue([]);
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      const result = await PayrollProcessingService.getPayrollDashboard(3, 2026);

      expect(result.month).toBe(3);
      expect(result.year).toBe(2026);
      expect(result.monthName).toContain("March");
      expect(result.totalEmployees).toBe(2);
      expect(result.totalGross).toBe(180000);
      expect(result.totalNet).toBe(153000);
      expect(result.paidCount).toBe(1);
      expect(result.pendingCount).toBe(1);
      expect(result.byDepartment.length).toBe(2);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Revert Payroll
  // ────────────────────────────────────────────────────────────
  describe("revertPayroll", () => {
    it("should delete the salary slip", async () => {
      mockPrisma.salarySlip.findUnique.mockResolvedValue(
        mockSlip({ id: "slip-to-revert", netSalary: 85000 })
      );
      mockPrisma.salarySlip.delete.mockResolvedValue({});

      const result = await PayrollProcessingService.revertPayroll("emp-1", 3, "Incorrect data");

      expect(result.success).toBe(true);
      expect(mockPrisma.salarySlip.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "slip-to-revert" } })
      );
    });

    it("should throw without reason", async () => {
      await expect(
        PayrollProcessingService.revertPayroll("emp-1", 3, "")
      ).rejects.toThrow("Revert reason is required");
    });

    it("should throw when slip not found", async () => {
      mockPrisma.salarySlip.findUnique.mockResolvedValue(null);

      await expect(
        PayrollProcessingService.revertPayroll("emp-1", 3, "Error fix")
      ).rejects.toThrow("Salary slip not found");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Arrears Calculation
  // ────────────────────────────────────────────────────────────
  describe("calculateArrears", () => {
    it("should compute arrears for salary revision", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee({ baseSalary: 1200000 }));
      mockPrisma.salarySlip.findUnique.mockResolvedValue(
        mockSlip({ netSalary: 85000 })
      );

      const result = await PayrollProcessingService.calculateArrears("emp-1", 1, 3, 1500000);

      expect(result.months).toBe(3);
      expect(result.arrearPerMonth).toBeGreaterThan(0);
      expect(result.totalArrears).toBeGreaterThan(0);
      expect(result.details.length).toBe(3);
    });

    it("should throw when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        PayrollProcessingService.calculateArrears("bad-id", 1, 3, 1500000)
      ).rejects.toThrow("Employee not found");
    });
  });

  // ────────────────────────────────────────────────────────────
  // YTD Tax
  // ────────────────────────────────────────────────────────────
  describe("calculateYTDTax", () => {
    it("should aggregate YTD figures", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.salarySlip.findMany.mockResolvedValue([
        mockSlip({ month: 4, year: 2025, grossSalary: 100000, pfDeduction: 1800, esiDeduction: 0, professionalTax: 200, tds: 5000, totalDeductions: 7000 }),
        mockSlip({ month: 5, year: 2025, grossSalary: 100000, pfDeduction: 1800, esiDeduction: 0, professionalTax: 200, tds: 5000, totalDeductions: 7000 }),
      ]);

      const result = await PayrollProcessingService.calculateYTDTax("emp-1");

      expect(result.financialYear).toMatch(/FY\d{4}-\d{2}/);
      expect(result.ytdGross).toBe(200000);
      expect(result.ytdTDS).toBe(10000);
      expect(result.ytdPF).toBe(3600);
      expect(result.projectedAnnualTax).toBeGreaterThan(0);
    });
  });
});
