// ──────────────────────────────────────────────────────────────
// SLAEngineService — Test Suite
// Tests for SLA deadlines, breach detection, compliance,
// escalation, at-risk tickets, reporting.
// ──────────────────────────────────────────────────────────────

const mockPrisma = {
  generatedDocument: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

import { SLAEngineService } from "../services/sla-engine.service";

// ══════════════════════════════════════════════════════════════
// Setup
// ══════════════════════════════════════════════════════════════

let service: SLAEngineService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new SLAEngineService();
});

// ══════════════════════════════════════════════════════════════
// SLA Deadline Calculation
// ══════════════════════════════════════════════════════════════

describe("SLA Deadline Calculation", () => {
  it("should calculate CRITICAL deadline as 4 hours", () => {
    const deadline = service.calculateSLADeadline("CRITICAL", "IT_SOFTWARE");
    const now = Date.now();
    const expectedMs = 4 * 60 * 60 * 1000;

    expect(deadline.priority).toBe("CRITICAL");
    expect(deadline.resolutionDeadline.getTime()).toBeGreaterThanOrEqual(now + expectedMs - 1000);
    expect(deadline.resolutionDeadline.getTime()).toBeLessThanOrEqual(now + expectedMs + 1000);
  });

  it("should calculate HIGH deadline as 8 hours", () => {
    const deadline = service.calculateSLADeadline("HIGH", "IT_SOFTWARE");
    expect(deadline.ruleApplied.resolutionTimeHours).toBe(8);
  });

  it("should calculate MEDIUM deadline as 24 hours", () => {
    const deadline = service.calculateSLADeadline("MEDIUM", "IT_SOFTWARE");
    expect(deadline.ruleApplied.resolutionTimeHours).toBe(24);
  });

  it("should calculate LOW deadline as 72 hours", () => {
    const deadline = service.calculateSLADeadline("LOW", "IT_SOFTWARE");
    expect(deadline.ruleApplied.resolutionTimeHours).toBe(72);
  });

  it("should apply category multiplier for IT_HARDWARE (1.5x)", () => {
    const deadline = service.calculateSLADeadline("MEDIUM", "IT_HARDWARE");
    const expectedHours = 24 * 1.5; // 36 hours
    const now = Date.now();
    const expectedMs = expectedHours * 60 * 60 * 1000;

    expect(deadline.resolutionDeadline.getTime()).toBeGreaterThanOrEqual(now + expectedMs - 1000);
  });

  it("should apply category multiplier for SECURITY (0.7x)", () => {
    const deadline = service.calculateSLADeadline("HIGH", "SECURITY");
    const expectedHours = 8 * 0.7; // 5.6 hours
    const now = Date.now();
    const expectedMs = expectedHours * 60 * 60 * 1000;

    expect(deadline.resolutionDeadline.getTime()).toBeGreaterThanOrEqual(now + expectedMs - 1000);
  });

  it("should default category multiplier to 1.0 for unknown category", () => {
    const deadline = service.calculateSLADeadline("MEDIUM", "UNKNOWN_CATEGORY");
    expect(deadline.ruleApplied.resolutionTimeHours).toBe(24);
  });

  it("should set response deadline correctly", () => {
    const deadline = service.calculateSLADeadline("CRITICAL", "IT_SOFTWARE");
    expect(deadline.responseDeadline.getTime()).toBeLessThan(deadline.resolutionDeadline.getTime());
  });
});

// ══════════════════════════════════════════════════════════════
// Breach Detection
// ══════════════════════════════════════════════════════════════

