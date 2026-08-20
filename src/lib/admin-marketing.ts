// Marketing Center — customer segments, email campaigns and checkout
// (abandoned cart) recovery. Built entirely on top of the existing shop
// store's read accessors (listCustomers, listOrders) and the existing mail
// pipeline (sendMail — which already logs to the shared email evidence log
// used by EmailsPanel), so campaign sends show up in the same audit trail as
// every other outbound email instead of creating a second, disconnected log.
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";
import { listCustomers, listOrders, type CustomerView, type StoredOrder } from "./store";
import { sendMail } from "./order-core";

export interface SegmentRules {
  minSpend?: number;
  maxSpend?: number;
  minOrders?: number;
  maxOrders?: number;
  inactiveDays?: number; // no order placed in the last N days (0 orders counts as inactive)
  includeBlocked?: boolean;
}

export interface Segment {
  id: string;
  name: string;
  description?: string;
  rules: SegmentRules;
  createdAt: string;
}

export type CampaignStatus = "draft" | "sending" | "sent";

export interface CampaignStats {
  recipients: number;
  delivered: number;
  failed: number;
}

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  segmentId?: string;
  status: CampaignStatus;
  createdAt: string;
  sentAt?: string;
  stats: CampaignStats;
}

interface MarketingDB {
  segments: Segment[];
  campaigns: Campaign[];
}

const store = createFileStore<MarketingDB>(
  "admin-marketing.json",
  () => ({ segments: [], campaigns: [] }),
  { durable: true }
);

/** Loads the authoritative copy before a request reads or writes. Every route awaits this first. */
export async function revalidateMarketing(): Promise<void> {
  await store.hydrate();
}

/** Waits for the pending database write to land — awaited before responding, not fired and forgotten. */
export async function flushMarketing(): Promise<void> {
  await store.flush();
}

// ------------------------------------------------------------- segments ----
export function listSegments(): Segment[] {
  return store.read().segments;
}

export function upsertSegment(input: Partial<Segment> & { name: string; rules: SegmentRules }): Segment {
  return store.mutate((db) => {
    const existing = input.id ? db.segments.find((s) => s.id === input.id) : undefined;
    if (existing) {
      existing.name = input.name;
      existing.description = input.description;
      existing.rules = input.rules;
      return existing;
    }
    const created: Segment = {
      id: shortId("seg"),
      name: input.name,
      description: input.description,
      rules: input.rules,
      createdAt: new Date().toISOString(),
    };
    db.segments.unshift(created);
    return created;
  });
}

export function deleteSegment(id: string): boolean {
  return store.mutate((db) => {
    const before = db.segments.length;
    db.segments = db.segments.filter((s) => s.id !== id);
    return db.segments.length < before;
  });
}

function daysSince(iso?: string): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

/** Resolves the live list of customers matching a segment's rules. */
export function resolveSegmentMembers(rules: SegmentRules): CustomerView[] {
  const customers = listCustomers();
  const orders = listOrders();
  const lastOrderByEmail = new Map<string, string>();
  for (const o of orders) {
    const email = (o.customer.email || "").toLowerCase();
    if (!email) continue;
    const prev = lastOrderByEmail.get(email);
    if (!prev || o.placedAt > prev) lastOrderByEmail.set(email, o.placedAt);
  }

  return customers.filter((c) => {
    if (!rules.includeBlocked && c.blocked) return false;
    if (rules.minSpend !== undefined && c.spend < rules.minSpend) return false;
    if (rules.maxSpend !== undefined && c.spend > rules.maxSpend) return false;
    if (rules.minOrders !== undefined && c.orders < rules.minOrders) return false;
    if (rules.maxOrders !== undefined && c.orders > rules.maxOrders) return false;
    if (rules.inactiveDays !== undefined) {
      const last = lastOrderByEmail.get(c.email.toLowerCase());
      if (daysSince(last) < rules.inactiveDays) return false;
    }
    return true;
  });
}

