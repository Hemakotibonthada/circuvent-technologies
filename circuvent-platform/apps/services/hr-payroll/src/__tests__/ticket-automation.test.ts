// ──────────────────────────────────────────────────────────────
// TicketAutomationService — Test Suite
// Tests for auto-assign, auto-escalate, categorize, predict
// resolution, agent metrics, daily report generation.
// ──────────────────────────────────────────────────────────────

const mockPrisma = {
  generatedDocument: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

import { TicketAutomationService } from "../services/ticket-automation.service";

// ══════════════════════════════════════════════════════════════
// Setup
// ══════════════════════════════════════════════════════════════

let service: TicketAutomationService;

function createTestTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: `TKT-${Math.random().toString(36).slice(2, 7)}`,
    code: "TKT-00001",
    subject: "Cannot access VPN",
    description: "VPN connection times out when connecting from home",
    category: "IT_SUPPORT" as const,
    priority: "P2" as const,
    status: "OPEN" as const,
    reporterId: "user-001",
    reporterName: "John Doe",
    assigneeId: null,
    assigneeName: null,
    departmentId: "dept-it",
    tags: ["vpn", "network"],
    slaDeadline: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: null,
    closedAt: null,
    escalatedAt: null,
    responseTimeMinutes: null,
    resolutionTimeMinutes: null,
    customerSatisfaction: null,
    history: [] as Array<{ action: string; performedBy: string; timestamp: string; details: string }>,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  service = new TicketAutomationService();
});

// ══════════════════════════════════════════════════════════════
// Auto-Assign
// ══════════════════════════════════════════════════════════════

