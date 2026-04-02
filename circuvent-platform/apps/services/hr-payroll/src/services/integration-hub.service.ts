// ──────────────────────────────────────────────────────────────
// HR Payroll — Integration Hub Service
// Webhooks, Slack/Jira/GitHub mock integration, CSV import,
// API key management, event routing.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type IntegrationType = "SLACK" | "JIRA" | "GITHUB" | "GOOGLE_WORKSPACE" | "CUSTOM_WEBHOOK" | "CSV_IMPORT";
export type IntegrationStatus = "CONNECTED" | "DISCONNECTED" | "ERROR" | "PENDING" | "RATE_LIMITED";
export type WebhookEvent = "EMPLOYEE_CREATED" | "EMPLOYEE_UPDATED" | "LEAVE_REQUESTED" | "LEAVE_APPROVED" | "PAYROLL_PROCESSED" | "TICKET_CREATED" | "TICKET_RESOLVED" | "SPRINT_COMPLETED" | "DEPLOYMENT_COMPLETED";

interface Integration {
  id: string;
  type: IntegrationType;
  name: string;
  status: IntegrationStatus;
  config: Record<string, string>;
  lastSyncAt: string | null;
  syncInterval: number;
  eventsSubscribed: WebhookEvent[];
  createdAt: string;
  createdBy: string;
  errorMessage?: string;
  stats: IntegrationStats;
}

interface IntegrationStats {
  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  lastEventAt: string | null;
  avgResponseMs: number;
}

interface WebhookRegistration {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  lastTriggeredAt: string | null;
  failureCount: number;
  maxRetries: number;
  headers: Record<string, string>;
}

interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: Record<string, unknown>;
  responseStatus: number | null;
  responseBody: string | null;
  deliveredAt: string;
  duration: number;
  success: boolean;
  retryCount: number;
  error?: string;
}

interface APIKey {
  id: string;
  name: string;
  key: string;
  prefix: string;
  permissions: string[];
  rateLimit: number;
  requestCount: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string;
  isActive: boolean;
}

interface CSVImportResult {
  id: string;
  fileName: string;
  entity: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  errors: Array<{ row: number; field: string; message: string }>;
  importedAt: string;
  importedBy: string;
  duration: number;
}

interface SlackMessage {
  channel: string;
  text: string;
  blocks?: unknown[];
  threadTs?: string;
}

interface JiraTicket {
  project: string;
  summary: string;
  description: string;
  issueType: "Bug" | "Task" | "Story" | "Epic";
  priority: "Highest" | "High" | "Medium" | "Low" | "Lowest";
  assignee?: string;
  labels?: string[];
}

interface GitHubIssue {
  repo: string;
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
  milestone?: number;
}

// ══════════════════════════════════════════════════════════════
// IntegrationHubService
// ══════════════════════════════════════════════════════════════

export class IntegrationHubService {
  private integrations: Integration[] = [];
  private webhooks: WebhookRegistration[] = [];
  private deliveries: WebhookDelivery[] = [];
  private apiKeys: APIKey[] = [];
  private importHistory: CSVImportResult[] = [];
  private idCounter = 0;

  constructor() {
    this.seedIntegrations();
  }

  // ── Integration CRUD ──────────────────────────────────────

  listIntegrations(): Integration[] {
    return [...this.integrations];
  }

  getIntegration(id: string): Integration | undefined {
    return this.integrations.find((i) => i.id === id);
  }

  connectIntegration(type: IntegrationType, name: string, config: Record<string, string>, userId: string): Integration {
    const id = `INT-${String(++this.idCounter).padStart(5, "0")}`;
    const integration: Integration = {
      id,
      type,
      name,
      status: "CONNECTED",
      config,
      lastSyncAt: new Date().toISOString(),
      syncInterval: 300,
      eventsSubscribed: [],
      createdAt: new Date().toISOString(),
      createdBy: userId,
      stats: { totalEvents: 0, successfulEvents: 0, failedEvents: 0, lastEventAt: null, avgResponseMs: 0 },
    };
    this.integrations.push(integration);
    return integration;
  }

