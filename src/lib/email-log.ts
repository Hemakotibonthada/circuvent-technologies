// Email evidence log — records EVERY outbound email for audit / compliance.
// When DATABASE_URL is set, rows go to the durable `email_history` table
// (see db.ts). Otherwise they append to a local JSONL file so nothing is lost
// in local dev. All writes are best-effort and never throw into the mail path.
// SERVER ONLY.

import { promises as fs } from "fs";
import path from "path";
import { dbEnabled } from "./db";
import type { EmailRecord, EmailHistoryRow, EmailQuery } from "./db";

export type { EmailRecord, EmailHistoryRow, EmailQuery } from "./db";

const FILE = path.join(process.cwd(), ".data", "email-history.jsonl");

/** Persists one email to the evidence log. Never throws. */
export async function recordEmail(e: EmailRecord): Promise<void> {
  try {
    console.info("[email]", JSON.stringify({ to: e.to, type: e.type ?? "other", status: e.status ?? "sent", provider: e.provider, subject: e.subject, messageId: e.messageId, error: e.error }));
  } catch { /* ignore */ }
  try {
    if (dbEnabled()) {
      const { dbLogEmail } = await import("./db");
      await dbLogEmail(e);
    } else {
      await fileAppend(e);
    }
  } catch (err) {
    console.error("recordEmail failed:", err);
  }
}

export async function listEmailHistory(opts: EmailQuery = {}): Promise<EmailHistoryRow[]> {
  if (dbEnabled()) {
    const { dbListEmailHistory } = await import("./db");
    return dbListEmailHistory(opts);
  }
  return fileList(opts);
}

export async function countEmailHistory(opts: EmailQuery = {}): Promise<{ total: number; sent: number; failed: number }> {
  if (dbEnabled()) {
    const { dbCountEmailHistory } = await import("./db");
    return dbCountEmailHistory(opts);
  }
  const f = applyFilter(await fileReadAll(), opts);
  return { total: f.length, sent: f.filter((r) => r.status === "sent").length, failed: f.filter((r) => r.status === "failed").length };
}

// ------------------------------------------------ local-dev JSONL fallback ---
let seq = 0;
async function fileAppend(e: EmailRecord): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const row: EmailHistoryRow = {
    id: Date.now() * 1000 + (seq++ % 1000),
    created_at: new Date().toISOString(),
    to: e.to,
    from_addr: e.from ?? null,
    reply_to: e.replyTo ?? null,
    cc: e.cc ?? null,
    subject: e.subject ?? null,
    type: e.type ?? "other",
    status: e.status ?? "sent",
    provider: e.provider ?? null,
    message_id: e.messageId ?? null,
    error: e.error ?? null,
    related: e.related ?? null,
    body_html: e.bodyHtml ?? null,
    meta: e.meta ?? null,
  };
  await fs.appendFile(FILE, JSON.stringify(row) + "\n", "utf8");
}

async function fileReadAll(): Promise<EmailHistoryRow[]> {
  try {
    const txt = await fs.readFile(FILE, "utf8");
    return txt.split("\n").filter(Boolean).map((l) => JSON.parse(l) as EmailHistoryRow);
  } catch { return []; }
}

function applyFilter(rows: EmailHistoryRow[], opts: EmailQuery): EmailHistoryRow[] {
  let r = rows;
  if (opts.type && opts.type !== "all") r = r.filter((x) => x.type === opts.type);
  if (opts.status && opts.status !== "all") r = r.filter((x) => x.status === opts.status);
  if (opts.q) {
    const s = opts.q.toLowerCase();
    r = r.filter((x) => (x.to || "").toLowerCase().includes(s) || (x.subject || "").toLowerCase().includes(s) || (x.related || "").toLowerCase().includes(s));
  }
  return r;
}

async function fileList(opts: EmailQuery): Promise<EmailHistoryRow[]> {
  const f = applyFilter(await fileReadAll(), opts).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
  return f.slice(offset, offset + limit);
}