describe("Auto-Assign", () => {
  it("should auto-assign a ticket to an available agent", () => {
    const ticket = createTestTicket();
    const result = service.autoAssign(ticket);

    expect(result).toBeDefined();
    expect(result.ticketId).toBe(ticket.id);
    expect(result.assignedTo).toBeTruthy();
    expect(result.assignedToName).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("should prefer skill-matched agents for IT_SUPPORT tickets", () => {
    service.setConfig({ strategy: "SKILL_BASED" });
    const ticket = createTestTicket({ category: "IT_SUPPORT" });
    const result = service.autoAssign(ticket);

    expect(result.assignedTo).toBeTruthy();
    expect(result.reason).toContain("Skill match");
  });

  it("should use round-robin strategy", () => {
    service.setConfig({ strategy: "ROUND_ROBIN" });
    const ticket1 = createTestTicket();
    const ticket2 = createTestTicket({ id: "TKT-002" });

    const result1 = service.autoAssign(ticket1);
    const result2 = service.autoAssign(ticket2);

    expect(result1).toBeDefined();
    expect(result2).toBeDefined();
    expect(result1.reason).toContain("Round-robin");
  });

  it("should use least-loaded strategy", () => {
    service.setConfig({ strategy: "LEAST_LOADED" });
    const ticket = createTestTicket();
    const result = service.autoAssign(ticket);

    expect(result.reason).toContain("Least loaded");
  });

  it("should use hybrid strategy by default", () => {
    const ticket = createTestTicket();
    const result = service.autoAssign(ticket);
    expect(result.reason).toContain("Hybrid scoring");
  });

  it("should update ticket status after assignment", () => {
    const ticket = createTestTicket();
    service.autoAssign(ticket);
    expect(ticket.status).toBe("IN_PROGRESS");
    expect(ticket.assigneeId).toBeTruthy();
  });

  it("should add history entry on assignment", () => {
    const ticket = createTestTicket();
    service.autoAssign(ticket);
    expect(ticket.history.length).toBe(1);
    expect(ticket.history[0].action).toBe("AUTO_ASSIGNED");
  });
});

// ══════════════════════════════════════════════════════════════
// Auto-Escalate
// ══════════════════════════════════════════════════════════════

describe("Auto-Escalate", () => {
  it("should escalate a ticket that is nearing SLA breach", () => {
    const ticket = createTestTicket({
      priority: "P0",
      createdAt: new Date(Date.now() - 100 * 60000).toISOString(), // 100 minutes ago, SLA is 120
      status: "IN_PROGRESS",
    });
    const result = service.autoEscalate(ticket);

    expect(result).toBeDefined();
    expect(result?.ticketId).toBe(ticket.id);
    expect(result?.level).toBe(1);
  });

  it("should not escalate resolved tickets", () => {
    const ticket = createTestTicket({
      priority: "P0",
      createdAt: new Date(Date.now() - 200 * 60000).toISOString(),
      status: "RESOLVED",
    });
    const result = service.autoEscalate(ticket);
    expect(result).toBeNull();
  });

  it("should not escalate tickets within SLA threshold", () => {
    const ticket = createTestTicket({
      priority: "P3",
      createdAt: new Date(Date.now() - 10 * 60000).toISOString(), // 10 min, SLA is 4320
      status: "IN_PROGRESS",
    });
    const result = service.autoEscalate(ticket);
    expect(result).toBeNull();
  });

  it("should update ticket status to ESCALATED", () => {
    const ticket = createTestTicket({
      priority: "P1",
      createdAt: new Date(Date.now() - 400 * 60000).toISOString(),
      status: "IN_PROGRESS",
    });
    service.autoEscalate(ticket);
    expect(ticket.status).toBe("ESCALATED");
  });
});

// ══════════════════════════════════════════════════════════════
// Categorization
// ══════════════════════════════════════════════════════════════

describe("Categorization", () => {
  it("should categorize IT_SUPPORT tickets correctly", () => {
    const result = service.categorize("Cannot access VPN", "My laptop VPN connection is not working");
    expect(result.suggestedCategory).toBe("IT_SUPPORT");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("should categorize PAYROLL tickets correctly", () => {
    const result = service.categorize("Salary issue", "My salary deduction seems incorrect for TDS");
    expect(result.suggestedCategory).toBe("PAYROLL");
  });

  it("should categorize HR_QUERY tickets correctly", () => {
    const result = service.categorize("Policy question", "What is the remote working policy?");
    expect(result.suggestedCategory).toBe("HR_QUERY");
  });

  it("should default to GENERAL for unrecognized content", () => {
    const result = service.categorize("Random topic", "Something completely random");
    expect(result.suggestedCategory).toBe("GENERAL");
    expect(result.confidence).toBeLessThanOrEqual(0.3);
  });

  it("should suggest priority based on keywords", () => {
    const result = service.categorize("Production outage", "Critical production system is down");
    expect(result.suggestedPriority).toBe("P0");
  });
});

// ══════════════════════════════════════════════════════════════
// Resolution Prediction
// ══════════════════════════════════════════════════════════════

describe("Resolution Prediction", () => {
  it("should predict resolution time based on similar tickets", () => {
    const resolved = createTestTicket({
      status: "RESOLVED",
      resolutionTimeMinutes: 120,
    });
    service.addTicket(resolved);

    const newTicket = createTestTicket({ id: "TKT-new" });
    const prediction = service.predictResolution(newTicket);

    expect(prediction).toBeDefined();
    expect(prediction.similarTickets).toBeGreaterThanOrEqual(1);
    expect(prediction.estimatedMinutes).toBeGreaterThan(0);
  });

  it("should provide fallback when no similar tickets exist", () => {
    const ticket = createTestTicket({ category: "SECURITY", priority: "P0" });
    const prediction = service.predictResolution(ticket);

    expect(prediction.similarTickets).toBe(0);
    expect(prediction.confidence).toBe(0.3);
  });
});

// ══════════════════════════════════════════════════════════════
// Agent Metrics
// ══════════════════════════════════════════════════════════════

describe("Agent Metrics", () => {
  it("should return metrics for a valid agent", () => {
    const metrics = service.getAgentMetrics("AGT-001");
    expect(metrics).toBeDefined();
    expect(metrics?.agentId).toBe("AGT-001");
    expect(metrics?.agentName).toBe("Ravi Kumar");
  });

  it("should return null for non-existent agent", () => {
    const metrics = service.getAgentMetrics("AGT-999");
    expect(metrics).toBeNull();
  });

  it("should return metrics for all agents", () => {
    const allMetrics = service.getAllAgentMetrics();
    expect(allMetrics.length).toBe(5);
  });
});

// ══════════════════════════════════════════════════════════════
// Daily Report
// ══════════════════════════════════════════════════════════════

describe("Daily Report", () => {
  it("should generate a daily report", () => {
    const report = service.generateDailyReport();
    expect(report).toBeDefined();
    expect(report.date).toBeTruthy();
    expect(report).toHaveProperty("totalTickets");
    expect(report).toHaveProperty("newTickets");
    expect(report).toHaveProperty("slaComplianceRate");
    expect(report).toHaveProperty("byCategory");
    expect(report).toHaveProperty("byPriority");
    expect(report).toHaveProperty("backlog");
  });

  it("should generate report for specific date", () => {
    const report = service.generateDailyReport("2026-03-10");
    expect(report.date).toBe("2026-03-10");
  });
});
