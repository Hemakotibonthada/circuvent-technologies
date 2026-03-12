// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Integration Routes
// Webhook management, external service notifications (Slack,
// email), bulk import/export, API key management, and health
// checks for all registered microservices.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "@circuvent/auth";
import { HTTP_STATUS } from "@circuvent/shared";
import { createAuditLog } from "@circuvent/audit";
import crypto from "crypto";

const router = Router();
const prisma = new PrismaClient();

// ── In-memory webhook store (production would use DB table) ──
interface WebhookRegistration {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
  lastTriggered?: string;
  failureCount: number;
}

interface APIKeyRecord {
  id: string;
  key: string;
  name: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  lastUsed?: string;
  active: boolean;
  scopes: string[];
}

const webhooks: Map<string, WebhookRegistration> = new Map();
const apiKeys: Map<string, APIKeyRecord> = new Map();

router.use(authenticate);

// ═══════════════════════════════════════════════════════════════
// Webhooks
// ═══════════════════════════════════════════════════════════════

// POST /api/integrations/webhooks — Register a new webhook
router.post("/webhooks", async (req: Request, res: Response) => {
  try {
    const { url, events } = req.body;
    if (!url || !events || !Array.isArray(events) || events.length === 0) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "Missing required fields: url (string), events (string[])",
      });
      return;
    }

    try {
      new URL(url);
    } catch {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, error: "Invalid URL format" });
      return;
    }

    const id = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString("hex");

    const webhook: WebhookRegistration = {
      id,
      url,
      events,
      secret,
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: req.user?.userId || "unknown",
      failureCount: 0,
    };

    webhooks.set(id, webhook);

    await createAuditLog({
      userId: req.user?.userId || "unknown",
      action: "CREATE",
      entity: "Webhook",
      entityId: id,
      newValue: { url, events },
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { id, url, events, secret, active: true, createdAt: webhook.createdAt },
    });
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: "Failed to register webhook",
    });
  }
});

// GET /api/integrations/webhooks — List all registered webhooks
router.get("/webhooks", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const allWebhooks = Array.from(webhooks.values())
      .filter((wh) => wh.createdBy === userId || (req.user?.role as string) === "ADMIN" || (req.user?.role as string) === "SUPER_ADMIN")
      .map(({ secret, ...rest }) => rest); // Never expose secrets in listing

    res.json({
      success: true,
      data: allWebhooks,
      meta: { total: allWebhooks.length },
    });
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: "Failed to list webhooks" });
  }
});

// POST /api/integrations/webhooks/:id/test — Test a webhook
router.post("/webhooks/:id/test", async (req: Request, res: Response) => {
  try {
    const webhook = webhooks.get(req.params.id);
    if (!webhook) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, error: "Webhook not found" });
      return;
    }

    // Simulate webhook delivery (in production, would make actual HTTP request)
    const testPayload = {
      event: "test.ping",
      timestamp: new Date().toISOString(),
      data: { message: "This is a test webhook delivery from Circuvent Platform" },
    };

    const signature = crypto
      .createHmac("sha256", webhook.secret)
      .update(JSON.stringify(testPayload))
      .digest("hex");

    // In production: await fetch(webhook.url, { method: "POST", headers: { "X-Webhook-Signature": signature }, body: JSON.stringify(testPayload) });

    webhook.lastTriggered = new Date().toISOString();

    res.json({
      success: true,
      data: {
        webhookId: webhook.id,
        url: webhook.url,
        status: "delivered",
        payload: testPayload,
        signature: `sha256=${signature}`,
        deliveredAt: webhook.lastTriggered,
      },
    });
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: "Failed to test webhook" });
  }
});

// DELETE /api/integrations/webhooks/:id — Delete a webhook
router.delete("/webhooks/:id", async (req: Request, res: Response) => {
  try {
    const webhook = webhooks.get(req.params.id);
    if (!webhook) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, error: "Webhook not found" });
      return;
    }

    // Only creator or admin can delete
    if (webhook.createdBy !== req.user?.userId && (req.user?.role as string) !== "ADMIN" && (req.user?.role as string) !== "SUPER_ADMIN") {
      res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, error: "Not authorized to delete this webhook" });
      return;
    }

    webhooks.delete(req.params.id);

    await createAuditLog({
      userId: req.user?.userId || "unknown",
      action: "DELETE",
      entity: "Webhook",
      entityId: req.params.id,
    });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: "Failed to delete webhook" });
  }
});

// ═══════════════════════════════════════════════════════════════
// Slack & Email (Mock)
// ═══════════════════════════════════════════════════════════════

// POST /api/integrations/slack/notify — Send Slack notification
router.post("/slack/notify", async (req: Request, res: Response) => {
  try {
    const { channel, message, blocks } = req.body;
    if (!channel || !message) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "Missing required fields: channel, message",
      });
      return;
    }

    // Mock Slack API response
    const mockResponse = {
      ok: true,
      channel,
      ts: `${Date.now()}.000100`,
      message: {
        text: message,
        blocks: blocks || null,
      },
    };

    await createAuditLog({
      userId: req.user?.userId || "unknown",
      action: "CREATE",
      entity: "SlackNotification",
      entityId: mockResponse.ts,
      newValue: { channel, messagePreview: message.substring(0, 100) },
    });

    res.json({
      success: true,
      data: mockResponse,
      note: "Mock response — configure SLACK_WEBHOOK_URL for production",
    });
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: "Failed to send Slack notification" });
  }
});

