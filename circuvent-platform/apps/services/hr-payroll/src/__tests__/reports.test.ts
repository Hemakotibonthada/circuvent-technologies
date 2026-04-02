// ──────────────────────────────────────────────────────────────
// HR & Payroll — Reports Service Test Suite
// Tests for all 14 report generation methods: headcount,
// attrition, payroll, attendance, leave, expense, timesheet,
// travel, performance, recruitment, asset, training,
// compliance, and executive dashboard.
// ──────────────────────────────────────────────────────────────

import { ReportsService } from "../services/reports.service";

// ══════════════════════════════════════════════════════════════
// Mock PrismaClient
// ══════════════════════════════════════════════════════════════

const mockPrisma = {
  employee: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  salarySlip: { findMany: jest.fn(), count: jest.fn() },
  leaveRecord: { findMany: jest.fn(), count: jest.fn() },
  expenseClaim: {
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  sprintTask: { findMany: jest.fn() },
  job: { findMany: jest.fn() },
  performanceReview: { findMany: jest.fn() },
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function createDate(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("ReportsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────
  // 1. Headcount Report
  // ────────────────────────────────────────────────────────────
  describe("generateHeadcountReport", () => {
    it("should return headcount breakdown by department, type, gender", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        { department: "Engineering", employmentType: "FULL_TIME", gender: "Male", status: "ACTIVE", joiningDate: createDate(2023, 1, 1) },
        { department: "Engineering", employmentType: "FULL_TIME", gender: "Female", status: "ACTIVE", joiningDate: createDate(2024, 3, 1) },
        { department: "Design", employmentType: "CONTRACT", gender: "Female", status: "ON_LEAVE", joiningDate: createDate(2024, 6, 1) },
      ]);

      const report = await ReportsService.generateHeadcountReport();

      expect(report.reportName).toBe("Headcount Report");
      expect(report.totalHeadcount).toBe(3);
      expect(report.activeEmployees).toBe(2);
      expect(report.onLeave).toBe(1);
      expect(report.byDepartment.length).toBe(2);
      expect(report.byEmploymentType.length).toBe(2);
      expect(report.byGender.length).toBe(2);
    });

    it("should include 6-month trend", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        { department: "Eng", employmentType: "FULL_TIME", gender: "Male", status: "ACTIVE", joiningDate: createDate(2023, 1, 1) },
      ]);

      const report = await ReportsService.generateHeadcountReport();

      expect(report.trends.length).toBe(6);
      for (const point of report.trends) {
        expect(point).toHaveProperty("period");
        expect(point).toHaveProperty("value");
      }
    });

    it("should handle zero employees", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([]);

      const report = await ReportsService.generateHeadcountReport();

      expect(report.totalHeadcount).toBe(0);
      expect(report.byDepartment).toEqual([]);
    });

    it("should calculate department percentages", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        { department: "Eng", employmentType: "FULL_TIME", gender: "M", status: "ACTIVE", joiningDate: createDate(2024, 1, 1) },
        { department: "Eng", employmentType: "FULL_TIME", gender: "F", status: "ACTIVE", joiningDate: createDate(2024, 1, 1) },
        { department: "Design", employmentType: "FULL_TIME", gender: "F", status: "ACTIVE", joiningDate: createDate(2024, 1, 1) },
        { department: "Design", employmentType: "FULL_TIME", gender: "M", status: "ACTIVE", joiningDate: createDate(2024, 1, 1) },
      ]);

      const report = await ReportsService.generateHeadcountReport();

      for (const dept of report.byDepartment) {
        expect(dept.percentage).toBe(50);
      }
    });
  });

  // ────────────────────────────────────────────────────────────
  // 2. Attrition Report
  // ────────────────────────────────────────────────────────────
  describe("generateAttritionReport", () => {
    it("should calculate attrition metrics", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        { department: "Eng", status: "RESIGNED", joiningDate: createDate(2022, 1, 1), updatedAt: createDate(2025, 3, 1) },
        { department: "HR", status: "TERMINATED", joiningDate: createDate(2023, 6, 1), updatedAt: createDate(2025, 2, 15) },
      ]);
      mockPrisma.employee.count.mockResolvedValue(50);

      const report = await ReportsService.generateAttritionReport(
        createDate(2025, 1, 1), createDate(2025, 6, 30)
      );

      expect(report.reportName).toBe("Attrition Report");
      expect(report.totalSeparations).toBe(2);
      expect(report.resignations).toBe(1);
      expect(report.terminations).toBe(1);
      expect(report.attritionRate).toBeGreaterThan(0);
      expect(report.avgTenure).toBeGreaterThan(0);
      expect(report.byDepartment.length).toBe(2);
      expect(report.byReason.length).toBe(2);
    });

    it("should return 0 attrition rate when no separations", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([]);
      mockPrisma.employee.count.mockResolvedValue(50);

      const report = await ReportsService.generateAttritionReport(
        createDate(2025, 1, 1), createDate(2025, 6, 30)
      );

      expect(report.attritionRate).toBe(0);
      expect(report.avgTenure).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 3. Payroll Report
  // ────────────────────────────────────────────────────────────
  describe("generatePayrollReport", () => {
    it("should aggregate payroll data by department", async () => {
      mockPrisma.salarySlip.findMany.mockResolvedValue([
        { grossSalary: 50000, netSalary: 40000, totalDeductions: 10000, pfDeduction: 1800, esiDeduction: 0, tds: 5000, professionalTax: 200, employee: { department: "Engineering" } },
        { grossSalary: 45000, netSalary: 36000, totalDeductions: 9000, pfDeduction: 1800, esiDeduction: 0, tds: 4500, professionalTax: 200, employee: { department: "Engineering" } },
        { grossSalary: 35000, netSalary: 28000, totalDeductions: 7000, pfDeduction: 1800, esiDeduction: 0, tds: 3000, professionalTax: 200, employee: { department: "Design" } },
      ]);

      const report = await ReportsService.generatePayrollReport(3, 2025);

      expect(report.reportName).toBe("Payroll Summary Report");
      expect(report.totalGross).toBe(130000);
      expect(report.totalNet).toBe(104000);
      expect(report.totalDeductions).toBe(26000);
      expect(report.employeesProcessed).toBe(3);
      expect(report.byDepartment.length).toBe(2);
      expect(report.statutory.totalPF).toBe(5400);
      expect(report.statutory.totalTDS).toBe(12500);
    });

    it("should handle no salary slips", async () => {
      mockPrisma.salarySlip.findMany.mockResolvedValue([]);

      const report = await ReportsService.generatePayrollReport(1, 2025);

      expect(report.totalGross).toBe(0);
      expect(report.employeesProcessed).toBe(0);
      expect(report.byDepartment).toEqual([]);
    });

    it("should calculate employer cost including PF + ESI", async () => {
      mockPrisma.salarySlip.findMany.mockResolvedValue([
        { grossSalary: 50000, netSalary: 40000, totalDeductions: 10000, pfDeduction: 1800, esiDeduction: 100, tds: 5000, professionalTax: 200, employee: { department: "Eng" } },
      ]);

      const report = await ReportsService.generatePayrollReport(3, 2025);

      expect(report.totalEmployerCost).toBeGreaterThan(report.totalGross);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 4. Attendance Report
  // ────────────────────────────────────────────────────────────
  describe("generateAttendanceReport", () => {
    it("should calculate attendance rates by department", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        { id: "e1", department: "Eng", user: { firstName: "A", lastName: "B" } },
        { id: "e2", department: "Eng", user: { firstName: "C", lastName: "D" } },
        { id: "e3", department: "Design", user: { firstName: "E", lastName: "F" } },
      ]);
      mockPrisma.leaveRecord.findMany.mockResolvedValue([
        { employeeId: "e1", days: 5 },
        { employeeId: "e3", days: 3 },
      ]);

      const report = await ReportsService.generateAttendanceReport(3, 2025);

      expect(report.reportName).toBe("Attendance Report");
      expect(report.totalEmployees).toBe(3);
      expect(report.avgAttendanceRate).toBeGreaterThan(0);
      expect(report.byDepartment.length).toBe(2);
    });

    it("should highlight absentees with 3+ days", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        { id: "e1", department: "Eng", user: { firstName: "A", lastName: "B" } },
      ]);
      mockPrisma.leaveRecord.findMany.mockResolvedValue([
        { employeeId: "e1", days: 5 },
      ]);

      const report = await ReportsService.generateAttendanceReport(3, 2025);

      expect(report.absenteeHighlights.length).toBe(1);
      expect(report.absenteeHighlights[0].absentDays).toBe(5);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 5. Leave Utilization Report
  // ────────────────────────────────────────────────────────────
  describe("generateLeaveReport", () => {
    it("should break down leaves by type and department", async () => {
      mockPrisma.leaveRecord.findMany.mockResolvedValue([
        { leaveType: "CASUAL", status: "APPROVED", days: 2, employee: { department: "Eng" } },
        { leaveType: "SICK", status: "APPROVED", days: 1, employee: { department: "Eng" } },
        { leaveType: "CASUAL", status: "PENDING", days: 3, employee: { department: "HR" } },
        { leaveType: "CASUAL", status: "REJECTED", days: 1, employee: { department: "Eng" } },
      ]);

      const report = await ReportsService.generateLeaveReport(3, 2025);

      expect(report.reportName).toBe("Leave Utilization Report");
      expect(report.totalLeavesTaken).toBe(2); // APPROVED only
      expect(report.totalLeavesPending).toBe(1);
      expect(report.totalLeavesRejected).toBe(1);
      expect(report.byType.length).toBe(2);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 6. Expense Analysis Report
  // ────────────────────────────────────────────────────────────
  describe("generateExpenseReport", () => {
    it("should aggregate expenses by category, department, and spender", async () => {
      mockPrisma.expenseClaim.findMany.mockResolvedValue([
        {
          id: "exp-1", employeeId: "e1", totalAmount: 5000, status: "APPROVED",
          submittedAt: createDate(2025, 3, 10),
          employee: { department: "Eng", user: { firstName: "A", lastName: "B" } },
          items: [{ category: "TRAVEL", amount: 5000 }],
        },
        {
          id: "exp-2", employeeId: "e2", totalAmount: 3000, status: "PENDING",
          submittedAt: createDate(2025, 3, 12),
          employee: { department: "HR", user: { firstName: "C", lastName: "D" } },
          items: [{ category: "OFFICE", amount: 3000 }],
        },
      ]);

      const report = await ReportsService.generateExpenseReport(3, 2025);

      expect(report.reportName).toBe("Expense Analysis Report");
      expect(report.totalClaims).toBe(2);
      expect(report.totalAmount).toBe(8000);
      expect(report.approvedAmount).toBe(5000);
      expect(report.pendingAmount).toBe(3000);
      expect(report.avgClaimAmount).toBe(4000);
      expect(report.byCategory.length).toBe(2);
      expect(report.byDepartment.length).toBe(2);
    });

    it("should limit top spenders to 10", async () => {
      const claims = Array.from({ length: 15 }, (_, i) => ({
        id: `e${i}`, employeeId: `emp-${i}`, totalAmount: (i + 1) * 1000, status: "APPROVED",
        submittedAt: createDate(2025, 3, 1),
        employee: { department: "Eng", user: { firstName: `F${i}`, lastName: `L${i}` } },
        items: [{ category: "TRAVEL", amount: (i + 1) * 1000 }],
      }));
      mockPrisma.expenseClaim.findMany.mockResolvedValue(claims);

      const report = await ReportsService.generateExpenseReport(3, 2025);

      expect(report.topSpenders.length).toBe(10);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 7. Timesheet Report
  // ────────────────────────────────────────────────────────────
  describe("generateTimesheetReport", () => {
    it("should aggregate timesheet hours and billability", async () => {
      mockPrisma.sprintTask.findMany.mockResolvedValue([
        { estimatedHours: 8, actualHours: 10, assigneeId: "u1", sprint: { project: { name: "Alpha" } } },
        { estimatedHours: 6, actualHours: null, assigneeId: "u2", sprint: { project: { name: "Beta" } } },
      ]);

      const report = await ReportsService.generateTimesheetReport(3, 2025);

      expect(report.reportName).toBe("Timesheet Report");
      expect(report.totalHours).toBe(16); // 10 + 6
      expect(report.billablePercentage).toBe(75);
      expect(report.byProject.length).toBe(2);
    });

    it("should handle no tasks", async () => {
      mockPrisma.sprintTask.findMany.mockResolvedValue([]);

      const report = await ReportsService.generateTimesheetReport(1, 2025);

      expect(report.totalHours).toBe(0);
      expect(report.billablePercentage).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 8. Travel Report
  // ────────────────────────────────────────────────────────────
  describe("generateTravelReport", () => {
    it("should filter expense claims with travel categories", async () => {
      mockPrisma.expenseClaim.findMany.mockResolvedValue([
        {
          id: "t1", totalAmount: 20000,
          employee: { department: "Sales", user: { firstName: "A", lastName: "B" } },
          items: [
            { category: "FLIGHT", amount: 15000 },
            { category: "HOTEL", amount: 5000 },
          ],
        },
      ]);

      const report = await ReportsService.generateTravelReport(
        createDate(2025, 1, 1), createDate(2025, 6, 30)
      );

      expect(report.reportName).toBe("Travel Expense Report");
      expect(report.totalClaims).toBe(1);
      expect(report.totalAmount).toBe(20000);
    });

    it("should handle no travel claims", async () => {
      mockPrisma.expenseClaim.findMany.mockResolvedValue([]);

      const report = await ReportsService.generateTravelReport(
        createDate(2025, 1, 1), createDate(2025, 3, 31)
      );

      expect(report.totalClaims).toBe(0);
      expect(report.totalAmount).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 9. Performance Report
  // ────────────────────────────────────────────────────────────
  describe("generatePerformanceReport", () => {
    it("should generate performance metrics for a quarter", async () => {
      mockPrisma.employee.findMany.mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => ({
          department: i < 15 ? "Eng" : "Design",
          user: { firstName: `F${i}`, lastName: `L${i}` },
        }))
      );

      const report = await ReportsService.generatePerformanceReport(1);

      expect(report.reportName).toBe("Performance Report");
      expect(report.avgRating).toBe(3.8);
      expect(report.reviewsCompleted).toBe(17); // 85% of 20
      expect(report.reviewsPending).toBe(3);
      expect(report.ratingDistribution.length).toBe(5);
      expect(report.topPerformers.length).toBe(5);
    });

    it("should handle zero employees", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([]);

      const report = await ReportsService.generatePerformanceReport(2);

      expect(report.reviewsCompleted).toBe(0);
      expect(report.reviewsPending).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 10. Recruitment Report
  // ────────────────────────────────────────────────────────────
  describe("generateRecruitmentReport", () => {
    it("should aggregate recruitment pipeline data", async () => {
      mockPrisma.job.findMany.mockResolvedValue([
        {
          id: "j1", department: "Engineering",
          applications: [
            { status: "HIRED", source: "LinkedIn", createdAt: new Date() },
            { status: "SCREENING", source: "Referral", createdAt: new Date() },
            { status: "REJECTED", source: "LinkedIn", createdAt: new Date() },
          ],
        },
        {
          id: "j2", department: "HR",
          applications: [
            { status: "OFFERED", source: "Direct", createdAt: new Date() },
          ],
        },
      ]);

      const report = await ReportsService.generateRecruitmentReport(
        createDate(2025, 1, 1), createDate(2025, 6, 30)
      );

      expect(report.reportName).toBe("Recruitment Report");
      expect(report.totalOpenings).toBe(2);
      expect(report.totalApplications).toBe(4);
      expect(report.totalHires).toBe(1);
      expect(report.avgTimeToHire).toBe(28);
      expect(report.byDepartment.length).toBe(2);
      expect(report.byStage.length).toBeGreaterThan(0);
      expect(report.sourceEffectiveness.length).toBeGreaterThan(0);
    });

    it("should handle no job postings", async () => {
      mockPrisma.job.findMany.mockResolvedValue([]);

      const report = await ReportsService.generateRecruitmentReport(
        createDate(2025, 1, 1), createDate(2025, 6, 30)
      );

      expect(report.totalOpenings).toBe(0);
      expect(report.totalApplications).toBe(0);
      expect(report.offerAcceptanceRate).toBe(0);
    });

    it("should calculate offer acceptance rate", async () => {
      mockPrisma.job.findMany.mockResolvedValue([
        {
          id: "j1", department: "Eng",
          applications: [
            { status: "HIRED", source: "Direct", createdAt: new Date() },
            { status: "OFFERED", source: "Direct", createdAt: new Date() },
          ],
        },
      ]);

      const report = await ReportsService.generateRecruitmentReport(
        createDate(2025, 1, 1), createDate(2025, 6, 30)
      );

      expect(report.offerAcceptanceRate).toBe(50); // 1 hired out of 2 offered/hired
    });
  });

  // ────────────────────────────────────────────────────────────
  // 11. Asset Report
  // ────────────────────────────────────────────────────────────
  describe("generateAssetReport", () => {
    it("should return asset report structure", async () => {
      const report = await ReportsService.generateAssetReport();

      expect(report.reportName).toBe("Asset Inventory Report");
      expect(report).toHaveProperty("totalAssets");
      expect(report).toHaveProperty("byCategory");
    });
  });

  // ────────────────────────────────────────────────────────────
  // 12. Training Report
  // ────────────────────────────────────────────────────────────
  describe("generateTrainingReport", () => {
    it("should return training report structure", async () => {
      const report = await ReportsService.generateTrainingReport();

      expect(report.reportName).toBe("Training Completion Report");
      expect(report).toHaveProperty("totalPrograms");
      expect(report).toHaveProperty("completionRate");
      expect(report).toHaveProperty("byDepartment");
    });
  });

  // ────────────────────────────────────────────────────────────
  // 13. Compliance Report
  // ────────────────────────────────────────────────────────────
  describe("generateComplianceReport", () => {
    it("should show COMPLIANT when payroll is processed", async () => {
      mockPrisma.salarySlip.count.mockResolvedValue(50);
      mockPrisma.employee.count.mockResolvedValue(50);

      const report = await ReportsService.generateComplianceReport();

      expect(report.reportName).toBe("Statutory Compliance Report");
      expect(report.overallStatus).toBe("COMPLIANT");
      expect(report.items.length).toBe(5);
      const payrollItem = report.items.find((i: any) => i.item === "Payroll Processing");
      expect(payrollItem?.status).toBe("COMPLETED");
    });

    it("should show ACTION_REQUIRED when payroll is not processed", async () => {
      mockPrisma.salarySlip.count.mockResolvedValue(0);
      mockPrisma.employee.count.mockResolvedValue(50);

      const report = await ReportsService.generateComplianceReport();

      expect(report.overallStatus).toBe("ACTION_REQUIRED");
    });

    it("should include all statutory items", async () => {
      mockPrisma.salarySlip.count.mockResolvedValue(10);
      mockPrisma.employee.count.mockResolvedValue(10);

      const report = await ReportsService.generateComplianceReport();

      const itemNames = report.items.map((i: any) => i.item);
      expect(itemNames).toContain("EPF Remittance");
      expect(itemNames).toContain("ESI Remittance");
      expect(itemNames).toContain("TDS Remittance");
      expect(itemNames).toContain("Professional Tax");
      expect(itemNames).toContain("Payroll Processing");
    });
  });

  // ────────────────────────────────────────────────────────────
  // 14. Executive Dashboard
  // ────────────────────────────────────────────────────────────
  describe("generateDashboardReport", () => {
    it("should aggregate executive metrics", async () => {
      mockPrisma.employee.count
        .mockResolvedValueOnce(100) // activeCount
        .mockResolvedValueOnce(5)   // newHires
        .mockResolvedValueOnce(2);  // separations
      mockPrisma.salarySlip.findMany
        .mockResolvedValueOnce([ // current month
          { grossSalary: 50000, netSalary: 40000 },
          { grossSalary: 45000, netSalary: 36000 },
        ])
        .mockResolvedValueOnce([ // prev month
          { grossSalary: 48000 },
          { grossSalary: 44000 },
        ]);
      mockPrisma.leaveRecord.count.mockResolvedValue(8);
      mockPrisma.expenseClaim.aggregate.mockResolvedValue({
        _sum: { totalAmount: 25000 },
      });

      const report = await ReportsService.generateDashboardReport();

      expect(report.reportName).toBe("Executive Dashboard");
      expect(report.headcount.total).toBe(100);
      expect(report.headcount.newHires).toBe(5);
      expect(report.headcount.separations).toBe(2);
      expect(report.payroll.totalCost).toBe(95000);
      expect(report.payroll.avgSalary).toBeGreaterThan(0);
      expect(report.leave.pendingApprovals).toBe(8);
      expect(report.expenses.pendingAmount).toBe(25000);
    });

    it("should calculate month-over-month payroll change", async () => {
      mockPrisma.employee.count.mockResolvedValue(10);
      mockPrisma.salarySlip.findMany
        .mockResolvedValueOnce([
          { grossSalary: 100000, netSalary: 80000 },
        ])
        .mockResolvedValueOnce([
          { grossSalary: 90000 },
        ]);
      mockPrisma.leaveRecord.count.mockResolvedValue(0);
      mockPrisma.expenseClaim.aggregate.mockResolvedValue({ _sum: { totalAmount: 0 } });

      const report = await ReportsService.generateDashboardReport();

      // (100000 - 90000) / 90000 * 100 = 11.11%
      expect(report.payroll.monthOverMonth).toBeCloseTo(11.11, 1);
    });

    it("should handle zero payroll data", async () => {
      mockPrisma.employee.count.mockResolvedValue(0);
      mockPrisma.salarySlip.findMany.mockResolvedValue([]);
      mockPrisma.leaveRecord.count.mockResolvedValue(0);
      mockPrisma.expenseClaim.aggregate.mockResolvedValue({ _sum: { totalAmount: 0 } });

      const report = await ReportsService.generateDashboardReport();

      expect(report.payroll.totalCost).toBe(0);
      expect(report.payroll.monthOverMonth).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Report Meta
  // ────────────────────────────────────────────────────────────
  describe("reportMetadata", () => {
    it("should include generatedAt timestamp in all reports", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([]);

      const report = await ReportsService.generateHeadcountReport();

      expect(report.generatedAt).toBeDefined();
      expect(typeof report.generatedAt).toBe("string");
    });

    it("should include period dates when applicable", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([]);
      mockPrisma.employee.count.mockResolvedValue(0);

      const report = await ReportsService.generateAttritionReport(
        createDate(2025, 1, 1), createDate(2025, 6, 30)
      );

      expect(report.periodStart).toBeDefined();
      expect(report.periodEnd).toBeDefined();
    });
  });
});
