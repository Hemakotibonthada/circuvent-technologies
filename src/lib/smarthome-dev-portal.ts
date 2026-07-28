// Developer Portal (server side) — per-console-user API tokens and outbound
// webhook subscriptions, with a signed + logged delivery mechanism. Mirrors
// the shape of admin-integrations.ts but scoped by console user id (uid),
// since many different homeowners share this one Next.js deployment.
//
// SERVER ONLY — uses node:crypto.

import crypto from "crypto";
import { createFileStore, shortId } from "./data-file";

export interface DevToken {
  id: string;
  uid: number;
  label: string;
  tokenPrefix: string;
  tokenHash: string;
  createdAt: string;
  lastUsedAt?: string;
  active: boolean;
}

export interface DevWebhook {
  id: string;
  uid: number;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: string;
}

export interface DevDelivery {
  id: string;
  webhookId: string;
  event: string;
  status: "success" | "failed";
  responseCode?: number;
  error?: string;
  durationMs: number;
  at: string;
}

interface DevPortalDB {
  tokens: DevToken[];
  webhooks: DevWebhook[];
  deliveries: DevDelivery[];
}

const store = createFileStore<DevPortalDB>("console-dev-portal.json", () => ({ tokens: [], webhooks: [], deliveries: [] }));

export const CONSOLE_EVENTS = ["device.state_changed", "device.offline", "scene.activated", "automation.triggered"] as const;

function hash(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function createToken(uid: number, label: string): { record: DevToken; plaintext: string } {
  const raw = "cvc_" + crypto.randomBytes(24).toString("hex");
  const record: DevToken = {
    id: shortId("tok"),
    uid,
    label,
    tokenPrefix: raw.slice(0, 10),
    tokenHash: hash(raw),
    createdAt: new Date().toISOString(),
    active: true,
  };
  store.mutate((db) => db.tokens.unshift(record));
  return { record, plaintext: raw };
}

export function listTokens(uid: number): DevToken[] {
  return store.read().tokens.filter((t) => t.uid === uid);
}

export function revokeToken(uid: number, id: string): boolean {
  return store.mutate((db) => {
    const t = db.tokens.find((x) => x.id === id && x.uid === uid);
    if (!t) return false;
    t.active = false;
    return true;
  });
}

export function createWebhook(uid: number, url: string, events: string[]): DevWebhook {
  return store.mutate((db) => {
    const webhook: DevWebhook = { id: shortId("whc"), uid, url, events, secret: crypto.randomBytes(16).toString("hex"), active: true, createdAt: new Date().toISOString() };
    db.webhooks.unshift(webhook);
    return webhook;
  });
}

export function listWebhooks(uid: number): DevWebhook[] {
  return store.read().webhooks.filter((w) => w.uid === uid);
}

export function toggleWebhook(uid: number, id: string, active: boolean): boolean {
  return store.mutate((db) => {
    const w = db.webhooks.find((x) => x.id === id && x.uid === uid);
    if (!w) return false;
    w.active = active;
    return true;
  });
}

export function deleteWebhook(uid: number, id: string): boolean {
  return store.mutate((db) => {
    const before = db.webhooks.length;
    db.webhooks = db.webhooks.filter((w) => !(w.id === id && w.uid === uid));
    return db.webhooks.length < before;
  });
}

export function listDeliveries(uid: number, webhookId?: string): DevDelivery[] {
  const ownedIds = new Set(listWebhooks(uid).map((w) => w.id));
  return store
    .read()
    .deliveries.filter((d) => ownedIds.has(d.webhookId) && (!webhookId || d.webhookId === webhookId))
    .slice(0, 50);
}

/** Sends a manually-triggered test payload to one webhook and logs the outcome. */
export async function sendTestEvent(uid: number, webhookId: string, event: string): Promise<DevDelivery | null> {
  const webhook = store.read().webhooks.find((w) => w.id === webhookId && w.uid === uid);
  if (!webhook) return null;
  const body = JSON.stringify({ event, payload: { test: true }, at: new Date().toISOString() });
  const signature = crypto.createHmac("sha256", webhook.secret).update(body).digest("hex");
  const started = Date.now();
  let delivery: DevDelivery;
  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Circuvent-Signature": signature },
      body,
      signal: AbortSignal.timeout(8000),
    });
    delivery = { id: shortId("dvy"), webhookId, event, status: res.ok ? "success" : "failed", responseCode: res.status, durationMs: Date.now() - started, at: new Date().toISOString() };
  } catch (e) {
    delivery = { id: shortId("dvy"), webhookId, event, status: "failed", error: e instanceof Error ? e.message : "Network error", durationMs: Date.now() - started, at: new Date().toISOString() };
  }
  store.mutate((db) => {
    db.deliveries.unshift(delivery);
    db.deliveries = db.deliveries.slice(0, 1000);
  });
  return delivery;
}
