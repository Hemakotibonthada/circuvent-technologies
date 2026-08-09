// Circuvent — scheduled email reports.
//
// Lets an admin subscribe a set of recipients to any report on a daily, weekly
// or monthly cadence. Each schedule is a small persisted record; a cron-driven
// runner (`runDueSchedules`) rebuilds the report from live data at send time —
// so a subscriber always receives real, current figures, never a stale
// snapshot — renders it to HTML with the shared renderer (identical formatting
// to the on-screen report), and emails it via the store's existing mail
// transport. Delivery outcome and timestamp are recorded back onto the record.
//
// The store's `sendMail` has no attachment parameter and order-core is out of
// scope to change, so scheduled reports are delivered as inline HTML tables
// (fully real data); the paginated PDF remains available on demand from the
// Reports panel and the /pdf endpoint.
//
// SERVER ONLY — uses the file store + report engine (which read node:fs).

import { createFileStore, shortId } from "./data-file";
import { buildReport, isReportType, companyInfo, REPORT_CATALOG } from "./reports";
import { reportToHtml } from "./reports-format";
import { sendMail } from "./order-core";

export type ScheduleFrequency = "daily" | "weekly" | "monthly";

export interface ReportSchedule {
  id: string;
  /** Report type id from REPORT_CATALOG (e.g. "sales", "tax"). */
  reportType: string;
  /** Window passed to the report builder at send time. */
  rangeDays: number;
  frequency: ScheduleFrequency;
  recipients: string[];
  enabled: boolean;
  /** Optional label shown in the UI. */
  label?: string;
  createdAt: string;
  updatedAt: string;
  lastSentAt: string | null;
  lastStatus: "ok" | "failed" | "skipped" | null;
  lastError: string | null;
  /** How many consecutive sends have been attempted (diagnostics). */
  sendCount: number;
}

interface ScheduleFile {
  schedules: ReportSchedule[];
}

const store = createFileStore<ScheduleFile>("report-schedules.json", () => ({ schedules: [] }));

const FREQ: ScheduleFrequency[] = ["daily", "weekly", "monthly"];
const DAY_MS = 86_400_000;

export function isFrequency(x: string): x is ScheduleFrequency {
  return (FREQ as string[]).includes(x);
}

