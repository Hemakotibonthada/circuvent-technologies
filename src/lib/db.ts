// Durable Postgres persistence for the Circuvent store.
//
// Circuvent runs on Vercel (serverless), where the filesystem is read-only and
// ephemeral, so the file-backed store in `store.ts` cannot persist data there.
// This module gives the store a real, durable, shared database.
//
// - Login-critical entities (customer accounts, staff/admin users, pending
//   sign-ups) get dedicated, typed, indexable tables.
// - The remaining store collections are persisted as JSONB blobs in `store_kv`
//   (one row per collection). They can be promoted to typed tables later without
//   touching application logic ("upgrade path").
//
// The full entity JSON is always stored in each row's `data` column, which is
// the source of truth on read; the extra typed columns exist for querying,
// indexing and inspection in the database console.
//
// Provider: Neon (@neondatabase/serverless) over HTTP — ideal for serverless
// because it needs no long-lived TCP connection. Any standard Postgres URL in
// DATABASE_URL works. When DATABASE_URL is unset, the store falls back to the
// local file/in-memory implementation (see store.ts) so local dev needs no DB.
//
// SERVER ONLY.

import type { DB, Account, AdminUser, PendingRegistration } from "./store";

/** A minimal query interface satisfied by both the Neon driver and PGlite (tests). */
export type QueryFn = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/** Collections persisted as a single JSONB blob row in `store_kv` (key = '_all'). */
export const KV_COLLECTIONS: (keyof DB)[] = [
  "orders",
  "products",
  "wallets",
  "devices",
  "reviews",
  "addresses",
  "notifyRequests",
  "logins",
  "coupons",
  "tickets",
  "returns",
  "audit",
  "loyalty",
  "referrals",
  "referralCodes",
  "giftCards",
  "questions",
  "notifications",
  "passwordResets",
  "admin2fa",
  "alertSettings",
  "contactMessages",
  "consumedPayments",
];

/** Collections with dedicated typed tables (the login/identity core). */
const TYPED_TABLES: Record<string, "accounts" | "adminUsers" | "pending"> = {
  accounts: "accounts",
  admin_users: "adminUsers",
  pending_registrations: "pending",
};let _query: QueryFn | null = null;

/** True when a database is configured (production / any host with DATABASE_URL). */
export function dbEnabled(): boolean {
  return !!process.env.DATABASE_URL;
}

/**
 * Normalises a database host for comparison.
 *
 * Neon exposes the same database on a direct and a pooled endpoint
 * (`ep-x.­…` and `ep-x-pooler.…`), and connection strings differ in their query
 * parameters. Comparing raw strings would miss "same database, different URL",
 * which is exactly the mistake this guards against.
 */