  disconnectIntegration(id: string): boolean {
    const integration = this.integrations.find((i) => i.id === id);
    if (!integration) return false;
    integration.status = "DISCONNECTED";
    return true;
  }

  syncIntegration(id: string): Integration | null {
    const integration = this.integrations.find((i) => i.id === id);
    if (!integration || integration.status !== "CONNECTED") return null;
    integration.lastSyncAt = new Date().toISOString();
    integration.stats.totalEvents++;
    integration.stats.successfulEvents++;
    integration.stats.lastEventAt = new Date().toISOString();
    return integration;
  }

  // ── Webhook Management ────────────────────────────────────

  registerWebhook(url: string, events: WebhookEvent[], userId: string, headers: Record<string, string> = {}): WebhookRegistration {
    const id = `WH-${String(++this.idCounter).padStart(5, "0")}`;
    const secret = `whsec_${this.generateSecureToken(32)}`;
    const webhook: WebhookRegistration = {
      id,
      url,
      events,
      secret,
      isActive: true,
      createdAt: new Date().toISOString(),
      createdBy: userId,
      lastTriggeredAt: null,
      failureCount: 0,
      maxRetries: 3,
      headers,
    };
    this.webhooks.push(webhook);
    return webhook;
  }

  listWebhooks(): WebhookRegistration[] {
    return [...this.webhooks];
  }

  deleteWebhook(id: string): boolean {
    const idx = this.webhooks.findIndex((w) => w.id === id);
    if (idx === -1) return false;
    this.webhooks.splice(idx, 1);
    return true;
  }

  toggleWebhook(id: string): WebhookRegistration | null {
    const webhook = this.webhooks.find((w) => w.id === id);
    if (!webhook) return null;
    webhook.isActive = !webhook.isActive;
    return webhook;
  }

  async triggerWebhooks(event: WebhookEvent, payload: Record<string, unknown>): Promise<WebhookDelivery[]> {
    const matchingWebhooks = this.webhooks.filter(
      (w) => w.isActive && w.events.includes(event),
    );

    const results: WebhookDelivery[] = [];

    for (const webhook of matchingWebhooks) {
      const startTime = Date.now();
      const delivery: WebhookDelivery = {
        id: `DEL-${String(++this.idCounter).padStart(5, "0")}`,
        webhookId: webhook.id,
        event,
        payload,
        responseStatus: 200,
        responseBody: '{"ok":true}',
        deliveredAt: new Date().toISOString(),
        duration: Date.now() - startTime + Math.floor(Math.random() * 100),
        success: true,
        retryCount: 0,
      };

      webhook.lastTriggeredAt = new Date().toISOString();
      this.deliveries.push(delivery);
      results.push(delivery);
    }

    return results;
  }

  getWebhookDeliveries(webhookId?: string): WebhookDelivery[] {
    if (webhookId) return this.deliveries.filter((d) => d.webhookId === webhookId);
    return [...this.deliveries];
  }

  // ── Slack Integration ─────────────────────────────────────

  async sendSlackMessage(message: SlackMessage): Promise<{ ok: boolean; messageId: string; timestamp: string }> {
    const slackIntegration = this.integrations.find((i) => i.type === "SLACK" && i.status === "CONNECTED");
    if (!slackIntegration) throw new Error("Slack integration not connected");

    slackIntegration.stats.totalEvents++;
    slackIntegration.stats.successfulEvents++;
    slackIntegration.stats.lastEventAt = new Date().toISOString();

    return {
      ok: true,
      messageId: `msg-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Jira Integration ──────────────────────────────────────

  async createJiraTicket(ticket: JiraTicket): Promise<{ key: string; id: string; url: string }> {
    const jiraIntegration = this.integrations.find((i) => i.type === "JIRA" && i.status === "CONNECTED");
    if (!jiraIntegration) throw new Error("Jira integration not connected");

    const ticketNum = 1000 + this.idCounter++;
    jiraIntegration.stats.totalEvents++;
    jiraIntegration.stats.successfulEvents++;
    jiraIntegration.stats.lastEventAt = new Date().toISOString();

    return {
      key: `${ticket.project}-${ticketNum}`,
      id: String(ticketNum),
      url: `https://circuvent.atlassian.net/browse/${ticket.project}-${ticketNum}`,
    };
  }

