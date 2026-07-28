// Server-side persistence for platform-admin configuration that the Circuvent
// control plane does not own.
//
// Devices, users, telemetry, events, automations and OTA all live in the control
// plane and are read straight from it. What remains — operator API keys,
// outbound webhooks, third-party integrations, feature flags, the firmware
// catalogue, PKI certificate records, alert channels and saved dashboards — has
// no upstream endpoint, so it is persisted here on disk instead of being
// invented client-side by a random-number generator.
//
// Every mutation is appended to a real audit log, so /smarthome/admin/access
// shows what operators actually did rather than a generated history.
//
// SERVER ONLY — imported exclusively by /api/smarthome/admin/config.

import { createFileStore, shortId } from "./data-file";

export const COLLECTIONS = [
  "api-keys",
  "webhooks",
  "integrations",
  "feature-flags",
  "firmware",
  "certificates",
  "alert-channels",
  "dashboards",
  "retention",
] as const;

export type Collection = (typeof COLLECTIONS)[number];

export function isCollection(v: string): v is Collection {
  return (COLLECTIONS as readonly string[]).includes(v);
}

export interface AdminRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  [key: string]: unknown;
}

export interface AuditEntry {
  id: string;
  ts: string;
  actor: string;
  action: "create" | "update" | "delete";
  collection: Collection;
  target: string;
  summary: string;
}

interface ConfigDb {
  collections: Record<string, AdminRecord[]>;
  audit: AuditEntry[];
}

const AUDIT_LIMIT = 500;

const store = createFileStore<ConfigDb>("smarthome-admin-config.json", () => ({
  collections: Object.fromEntries(COLLECTIONS.map((c) => [c, [] as AdminRecord[]])),
  audit: [],
}));

function ensure(db: ConfigDb, collection: Collection): AdminRecord[] {
  if (!db.collections[collection]) db.collections[collection] = [];
  return db.collections[collection];
}

function audit(db: ConfigDb, entry: Omit<AuditEntry, "id" | "ts">): void {
  db.audit.unshift({ id: shortId("aud"), ts: new Date().toISOString(), ...entry });
  if (db.audit.length > AUDIT_LIMIT) db.audit.length = AUDIT_LIMIT;
}

function label(rec: AdminRecord): string {
  return String(rec.name ?? rec.label ?? rec.version ?? rec.url ?? rec.id);
}

export function listRecords(collection: Collection): AdminRecord[] {
  return store.read().collections[collection] ?? [];
}

export function listAudit(limit = 100): AuditEntry[] {
  return store.read().audit.slice(0, limit);
}

export function createRecord(collection: Collection, actor: string, body: Record<string, unknown>): AdminRecord {
  return store.mutate((db) => {
    const now = new Date().toISOString();
    const { id: _ignored, ...fields } = body;
    void _ignored;
    const rec: AdminRecord = {
      ...fields,
      id: shortId(collection.replace(/-/g, "").slice(0, 4)),
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
    };
    ensure(db, collection).unshift(rec);
    audit(db, { actor, action: "create", collection, target: rec.id, summary: `created ${label(rec)}` });
    return rec;
  });
}

export function updateRecord(
  collection: Collection,
  actor: string,
  id: string,
  patch: Record<string, unknown>
): AdminRecord | null {
  return store.mutate((db) => {
    const rows = ensure(db, collection);
    const i = rows.findIndex((r) => r.id === id);
    if (i === -1) return null;
    const { id: _ignored, createdAt, createdBy, ...fields } = patch;
    void _ignored; void createdAt; void createdBy;
    rows[i] = { ...rows[i], ...fields, updatedAt: new Date().toISOString() };
    audit(db, { actor, action: "update", collection, target: id, summary: `updated ${label(rows[i])}` });
    return rows[i];
  });
}

export function deleteRecord(collection: Collection, actor: string, id: string): boolean {
  return store.mutate((db) => {
    const rows = ensure(db, collection);
    const i = rows.findIndex((r) => r.id === id);
    if (i === -1) return false;
    const [gone] = rows.splice(i, 1);
    audit(db, { actor, action: "delete", collection, target: id, summary: `deleted ${label(gone)}` });
    return true;
  });
}

/** True when this instance can persist to disk (false on read-only serverless). */
export function isDurable(): boolean {
  return store.isDurable();
}

// ------------------------------------------------------------------- auth ----

const CONTROL_PLANE = process.env.NEXT_PUBLIC_CONTROL_PLANE_URL || "https://api.circuvent.com";

export interface Operator {
  email: string;
  admin: boolean;
}

/**
 * Verifies the caller by replaying their control-plane bearer token against
 * `/admin/me`. We deliberately do not mint our own admin session: the control
 * plane stays the single source of truth for who is an operator.
 */
export async function verifyOperator(request: Request): Promise<Operator | null> {
  const auth = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(auth)) return null;
  try {
    const res = await fetch(`${CONTROL_PLANE}/admin/me`, {
      headers: { authorization: auth },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { admin?: boolean; email?: string; user?: { email?: string } };
    if (!data?.admin) return null;
    return { email: data.email ?? data.user?.email ?? "operator", admin: true };
  } catch {
    return null;
  }
}
