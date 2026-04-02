// ──────────────────────────────────────────────────────────────
// DashboardEngineService — Test Suite
// Tests for role-specific dashboards, org health score,
// action items, widget generation.
// ──────────────────────────────────────────────────────────────

const mockPrisma = {
  generatedDocument: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

import { DashboardEngineService } from "../services/dashboard-engine.service";

// ══════════════════════════════════════════════════════════════
// Setup
// ══════════════════════════════════════════════════════════════

let service: DashboardEngineService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new DashboardEngineService();
});

// ══════════════════════════════════════════════════════════════
// Role-Specific Dashboards
// ══════════════════════════════════════════════════════════════

describe("Role-Specific Dashboards", () => {
  it("should generate CEO dashboard", () => {
    const dashboard = service.getDashboard("CEO", "user-ceo");
    expect(dashboard.role).toBe("CEO");
    expect(dashboard.widgets.length).toBeGreaterThan(0);
    expect(dashboard.orgHealth).toBeDefined();
    expect(dashboard.lastRefreshed).toBeTruthy();
  });

  it("should include headcount widget for CEO", () => {
    const dashboard = service.getDashboard("CEO", "user-ceo");
    const headcountWidget = dashboard.widgets.find((w) => w.id === "ceo-headcount");
    expect(headcountWidget).toBeDefined();
    expect(headcountWidget?.type).toBe("STAT");
  });

  it("should generate HR Manager dashboard", () => {
    const dashboard = service.getDashboard("HR_MANAGER", "user-hr");
    expect(dashboard.role).toBe("HR_MANAGER");
    expect(dashboard.widgets.length).toBeGreaterThan(5);

    const attendanceWidget = dashboard.widgets.find((w) => w.id === "hr-attendance");
    expect(attendanceWidget).toBeDefined();
  });

  it("should generate Manager dashboard", () => {
    const dashboard = service.getDashboard("MANAGER", "user-mgr");
    expect(dashboard.role).toBe("MANAGER");

    const teamWidget = dashboard.widgets.find((w) => w.id === "mgr-team");
    expect(teamWidget).toBeDefined();
  });

  it("should generate Developer dashboard", () => {
    const dashboard = service.getDashboard("DEVELOPER", "user-dev");
    expect(dashboard.role).toBe("DEVELOPER");

    const tasksWidget = dashboard.widgets.find((w) => w.id === "dev-tasks");
    expect(tasksWidget).toBeDefined();
  });

  it("should generate Marketing dashboard", () => {
    const dashboard = service.getDashboard("MARKETING", "user-mkt");
    expect(dashboard.role).toBe("MARKETING");
    expect(dashboard.widgets.length).toBeGreaterThan(0);
  });

  it("should generate Admin dashboard", () => {
    const dashboard = service.getDashboard("ADMIN", "user-admin");
    expect(dashboard.role).toBe("ADMIN");

    const systemWidget = dashboard.widgets.find((w) => w.id === "adm-system");
    expect(systemWidget).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════
// Org Health Score
// ══════════════════════════════════════════════════════════════

describe("Org Health Score", () => {
  it("should calculate org health score", () => {
    const health = service.calculateOrgHealth();
    expect(health).toBeDefined();
    expect(health.overall).toBeGreaterThan(0);
    expect(health.overall).toBeLessThanOrEqual(100);
    expect(health.dimensions.length).toBeGreaterThan(0);
    expect(health.calculatedAt).toBeTruthy();
  });

  it("should include all four dimensions", () => {
    const health = service.calculateOrgHealth();
    const dimensionNames = health.dimensions.map((d) => d.name);
    expect(dimensionNames).toContain("People & Culture");
    expect(dimensionNames).toContain("Financial Health");
    expect(dimensionNames).toContain("Operational Excellence");
    expect(dimensionNames).toContain("Customer Success");
  });

  it("should have valid dimension weights summing to 1", () => {
    const health = service.calculateOrgHealth();
    const totalWeight = health.dimensions.reduce((sum, d) => sum + d.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 2);
  });

  it("should determine trend based on overall score", () => {
    const health = service.calculateOrgHealth();
    expect(["IMPROVING", "STABLE", "DECLINING"]).toContain(health.trend);
  });

  it("should have indicators with target values", () => {
    const health = service.calculateOrgHealth();
    for (const dim of health.dimensions) {
      for (const indicator of dim.indicators) {
        expect(indicator.target).toBeGreaterThan(0);
        expect(["GOOD", "WARNING", "CRITICAL"]).toContain(indicator.status);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════
// Action Items
// ══════════════════════════════════════════════════════════════

describe("Action Items", () => {
  it("should return action items for HR_MANAGER role", () => {
    const items = service.getActionItemsForUser("user-hr", "HR_MANAGER");
    expect(items.length).toBeGreaterThan(0);
    const leaveItem = items.find((a) => a.sourceModule === "LEAVE");
    expect(leaveItem).toBeDefined();
  });

  it("should return action items for MANAGER role", () => {
    const items = service.getActionItemsForUser("user-mgr", "MANAGER");
    expect(items.length).toBeGreaterThan(0);
    const sprintItem = items.find((a) => a.sourceModule === "SPRINT");
    expect(sprintItem).toBeDefined();
  });

  it("should sort action items by priority (HIGH first)", () => {
    const items = service.getActionItemsForUser("user-hr", "HR_MANAGER");
    if (items.length >= 2) {
      const priorities = items.map((a) => a.priority);
      const highIdx = priorities.indexOf("HIGH");
      const lowIdx = priorities.indexOf("LOW");
      if (highIdx !== -1 && lowIdx !== -1) {
        expect(highIdx).toBeLessThan(lowIdx);
      }
    }
  });

  it("should add and complete an action item", () => {
    service.addActionItem({
      id: "ai-test",
      type: "TASK",
      title: "Test Action",
      description: "Test description",
      priority: "LOW",
      dueDate: null,
      sourceModule: "TEST",
      sourceId: "test-1",
      assignedTo: "user-test",
      status: "PENDING",
      createdAt: new Date().toISOString(),
    });

    const result = service.completeActionItem("ai-test");
    expect(result).toBe(true);
  });

  it("should return false for completing non-existent action item", () => {
    const result = service.completeActionItem("non-existent");
    expect(result).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Widget Validation
// ══════════════════════════════════════════════════════════════

describe("Widget Structure", () => {
  it("should have valid widget structure", () => {
    const dashboard = service.getDashboard("CEO", "user-ceo");
    for (const widget of dashboard.widgets) {
      expect(widget.id).toBeTruthy();
      expect(widget.title).toBeTruthy();
      expect(["STAT", "CHART", "TABLE", "LIST", "PROGRESS", "MAP", "CALENDAR", "ALERT"]).toContain(widget.type);
      expect(["SM", "MD", "LG", "XL"]).toContain(widget.size);
      expect(widget.data).toBeDefined();
    }
  });

  it("should have unique widget IDs per dashboard", () => {
    const dashboard = service.getDashboard("ADMIN", "user-admin");
    const ids = dashboard.widgets.map((w) => w.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