  // ── GitHub Integration ────────────────────────────────────

  async createGitHubIssue(issue: GitHubIssue): Promise<{ number: number; url: string; id: string }> {
    const ghIntegration = this.integrations.find((i) => i.type === "GITHUB" && i.status === "CONNECTED");
    if (!ghIntegration) throw new Error("GitHub integration not connected");

    const issueNum = 100 + this.idCounter++;
    ghIntegration.stats.totalEvents++;
    ghIntegration.stats.successfulEvents++;
    ghIntegration.stats.lastEventAt = new Date().toISOString();

    return {
      number: issueNum,
      url: `https://github.com/${issue.repo}/issues/${issueNum}`,
      id: String(issueNum),
    };
  }

  // ── CSV Import ────────────────────────────────────────────

  importCSV(csvContent: string, entity: string, userId: string): CSVImportResult {
    const startTime = Date.now();
    const lines = csvContent.trim().split("\n");
    const headers = lines[0]?.split(",").map((h) => h.trim()) ?? [];
    const dataRows = lines.slice(1);

    const errors: CSVImportResult["errors"] = [];
    let successCount = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const values = row.split(",");

      if (values.length !== headers.length) {
        errors.push({ row: i + 2, field: "*", message: `Expected ${headers.length} columns, got ${values.length}` });
        continue;
      }

      // Validate required fields
      const emptyFields = headers.filter((h, idx) => !values[idx]?.trim());
      if (emptyFields.length > 0) {
        errors.push({ row: i + 2, field: emptyFields[0], message: `Required field "${emptyFields[0]}" is empty` });
        continue;
      }

      successCount++;
    }

    const result: CSVImportResult = {
      id: `IMP-${String(++this.idCounter).padStart(5, "0")}`,
      fileName: `${entity.toLowerCase()}_import.csv`,
      entity,
      totalRows: dataRows.length,
      successRows: successCount,
      failedRows: errors.length,
      errors,
      importedAt: new Date().toISOString(),
      importedBy: userId,
      duration: Date.now() - startTime,
    };

