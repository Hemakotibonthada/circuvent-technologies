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
];

/** Collections with dedicated typed tables (the login/identity core). */
const TYPED_TABLES: Record<string, "accounts" | "adminUsers" | "pending"> = {
  accounts: "accounts",
  admin_users: "adminUsers",
  pending_registrations: "pending",
};

let _query: QueryFn | null = null;

/** True when a database is configured (production / any host with DATABASE_URL). */
export function dbEnabled(): boolean {
  return !!process.env.DATABASE_URL;
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
  `CREATE INDEX IF NOT EXISTS accounts_created_idx ON accounts (created_at)`,
  `CREATE INDEX IF NOT EXISTS admin_users_role_idx ON admin_users (role)`,
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

function recordFromRows(rows: Record<string, unknown>[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
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