export function normaliseDataHost(urlOrHost: string): string {
  const raw = urlOrHost.trim();
  const host = raw.includes("@")
    ? (raw.match(/@([^/:?]+)/) || [])[1] || ""
    : raw.replace(/^[a-z]+:\/\//i, "").split(/[/:?]/)[0];
  return host.toLowerCase().replace(/-pooler(?=\.)/, "");
}

/**
 * Refuses to open a production database from a non-production deployment.
 *
 * Vercel environment variables are scoped per target, and a variable added to
 * "all environments" silently hands preview builds the production connection
 * string. That is how dev.circuvent.com came to serve real customer accounts,
 * orders and wallet balances — nothing in the code objected, because from the
 * app's point of view it was simply a database.
 *
 * PROD_DATA_HOSTS is a comma-separated list of database hosts that only
 * production may use. It is checked on non-production deployments only, so an
 * incomplete list can never take production down; the worst case is that a
 * host nobody listed goes unguarded. Hosts are not credentials, so the list is
 * safe to set on every target.
 *
 * This throws rather than falling back to the in-memory store: quietly serving
 * an empty shop looks like data loss and hides the misconfiguration.
 */
export function assertNotProductionData(url: string): void {
  const listed = (process.env.PROD_DATA_HOSTS || "")
    .split(",")
    .map((h) => normaliseDataHost(h))
    .filter(Boolean);
  if (listed.length === 0) return;

  const isProduction =
    process.env.VERCEL_ENV === "production" ||
    (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production");
  if (isProduction) return;

  const host = normaliseDataHost(url);
  if (host && listed.includes(host)) {
    throw new Error(
      `Refusing to use the production database (${host}) from a non-production ` +
        "deployment. This environment needs its own DATABASE_URL. " +
        "(Set one for the Preview target, or update PROD_DATA_HOSTS if this " +
        "database is no longer production.)"
    );
  }
}

/** Allows tests to inject a PGlite-backed executor (bypasses the Neon driver). */
export function __setQueryForTests(fn: QueryFn | null): void {
  _query = fn;
  _initPromise = null;
}

/** Lazily builds the Neon HTTP query function. */
async function getQuery(): Promise<QueryFn> {
  if (_query) return _query;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  assertNotProductionData(url);
  const { neon } = await import("@neondatabase/serverless");
  const client = neon(url);
  _query = (text, params = []) =>
    client.query(text, params) as Promise<Record<string, unknown>[]>;
  return _query;
}

const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS accounts (
     email TEXT PRIMARY KEY,
     name TEXT,
     password_hash TEXT,
     password_salt TEXT,
     phone TEXT,
     blocked BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ,
     data JSONB NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS admin_users (
     email TEXT PRIMARY KEY,
     name TEXT,
     role TEXT,
     active BOOLEAN NOT NULL DEFAULT TRUE,
     password_hash TEXT,
     password_salt TEXT,
     created_at TIMESTAMPTZ,
     data JSONB NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS pending_registrations (
     email TEXT PRIMARY KEY,
     name TEXT,
     otp TEXT,
     expires BIGINT,
     attempts INTEGER NOT NULL DEFAULT 0,
     ref TEXT,
     data JSONB NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS store_kv (
     collection TEXT NOT NULL,
     key TEXT NOT NULL DEFAULT '_all',
     data JSONB NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (collection, key)
   )`,
  `CREATE TABLE IF NOT EXISTS email_history (
     id BIGSERIAL PRIMARY KEY,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     "to" TEXT NOT NULL,
     from_addr TEXT,
     reply_to TEXT,
     cc TEXT,
     subject TEXT,
     type TEXT NOT NULL DEFAULT 'other',
     status TEXT NOT NULL DEFAULT 'sent',
     provider TEXT,
     message_id TEXT,
     error TEXT,
     related TEXT,
     body_html TEXT,
     meta JSONB
   )`,
  `CREATE INDEX IF NOT EXISTS accounts_created_idx ON accounts (created_at)`,
  `CREATE INDEX IF NOT EXISTS admin_users_role_idx ON admin_users (role)`,
  `CREATE INDEX IF NOT EXISTS email_history_created_idx ON email_history (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS email_history_type_idx ON email_history (type)`,
  `CREATE INDEX IF NOT EXISTS email_history_to_idx ON email_history ("to")`,
  `CREATE INDEX IF NOT EXISTS email_history_status_idx ON email_history (status)`,
  `CREATE TABLE IF NOT EXISTS request_metrics (
     id BIGSERIAL PRIMARY KEY,
     ts TIMESTAMPTZ NOT NULL DEFAULT now(),
     endpoint TEXT NOT NULL,
     method TEXT,
     status INTEGER,
     ms REAL NOT NULL,
     region TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS request_metrics_ts_idx ON request_metrics (ts DESC)`,
  `CREATE INDEX IF NOT EXISTS request_metrics_endpoint_idx ON request_metrics (endpoint)`,
  // Page views.
  //
  // One row per view. No IP and no cookie id: visitor_hash is a salted digest
  // whose salt rotates daily, so a row cannot be traced to a person and two
  // days of rows cannot be joined into a history of one. See lib/traffic.ts.
  //
  // Raw rows rather than pre-aggregated counters because "top pages last
  // week" and "where did Tuesday's spike come from" are the questions this
  // exists to answer, and a counter cannot be re-cut after the fact. Rows are
  // pruned on a retention window; if the volume ever outgrows that, add a
  // daily rollup table beside this rather than widening the retention.
  `CREATE TABLE IF NOT EXISTS page_views (
     id BIGSERIAL PRIMARY KEY,
     ts TIMESTAMPTZ NOT NULL DEFAULT now(),
     path TEXT NOT NULL,
     visitor_hash TEXT NOT NULL,
     referrer_host TEXT,
     device TEXT NOT NULL DEFAULT 'desktop',
     browser TEXT NOT NULL DEFAULT 'Unknown',
     country TEXT
   )`,
  // Every dashboard query is "since <cutoff>", so ts leads each index.
  `CREATE INDEX IF NOT EXISTS page_views_ts_idx ON page_views (ts DESC)`,
  `CREATE INDEX IF NOT EXISTS page_views_ts_path_idx ON page_views (ts DESC, path)`,
  `CREATE INDEX IF NOT EXISTS page_views_ts_visitor_idx ON page_views (ts DESC, visitor_hash)`,
];

let _initPromise: Promise<void> | null = null;

/** Creates the schema if it does not yet exist (idempotent, runs once). */
export function initDb(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const q = await getQuery();
    for (const stmt of SCHEMA_STATEMENTS) await q(stmt);
  })();
  return _initPromise;
}

// ------------------------------------------------------------- email evidence
// Append-only audit log of every email the platform sends. Kept out of the
// in-memory store hydrate/flush cycle (it can grow large and is write-once), so
// it is written and queried directly against its own table.

export interface EmailRecord {
  to: string;
  from?: string | null;
  replyTo?: string | null;
  cc?: string | null;
  subject?: string | null;
  type?: string;
  status?: string;
  provider?: string | null;
  messageId?: string | null;
  error?: string | null;
  related?: string | null;
  bodyHtml?: string | null;
  meta?: unknown;
}

export interface EmailHistoryRow {
  id: number;
  created_at: string;
  to: string;
  from_addr: string | null;
  reply_to: string | null;
  cc: string | null;
  subject: string | null;
  type: string;
  status: string;
  provider: string | null;
  message_id: string | null;
  error: string | null;
  related: string | null;
  body_html: string | null;
  meta: unknown;
}

export interface EmailQuery { limit?: number; offset?: number; type?: string; status?: string; q?: string }

/** Appends one email to the durable evidence log. */
export async function dbLogEmail(e: EmailRecord): Promise<void> {
  await initDb();
  const q = await getQuery();
  await q(
    `INSERT INTO email_history ("to", from_addr, reply_to, cc, subject, type, status, provider, message_id, error, related, body_html, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
    [
      e.to,
      e.from ?? null,
      e.replyTo ?? null,
      e.cc ?? null,
      e.subject ?? null,
      e.type ?? "other",
      e.status ?? "sent",
      e.provider ?? null,
      e.messageId ?? null,
      e.error ?? null,
      e.related ?? null,
      e.bodyHtml ?? null,
      e.meta === undefined ? null : JSON.stringify(e.meta),
    ]
  );
}

function emailWhere(opts: EmailQuery): { clause: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (opts.type && opts.type !== "all") { params.push(opts.type); conds.push(`type = $${params.length}`); }
  if (opts.status && opts.status !== "all") { params.push(opts.status); conds.push(`status = $${params.length}`); }
  if (opts.q) { params.push(`%${opts.q}%`); const i = params.length; conds.push(`("to" ILIKE $${i} OR subject ILIKE $${i} OR related ILIKE $${i})`); }
  return { clause: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
}

/** Lists email evidence rows, newest first (body included for full evidence). */
export async function dbListEmailHistory(opts: EmailQuery = {}): Promise<EmailHistoryRow[]> {
  await initDb();
  const q = await getQuery();
  const { clause, params } = emailWhere(opts);
  const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
  const offset = Math.max(0, opts.offset ?? 0);
  const rows = await q(
    `SELECT id, created_at, "to", from_addr, reply_to, cc, subject, type, status, provider, message_id, error, related, body_html, meta
     FROM email_history ${clause} ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return rows as unknown as EmailHistoryRow[];
}

export async function dbCountEmailHistory(opts: EmailQuery = {}): Promise<{ total: number; sent: number; failed: number }> {
  await initDb();
  const q = await getQuery();
  const { clause, params } = emailWhere(opts);
  const rows = await q(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
     FROM email_history ${clause}`,
    params
  );
  const r = (rows[0] || {}) as { total?: number; sent?: number; failed?: number };
  return { total: Number(r.total ?? 0), sent: Number(r.sent ?? 0), failed: Number(r.failed ?? 0) };
}

// ------------------------------------------------------------- request metrics
export interface LatencySample { ts: string; endpoint: string; method: string | null; status: number | null; ms: number }

/** Lightweight DB round-trip check used as a live latency probe. */
export async function pingDb(): Promise<void> {
  await initDb();
  const q = await getQuery();
  await q("SELECT 1");
}

/** Batch-appends request latency samples (best-effort caller). */
export async function dbRecordLatency(samples: { endpoint: string; method?: string; status?: number; ms: number; region?: string }[]): Promise<void> {
  if (!samples.length) return;
  await initDb();
  const q = await getQuery();
  const values: string[] = [];
  const params: unknown[] = [];
  samples.forEach((s, i) => {
    const b = i * 5;
    values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`);
    params.push(s.endpoint, s.method ?? null, s.status ?? null, s.ms, s.region ?? null);
  });
  await q(`INSERT INTO request_metrics (endpoint, method, status, ms, region) VALUES ${values.join(",")}`, params);
}

/** Raw latency samples within the last `hours` (newest first, capped). */
export async function dbLatencySamples(hours: number, limit = 5000): Promise<LatencySample[]> {
  await initDb();
  const q = await getQuery();
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const lim = Math.min(20000, Math.max(1, limit));
  const rows = await q(
    `SELECT ts, endpoint, method, status, ms FROM request_metrics WHERE ts > $1 ORDER BY ts DESC LIMIT ${lim}`,
    [cutoff]
  );
  return rows as unknown as LatencySample[];
}

// --------------------------------------------------------------- page views
export interface PageViewInput {
  path: string;
  visitorHash: string;
  referrerHost?: string | null;
  device?: string;
  browser?: string;
  country?: string | null;
}

export interface TrafficPoint {
  bucket: string;
  views: number;
  visitors: number;
}

export interface TrafficBreakdown {
  key: string;
  views: number;
  visitors: number;
}

export interface TrafficSummary {
  views: number;
  visitors: number;
  series: TrafficPoint[];
  topPages: TrafficBreakdown[];
  referrers: TrafficBreakdown[];
  devices: TrafficBreakdown[];
  browsers: TrafficBreakdown[];
}

/** Appends page views. Best-effort — the caller must never block a page on it. */
export async function dbRecordPageViews(views: PageViewInput[]): Promise<void> {
  if (!views.length) return;
  await initDb();
  const q = await getQuery();
  const values: string[] = [];
  const params: unknown[] = [];
  views.forEach((v, i) => {
    const b = i * 6;
    values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`);
    params.push(
      v.path,
      v.visitorHash,
      v.referrerHost ?? null,
      v.device ?? "desktop",
      v.browser ?? "Unknown",
      v.country ?? null
    );
  });
  await q(
    `INSERT INTO page_views (path, visitor_hash, referrer_host, device, browser, country) VALUES ${values.join(",")}`,
    params
  );
}

/**
 * The whole traffic report for a window, in one round-trip per section.
 *
 * `visitors` is a COUNT(DISTINCT visitor_hash), which is a per-day figure by
 * construction: the hash salt rotates at midnight, so the same person on two
 * days counts twice. That is the honest number given we deliberately cannot
 * link a visitor across days, and the dashboard labels it as such rather than
 * implying a de-duplicated monthly audience.
 *
 * Bots are excluded from the headline numbers but still counted, so the panel
 * can show how much of the raw traffic they were.
 */
export async function dbTrafficSummary(days: number, includeBots = false): Promise<TrafficSummary> {
  await initDb();
  const q = await getQuery();
  const d = Math.min(365, Math.max(1, Math.floor(days)));
  const cutoff = new Date(Date.now() - d * 86400_000).toISOString();
  // Hourly buckets for a single day, daily beyond that — a 90-day chart with
  // hourly points is 2160 items nobody can read.
  const gran = d <= 2 ? "hour" : "day";
  const botFilter = includeBots ? "" : ` AND device <> 'bot'`;

  const [totals, series, pages, refs, devices, browsers] = await Promise.all([
    q(`SELECT COUNT(*)::int AS views, COUNT(DISTINCT visitor_hash)::int AS visitors
         FROM page_views WHERE ts > $1${botFilter}`, [cutoff]),
    q(`SELECT date_trunc('${gran}', ts) AS bucket, COUNT(*)::int AS views,
              COUNT(DISTINCT visitor_hash)::int AS visitors
         FROM page_views WHERE ts > $1${botFilter}
         GROUP BY 1 ORDER BY 1`, [cutoff]),
    q(`SELECT path AS key, COUNT(*)::int AS views, COUNT(DISTINCT visitor_hash)::int AS visitors
         FROM page_views WHERE ts > $1${botFilter}
         GROUP BY 1 ORDER BY views DESC LIMIT 20`, [cutoff]),
    q(`SELECT COALESCE(referrer_host,'(direct)') AS key, COUNT(*)::int AS views,
              COUNT(DISTINCT visitor_hash)::int AS visitors
         FROM page_views WHERE ts > $1${botFilter}
         GROUP BY 1 ORDER BY views DESC LIMIT 15`, [cutoff]),
    q(`SELECT device AS key, COUNT(*)::int AS views, COUNT(DISTINCT visitor_hash)::int AS visitors
         FROM page_views WHERE ts > $1
         GROUP BY 1 ORDER BY views DESC`, [cutoff]),
    q(`SELECT browser AS key, COUNT(*)::int AS views, COUNT(DISTINCT visitor_hash)::int AS visitors
         FROM page_views WHERE ts > $1${botFilter}
         GROUP BY 1 ORDER BY views DESC LIMIT 10`, [cutoff]),
  ]);

  const num = (v: unknown) => Number(v) || 0;
  const asBreakdown = (rows: Record<string, unknown>[]): TrafficBreakdown[] =>
    rows.map((r) => ({ key: String(r.key ?? ""), views: num(r.views), visitors: num(r.visitors) }));

  return {
    views: num(totals[0]?.views),
    visitors: num(totals[0]?.visitors),
    series: series.map((r) => ({
      bucket: new Date(r.bucket as string).toISOString(),
      views: num(r.views),
      visitors: num(r.visitors),
    })),
    topPages: asBreakdown(pages),
    referrers: asBreakdown(refs),
    devices: asBreakdown(devices),
    browsers: asBreakdown(browsers),
  };
}

/**
 * Deletes views older than the retention window.
 *
 * Analytics that only ever grows is a liability rather than an asset: the
 * table gets slower, the backups get bigger, and we end up holding behavioural
 * data far longer than anyone will ever look at it.
 */
export async function dbPrunePageViews(retentionDays = 400): Promise<number> {
  await initDb();
  const q = await getQuery();
  const cutoff = new Date(Date.now() - retentionDays * 86400_000).toISOString();
  const rows = await q(`DELETE FROM page_views WHERE ts < $1 RETURNING 1`, [cutoff]);
  return rows.length;
}

function recordFromRows(rows: Record<string, unknown>[]): Record<string, unknown> {  const out: Record<string, unknown> = {};
  for (const r of rows) {
    const data = r.data as { email?: string } | null;
    if (data && data.email) out[data.email] = data;
  }
  return out;
}

/**
 * Reads collections from the database into a partial DB object.
 * @param cols Optional subset of collections to read (defaults to everything).
 */
export async function dbHydrate(cols?: (keyof DB)[]): Promise<Partial<DB>> {
  const q = await getQuery();
  const want = cols ? new Set<string>(cols as string[]) : null;
  const out: Partial<DB> = {};

  if (!want || want.has("accounts")) {
    out.accounts = recordFromRows(await q(`SELECT data FROM accounts`)) as DB["accounts"];
  }
  if (!want || want.has("adminUsers")) {
    out.adminUsers = recordFromRows(await q(`SELECT data FROM admin_users`)) as DB["adminUsers"];
  }
  if (!want || want.has("pending")) {
    out.pending = recordFromRows(await q(`SELECT data FROM pending_registrations`)) as DB["pending"];
  }

  const kvWanted = KV_COLLECTIONS.filter((c) => !want || want.has(c as string));
  if (kvWanted.length) {
    const rows = await q(
      `SELECT collection, data FROM store_kv WHERE key = '_all' AND collection = ANY($1::text[])`,
      [kvWanted as string[]]
    );
    for (const r of rows) {
      (out as Record<string, unknown>)[r.collection as string] = r.data;
    }
  }
  return out;
}

async function mirrorTyped<T extends { email: string }>(
  q: QueryFn,
  table: string,
  rec: Record<string, T> | undefined,
  columns: string[],
  values: (e: T) => unknown[]
): Promise<void> {
  const list = Object.values(rec ?? {});
  const emails = list.map((e) => e.email.toLowerCase());
  // Drop rows that no longer exist in memory so the table mirrors the store.
  if (emails.length) {
    await q(`DELETE FROM ${table} WHERE email <> ALL($1::text[])`, [emails]);
  } else {
    await q(`DELETE FROM ${table}`);
  }
  const allCols = [...columns, "data"];
  const placeholders = allCols
    .map((c, i) => (c === "data" ? `$${i + 1}::jsonb` : `$${i + 1}`))
    .join(", ");
  const updates = allCols
    .filter((c) => c !== "email")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  for (const e of list) {
    await q(
      `INSERT INTO ${table} (${allCols.join(", ")}) VALUES (${placeholders})
       ON CONFLICT (email) DO UPDATE SET ${updates}, updated_at = now()`,
      [...values(e), JSON.stringify(e)]
    );
  }
}

async function upsertKv(q: QueryFn, collection: string, value: unknown): Promise<void> {
  await q(
    `INSERT INTO store_kv (collection, key, data) VALUES ($1, '_all', $2::jsonb)
     ON CONFLICT (collection, key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [collection, JSON.stringify(value ?? null)]
  );
}

/** Persists the given changed collections from `db` to the database. */
export async function dbFlush(db: DB, changed: Iterable<keyof DB>): Promise<void> {
  const q = await getQuery();
  const set = new Set<string>(changed as Iterable<string>);
  const jobs: Promise<void>[] = [];

  if (set.has("accounts")) {
    jobs.push(
      mirrorTyped<Account>(
        q,
        "accounts",
        db.accounts,
        ["email", "name", "password_hash", "password_salt", "phone", "blocked", "created_at"],
        (a) => [
          a.email.toLowerCase(),
          a.name ?? null,
          a.hash,
          a.salt,
          a.phone ?? null,
          !!a.blocked,
          a.createdAt ?? null,
        ]
      )
    );
  }
  if (set.has("adminUsers")) {
    jobs.push(
      mirrorTyped<AdminUser>(
        q,
        "admin_users",
        db.adminUsers,
        ["email", "name", "role", "active", "password_hash", "password_salt", "created_at"],
        (u) => [
          u.email.toLowerCase(),
          u.name ?? null,
          u.role,
          !!u.active,
          u.hash,
          u.salt,
          u.createdAt ?? null,
        ]
      )
    );
  }
  if (set.has("pending")) {
    jobs.push(
      mirrorTyped<PendingRegistration>(
        q,
        "pending_registrations",
        db.pending,
        ["email", "name", "otp", "expires", "attempts", "ref"],
        (p) => [
          p.email.toLowerCase(),
          p.name ?? null,
          p.otp ?? null,
          p.expires ?? null,
          p.attempts ?? 0,
          p.ref ?? null,
        ]
      )
    );
  }
  for (const c of KV_COLLECTIONS) {
    if (set.has(c as string)) {
      jobs.push(upsertKv(q, c as string, (db as unknown as Record<string, unknown>)[c as string]));
    }
  }

  await Promise.all(jobs);
}

/** All collections known to the persistence layer (typed + KV). */
export function allCollections(): (keyof DB)[] {
  return [...(Object.values(TYPED_TABLES) as (keyof DB)[]), ...KV_COLLECTIONS];
}

/**
 * Non-destructive connectivity + schema check for a real database. Creates the
 * schema (idempotent), performs an isolated write/read/delete on a reserved
 * key that the store never reads, and returns row counts. Safe to run against a
 * populated production database.
 */
export async function dbHealthcheck(): Promise<{
  ok: boolean;
  accounts: number;
  admins: number;
  orders: number;
}> {
  await initDb();
  const q = await getQuery();
  await q(
    `INSERT INTO store_kv (collection, key, data) VALUES ('__healthcheck__', 'ping', $1::jsonb)
     ON CONFLICT (collection, key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [JSON.stringify({ at: new Date().toISOString() })]
  );
  const back = await q(`SELECT data FROM store_kv WHERE collection = '__healthcheck__' AND key = 'ping'`);
  await q(`DELETE FROM store_kv WHERE collection = '__healthcheck__'`);
  const h = await dbHydrate(["accounts", "adminUsers", "orders"]);
  return {
    ok: back.length === 1,
    accounts: Object.keys(h.accounts ?? {}).length,
    admins: Object.keys(h.adminUsers ?? {}).length,
    orders: ((h.orders as unknown[]) ?? []).length,
  };
}