// POST /api/integrations/email/send — Send email
router.post("/email/send", async (req: Request, res: Response) => {
  try {
    const { to, subject, template, data } = req.body;
    if (!to || !subject) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "Missing required fields: to, subject",
      });
      return;
    }

    const TEMPLATES: Record<string, string> = {
      welcome: "Welcome to Circuvent Technologies! Your account has been created.",
      payslip: `Your payslip for ${data?.month || "this month"} is ready for download.`,
      leave_approved: `Your leave request has been approved by ${data?.approver || "your manager"}.`,
      leave_rejected: `Your leave request has been rejected. Reason: ${data?.reason || "N/A"}.`,
      expense_approved: `Your expense claim of ₹${data?.amount || "0"} has been approved.`,
      password_reset: `Click here to reset your password. This link expires in 1 hour.`,
      onboarding: `Welcome aboard! Please complete your onboarding checklist.`,
    };

    const body = template && TEMPLATES[template] ? TEMPLATES[template] : (req.body.body || "");

    const messageId = `msg_${crypto.randomUUID().slice(0, 8)}@circuvent.com`;

    res.json({
      success: true,
      data: {
        messageId,
        to: Array.isArray(to) ? to : [to],
        subject,
        template: template || "custom",
        bodyPreview: body.substring(0, 100),
        status: "queued",
        queuedAt: new Date().toISOString(),
      },
      note: "Mock response — configure SMTP settings for production",
    });
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: "Failed to send email" });
  }
});

// ═══════════════════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════════════════

