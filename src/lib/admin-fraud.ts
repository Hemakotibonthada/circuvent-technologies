// Fraud & Risk Center — heuristic order-risk scoring, a manual review queue,
// and an email/phone/pincode blocklist. Reuses the existing `listOrders()`
// accessor from store.ts (read-only) so it never duplicates order storage;
// review decisions and the blocklist live in their own small file store.
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";
import { listOrders, type StoredOrder } from "./store";

export interface RiskSettings {
  highValueThreshold: number;
  velocityWindowMinutes: number;
  velocityCount: number;
  newAccountHours: number;
}

export type ReviewDecisionType = "cleared" | "blocked";

export interface ReviewDecision {
  orderNo: string;
  decision: ReviewDecisionType;
  note?: string;
  reviewedBy: string;
  at: string;
}

export type BlocklistType = "email" | "phone" | "pincode";

export interface BlocklistEntry {
  id: string;
  type: BlocklistType;
  value: string;
  reason: string;
  addedAt: string;
}

interface FraudDB {
  settings: RiskSettings;
  reviews: ReviewDecision[];
  blocklist: BlocklistEntry[];
}

const defaultSettings: RiskSettings = {
  highValueThreshold: 15000,
  velocityWindowMinutes: 60,
  velocityCount: 3,
  newAccountHours: 2,
};

const store = createFileStore<FraudDB>("admin-fraud.json", () => ({ settings: { ...defaultSettings }, reviews: [], blocklist: [] }));

export function getSettings(): RiskSettings {
  return store.read().settings;
}

export function updateSettings(patch: Partial<RiskSettings>): RiskSettings {
  return store.mutate((db) => {
    db.settings = { ...db.settings, ...patch };
    return db.settings;
  });
}

export function listBlocklist(): BlocklistEntry[] {
  return store.read().blocklist;
}

export function addBlocklistEntry(type: BlocklistType, value: string, reason: string): BlocklistEntry {
  return store.mutate((db) => {
    const entry: BlocklistEntry = { id: shortId("blk"), type, value: value.trim().toLowerCase(), reason, addedAt: new Date().toISOString() };
    db.blocklist.unshift(entry);
    return entry;
  });
}

export function removeBlocklistEntry(id: string): boolean {
  return store.mutate((db) => {
    const before = db.blocklist.length;
    db.blocklist = db.blocklist.filter((b) => b.id !== id);
    return db.blocklist.length < before;
  });
}

export function listReviews(): ReviewDecision[] {
  return store.read().reviews;
}

export function decideOrder(orderNo: string, decision: ReviewDecisionType, reviewedBy: string, note?: string): ReviewDecision {
  return store.mutate((db) => {
    db.reviews = db.reviews.filter((r) => r.orderNo !== orderNo);
    const entry: ReviewDecision = { orderNo, decision, note, reviewedBy, at: new Date().toISOString() };
    db.reviews.unshift(entry);
    return entry;
  });
}

export interface FlaggedOrder {
  orderNo: string;
  email: string;
  name: string;
  total: number;
  placedAt: string;
  riskScore: number;
  reasons: string[];
  review?: ReviewDecision;
}

/** Computes a heuristic risk score (0-100) for every order in the given window. */
export function computeFlaggedOrders(daysBack = 30): FlaggedOrder[] {
  const { settings, blocklist, reviews } = store.read();
  const cutoff = Date.now() - daysBack * 86_400_000;
  const orders = listOrders().filter((o) => new Date(o.placedAt).getTime() >= cutoff);
  const blockedEmails = new Set(blocklist.filter((b) => b.type === "email").map((b) => b.value));
  const blockedPhones = new Set(blocklist.filter((b) => b.type === "phone").map((b) => b.value));
  const blockedPincodes = new Set(blocklist.filter((b) => b.type === "pincode").map((b) => b.value));

  // Velocity: count of orders from the same email within the rolling window.
  const byEmail = new Map<string, StoredOrder[]>();
  for (const o of orders) {
    const email = (o.customer.email || "").toLowerCase();
    if (!email) continue;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email)!.push(o);
  }

  const flagged: FlaggedOrder[] = [];
  for (const o of orders) {
    const email = (o.customer.email || "").toLowerCase();
    const phone = (o.customer.phone || "").toLowerCase();
    const pincode = (o.customer.pincode || "").toLowerCase();
    const reasons: string[] = [];
    let score = 0;

    if (o.total >= settings.highValueThreshold) {
      reasons.push(`High value order (₹${o.total.toFixed(0)})`);
      score += 30;
    }
    const windowMs = settings.velocityWindowMinutes * 60_000;
    const recentFromSameEmail = (byEmail.get(email) || []).filter(
      (x) => Math.abs(new Date(x.placedAt).getTime() - new Date(o.placedAt).getTime()) <= windowMs
    );
    if (recentFromSameEmail.length >= settings.velocityCount) {
      reasons.push(`${recentFromSameEmail.length} orders within ${settings.velocityWindowMinutes} min`);
      score += 25;
    }
    if (o.paymentMethod !== "cod" && o.paymentStatus !== "paid") {
      reasons.push("Non-COD order without confirmed payment");
      score += 15;
    }
    if (blockedEmails.has(email) || blockedPhones.has(phone) || blockedPincodes.has(pincode)) {
      reasons.push("Matches blocklist entry");
      score += 50;
    }
    if (reasons.length === 0) continue;

    flagged.push({
      orderNo: o.orderNo,
      email: o.customer.email || "",
      name: o.customer.name || "",
      total: o.total,
      placedAt: o.placedAt,
      riskScore: Math.min(100, score),
      reasons,
      review: reviews.find((r) => r.orderNo === o.orderNo),
    });
  }

  return flagged.sort((a, b) => b.riskScore - a.riskScore);
}

export function fraudStats(): { flagged: number; pendingReview: number; blockedCount: number; blocklistSize: number } {
  const flagged = computeFlaggedOrders();
  return {
    flagged: flagged.length,
    pendingReview: flagged.filter((f) => !f.review).length,
    blockedCount: flagged.filter((f) => f.review?.decision === "blocked").length,
    blocklistSize: store.read().blocklist.length,
  };
}