// ------------------------------------------------------------- campaigns ---
export function listCampaigns(): Campaign[] {
  return [...store.read().campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function upsertCampaign(input: Partial<Campaign> & { name: string; subject: string; bodyHtml: string }): Campaign {
  return store.mutate((db) => {
    const existing = input.id ? db.campaigns.find((c) => c.id === input.id) : undefined;
    if (existing && existing.status === "draft") {
      existing.name = input.name;
      existing.subject = input.subject;
      existing.bodyHtml = input.bodyHtml;
      existing.segmentId = input.segmentId;
      return existing;
    }
    const created: Campaign = {
      id: shortId("camp"),
      name: input.name,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      segmentId: input.segmentId,
      status: "draft",
      createdAt: new Date().toISOString(),
      stats: { recipients: 0, delivered: 0, failed: 0 },
    };
    db.campaigns.unshift(created);
    return created;
  });
}

export function deleteCampaign(id: string): boolean {
  return store.mutate((db) => {
    const before = db.campaigns.length;
    db.campaigns = db.campaigns.filter((c) => c.id !== id);
    return db.campaigns.length < before;
  });
}

/** Sends a draft campaign to its resolved segment. Caps recipients defensively. */
export async function sendCampaign(id: string, maxRecipients = 2000): Promise<Campaign | null> {
  const campaign = store.read().campaigns.find((c) => c.id === id);
  if (!campaign || campaign.status !== "draft") return null;

  const segment = campaign.segmentId ? store.read().segments.find((s) => s.id === campaign.segmentId) : undefined;
  const members = segment ? resolveSegmentMembers(segment.rules) : listCustomers();
  const recipients = members.slice(0, maxRecipients);

  store.mutate((db) => {
    const c = db.campaigns.find((x) => x.id === id);
    if (c) c.status = "sending";
  });

  let delivered = 0;
  let failed = 0;
  for (const r of recipients) {
    try {
      const ok = await sendMail(r.email, campaign.subject, campaign.bodyHtml, undefined, { type: "marketing" });
      if (ok) delivered++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return store.mutate((db) => {
    const c = db.campaigns.find((x) => x.id === id);
    if (!c) return null;
    c.status = "sent";
    c.sentAt = new Date().toISOString();
    c.stats = { recipients: recipients.length, delivered, failed };
    return c;
  });
}

// ------------------------------------------------- checkout / cart recovery -
export interface AbandonedCheckout {
  orderNo: string;
  email: string;
  name: string;
  total: number;
  itemsCount: number;
  placedAt: string;
  hoursAgo: number;
}

/**
 * Orders that started checkout but never completed payment (paymentStatus is
 * not "paid") within the given age window — the real, already-tracked signal
 * for cart/checkout abandonment (no new client instrumentation required).
 */
export function abandonedCheckouts(minHours = 1, maxDays = 14): AbandonedCheckout[] {
  const now = Date.now();
  return listOrders()
    .filter((o: StoredOrder) => o.paymentStatus !== "paid" && o.status !== "cancelled")
    .map((o) => ({ o, ageHours: (now - new Date(o.placedAt).getTime()) / 3_600_000 }))
    .filter(({ ageHours }) => ageHours >= minHours && ageHours <= maxDays * 24)
    .map(({ o, ageHours }) => ({
      orderNo: o.orderNo,
      email: o.customer.email || "",
      name: o.customer.name || "there",
      total: o.total,
      itemsCount: o.items.reduce((s, i) => s + i.qty, 0),
      placedAt: o.placedAt,
      hoursAgo: Math.round(ageHours),
    }))
    .filter((c) => !!c.email)
    .sort((a, b) => a.hoursAgo - b.hoursAgo);
}

export async function sendRecoveryEmail(orderNo: string): Promise<boolean> {
  const order = listOrders().find((o) => o.orderNo === orderNo);
  if (!order?.customer.email) return false;
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2>You left something in your cart, ${order.customer.name || "there"}!</h2>
      <p>Your order <strong>${order.orderNo}</strong> (₹${order.total.toFixed(2)}) is still waiting for payment.</p>
      <p>Complete your purchase before it expires — your items are reserved for a limited time.</p>
      <p><a href="https://circuvent.com/track?order=${encodeURIComponent(order.orderNo)}" style="background:#06b6d4;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Complete my order</a></p>
    </div>`;
  return sendMail(order.customer.email, "You left something in your cart", html, undefined, { type: "marketing" });
}

export function marketingStats(): { segments: number; campaigns: number; sent: number; abandoned: number } {
  const db = store.read();
  return {
    segments: db.segments.length,
    campaigns: db.campaigns.length,
    sent: db.campaigns.filter((c) => c.status === "sent").length,
    abandoned: abandonedCheckouts().length,
  };
}