    this.importHistory.push(result);
    return result;
  }

  getImportHistory(): CSVImportResult[] {
    return [...this.importHistory];
  }

  // ── API Key Management ────────────────────────────────────

  generateAPIKey(name: string, permissions: string[], userId: string, expiresInDays?: number): APIKey {
    const key = this.generateSecureToken(40);
    const prefix = key.slice(0, 8);
    const apiKey: APIKey = {
      id: `KEY-${String(++this.idCounter).padStart(5, "0")}`,
      name,
      key: `cvt_${key}`,
      prefix: `cvt_${prefix}`,
      permissions,
      rateLimit: 1000,
      requestCount: 0,
      lastUsedAt: null,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null,
      createdAt: new Date().toISOString(),
      createdBy: userId,
      isActive: true,
    };
    this.apiKeys.push(apiKey);
    return apiKey;
  }

  listAPIKeys(): Omit<APIKey, "key">[] {
    return this.apiKeys.map(({ key, ...rest }) => rest);
  }

  revokeAPIKey(id: string): boolean {
    const apiKey = this.apiKeys.find((k) => k.id === id);
    if (!apiKey) return false;
    apiKey.isActive = false;
    return true;
  }

  validateAPIKey(key: string): { valid: boolean; permissions: string[]; rateLimited: boolean } {
    const apiKey = this.apiKeys.find((k) => k.key === key && k.isActive);
    if (!apiKey) return { valid: false, permissions: [], rateLimited: false };

    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      apiKey.isActive = false;
      return { valid: false, permissions: [], rateLimited: false };
    }

    apiKey.requestCount++;
    apiKey.lastUsedAt = new Date().toISOString();

    return {
      valid: true,
      permissions: apiKey.permissions,
      rateLimited: apiKey.requestCount > apiKey.rateLimit,
    };
  }

  // ── Dashboard ─────────────────────────────────────────────

  getDashboard(): {
    integrations: Array<{ type: IntegrationType; status: IntegrationStatus; lastSync: string | null }>;
    webhooks: { total: number; active: number; totalDeliveries: number; successRate: number };
    apiKeys: { total: number; active: number; totalRequests: number };
    recentImports: CSVImportResult[];
  } {
    const activeWebhooks = this.webhooks.filter((w) => w.isActive).length;
    const successDeliveries = this.deliveries.filter((d) => d.success).length;

    return {
      integrations: this.integrations.map((i) => ({ type: i.type, status: i.status, lastSync: i.lastSyncAt })),
      webhooks: {
        total: this.webhooks.length,
        active: activeWebhooks,
        totalDeliveries: this.deliveries.length,
        successRate: this.deliveries.length > 0 ? Math.round((successDeliveries / this.deliveries.length) * 100) : 100,
      },
      apiKeys: {
        total: this.apiKeys.length,
        active: this.apiKeys.filter((k) => k.isActive).length,
        totalRequests: this.apiKeys.reduce((sum, k) => sum + k.requestCount, 0),
      },
      recentImports: this.importHistory.slice(-5),
    };
  }

  // ── Helpers ───────────────────────────────────────────────

  private generateSecureToken(length: number): string {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private seedIntegrations(): void {
    this.integrations = [
      {
        id: "INT-00001", type: "SLACK", name: "Circuvent Slack", status: "CONNECTED",
        config: { workspace: "circuvent-tech", channel: "#general" },
        lastSyncAt: new Date(Date.now() - 300000).toISOString(), syncInterval: 300,
        eventsSubscribed: ["EMPLOYEE_CREATED", "LEAVE_APPROVED", "TICKET_CREATED"],
        createdAt: new Date(Date.now() - 90 * 86400000).toISOString(), createdBy: "admin",
        stats: { totalEvents: 1456, successfulEvents: 1432, failedEvents: 24, lastEventAt: new Date(Date.now() - 300000).toISOString(), avgResponseMs: 120 },
      },
      {
        id: "INT-00002", type: "JIRA", name: "Jira Cloud", status: "CONNECTED",
        config: { domain: "circuvent.atlassian.net", project: "CVT" },
        lastSyncAt: new Date(Date.now() - 600000).toISOString(), syncInterval: 600,
        eventsSubscribed: ["TICKET_CREATED", "SPRINT_COMPLETED"],
        createdAt: new Date(Date.now() - 60 * 86400000).toISOString(), createdBy: "admin",
        stats: { totalEvents: 834, successfulEvents: 820, failedEvents: 14, lastEventAt: new Date(Date.now() - 600000).toISOString(), avgResponseMs: 250 },
      },
      {
        id: "INT-00003", type: "GITHUB", name: "GitHub Enterprise", status: "CONNECTED",
        config: { org: "circuvent-technologies", repo: "circuvent-platform" },
        lastSyncAt: new Date(Date.now() - 900000).toISOString(), syncInterval: 300,
        eventsSubscribed: ["DEPLOYMENT_COMPLETED"],
        createdAt: new Date(Date.now() - 120 * 86400000).toISOString(), createdBy: "admin",
        stats: { totalEvents: 2100, successfulEvents: 2085, failedEvents: 15, lastEventAt: new Date(Date.now() - 900000).toISOString(), avgResponseMs: 180 },
      },
      {
        id: "INT-00004", type: "GOOGLE_WORKSPACE", name: "Google Workspace", status: "CONNECTED",
        config: { domain: "circuvent.com" },
        lastSyncAt: new Date(Date.now() - 1200000).toISOString(), syncInterval: 900,
        eventsSubscribed: ["EMPLOYEE_CREATED", "EMPLOYEE_UPDATED"],
        createdAt: new Date(Date.now() - 180 * 86400000).toISOString(), createdBy: "admin",
        stats: { totalEvents: 567, successfulEvents: 560, failedEvents: 7, lastEventAt: new Date(Date.now() - 1200000).toISOString(), avgResponseMs: 350 },
      },
    ];
  }
}
