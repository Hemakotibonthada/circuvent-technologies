// ──────────────────────────────────────────────────────────────
// HR & Payroll — Onboarding Service Test Suite
// Tests for checklist generation (32 default items), progress
// calculation, mentor assignment, welcome package generation,
// default benefits/training enrollment, check-ins, access
// requests, and dashboard statistics.
// ──────────────────────────────────────────────────────────────

import { OnboardingService } from "../services/onboarding.service";

// ══════════════════════════════════════════════════════════════
// Mock Dependencies
// ══════════════════════════════════════════════════════════════

const mockPrisma = {
  employee: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  generatedDocument: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  notification: { create: jest.fn(), createMany: jest.fn() },
  user: { findMany: jest.fn() },
  benefitPlan: { findMany: jest.fn() },
  benefitEnrollment: { findFirst: jest.fn(), create: jest.fn() },
  trainingProgram: { findMany: jest.fn() },
  trainingEnrollment: {
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  calendarEvent: { create: jest.fn() },
  assetRequest: { create: jest.fn() },
  helpTicket: { count: jest.fn(), create: jest.fn() },
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
    employeeCode: overrides.employeeCode || "CT-001",
    department: overrides.department || "Engineering",
    designation: overrides.designation || "SDE-1",
    dateOfJoining: overrides.dateOfJoining || new Date("2025-03-01"),
    userId: overrides.userId || "user-1",
    user: overrides.user || { id: "user-1", firstName: "Alice", lastName: "Dev", email: "alice@circuvent.io" },
    ...overrides,
  };
}

