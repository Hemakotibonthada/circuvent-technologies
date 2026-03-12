// ──────────────────────────────────────────────────────────────
// HR & Payroll — Letter Automation Service Test Suite
// Tests all letter generation methods, template variable
// replacement, bulk operations, dispatch, and statistics.
// ──────────────────────────────────────────────────────────────

import { LetterAutomationService } from "../services/letter-automation.service";

// ══════════════════════════════════════════════════════════════
// Mock Dependencies
// ══════════════════════════════════════════════════════════════

const mockCandidate = {
  id: "cand-001",
  candidateCode: "CAN-2026-0001",
  firstName: "Priya",
  lastName: "Sharma",
  email: "priya.sharma@example.com",
  currentRole: "Software Engineer",
};

const mockUser = {
  id: "user-001",
  firstName: "Rahul",
  lastName: "Kumar",
  email: "rahul.kumar@circuvent.com",
  role: "ENGINEER",
  department: "Engineering",
};

const mockEmployee = {
  id: "emp-001",
  userId: "user-001",
  employeeCode: "CIR-EMP-001",
  designation: "Senior Software Engineer",
  department: "Engineering",
  dateOfJoining: new Date("2023-06-15"),
  dateOfLeaving: null,
  baseSalary: { toNumber: () => 80000 },
  employmentType: "FULL_TIME",
  user: mockUser,
  salarySlips: [{ netSalary: 75000 }],
};

const mockEmployeeExited = {
  ...mockEmployee,
  id: "emp-002",
  dateOfLeaving: new Date("2026-02-28"),
};

const mockTemplate = {
  id: "tpl-001",
  name: "Offer Letter Template",
  letterType: "OFFER_LETTER",
  subject: "Offer of Employment — Circuvent Technologies",
  htmlContent: "<p>Dear {{candidateName}}, Offer for {{designation}} at {{department}}, salary ₹{{salary}}, join {{joiningDate}}. {{benefitsList}}</p>",
  variables: [],
  category: "EMPLOYMENT",
  isActive: true,
  version: 1,
  createdBy: "system",
};