describe("Breach Detection", () => {
  it("should detect breached ticket (overdue unresolved)", () => {
    const ticket = {
      id: "t1",
      subject: "Test",
      priority: "CRITICAL" as const,
      category: "IT_SOFTWARE",
      status: "OPEN",
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
      escalationLevel: 0,
    };

    expect(service.checkSLABreach(ticket)).toBe(true);
  });

  it("should not flag ticket within SLA", () => {
    const ticket = {
      id: "t2",
      subject: "Test",
      priority: "CRITICAL" as const,
      category: "IT_SOFTWARE",
      status: "OPEN",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      escalationLevel: 0,
    };

    expect(service.checkSLABreach(ticket)).toBe(false);
  });

  it("should detect breach on resolved ticket that was late", () => {
    const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
    const oneHourAgo = Date.now() - 1 * 60 * 60 * 1000;

    const ticket = {
      id: "t3",
      subject: "Test",
      priority: "CRITICAL" as const,
      category: "IT_SOFTWARE",
      status: "RESOLVED",
      createdAt: new Date(fiveHoursAgo).toISOString(),
      resolvedAt: new Date(oneHourAgo).toISOString(),
      escalationLevel: 0,
    };

    expect(service.checkSLABreach(ticket)).toBe(true);
  });

  it("should not flag resolved ticket within SLA", () => {
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

    const ticket = {
      id: "t4",
      subject: "Test",
      priority: "CRITICAL" as const,
      category: "IT_SOFTWARE",
      status: "RESOLVED",
      createdAt: new Date(threeHoursAgo).toISOString(),
      resolvedAt: new Date(twoHoursAgo).toISOString(),
      escalationLevel: 0,
    };

    expect(service.checkSLABreach(ticket)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// SLA Status
// ══════════════════════════════════════════════════════════════

describe("SLA Status", () => {
  it("should return GREEN for ticket well within SLA", () => {
    const ticket = {
      id: "t1",
      subject: "Test",
      priority: "MEDIUM" as const,
      category: "IT_SOFTWARE",
      status: "OPEN",
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago, 24h SLA
      escalationLevel: 0,
    };

    const status = service.getSLAStatus(ticket);
    expect(status.level).toBe("GREEN");
    expect(status.breached).toBe(false);
    expect(status.remainingMinutes).toBeGreaterThan(0);
  });

  it("should return AMBER for ticket approaching SLA", () => {
    const ticket = {
      id: "t2",
      subject: "Test",
      priority: "MEDIUM" as const,
      category: "IT_SOFTWARE",
      status: "OPEN",
      createdAt: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(), // 22h ago, 24h SLA (91% elapsed)
      escalationLevel: 0,
    };

    const status = service.getSLAStatus(ticket);
    expect(status.level).toBe("AMBER");
  });

  it("should return RED for breached ticket", () => {
    const ticket = {
      id: "t3",
      subject: "Test",
      priority: "CRITICAL" as const,
      category: "IT_SOFTWARE",
      status: "OPEN",
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5h ago, 4h SLA
      escalationLevel: 0,
    };

    const status = service.getSLAStatus(ticket);
    expect(status.level).toBe("RED");
    expect(status.breached).toBe(true);
    expect(status.remainingMinutes).toBeLessThan(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Time to Resolution
// ══════════════════════════════════════════════════════════════

describe("Time to Resolution", () => {
  it("should calculate resolution time for resolved ticket", () => {
    const ticket = {
      id: "t1",
      subject: "Test",
      priority: "HIGH" as const,
      category: "IT_SOFTWARE",
      status: "RESOLVED",
      createdAt: new Date("2026-03-01T10:00:00Z").toISOString(),
      resolvedAt: new Date("2026-03-01T15:30:00Z").toISOString(),
      escalationLevel: 0,
    };

    const result = service.getTimeToResolution(ticket);
    expect(result).not.toBeNull();
    expect(result!.hours).toBe(5);
    expect(result!.minutes).toBe(30);
    expect(result!.withinSLA).toBe(true); // 5.5h < 8h
  });

  it("should return null for unresolved ticket", () => {
    const ticket = {
      id: "t2",
      subject: "Test",
      priority: "HIGH" as const,
      category: "IT_SOFTWARE",
      status: "OPEN",
      createdAt: new Date().toISOString(),
      escalationLevel: 0,
    };

    const result = service.getTimeToResolution(ticket);
    expect(result).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// Compliance & Reporting
// ══════════════════════════════════════════════════════════════

describe("SLA Compliance", () => {
  it("should calculate compliance rate", async () => {
    const now = Date.now();
    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      {
        id: "t1",
        name: "Ticket 1",
        createdAt: new Date(now - 2 * 60 * 60 * 1000),
        data: { priority: "CRITICAL", category: "IT_SOFTWARE", status: "RESOLVED", resolvedAt: new Date(now - 1 * 60 * 60 * 1000).toISOString() },
      },
      {
        id: "t2",
        name: "Ticket 2",
        createdAt: new Date(now - 10 * 60 * 60 * 1000),
        data: { priority: "CRITICAL", category: "IT_SOFTWARE", status: "RESOLVED", resolvedAt: new Date(now - 1 * 60 * 60 * 1000).toISOString() },
      },
    ]);

    const result = await service.getSLAComplianceRate("2026-03-01", "2026-03-31");
    expect(result.total).toBe(2);
    expect(result.compliant).toBe(1); // Only first ticket within 4h SLA
  });
});

describe("At-Risk Tickets", () => {
  it("should identify at-risk tickets", async () => {
    const now = Date.now();
    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      {
        id: "t1",
        name: "Almost due",
        createdAt: new Date(now - 3.5 * 60 * 60 * 1000), // 3.5h ago, CRITICAL 4h SLA => 30 min remaining
        data: { priority: "CRITICAL", category: "IT_SOFTWARE", status: "OPEN" },
      },
      {
        id: "t2",
        name: "Not at risk",
        createdAt: new Date(now - 1 * 60 * 60 * 1000), // 1h ago, MEDIUM 24h SLA
        data: { priority: "MEDIUM", category: "IT_SOFTWARE", status: "OPEN" },
      },
    ]);

    const atRisk = await service.identifyAtRiskTickets(60); // within 60 min
    expect(atRisk).toHaveLength(1);
    expect(atRisk[0].id).toBe("t1");
  });
});

describe("Auto-Escalation", () => {
  it("should escalate breached tickets", async () => {
    const now = Date.now();
    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      {
        id: "t1",
        name: "Breached",
        createdAt: new Date(now - 5 * 60 * 60 * 1000), // 5h ago, CRITICAL 4h SLA
        data: { priority: "CRITICAL", category: "IT_SOFTWARE", status: "OPEN", escalationLevel: 0 },
      },
    ]);

    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "t1",
      data: { priority: "CRITICAL", category: "IT_SOFTWARE", escalationLevel: 0, escalationHistory: [] },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const result = await service.autoEscalateBreachedTickets();
    expect(result.total).toBe(1);
    expect(result.escalated).toContain("t1");
  });
});

describe("SLA Report", () => {
  it("should generate comprehensive SLA report", async () => {
    const now = Date.now();
    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      {
        id: "t1",
        name: "Ticket 1",
        createdAt: new Date(now - 2 * 60 * 60 * 1000),
        data: { priority: "HIGH", category: "IT_SOFTWARE", status: "RESOLVED", resolvedAt: new Date(now - 1 * 60 * 60 * 1000).toISOString() },
      },
      {
        id: "t2",
        name: "Ticket 2",
        createdAt: new Date(now - 10 * 60 * 60 * 1000),
        data: { priority: "HIGH", category: "IT_HARDWARE", status: "RESOLVED", resolvedAt: new Date(now - 1 * 60 * 60 * 1000).toISOString() },
      },
      {
        id: "t3",
        name: "Ticket 3",
        createdAt: new Date(now - 1 * 60 * 60 * 1000),
        data: { priority: "LOW", category: "IT_SOFTWARE", status: "OPEN" },
      },
    ]);

    const report = await service.generateSLAReport("2026-03-01", "2026-03-31");
    expect(report.totalTickets).toBe(3);
    expect(report.period.start).toBe("2026-03-01");
    expect(report.byPriority).toBeDefined();
    expect(report.byCategory).toBeDefined();
    expect(report.avgResolutionTimeHours).toBeGreaterThan(0);
  });
});
