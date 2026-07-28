// Subscriptions & Membership — "Circuvent+" style recurring plans, subscriber
// lifecycle, and an MRR (monthly recurring revenue) rollup. Independent of
// the one-time-purchase shop checkout; a future checkout integration could
// call `upsertSubscriber` on successful payment, but that wiring is left out
// here to avoid touching the existing checkout/payment routes.
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";

export interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  active: boolean;
  createdAt: string;
}

export type SubscriberStatus = "trialing" | "active" | "paused" | "cancelled";
export type BillingCycle = "monthly" | "yearly";

export interface Subscriber {
  id: string;
  email: string;
  planId: string;
  status: SubscriberStatus;
  billingCycle: BillingCycle;
  startedAt: string;
  renewsAt: string;
  cancelledAt?: string;
}

interface SubscriptionsDB {
  plans: Plan[];
  subscribers: Subscriber[];
}

const store = createFileStore<SubscriptionsDB>("admin-subscriptions.json", () => ({ plans: [], subscribers: [] }));

export function listPlans(): Plan[] {
  return store.read().plans;
}

export function upsertPlan(input: Partial<Plan> & { name: string; priceMonthly: number; priceYearly: number }): Plan {
  return store.mutate((db) => {
    const existing = input.id ? db.plans.find((p) => p.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, input);
      return existing;
    }
    const created: Plan = {
      id: shortId("plan"),
      name: input.name,
      priceMonthly: input.priceMonthly,
      priceYearly: input.priceYearly,
      features: input.features || [],
      active: input.active ?? true,
      createdAt: new Date().toISOString(),
    };
    db.plans.unshift(created);
    return created;
  });
}

export function deletePlan(id: string): boolean {
  return store.mutate((db) => {
    const before = db.plans.length;
    db.plans = db.plans.filter((p) => p.id !== id);
    return db.plans.length < before;
  });
}

export function listSubscribers(): Subscriber[] {
  return [...store.read().subscribers].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function addInterval(iso: string, cycle: BillingCycle): string {
  const d = new Date(iso);
  if (cycle === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

export function upsertSubscriber(input: { email: string; planId: string; billingCycle: BillingCycle; status?: SubscriberStatus }): Subscriber {
  return store.mutate((db) => {
    const existing = db.subscribers.find((s) => s.email.toLowerCase() === input.email.toLowerCase());
    const now = new Date().toISOString();
    if (existing) {
      existing.planId = input.planId;
      existing.billingCycle = input.billingCycle;
      existing.status = input.status || existing.status;
      return existing;
    }
    const created: Subscriber = {
      id: shortId("sub"),
      email: input.email.toLowerCase(),
      planId: input.planId,
      billingCycle: input.billingCycle,
      status: input.status || "trialing",
      startedAt: now,
      renewsAt: addInterval(now, input.billingCycle),
    };
    db.subscribers.unshift(created);
    return created;
  });
}

export function cancelSubscriber(id: string): Subscriber | null {
  return store.mutate((db) => {
    const s = db.subscribers.find((x) => x.id === id);
    if (!s) return null;
    s.status = "cancelled";
    s.cancelledAt = new Date().toISOString();
    return s;
  });
}

export function mrr(): number {
  const { plans, subscribers } = store.read();
  const planById = new Map(plans.map((p) => [p.id, p]));
  return subscribers
    .filter((s) => s.status === "active" || s.status === "trialing")
    .reduce((sum, s) => {
      const plan = planById.get(s.planId);
      if (!plan) return sum;
      return sum + (s.billingCycle === "monthly" ? plan.priceMonthly : plan.priceYearly / 12);
    }, 0);
}

export function subscriptionStats(): { plans: number; activeSubscribers: number; mrr: number; churned: number } {
  const subs = store.read().subscribers;
  return {
    plans: store.read().plans.length,
    activeSubscribers: subs.filter((s) => s.status === "active" || s.status === "trialing").length,
    mrr: Math.round(mrr()),
    churned: subs.filter((s) => s.status === "cancelled").length,
  };
}