// GET /api/integrations/health — Check all service health
router.get("/health", async (_req: Request, res: Response) => {
  const services = [
    { name: "project-tracker", port: process.env.PROJECT_TRACKER_PORT || "3001" },
    { name: "iot-registry", port: process.env.IOT_REGISTRY_PORT || "3002" },
    { name: "hr-payroll", port: process.env.HR_PAYROLL_PORT || "3003" },
    { name: "client-portal", port: process.env.CLIENT_PORTAL_PORT || "3004" },
    { name: "ai-orchestrator", port: process.env.AI_ORCHESTRATOR_PORT || "3006" },
    { name: "financial-ledger", port: process.env.FINANCIAL_LEDGER_PORT || "3007" },
    { name: "ats-engine", port: process.env.ATS_ENGINE_PORT || "3008" },
  ];

  const baseUrl = process.env.SERVICE_HOST || "http://localhost";
  const results = await Promise.all(
    services.map(async (svc) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const resp = await fetch(`${baseUrl}:${svc.port}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        return { name: svc.name, status: resp.ok ? "healthy" : "unhealthy", statusCode: resp.status, responseTime: "< 3s" };
      } catch {
        return { name: svc.name, status: "unreachable", statusCode: null, responseTime: null };
      }
    })
  );

  // Database health
  let dbStatus = "healthy";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "unhealthy";
  }

  const allHealthy = results.every((r) => r.status === "healthy") && dbStatus === "healthy";

  res.status(allHealthy ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE).json({
    success: true,
    data: {
      overall: allHealthy ? "healthy" : "degraded",
      database: dbStatus,
      services: results,
      checkedAt: new Date().toISOString(),
    },
  });
});

// ═══════════════════════════════════════════════════════════════
// Bulk Import / Export
// ═══════════════════════════════════════════════════════════════

// POST /api/integrations/import/employees — Bulk import employees from CSV data
router.post("/import/employees", async (req: Request, res: Response) => {
  try {
    const { employees } = req.body;
    if (!employees || !Array.isArray(employees) || employees.length === 0) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "Missing or empty 'employees' array. Each entry needs: email, firstName, lastName, department.",
      });
      return;
    }

    const results: { email: string; status: "created" | "skipped" | "error"; reason?: string }[] = [];

    for (const emp of employees) {
      try {
        if (!emp.email || !emp.firstName || !emp.lastName) {
          results.push({ email: emp.email || "unknown", status: "skipped", reason: "Missing required fields" });
          continue;
        }

        const existing = await prisma.user.findUnique({ where: { email: emp.email } });
        if (existing) {
          results.push({ email: emp.email, status: "skipped", reason: "User already exists" });
          continue;
        }

        const user = await prisma.user.create({
          data: {
            email: emp.email,
            passwordHash: crypto.randomBytes(32).toString("hex"), // Temporary — must be reset
            firstName: emp.firstName,
            lastName: emp.lastName,
            phone: emp.phone || null,
            role: "ENGINEER",
          },
        });

        await prisma.employee.create({
          data: {
            userId: user.id,
            department: emp.department || "General",
            designation: emp.designation || "Associate",
            baseSalary: emp.baseSalary || 0,
            dateOfJoining: emp.joiningDate ? new Date(emp.joiningDate) : new Date(),
            employeeCode: `CIR-EMP-${Date.now().toString(36).toUpperCase()}`,
            employmentType: emp.employmentType || "FULL_TIME",
          },
        });

        results.push({ email: emp.email, status: "created" });
      } catch (err) {
        results.push({
          email: emp.email || "unknown",
          status: "error",
          reason: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    await createAuditLog({
      userId: req.user?.userId || "unknown",
      action: "CREATE",
      entity: "Employee",
      entityId: `import_${Date.now()}`,
      newValue: {
        total: employees.length,
        created: results.filter((r) => r.status === "created").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        errors: results.filter((r) => r.status === "error").length,
      },
    });

    res.status(HTTP_STATUS.CREATED).json({ success: true, data: { results, summary: { total: employees.length, created: results.filter((r) => r.status === "created").length, skipped: results.filter((r) => r.status === "skipped").length, errors: results.filter((r) => r.status === "error").length } } });
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: "Bulk import failed" });
  }
});

// POST /api/integrations/import/holidays — Bulk import holidays
router.post("/import/holidays", async (req: Request, res: Response) => {
  try {
    const { holidays } = req.body;
    if (!holidays || !Array.isArray(holidays) || holidays.length === 0) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "Missing or empty 'holidays' array. Each entry needs: name, date.",
      });
      return;
    }

    // Store in a simple format (in production would use a Holiday model)
    const imported = holidays.map((h: { name: string; date: string; type?: string }) => ({
      name: h.name,
      date: h.date,
      type: h.type || "PUBLIC",
      imported: true,
    }));

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { imported: imported.length, holidays: imported },
    });
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: "Holiday import failed" });
  }
});

// POST /api/integrations/export/employees — Export employee data
router.post("/export/employees", async (req: Request, res: Response) => {
  try {
    const { format = "json", departments, statuses } = req.body;

    const where: Record<string, unknown> = {};
    if (departments && Array.isArray(departments)) where.department = { in: departments };
    if (statuses && Array.isArray(statuses)) {
      // Map status filter to dateOfLeaving (Employee has no status field)
      if (statuses.includes("ACTIVE")) where.dateOfLeaving = null;
    } else {
      where.dateOfLeaving = null;
    }

    const employees = await prisma.employee.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, email: true, phone: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const data = employees.map((emp) => ({
      employeeId: emp.id,
      firstName: emp.user?.firstName,
      lastName: emp.user?.lastName,
      email: emp.user?.email,
      phone: emp.user?.phone,
      department: emp.department,
      designation: emp.designation,
      dateOfJoining: emp.dateOfJoining,
      employmentType: emp.employmentType,
      active: emp.dateOfLeaving === null,
    }));

    await createAuditLog({
      userId: req.user?.userId || "unknown",
      action: "EXPORT",
      entity: "Employee",
      entityId: `export_${Date.now()}`,
      newValue: { format, count: data.length },
    });

    if (format === "csv") {
      const headers = Object.keys(data[0] || {}).join(",");
      const rows = data.map((d) => Object.values(d).map((v) => `"${v ?? ""}"`).join(","));
      const csv = [headers, ...rows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=employees.csv");
      res.send(csv);
      return;
    }

    res.json({ success: true, data, meta: { total: data.length, format } });
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: "Export failed" });
  }
});

// ═══════════════════════════════════════════════════════════════
// API Keys
// ═══════════════════════════════════════════════════════════════

// GET /api/integrations/api-keys — List API keys
router.get("/api-keys", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const keys = Array.from(apiKeys.values())
      .filter((k) => k.createdBy === userId || (req.user?.role as string) === "ADMIN" || (req.user?.role as string) === "SUPER_ADMIN")
      .map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.key.substring(0, 8) + "..." + k.key.substring(k.key.length - 4),
        scopes: k.scopes,
        active: k.active,
        createdAt: k.createdAt,
        expiresAt: k.expiresAt,
        lastUsed: k.lastUsed,
      }));

    res.json({ success: true, data: keys, meta: { total: keys.length } });
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: "Failed to list API keys" });
  }
});

// POST /api/integrations/api-keys — Generate a new API key
router.post("/api-keys", async (req: Request, res: Response) => {
  try {
    const { name, scopes = ["read"], expiresInDays = 90 } = req.body;
    if (!name) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, error: "Missing required field: name" });
      return;
    }

    const id = crypto.randomUUID();
    const key = `cv_${crypto.randomBytes(32).toString("hex")}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const record: APIKeyRecord = {
      id,
      key,
      name,
      createdBy: req.user?.userId || "unknown",
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      active: true,
      scopes,
    };

    apiKeys.set(id, record);

    await createAuditLog({
      userId: req.user?.userId || "unknown",
      action: "CREATE",
      entity: "APIKey",
      entityId: id,
      newValue: { name, scopes, expiresAt: record.expiresAt },
    });

    // Return the full key ONLY on creation — never again
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        id,
        name,
        key, // Shown only once
        scopes,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
      },
      warning: "Save this API key securely. It will not be shown again.",
    });
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: "Failed to generate API key" });
  }
});

export const integrationRouter = router;
