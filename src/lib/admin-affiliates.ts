// Affiliate Program — professional/influencer affiliates with percentage
// commissions, admin-recorded conversions, and payout requests. This is
// deliberately separate from the existing customer-to-customer "referral"
// program (src/lib/store.ts getOrCreateReferral / REFERRAL_REWARD_AMOUNT),
// which is a flat wallet-credit perk for regular customers. Affiliates here
// are external partners tracked with a commission ledger and payout workflow.
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";

export type AffiliateStatus = "pending" | "approved" | "suspended";
export type PayoutStatus = "requested" | "paid" | "rejected";

export interface Affiliate {
  id: string;
  name: string;
  email: string;
  code: string;
  commissionPct: number;
  status: AffiliateStatus;
  createdAt: string;
}

export interface AffiliateConversion {
  id: string;
  affiliateId: string;
  orderNo: string;
  orderTotal: number;
  commissionAmount: number;
  at: string;
}

export interface PayoutRequest {
  id: string;
  affiliateId: string;
  amount: number;
  status: PayoutStatus;
  requestedAt: string;
  decidedAt?: string;
}

interface AffiliatesDB {
  affiliates: Affiliate[];
  conversions: AffiliateConversion[];
  payouts: PayoutRequest[];
}

const store = createFileStore<AffiliatesDB>("admin-affiliates.json", () => ({ affiliates: [], conversions: [], payouts: [] }), { durable: true });

/** Loads the authoritative copy before a request reads or writes. Every route awaits this first. */
export async function revalidateAffiliates(): Promise<void> {
  await store.hydrate();
}

/** Waits for the pending database write to land — awaited before responding, not fired and forgotten. */
export async function flushAffiliates(): Promise<void> {
  await store.flush();
}

function genCode(name: string): string {
  return (name.replace(/[^a-zA-Z]/g, "").slice(0, 6) || "AFF").toUpperCase() + Math.floor(1000 + Math.random() * 9000);
}

export function listAffiliates(): Affiliate[] {
  return store.read().affiliates;
}

export function upsertAffiliate(input: Partial<Affiliate> & { name: string; email: string; commissionPct: number }): Affiliate {
  return store.mutate((db) => {
    const existing = input.id ? db.affiliates.find((a) => a.id === input.id) : undefined;
    if (existing) {
      existing.name = input.name;
      existing.email = input.email;
      existing.commissionPct = input.commissionPct;
      existing.status = input.status || existing.status;
      return existing;
    }
    const created: Affiliate = {
      id: shortId("aff"),
      name: input.name,
      email: input.email,
      code: genCode(input.name),
      commissionPct: input.commissionPct,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    db.affiliates.unshift(created);
    return created;
  });
}

export function decideAffiliate(id: string, status: AffiliateStatus): Affiliate | null {
  return store.mutate((db) => {
    const a = db.affiliates.find((x) => x.id === id);
    if (!a) return null;
    a.status = status;
    return a;
  });
}

export function recordConversion(affiliateId: string, orderNo: string, orderTotal: number): AffiliateConversion | null {
  return store.mutate((db) => {
    const affiliate = db.affiliates.find((a) => a.id === affiliateId);
    if (!affiliate) return null;
    const conversion: AffiliateConversion = {
      id: shortId("conv"),
      affiliateId,
      orderNo,
      orderTotal,
      commissionAmount: Math.round(orderTotal * (affiliate.commissionPct / 100) * 100) / 100,
      at: new Date().toISOString(),
    };
    db.conversions.unshift(conversion);
    return conversion;
  });
}

export function listConversions(affiliateId?: string): AffiliateConversion[] {
  const rows = store.read().conversions;
  return affiliateId ? rows.filter((c) => c.affiliateId === affiliateId) : rows;
}

export function commissionOwed(affiliateId: string): number {
  const earned = listConversions(affiliateId).reduce((s, c) => s + c.commissionAmount, 0);
  const paid = store
    .read()
    .payouts.filter((p) => p.affiliateId === affiliateId && p.status === "paid")
    .reduce((s, p) => s + p.amount, 0);
  return Math.round((earned - paid) * 100) / 100;
}

export function requestPayout(affiliateId: string, amount: number): PayoutRequest {
  return store.mutate((db) => {
    const req: PayoutRequest = { id: shortId("payout"), affiliateId, amount, status: "requested", requestedAt: new Date().toISOString() };
    db.payouts.unshift(req);
    return req;
  });
}

export function decidePayout(id: string, status: Exclude<PayoutStatus, "requested">): PayoutRequest | null {
  return store.mutate((db) => {
    const p = db.payouts.find((x) => x.id === id);
    if (!p) return null;
    p.status = status;
    p.decidedAt = new Date().toISOString();
    return p;
  });
}

export function listPayouts(affiliateId?: string): PayoutRequest[] {
  const rows = store.read().payouts;
  return affiliateId ? rows.filter((p) => p.affiliateId === affiliateId) : rows;
}

export function affiliateStats(): { total: number; approved: number; pendingPayouts: number; totalCommission: number } {
  const db = store.read();
  return {
    total: db.affiliates.length,
    approved: db.affiliates.filter((a) => a.status === "approved").length,
    pendingPayouts: db.payouts.filter((p) => p.status === "requested").length,
    totalCommission: Math.round(db.conversions.reduce((s, c) => s + c.commissionAmount, 0) * 100) / 100,
  };
}