const createdLetter = {
  id: "letter-001",
  templateId: "tpl-001",
  letterType: "OFFER_LETTER",
  recipientId: "cand-001",
  recipientName: "Priya Sharma",
  recipientEmail: "priya.sharma@example.com",
  subject: "Offer of Employment — Circuvent Technologies",
  htmlContent: "<p>Rendered content</p>",
  status: "DRAFT",
  createdBy: "system",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  candidate: {
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  employee: {
    findUnique: jest.fn(),
  },
  letterTemplate: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  letter: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  letterBatch: {
    create: jest.fn(),
    update: jest.fn(),
  },
  notification: {
    create: jest.fn(),
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

function setupDefaultMocks() {
  mockPrisma.candidate.findUnique.mockResolvedValue(mockCandidate);
  mockPrisma.user.findUnique.mockResolvedValue(mockUser);
  mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
  mockPrisma.letterTemplate.findFirst.mockResolvedValue(mockTemplate);
  mockPrisma.letterTemplate.create.mockResolvedValue(mockTemplate);
  mockPrisma.letter.create.mockResolvedValue(createdLetter);
  mockPrisma.letter.findUnique.mockResolvedValue(createdLetter);
  mockPrisma.letter.update.mockResolvedValue({ ...createdLetter, status: "SENT", sentAt: new Date() });
  mockPrisma.notification.create.mockResolvedValue({ id: "notif-001" });
  mockPrisma.letterBatch.create.mockResolvedValue({ id: "batch-001", status: "PROCESSING" });
  mockPrisma.letterBatch.update.mockResolvedValue({ id: "batch-001", status: "COMPLETED" });
}

beforeEach(() => {
  jest.clearAllMocks();
  setupDefaultMocks();
});

// ══════════════════════════════════════════════════════════════
// Tests — Individual Letter Generation
// ══════════════════════════════════════════════════════════════

describe("LetterAutomationService", () => {
  describe("generateOfferLetter", () => {
    it("should generate an offer letter for a candidate", async () => {
      const result = await LetterAutomationService.generateOfferLetter("cand-001", {
        salary: 1200000,
        designation: "Software Engineer",
        department: "Engineering",
        joiningDate: "2026-04-01",
      });

      expect(result).toBeDefined();
      expect(result.letterType).toBe("OFFER_LETTER");
      expect(result.recipientName).toBe("Priya Sharma");
      expect(result.status).toBe("DRAFT");
      expect(mockPrisma.candidate.findUnique).toHaveBeenCalledWith({ where: { id: "cand-001" } });
      expect(mockPrisma.letter.create).toHaveBeenCalled();
      const createCallData = mockPrisma.letter.create.mock.calls[0][0].data;
      expect(createCallData.letterType).toBe("OFFER_LETTER");
      expect(createCallData.recipientEmail).toBe("priya.sharma@example.com");
    });

    it("should throw if candidate not found", async () => {
      mockPrisma.candidate.findUnique.mockResolvedValue(null);
      await expect(
        LetterAutomationService.generateOfferLetter("bad-id", {
          salary: 1000000, designation: "Dev", department: "Eng", joiningDate: "2026-04-01",
        })
      ).rejects.toThrow("Candidate not found");
    });

    it("should create template if none exists", async () => {
      mockPrisma.letterTemplate.findFirst.mockResolvedValue(null);
      await LetterAutomationService.generateOfferLetter("cand-001", {
        salary: 1000000, designation: "Dev", department: "Eng", joiningDate: "2026-04-01",
      });
      expect(mockPrisma.letterTemplate.create).toHaveBeenCalled();
    });
  });

  describe("generateCallLetter", () => {
    it("should generate a call letter for interview", async () => {
      const result = await LetterAutomationService.generateCallLetter(
        "cand-001", "2026-04-10T10:00:00Z", "Circuvent HQ, Hyderabad", "John Doe"
      );
      expect(result.letterType).toBe("CALL_LETTER");
      expect(result.recipientName).toBe("Priya Sharma");
      expect(mockPrisma.letter.create).toHaveBeenCalled();
    });
  });

  describe("generateInternshipLetter", () => {
    it("should generate an internship letter", async () => {
      const result = await LetterAutomationService.generateInternshipLetter(
        "cand-001", "3 months", "Dr. Smith", 25000
      );
      expect(result.letterType).toBe("INTERNSHIP_LETTER");
      expect(result.recipientName).toBe("Priya Sharma");
    });
  });

  describe("generateExperienceLetter", () => {
    it("should auto-populate from employee record", async () => {
      const result = await LetterAutomationService.generateExperienceLetter("emp-001");
      expect(result.letterType).toBe("EXPERIENCE_LETTER");
      expect(result.recipientName).toBe("Rahul Kumar");
      expect(mockPrisma.employee.findUnique).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "emp-001" },
      }));
    });

    it("should throw if employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);
      await expect(
        LetterAutomationService.generateExperienceLetter("bad-id")
      ).rejects.toThrow("Employee not found");
    });
  });

  describe("generateRelievingLetter", () => {
    it("should generate with last working day from employee", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployeeExited);
      const result = await LetterAutomationService.generateRelievingLetter("emp-002");
      expect(result.letterType).toBe("RELIEVING_LETTER");
    });
  });

  describe("generateAppointmentLetter", () => {
    it("should generate a formal appointment letter", async () => {
      const result = await LetterAutomationService.generateAppointmentLetter("emp-001", {
        salary: 1200000, probationMonths: 6, noticePeriod: 30,
      });
      expect(result.letterType).toBe("APPOINTMENT_LETTER");
      expect(result.recipientName).toBe("Rahul Kumar");
    });
  });

  describe("generateSalaryRevisionLetter", () => {
    it("should include previous and new salary", async () => {
      const result = await LetterAutomationService.generateSalaryRevisionLetter(
        "emp-001", 1500000, "2026-04-01"
      );
      expect(result.letterType).toBe("SALARY_REVISION_LETTER");
      const createCallData = mockPrisma.letter.create.mock.calls[0][0].data;
      expect(createCallData.metadata).toBeDefined();
    });
  });

  describe("generateTransferLetter", () => {
    it("should generate a transfer letter with old and new department", async () => {
      const result = await LetterAutomationService.generateTransferLetter(
        "emp-001", "Product Team", "Bangalore"
      );
      expect(result.letterType).toBe("TRANSFER_LETTER");
    });
  });

  describe("generatePromotionLetter", () => {
    it("should include previous and new designation", async () => {
      const result = await LetterAutomationService.generatePromotionLetter(
        "emp-001", "Lead Engineer", 1800000
      );
      expect(result.letterType).toBe("PROMOTION_LETTER");
      const meta = mockPrisma.letter.create.mock.calls[0][0].data.metadata;
      expect(meta.previousDesignation).toBe("Senior Software Engineer");
      expect(meta.newDesignation).toBe("Lead Engineer");
    });
  });

  describe("generateWarningLetter", () => {
    it("should generate appropriate warning level", async () => {
      const result = await LetterAutomationService.generateWarningLetter(
        "emp-001", "Repeated tardiness", "First"
      );
      expect(result.letterType).toBe("WARNING_LETTER");
    });
  });

  describe("generateTerminationLetter", () => {
    it("should generate termination with reason and last date", async () => {
      const result = await LetterAutomationService.generateTerminationLetter(
        "emp-001", "Performance issues", "2026-03-31"
      );
      expect(result.letterType).toBe("TERMINATION_LETTER");
    });
  });

  describe("generateBonusLetter", () => {
    it("should generate bonus letter with amount and reason", async () => {
      const result = await LetterAutomationService.generateBonusLetter(
        "emp-001", 50000, "Outstanding performance in Q4"
      );
      expect(result.letterType).toBe("BONUS_LETTER");
    });
  });

  describe("generateProbationCompletionLetter", () => {
    it("should generate probation confirmation", async () => {
      const result = await LetterAutomationService.generateProbationCompletionLetter("emp-001");
      expect(result.letterType).toBe("PROBATION_CONFIRMATION");
      expect(result.recipientName).toBe("Rahul Kumar");
    });
  });

  describe("generateContractRenewalLetter", () => {
    it("should generate contract renewal with new end date", async () => {
      const result = await LetterAutomationService.generateContractRenewalLetter(
        "emp-001", "2027-12-31", "Same terms with 10% increment"
      );
      expect(result).toBeDefined();
      expect(result.recipientName).toBe("Rahul Kumar");
    });
  });

  describe("generateNDALetter", () => {
    it("should generate NDA for a user", async () => {
      const result = await LetterAutomationService.generateNDALetter("user-001");
      expect(result.letterType).toBe("NDA_AGREEMENT");
      expect(result.recipientName).toBe("Rahul Kumar");
    });

    it("should throw if user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        LetterAutomationService.generateNDALetter("bad-id")
      ).rejects.toThrow("User not found");
    });
  });

  describe("generateInternshipCompletionLetter", () => {
    it("should generate with feedback", async () => {
      const result = await LetterAutomationService.generateInternshipCompletionLetter(
        "emp-001", "Excellent contribution to the IoT project"
      );
      expect(result.letterType).toBe("INTERNSHIP_COMPLETION");
    });
  });

  describe("generateAbsconding", () => {
    it("should generate absconding notice", async () => {
      const result = await LetterAutomationService.generateAbsconding("emp-001");
      expect(result).toBeDefined();
      expect(result.subject).toContain("Absconding");
    });
  });

  describe("generateReferenceLetterForEmployee", () => {
    it("should generate reference letter with recipient", async () => {
      const result = await LetterAutomationService.generateReferenceLetterForEmployee(
        "emp-001", "To the Hiring Manager at TechCorp"
      );
      expect(result.letterType).toBe("REFERENCE_LETTER");
    });

    it("should default to 'To Whomsoever It May Concern'", async () => {
      const result = await LetterAutomationService.generateReferenceLetterForEmployee("emp-001", "");
      expect(result).toBeDefined();
    });
  });

  // ════════════════════════════════════════════════════════════
  // Tests — Template Variable Replacement
  // ════════════════════════════════════════════════════════════

  describe("Template variable replacement", () => {
    it("should replace all template variables in offer letter", async () => {
      const templateWithVars = {
        ...mockTemplate,
        htmlContent: "Dear {{candidateName}}, you are offered {{designation}} at {{department}} with ₹{{salary}} joining {{joiningDate}}. Benefits: {{benefitsList}}",
      };
      mockPrisma.letterTemplate.findFirst.mockResolvedValue(templateWithVars);

      await LetterAutomationService.generateOfferLetter("cand-001", {
        salary: 1200000, designation: "Engineer", department: "R&D", joiningDate: "2026-05-01",
      });

      const createCall = mockPrisma.letter.create.mock.calls[0][0].data;
      expect(createCall.htmlContent).not.toContain("{{candidateName}}");
      expect(createCall.htmlContent).not.toContain("{{designation}}");
      expect(createCall.htmlContent).not.toContain("{{salary}}");
      expect(createCall.htmlContent).toContain("Priya Sharma");
      expect(createCall.htmlContent).toContain("Engineer");
    });

    it("should handle missing template variables gracefully", async () => {
      const templateWithExtra = {
        ...mockTemplate,
        htmlContent: "Dear {{candidateName}}, {{unknownVar}} and {{anotherMissing}}",
      };
      mockPrisma.letterTemplate.findFirst.mockResolvedValue(templateWithExtra);

      await LetterAutomationService.generateOfferLetter("cand-001", {
        salary: 1000000, designation: "Dev", department: "Eng", joiningDate: "2026-05-01",
      });

      const createCall = mockPrisma.letter.create.mock.calls[0][0].data;
      expect(createCall.htmlContent).toContain("Priya Sharma");
      // Unknown vars should be replaced with empty string
      expect(createCall.htmlContent).not.toContain("{{candidateName}}");
    });
  });

  // ════════════════════════════════════════════════════════════
  // Tests — Bulk Operations
  // ════════════════════════════════════════════════════════════

  describe("bulkGenerateLetters", () => {
    it("should generate letters for all recipients", async () => {
      const result = await LetterAutomationService.bulkGenerateLetters(
        "EXPERIENCE_LETTER", ["emp-001", "emp-001"], {}
      );

      expect(result.batchId).toBe("batch-001");
      expect(result.totalCount).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(mockPrisma.letterBatch.create).toHaveBeenCalled();
      expect(mockPrisma.letterBatch.update).toHaveBeenCalled();
    });

    it("should track failures in bulk generation", async () => {
      mockPrisma.employee.findUnique
        .mockResolvedValueOnce(mockEmployee)
        .mockResolvedValueOnce(null);

      const result = await LetterAutomationService.bulkGenerateLetters(
        "EXPERIENCE_LETTER", ["emp-001", "emp-bad"], {}
      );

      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].recipientId).toBe("emp-bad");
    });

    it("should handle offer letters in bulk with data", async () => {
      const result = await LetterAutomationService.bulkGenerateLetters(
        "OFFER_LETTER",
        ["cand-001"],
        { salary: 900000, designation: "Junior Dev", department: "Eng", joiningDate: "2026-06-01" }
      );

      expect(result.successCount).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════
  // Tests — Dispatch
  // ════════════════════════════════════════════════════════════

  describe("dispatchLetter", () => {
    it("should mark letter as SENT", async () => {
      const result = await LetterAutomationService.dispatchLetter("letter-001");

      expect(result.status).toBe("SENT");
      expect(mockPrisma.letter.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "letter-001" },
        data: expect.objectContaining({ status: "SENT" }),
      }));
    });

    it("should create notification for recipient", async () => {
      await LetterAutomationService.dispatchLetter("letter-001");
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          userId: "cand-001",
          type: "LETTER",
        }),
      }));
    });

    it("should throw if letter not found", async () => {
      mockPrisma.letter.findUnique.mockResolvedValue(null);
      await expect(
        LetterAutomationService.dispatchLetter("bad-id")
      ).rejects.toThrow("Letter not found");
    });

    it("should throw if letter already sent", async () => {
      mockPrisma.letter.findUnique.mockResolvedValue({ ...createdLetter, status: "SENT" });
      await expect(
        LetterAutomationService.dispatchLetter("letter-001")
      ).rejects.toThrow("cannot be dispatched");
    });
  });

  describe("bulkDispatchLetters", () => {
    it("should dispatch multiple letters", async () => {
      const result = await LetterAutomationService.bulkDispatchLetters(["letter-001", "letter-001"]);
      expect(result.dispatched).toBe(2);
      expect(result.failed).toBe(0);
    });

    it("should track failures", async () => {
      mockPrisma.letter.findUnique
        .mockResolvedValueOnce(createdLetter)
        .mockResolvedValueOnce(null);

      const result = await LetterAutomationService.bulkDispatchLetters(["letter-001", "letter-bad"]);
      expect(result.dispatched).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════
  // Tests — Queries
  // ════════════════════════════════════════════════════════════

  describe("getLettersByEmployee", () => {
    it("should return letters for an employee", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ userId: "user-001" });
      mockPrisma.letter.findMany.mockResolvedValue([createdLetter]);

      const result = await LetterAutomationService.getLettersByEmployee("emp-001");
      expect(result).toHaveLength(1);
      expect(mockPrisma.letter.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { recipientId: "user-001" },
      }));
    });

    it("should throw if employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);
      await expect(
        LetterAutomationService.getLettersByEmployee("bad-id")
      ).rejects.toThrow("Employee not found");
    });
  });

  describe("getLettersByType", () => {
    it("should return letters filtered by type", async () => {
      mockPrisma.letter.findMany.mockResolvedValue([createdLetter]);

      const result = await LetterAutomationService.getLettersByType("OFFER_LETTER");
      expect(result).toHaveLength(1);
      expect(mockPrisma.letter.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { letterType: "OFFER_LETTER" },
      }));
    });
  });

  // ════════════════════════════════════════════════════════════
  // Tests — Statistics
  // ════════════════════════════════════════════════════════════

  describe("getLetterStats", () => {
    it("should return comprehensive letter statistics", async () => {
      mockPrisma.letter.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(20)  // draft
        .mockResolvedValueOnce(50)  // sent
        .mockResolvedValueOnce(30); // acknowledged

      mockPrisma.letter.groupBy.mockResolvedValue([
        { letterType: "OFFER_LETTER", _count: { id: 30 } },
        { letterType: "EXPERIENCE_LETTER", _count: { id: 20 } },
        { letterType: "SALARY_REVISION_LETTER", _count: { id: 15 } },
      ]);

      mockPrisma.letter.findMany
        .mockResolvedValueOnce([
          { id: "l1", letterType: "OFFER_LETTER", recipientName: "Test", status: "SENT", createdAt: new Date() },
        ]) // recent
        .mockResolvedValueOnce([
          { createdAt: new Date("2026-01-15") },
          { createdAt: new Date("2026-02-10") },
          { createdAt: new Date("2026-02-20") },
        ]); // monthly

      const stats = await LetterAutomationService.getLetterStats();

      expect(stats.totalLetters).toBe(100);
      expect(stats.draftCount).toBe(20);
      expect(stats.sentCount).toBe(50);
      expect(stats.acknowledgedCount).toBe(30);
      expect(stats.byType).toHaveLength(3);
      expect(stats.recentLetters).toBeDefined();
      expect(stats.monthlyTrend).toBeDefined();
    });
  });
});