function mockChecklist(items: any[], status: string = "IN_PROGRESS") {
  return {
    id: "doc-1",
    entityType: "Employee",
    entityId: "emp-1",
    category: "ONBOARDING_CHECKLIST",
    data: { items, status, createdAt: new Date() },
    createdAt: new Date(),
  };
}

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("OnboardingService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────
  // Create Onboarding Checklist
  // ────────────────────────────────────────────────────────────
  describe("createOnboardingChecklist", () => {
    it("should generate a checklist with 32 default items", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "doc-1" });

      const result = await OnboardingService.createOnboardingChecklist("emp-1");

      expect(result.items.length).toBe(32);
      expect(result.completionPercent).toBe(0);
      expect(result.employeeId).toBe("emp-1");
    });

    it("should set all items to isCompleted=false initially", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "doc-1" });

      const result = await OnboardingService.createOnboardingChecklist("emp-1");

      for (const item of result.items) {
        expect(item.isCompleted).toBe(false);
      }
    });

    it("should set due dates relative to joining date", async () => {
      const joiningDate = new Date("2025-03-01");
      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ dateOfJoining: joiningDate })
      );
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "doc-1" });

      const result = await OnboardingService.createOnboardingChecklist("emp-1");

      // First item has dueDaysFromJoin=1
      const firstItem = result.items.find((i: any) => i.sortOrder === 1);
      expect(firstItem?.dueDate).toBeDefined();
      if (firstItem?.dueDate) {
        expect(firstItem.dueDate.getDate()).toBe(joiningDate.getDate() + 1);
      }
    });

    it("should cover all 8 onboarding categories", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "doc-1" });

      const result = await OnboardingService.createOnboardingChecklist("emp-1");

      const categories = new Set(result.items.map((i: any) => i.category));
      expect(categories.size).toBe(8);
      expect(categories.has("DOCUMENTATION")).toBe(true);
      expect(categories.has("IT_SETUP")).toBe(true);
      expect(categories.has("HR_FORMALITIES")).toBe(true);
      expect(categories.has("TEAM_INTEGRATION")).toBe(true);
      expect(categories.has("TRAINING")).toBe(true);
      expect(categories.has("COMPLIANCE")).toBe(true);
      expect(categories.has("FACILITY")).toBe(true);
      expect(categories.has("CULTURE")).toBe(true);
    });

    it("should throw when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        OnboardingService.createOnboardingChecklist("bad-id")
      ).rejects.toThrow("Employee not found");
    });

    it("should store the checklist as a generated document", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "doc-1" });

      await OnboardingService.createOnboardingChecklist("emp-1");

      expect(mockPrisma.generatedDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            category: "ONBOARDING_CHECKLIST",
            entityType: "Employee",
            entityId: "emp-1",
            format: "JSON",
          }),
        })
      );
    });

    it("should assign unique IDs to each checklist item", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.generatedDocument.create.mockResolvedValue({ id: "doc-1" });

      const result = await OnboardingService.createOnboardingChecklist("emp-1");

      const ids = result.items.map((i: any) => i.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(32);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Get Onboarding Progress
  // ────────────────────────────────────────────────────────────
  describe("getOnboardingProgress", () => {
    it("should calculate progress percentage correctly", async () => {
      const items = Array.from({ length: 32 }, (_, i) => ({
        id: `item-${i}`, title: `Task ${i}`, description: "",
        category: "DOCUMENTATION", isCompleted: i < 16, sortOrder: i + 1,
      }));

      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ user: { firstName: "Alice", lastName: "Dev" } })
      );
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(
        mockChecklist(items)
      );
      // Return null for mentor doc
      mockPrisma.generatedDocument.findFirst
        .mockResolvedValueOnce(mockChecklist(items))
        .mockResolvedValueOnce(null);

      const result = await OnboardingService.getOnboardingProgress("emp-1");

      expect(result.totalItems).toBe(32);
      expect(result.completedItems).toBe(16);
      expect(result.completionPercent).toBe(50);
      expect(result.pendingItems.length).toBe(16);
    });

    it("should return 0% when nothing is completed", async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        id: `item-${i}`, title: `Task ${i}`, description: "",
        category: "IT_SETUP", isCompleted: false, sortOrder: i,
      }));

      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ user: { firstName: "Bob", lastName: "QA" } })
      );
      mockPrisma.generatedDocument.findFirst
        .mockResolvedValueOnce(mockChecklist(items))
        .mockResolvedValueOnce(null);

      const result = await OnboardingService.getOnboardingProgress("emp-1");

      expect(result.completionPercent).toBe(0);
      expect(result.pendingItems.length).toBe(10);
    });

    it("should return 100% when all completed", async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        id: `item-${i}`, title: `Task ${i}`, description: "",
        category: "TRAINING", isCompleted: true, sortOrder: i,
      }));

      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ user: { firstName: "C", lastName: "D" } })
      );
      mockPrisma.generatedDocument.findFirst
        .mockResolvedValueOnce(mockChecklist(items, "COMPLETED"))
        .mockResolvedValueOnce(null);

      const result = await OnboardingService.getOnboardingProgress("emp-1");

      expect(result.completionPercent).toBe(100);
      expect(result.pendingItems.length).toBe(0);
    });

    it("should include category breakdown", async () => {
      const items = [
        { id: "1", title: "T1", description: "", category: "DOCUMENTATION", isCompleted: true, sortOrder: 1 },
        { id: "2", title: "T2", description: "", category: "DOCUMENTATION", isCompleted: false, sortOrder: 2 },
        { id: "3", title: "T3", description: "", category: "IT_SETUP", isCompleted: true, sortOrder: 3 },
      ];

      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ user: { firstName: "E", lastName: "F" } })
      );
      mockPrisma.generatedDocument.findFirst
        .mockResolvedValueOnce(mockChecklist(items))
        .mockResolvedValueOnce(null);

      const result = await OnboardingService.getOnboardingProgress("emp-1");

      expect(result.categories.length).toBe(2);
      const docCat = result.categories.find((c: any) => c.category === "DOCUMENTATION");
      expect(docCat?.total).toBe(2);
      expect(docCat?.completed).toBe(1);
      expect(docCat?.percent).toBe(50);
    });

    it("should include mentor name when assigned", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ user: { firstName: "X", lastName: "Y" } })
      );
      mockPrisma.generatedDocument.findFirst
        .mockResolvedValueOnce(mockChecklist([]))
        .mockResolvedValueOnce({ data: { mentorName: "Jane Mentor" } });

      const result = await OnboardingService.getOnboardingProgress("emp-1");

      expect(result.mentorName).toBe("Jane Mentor");
    });

    it("should throw when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        OnboardingService.getOnboardingProgress("bad-id")
      ).rejects.toThrow("Employee not found");
    });

    it("should compute days in onboarding", async () => {
      const joiningDate = new Date();
      joiningDate.setDate(joiningDate.getDate() - 15);

      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ dateOfJoining: joiningDate, user: { firstName: "Z", lastName: "W" } })
      );
      mockPrisma.generatedDocument.findFirst
        .mockResolvedValueOnce(mockChecklist([]))
        .mockResolvedValueOnce(null);

      const result = await OnboardingService.getOnboardingProgress("emp-1");

      expect(result.daysInOnboarding).toBeGreaterThanOrEqual(14);
      expect(result.daysInOnboarding).toBeLessThanOrEqual(16);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Mentor Assignment
  // ────────────────────────────────────────────────────────────
  describe("assignMentor", () => {
    it("should assign a mentor and notify both parties", async () => {
      mockPrisma.employee.findUnique
        .mockResolvedValueOnce(mockEmployee({ id: "emp-new" }))
        .mockResolvedValueOnce(
          mockEmployee({
            id: "emp-mentor", employeeCode: "CT-010",
            user: { id: "u-mentor", firstName: "Jane", lastName: "Senior" },
          })
        );
      mockPrisma.generatedDocument.create.mockResolvedValue({});
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await OnboardingService.assignMentor("emp-new", "emp-mentor");

      expect(result.success).toBe(true);
      expect(result.mentorName).toBe("Jane Senior");
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2);
    });

    it("should throw when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValueOnce(null);

      await expect(
        OnboardingService.assignMentor("bad", "mentor")
      ).rejects.toThrow("Employee not found");
    });

    it("should throw when mentor not found", async () => {
      mockPrisma.employee.findUnique
        .mockResolvedValueOnce(mockEmployee())
        .mockResolvedValueOnce(null);

      await expect(
        OnboardingService.assignMentor("emp-1", "bad-mentor")
      ).rejects.toThrow("Mentor not found");
    });

    it("should store mentor assignment as generated document", async () => {
      mockPrisma.employee.findUnique
        .mockResolvedValueOnce(mockEmployee())
        .mockResolvedValueOnce(
          mockEmployee({
            id: "mentor-1", employeeCode: "CT-100",
            user: { id: "u-m", firstName: "M", lastName: "T" },
          })
        );
      mockPrisma.generatedDocument.create.mockResolvedValue({});
      mockPrisma.notification.create.mockResolvedValue({});

      await OnboardingService.assignMentor("emp-1", "mentor-1");

      expect(mockPrisma.generatedDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            category: "MENTOR_ASSIGNMENT",
            entityType: "Employee",
          }),
        })
      );
    });
  });

  // ────────────────────────────────────────────────────────────
  // Welcome Package
  // ────────────────────────────────────────────────────────────
  describe("generateWelcomePackage", () => {
    it("should generate 5 welcome documents", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ user: { firstName: "New", lastName: "Hire", email: "new@co.io" } })
      );
      mockPrisma.generatedDocument.create.mockResolvedValue({});
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await OnboardingService.generateWelcomePackage("emp-1");

      expect(result.offerLetterGenerated).toBe(true);
      expect(result.ndaGenerated).toBe(true);
      expect(result.employeeHandbookShared).toBe(true);
      expect(result.itPolicyShared).toBe(true);
      expect(result.orgChartShared).toBe(true);
      expect(result.welcomeEmailSent).toBe(true);
      expect(result.documentsCreated.length).toBe(5);
    });

    it("should throw when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        OnboardingService.generateWelcomePackage("bad-id")
      ).rejects.toThrow("Employee not found");
    });

    it("should send welcome notification", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ user: { firstName: "N", lastName: "H", email: "n@c.io" } })
      );
      mockPrisma.generatedDocument.create.mockResolvedValue({});
      mockPrisma.notification.create.mockResolvedValue({});

      await OnboardingService.generateWelcomePackage("emp-1");

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: expect.stringContaining("Welcome"),
          }),
        })
      );
    });

    it("should handle partial document generation failures", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ user: { firstName: "A", lastName: "B", email: "a@b.io" } })
      );
      let callCount = 0;
      mockPrisma.generatedDocument.create.mockImplementation(() => {
        callCount++;
        if (callCount === 3) throw new Error("Storage full");
        return Promise.resolve({});
      });
      mockPrisma.notification.create.mockResolvedValue({});

      const result = await OnboardingService.generateWelcomePackage("emp-1");

      expect(result.documentsCreated.length).toBe(4); // 5 - 1 failed
    });
  });

  // ────────────────────────────────────────────────────────────
  // Default Benefits Enrollment
  // ────────────────────────────────────────────────────────────
  describe("setupDefaultBenefits", () => {
    it("should enroll employee in all active benefit plans", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.benefitPlan.findMany.mockResolvedValue([
        { id: "plan-1", name: "Health Insurance", isActive: true },
        { id: "plan-2", name: "Life Insurance", isActive: true },
      ]);
      mockPrisma.benefitEnrollment.findFirst.mockResolvedValue(null);
      mockPrisma.benefitEnrollment.create.mockResolvedValue({});

      const result = await OnboardingService.setupDefaultBenefits("emp-1");

      expect(result.enrolledPlans.length).toBe(2);
      expect(result.enrolledPlans).toContain("Health Insurance");
      expect(result.enrolledPlans).toContain("Life Insurance");
      expect(result.skippedPlans.length).toBe(0);
    });

    it("should skip already enrolled plans", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.benefitPlan.findMany.mockResolvedValue([
        { id: "plan-1", name: "Health", isActive: true },
      ]);
      mockPrisma.benefitEnrollment.findFirst.mockResolvedValue({ id: "existing" });

      const result = await OnboardingService.setupDefaultBenefits("emp-1");

      expect(result.enrolledPlans.length).toBe(0);
      expect(result.skippedPlans).toContain("Health");
    });

    it("should throw when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        OnboardingService.setupDefaultBenefits("bad")
      ).rejects.toThrow("Employee not found");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Default Training Enrollment
  // ────────────────────────────────────────────────────────────
  describe("assignDefaultTraining", () => {
    it("should enroll in mandatory training programs", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(
        mockEmployee({ department: "Engineering" })
      );
      mockPrisma.trainingProgram.findMany.mockResolvedValue([
        { id: "tp-1", title: "Security Awareness", mandatory: true, maxSeats: null, status: "ONGOING" },
        { id: "tp-2", title: "Code Standards", mandatory: false, department: "Engineering", maxSeats: 50, status: "UPCOMING" },
      ]);
      mockPrisma.trainingEnrollment.findUnique.mockResolvedValue(null);
      mockPrisma.trainingEnrollment.count.mockResolvedValue(10);
      mockPrisma.trainingEnrollment.create.mockResolvedValue({});

      const result = await OnboardingService.assignDefaultTraining("emp-1");

      expect(result.enrolledPrograms.length).toBe(2);
      expect(result.skippedPrograms.length).toBe(0);
    });

    it("should skip full training programs", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee());
      mockPrisma.trainingProgram.findMany.mockResolvedValue([
        { id: "tp-1", title: "Full Course", mandatory: true, maxSeats: 10, status: "ONGOING" },
      ]);
      mockPrisma.trainingEnrollment.findUnique.mockResolvedValue(null);
      mockPrisma.trainingEnrollment.count.mockResolvedValue(10); // Full

      const result = await OnboardingService.assignDefaultTraining("emp-1");

      expect(result.skippedPrograms.length).toBe(1);
      expect(result.skippedPrograms[0]).toContain("full");
    });

    it("should throw when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        OnboardingService.assignDefaultTraining("bad")
      ).rejects.toThrow("Employee not found");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Onboarding Dashboard
  // ────────────────────────────────────────────────────────────
  describe("getOnboardingDashboard", () => {
    it("should aggregate onboarding statistics", async () => {
      const doc1 = {
        id: "doc-1", entityId: "emp-1", category: "ONBOARDING_CHECKLIST",
        data: {
          items: [
            { category: "IT_SETUP", isCompleted: true },
            { category: "IT_SETUP", isCompleted: false },
          ],
          status: "IN_PROGRESS",
        },
        createdAt: new Date(),
      };
      const doc2 = {
        id: "doc-2", entityId: "emp-2", category: "ONBOARDING_CHECKLIST",
        data: {
          items: [
            { category: "TRAINING", isCompleted: true },
          ],
          status: "COMPLETED",
          completedAt: new Date(),
        },
        createdAt: new Date(),
      };

      mockPrisma.generatedDocument.findMany.mockResolvedValue([doc1, doc2]);
      mockPrisma.employee.findMany.mockResolvedValue([
        mockEmployee({ id: "emp-1" }),
        mockEmployee({ id: "emp-2", employeeCode: "CT-002" }),
      ]);
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);

      const dashboard = await OnboardingService.getOnboardingDashboard();

      expect(dashboard.totalInProgress).toBe(1);
      expect(dashboard.totalCompleted).toBe(1);
      expect(dashboard.recentOnboardings.length).toBe(2);
      expect(dashboard.bottlenecks.length).toBeGreaterThan(0);
    });

    it("should handle no onboarding checklists", async () => {
      mockPrisma.generatedDocument.findMany.mockResolvedValue([]);
      mockPrisma.employee.findMany.mockResolvedValue([]);

      const dashboard = await OnboardingService.getOnboardingDashboard();

      expect(dashboard.totalInProgress).toBe(0);
      expect(dashboard.totalCompleted).toBe(0);
      expect(dashboard.avgCompletionDays).toBe(0);
      expect(dashboard.avgCompletionPercent).toBe(0);
    });
  });
});
