// ──────────────────────────────────────────────────────────────
// IntegrationHubService — Test Suite
// Tests for webhooks, Slack/Jira/GitHub integration,
// CSV import, API key management, event routing.
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

import { IntegrationHubService } from "../services/integration-hub.service";

// ══════════════════════════════════════════════════════════════
// Setup
// ══════════════════════════════════════════════════════════════

let service: IntegrationHubService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new IntegrationHubService();
});

// ══════════════════════════════════════════════════════════════
// Integration Management
// ══════════════════════════════════════════════════════════════

describe("Integration Management", () => {
  it("should list seeded integrations", () => {
    const integrations = service.listIntegrations();
    expect(integrations.length).toBe(4);
    expect(integrations.map((i) => i.type)).toEqual(
      expect.arrayContaining(["SLACK", "JIRA", "GITHUB", "GOOGLE_WORKSPACE"]),
    );
  });

  it("should connect a new integration", () => {
    const integration = service.connectIntegration("CUSTOM_WEBHOOK", "My Webhook", { url: "https://example.com/hook" }, "user-001");
    expect(integration.id).toBeTruthy();
    expect(integration.type).toBe("CUSTOM_WEBHOOK");
    expect(integration.status).toBe("CONNECTED");
  });

  it("should disconnect an integration", () => {
    const integrations = service.listIntegrations();
    const result = service.disconnectIntegration(integrations[0].id);
    expect(result).toBe(true);
    expect(service.getIntegration(integrations[0].id)?.status).toBe("DISCONNECTED");
  });

  it("should sync an integration", () => {
    const integrations = service.listIntegrations();
    const synced = service.syncIntegration(integrations[0].id);
    expect(synced).toBeDefined();
    expect(synced?.lastSyncAt).toBeTruthy();
  });

  it("should not sync a disconnected integration", () => {
    const integrations = service.listIntegrations();
    service.disconnectIntegration(integrations[0].id);
    const synced = service.syncIntegration(integrations[0].id);
    expect(synced).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// Webhook Management
// ══════════════════════════════════════════════════════════════

describe("Webhook Management", () => {
  it("should register a webhook", () => {
    const webhook = service.registerWebhook("https://example.com/webhook", ["EMPLOYEE_CREATED", "LEAVE_APPROVED"], "user-001");
    expect(webhook.id).toBeTruthy();
    expect(webhook.url).toBe("https://example.com/webhook");
    expect(webhook.events.length).toBe(2);
    expect(webhook.secret).toMatch(/^whsec_/);
    expect(webhook.isActive).toBe(true);
  });

  it("should list webhooks", () => {
    service.registerWebhook("https://a.com/hook", ["EMPLOYEE_CREATED"], "user-001");
    service.registerWebhook("https://b.com/hook", ["LEAVE_APPROVED"], "user-001");
    const webhooks = service.listWebhooks();
    expect(webhooks.length).toBe(2);
  });

  it("should delete a webhook", () => {
    const webhook = service.registerWebhook("https://delete.com/hook", ["TICKET_CREATED"], "user-001");
    const result = service.deleteWebhook(webhook.id);
    expect(result).toBe(true);
    expect(service.listWebhooks().length).toBe(0);
  });

  it("should toggle webhook active state", () => {
    const webhook = service.registerWebhook("https://toggle.com/hook", ["TICKET_CREATED"], "user-001");
    const toggled = service.toggleWebhook(webhook.id);
    expect(toggled?.isActive).toBe(false);
    const toggledBack = service.toggleWebhook(webhook.id);
    expect(toggledBack?.isActive).toBe(true);
  });

  it("should trigger webhooks for matching events", async () => {
    service.registerWebhook("https://a.com/hook", ["EMPLOYEE_CREATED"], "user-001");
    service.registerWebhook("https://b.com/hook", ["EMPLOYEE_CREATED", "LEAVE_APPROVED"], "user-001");

    const deliveries = await service.triggerWebhooks("EMPLOYEE_CREATED", { id: "emp-1", name: "Test" });
    expect(deliveries.length).toBe(2);
    expect(deliveries[0].success).toBe(true);
  });

  it("should not trigger inactive webhooks", async () => {
    const webhook = service.registerWebhook("https://inactive.com/hook", ["EMPLOYEE_CREATED"], "user-001");
    service.toggleWebhook(webhook.id);

    const deliveries = await service.triggerWebhooks("EMPLOYEE_CREATED", { id: "emp-1" });
    expect(deliveries.length).toBe(0);
  });

  it("should track webhook deliveries", async () => {
    const webhook = service.registerWebhook("https://track.com/hook", ["TICKET_CREATED"], "user-001");
    await service.triggerWebhooks("TICKET_CREATED", { id: "tkt-1" });

    const deliveries = service.getWebhookDeliveries(webhook.id);
    expect(deliveries.length).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// Slack Integration
// ══════════════════════════════════════════════════════════════

describe("Slack Integration", () => {
  it("should send a Slack message", async () => {
    const result = await service.sendSlackMessage({ channel: "#general", text: "Hello from CI/CD!" });
    expect(result.ok).toBe(true);
    expect(result.messageId).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════
// Jira Integration
// ══════════════════════════════════════════════════════════════

describe("Jira Integration", () => {
  it("should create a Jira ticket", async () => {
    const result = await service.createJiraTicket({
      project: "CVT", summary: "Bug in login", description: "Users cannot login", issueType: "Bug", priority: "High",
    });

    expect(result.key).toMatch(/^CVT-\d+$/);
    expect(result.url).toContain("atlassian.net");
  });
});

// ══════════════════════════════════════════════════════════════
// GitHub Integration
// ══════════════════════════════════════════════════════════════

describe("GitHub Integration", () => {
  it("should create a GitHub issue", async () => {
    const result = await service.createGitHubIssue({
      repo: "circuvent/platform", title: "Fix CI pipeline", body: "Pipeline fails on Windows",
    });

    expect(result.number).toBeGreaterThan(0);
    expect(result.url).toContain("github.com");
  });
});

// ══════════════════════════════════════════════════════════════
// CSV Import
// ══════════════════════════════════════════════════════════════

describe("CSV Import", () => {
  it("should import valid CSV data", () => {
    const csv = "name,email,department\nJohn,john@test.com,Engineering\nJane,jane@test.com,HR";
    const result = service.importCSV(csv, "EMPLOYEES", "user-001");

    expect(result.totalRows).toBe(2);
    expect(result.successRows).toBe(2);
    expect(result.failedRows).toBe(0);
  });

  it("should report errors for invalid CSV rows", () => {
    const csv = "name,email,department\nJohn,john@test.com\nJane,jane@test.com,HR";
    const result = service.importCSV(csv, "EMPLOYEES", "user-001");

    expect(result.failedRows).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].row).toBe(2);
  });

  it("should track import history", () => {
    service.importCSV("a,b\n1,2", "TEST", "user-001");
    const history = service.getImportHistory();
    expect(history.length).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// API Key Management
// ══════════════════════════════════════════════════════════════

describe("API Key Management", () => {
  it("should generate an API key", () => {
    const key = service.generateAPIKey("Test Key", ["READ", "WRITE"], "user-001");
    expect(key.id).toBeTruthy();
    expect(key.key).toMatch(/^cvt_/);
    expect(key.permissions).toEqual(["READ", "WRITE"]);
    expect(key.isActive).toBe(true);
  });

  it("should list API keys without exposing full key", () => {
    service.generateAPIKey("Key 1", ["READ"], "user-001");
    const keys = service.listAPIKeys();
    expect(keys.length).toBe(1);
    // Should not have the full key property
    expect((keys[0] as any).key).toBeUndefined();
    expect(keys[0].prefix).toMatch(/^cvt_/);
  });

  it("should validate a valid API key", () => {
    const key = service.generateAPIKey("Valid Key", ["READ"], "user-001");
    const result = service.validateAPIKey(key.key);
    expect(result.valid).toBe(true);
    expect(result.permissions).toEqual(["READ"]);
  });

  it("should reject an invalid API key", () => {
    const result = service.validateAPIKey("invalid-key");
    expect(result.valid).toBe(false);
  });

  it("should revoke an API key", () => {
    const key = service.generateAPIKey("Revoke Key", ["READ"], "user-001");
    const result = service.revokeAPIKey(key.id);
    expect(result).toBe(true);
    expect(service.validateAPIKey(key.key).valid).toBe(false);
  });

  it("should expire API keys", () => {
    const key = service.generateAPIKey("Expire Key", ["READ"], "user-001", -1); // Already expired
    const result = service.validateAPIKey(key.key);
    expect(result.valid).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Dashboard
// ══════════════════════════════════════════════════════════════

describe("Dashboard", () => {
  it("should return integration dashboard", () => {
    const dashboard = service.getDashboard();
    expect(dashboard.integrations.length).toBe(4);
    expect(dashboard.webhooks).toBeDefined();
    expect(dashboard.apiKeys).toBeDefined();
    expect(dashboard.recentImports).toBeDefined();
  });
});
