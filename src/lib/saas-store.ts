/**
 * Durable store for SaaS subscriptions and invoices.
 *
 * Uses the same pattern as other WebSite feature modules: in-memory working
 * copy + optional JSON persistence under DATA_DIR. Server only.
 */

import { createFileStore } from "./data-file";

export type SubscriptionStatus =
  | "trial"
  | "active"
  | "past_due"
  | "cancelled"
  | "pending";

export interface SaaSSubscription {
  id: string;
  orgName: string;
  customerEmail: string;
  productSlug: string;
  planId: string;
  planName: string;
  seats: number;
  status: SubscriptionStatus;
  renewsAt: string;
  priceLabel: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaaSInvoice {
  id: string;
  subscriptionId: string;
  customerEmail: string;
  amount: number;
  currency: string;
  status: "paid" | "pending" | "failed" | "void";
  description: string;
  issuedAt: string;
  dueAt: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
}

interface StoreShape {
  subscriptions: SaaSSubscription[];
  invoices: SaaSInvoice[];
}

function seed(): StoreShape {
  return { subscriptions: [], invoices: [] };
}

const store = createFileStore<StoreShape>("saas-store.json", seed, { durable: false });

export function listSubscriptions(): SaaSSubscription[] {
  return store.read().subscriptions.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listInvoices(): SaaSInvoice[] {
  return store.read().invoices.slice().sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

export function findSubscriptionById(id: string): SaaSSubscription | undefined {
  return store.read().subscriptions.find((s) => s.id === id);
}

export function findSubscriptionByEmail(email: string): SaaSSubscription[] {
  const e = email.trim().toLowerCase();
  return store
    .read()
    .subscriptions.filter((s) => s.customerEmail.toLowerCase() === e);
}

export function findInvoicesForSubscription(subscriptionId: string): SaaSInvoice[] {
  return store
    .read()
    .invoices.filter((i) => i.subscriptionId === subscriptionId);
}

export function createSubscription(input: {
  orgName: string;
  customerEmail: string;
  productSlug: string;
  planId: string;
  planName: string;
  seats: number;
  priceLabel: string;
}): SaaSSubscription {
  const now = new Date().toISOString();
  const sub: SaaSSubscription = {
    id: `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    orgName: input.orgName,
    customerEmail: input.customerEmail,
    productSlug: input.productSlug,
    planId: input.planId,
    planName: input.planName,
    seats: input.seats,
    status: "pending",
    renewsAt: now,
    priceLabel: input.priceLabel,
    createdAt: now,
    updatedAt: now,
  };
  store.mutate((d) => {
    d.subscriptions.unshift(sub);
  });
  return sub;
}

export function updateSubscriptionStatus(
  id: string,
  status: SubscriptionStatus
): SaaSSubscription | undefined {
  let result: SaaSSubscription | undefined;
  store.mutate((d) => {
    const row = d.subscriptions.find((s) => s.id === id);
    if (!row) return;
    row.status = status;
    row.updatedAt = new Date().toISOString();
    result = row;
  });
  return result;
}

export function createInvoice(input: {
  subscriptionId: string;
  customerEmail: string;
  amount: number;
  description: string;
  status: SaaSInvoice["status"];
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
}): SaaSInvoice {
  const now = new Date().toISOString();
  const inv: SaaSInvoice = {
    id: `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    subscriptionId: input.subscriptionId,
    customerEmail: input.customerEmail,
    amount: input.amount,
    currency: "INR",
    status: input.status,
    description: input.description,
    issuedAt: now,
    dueAt:
      input.status === "paid"
        ? now
        : new Date(Date.now() + 7 * 86400000).toISOString(),
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
  };
  store.mutate((d) => {
    d.invoices.unshift(inv);
  });
  return inv;
}