function periodMs(freq: ScheduleFrequency): number {
  return freq === "daily" ? DAY_MS : freq === "weekly" ? 7 * DAY_MS : 30 * DAY_MS;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalises + validates a recipient list, de-duplicating case-insensitively. */
export function cleanRecipients(input: unknown): string[] {
  const arr = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[,;\s]+/)
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of arr) {
    const e = String(raw).trim();
    if (!EMAIL_RE.test(e)) continue;
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export function listSchedules(): ReportSchedule[] {
  return store.read().schedules.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getSchedule(id: string): ReportSchedule | null {
  return store.read().schedules.find((s) => s.id === id) ?? null;
}

export interface ScheduleInput {
  reportType: string;
  rangeDays?: number;
  frequency: string;
  recipients: unknown;
  enabled?: boolean;
  label?: string;
}

export interface ScheduleResult {
  ok: boolean;
  error?: string;
  schedule?: ReportSchedule;
}

function validate(input: ScheduleInput): string | null {
  if (!isReportType(input.reportType)) return `Unknown report type "${input.reportType}".`;
  if (!isFrequency(input.frequency)) return `Frequency must be one of ${FREQ.join(", ")}.`;
  if (cleanRecipients(input.recipients).length === 0) return "At least one valid recipient email is required.";
  return null;
}

export function createSchedule(input: ScheduleInput): ScheduleResult {
  const err = validate(input);
  if (err) return { ok: false, error: err };
  const now = new Date().toISOString();
  const schedule: ReportSchedule = {
    id: shortId("sch"),
    reportType: input.reportType,
    rangeDays: clampRange(input.rangeDays),
    frequency: input.frequency as ScheduleFrequency,
    recipients: cleanRecipients(input.recipients),
    enabled: input.enabled !== false,
    label: input.label?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    lastSentAt: null,
    lastStatus: null,
    lastError: null,
    sendCount: 0,
  };
  store.mutate((d) => d.schedules.push(schedule));
  return { ok: true, schedule };
}

export function updateSchedule(id: string, patch: Partial<ScheduleInput>): ScheduleResult {
  const existing = getSchedule(id);
  if (!existing) return { ok: false, error: "Schedule not found." };
  const merged: ScheduleInput = {
    reportType: patch.reportType ?? existing.reportType,
    rangeDays: patch.rangeDays ?? existing.rangeDays,
    frequency: patch.frequency ?? existing.frequency,
    recipients: patch.recipients ?? existing.recipients,
    enabled: patch.enabled ?? existing.enabled,
    label: patch.label ?? existing.label,
  };
  const err = validate(merged);
  if (err) return { ok: false, error: err };
  let updated: ReportSchedule | undefined;
  store.mutate((d) => {
    const s = d.schedules.find((x) => x.id === id);
    if (!s) return;
    s.reportType = merged.reportType;
    s.rangeDays = clampRange(merged.rangeDays);
    s.frequency = merged.frequency as ScheduleFrequency;
    s.recipients = cleanRecipients(merged.recipients);
    s.enabled = merged.enabled !== false;
    s.label = merged.label?.trim() || undefined;
    s.updatedAt = new Date().toISOString();
    updated = s;
  });
  return updated ? { ok: true, schedule: updated } : { ok: false, error: "Schedule not found." };
}

export function deleteSchedule(id: string): boolean {
  let removed = false;
  store.mutate((d) => {
    const before = d.schedules.length;
    d.schedules = d.schedules.filter((s) => s.id !== id);
    removed = d.schedules.length < before;
  });
  return removed;
}

function clampRange(days: number | undefined): number {
  return Math.max(7, Math.min(365, Math.round(days || 30)));
}

/** True when a schedule is enabled and its cadence has elapsed since last send. */
export function isDue(s: ReportSchedule, now = Date.now()): boolean {
  if (!s.enabled) return false;
  if (s.recipients.length === 0) return false;
  if (!s.lastSentAt) return true;
  const last = new Date(s.lastSentAt).getTime();
  if (!isFinite(last)) return true;
  // A 6h grace window means a cron that fires slightly earlier than exactly
  // 24h/7d/30d later still counts the period as elapsed.
  return now - last >= periodMs(s.frequency) - 6 * 3_600_000;
}

export interface SendOutcome {
  id: string;
  reportType: string;
  recipients: string[];
  status: "ok" | "failed" | "skipped";
  error?: string;
}

/**
 * Renders one schedule's report to HTML and emails it to every recipient.
 * Records the outcome (status, timestamp, error) back onto the schedule.
 */
export async function sendSchedule(id: string): Promise<SendOutcome> {
  const schedule = getSchedule(id);
  if (!schedule) return { id, reportType: "?", recipients: [], status: "failed", error: "not found" };
  const co = companyInfo();
  const table = buildReport(schedule.reportType, schedule.rangeDays);
  const html = reportToHtml(table, { name: co.name });
  const rangeLabel = table.snapshot ? "snapshot" : `${schedule.rangeDays}d`;
  const subject = `[${co.name}] ${table.title} (${rangeLabel}) — ${new Date().toLocaleDateString("en-IN")}`;

  let allOk = true;
  let lastError: string | null = null;
  for (const to of schedule.recipients) {
    const ok = await sendMail(to, subject, html, undefined, { type: "report", related: schedule.reportType });
    if (!ok) { allOk = false; lastError = "mail transport failed or not configured"; }
  }

  const status: SendOutcome["status"] = allOk ? "ok" : "failed";
  store.mutate((d) => {
    const s = d.schedules.find((x) => x.id === id);
    if (!s) return;
    s.lastSentAt = new Date().toISOString();
    s.lastStatus = status;
    s.lastError = lastError;
    s.sendCount += 1;
  });
  return { id, reportType: schedule.reportType, recipients: schedule.recipients, status, error: lastError ?? undefined };
}

export interface RunSummary {
  ran: number;
  sent: number;
  failed: number;
  outcomes: SendOutcome[];
}

/** Sends every schedule that is currently due. Used by the cron endpoint. */
export async function runDueSchedules(now = Date.now()): Promise<RunSummary> {
  const due = listSchedules().filter((s) => isDue(s, now));
  const outcomes: SendOutcome[] = [];
  for (const s of due) outcomes.push(await sendSchedule(s.id));
  return {
    ran: outcomes.length,
    sent: outcomes.filter((o) => o.status === "ok").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
    outcomes,
  };
}

/** Report types available to schedule, for the UI dropdown. */
export function schedulableReports(): { id: string; label: string; group: string }[] {
  return REPORT_CATALOG.map((r) => ({ id: r.id, label: r.label, group: r.group }));
}
