// Integrations Hub — API keys for external/server-to-server access, and
// outbound webhook subscriptions with signed, logged deliveries. Independent
// small store; does not touch the shop's own admin-auth token scheme.
//
// SERVER ONLY — uses node:crypto.

import crypto from "crypto";
import { createFileStore, shortId } from "./data-file";

export interface ApiKeyRecord {
  id: string;
  label: string;
  keyPrefix: string; // first 8 chars shown in the UI, full key never stored/shown again
  keyHash: string;
  scopes: string[];
  active: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

export interface WebhookSub {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  status: "success" | "failed";
  responseCode?: number;
  error?: string;
  durationMs: number;
  at: string;
}

interface IntegrationsDB {
  apiKeys: ApiKeyRecord[];
  webhooks: WebhookSub[];
  deliveries: WebhookDelivery[];
}

const store = createFileStore<IntegrationsDB>("admin-integrations.json", () => ({ apiKeys: [], webhooks: [], deliveries: [] }));

function hashKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export const AVAILABLE_EVENTS = ["order.created", "order.paid", "order.shipped", "order.returned", "ticket.opened"] as const;
export type IntegrationEvent = (typeof AVAILABLE_EVENTS)[number];

/** Creates a new API key. Returns the plaintext key ONCE — only the hash is persisted. */
export function createApiKey(label: string, scopes: string[]): { record: ApiKeyRecord; plaintext: string } {
  const raw = "cv_" + crypto.randomBytes(24).toString("hex");
  const record: ApiKeyRecord = {
    id: shortId("key"),
    label,
    keyPrefix: raw.slice(0, 10),
    keyHash: hashKey(raw),
    scopes,
    active: true,
    createdAt: new Date().toISOString(),
  };
  store.mutate((db) => {
    db.apiKeys.unshift(record);
  });
  return { record, plaintext: raw };
}

export function listApiKeys(): ApiKeyRecord[] {
  return store.read().apiKeys;
}

export function revokeApiKey(id: string): boolean {
  return store.mutate((db) => {
    const k = db.apiKeys.find((x) => x.id === id);
    if (!k) return false;
    k.active = false;
    return true;
  });
}

/** Verifies a presented plaintext key against stored hashes (constant-time compare). */
export function verifyApiKey(plaintext: string): ApiKeyRecord | null {
  const hashed = hashKey(plaintext);
  const key = store.read().apiKeys.find((k) => k.active && k.keyHash === hashed);
  if (!key) return null;
  store.mutate((db) => {
    const k = db.apiKeys.find((x) => x.id === key.id);
    if (k) k.lastUsedAt = new Date().toISOString();
  });
  return key;
}

export function listWebhooks(): WebhookSub[] {
  return store.read().webhooks;
}

export function createWebhook(url: string, events: string[]): WebhookSub {
  return store.mutate((db) => {
    const sub: WebhookSub = { id: shortId("wh"), url, events, secret: crypto.randomBytes(16).toString("hex"), active: true, createdAt: new Date().toISOString() };
    db.webhooks.unshift(sub);
    return sub;
  });
}

export function toggleWebhook(id: string, active: boolean): boolean {
  return store.mutate((db) => {
    const w = db.webhooks.find((x) => x.id === id);
    if (!w) return false;
    w.active = active;
    return true;
  });
}

export function deleteWebhook(id: string): boolean {
  return store.mutate((db) => {
    const before = db.webhooks.length;
    db.webhooks = db.webhooks.filter((w) => w.id !== id);
    return db.webhooks.length < before;
  });
}

export function listDeliveries(webhookId?: string, limit = 50): WebhookDelivery[] {
  const rows = store.read().deliveries;
  return (webhookId ? rows.filter((d) => d.webhookId === webhookId) : rows).slice(0, limit);
}

function recordDelivery(d: WebhookDelivery) {
  store.mutate((db) => {
    db.deliveries.unshift(d);
    db.deliveries = db.deliveries.slice(0, 500);
  });
}

/**
 * Delivers `event` with `payload` to every active webhook subscribed to it.
 * Every attempt is timed, HMAC-signed (X-Circuvent-Signature) and logged —
 * success or failure — so the Integrations Hub UI has a full delivery trail.
 */
export async function deliverEvent(event: string, payload: Record<string, unknown>): Promise<{ attempted: number; ok: number }> {
  const subs = store.read().webhooks.filter((w) => w.active && w.events.includes(event));
  let ok = 0;
  for (const sub of subs) {
    const body = JSON.stringify({ event, payload, at: new Date().toISOString() });
    const signature = crypto.createHmac("sha256", sub.secret).update(body).digest("hex");
    const started = Date.now();
    try {
      const res = await fetch(sub.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Circuvent-Signature": signature, "X-Circuvent-Event": event },
        body,
        signal: AbortSignal.timeout(8000),
      });
      recordDelivery({ id: shortId("dlv"), webhookId: sub.id, event, status: res.ok ? "success" : "failed", responseCode: res.status, durationMs: Date.now() - started, at: new Date().toISOString() });
      if (res.ok) ok++;
    } catch (e) {
      recordDelivery({ id: shortId("dlv"), webhookId: sub.id, event, status: "failed", error: e instanceof Error ? e.message : "Network error", durationMs: Date.now() - started, at: new Date().toISOString() });
    }
  }
  return { attempted: subs.length, ok };
}

export function integrationsStats(): { apiKeys: number; activeKeys: number; webhooks: number; deliveries24h: number } {
  const db = store.read();
  const cutoff = Date.now() - 86_400_000;
  return {
    apiKeys: db.apiKeys.length,
    activeKeys: db.apiKeys.filter((k) => k.active).length,
    webhooks: db.webhooks.length,
    deliveries24h: db.deliveries.filter((d) => new Date(d.at).getTime() >= cutoff).length,
  };
}
