// Pricing Engine — scheduled promotional pricing rules layered on top of the
// base catalog/admin product prices (which remain edited via the existing
// Inventory → Products tab). This module only manages time-boxed discount
// rules (flash sales, category-wide promos) and a change-history log; it
// never mutates StoredProduct.price directly, so it can't conflict with the
// existing product editor.
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";

export type DiscountType = "percent" | "flat";
export type RuleScope = "all" | "category" | "product";

export interface PriceRule {
  id: string;
  name: string;
  scope: RuleScope;
  target?: string; // category name or product id, depending on scope
  discountType: DiscountType;
  value: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
}

export interface PriceHistoryEntry {
  id: string;
  ruleId: string;
  ruleName: string;
  action: "created" | "activated" | "expired" | "disabled" | "deleted";
  at: string;
}

interface PricingDB {
  rules: PriceRule[];
  history: PriceHistoryEntry[];
}

const store = createFileStore<PricingDB>("admin-pricing.json", () => ({ rules: [], history: [] }));

function log(ruleId: string, ruleName: string, action: PriceHistoryEntry["action"]) {
  store.mutate((db) => {
    db.history.unshift({ id: shortId("ph"), ruleId, ruleName, action, at: new Date().toISOString() });
    db.history = db.history.slice(0, 500);
  });
}

export function listRules(): PriceRule[] {
  return [...store.read().rules].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listHistory(limit = 100): PriceHistoryEntry[] {
  return store.read().history.slice(0, limit);
}

export function upsertRule(input: Partial<PriceRule> & { name: string; scope: RuleScope; discountType: DiscountType; value: number; startsAt: string; endsAt: string }, createdBy: string): PriceRule {
  const wasUpdate = !!input.id && store.read().rules.some((r) => r.id === input.id);
  const rule = store.mutate((db) => {
    const existing = input.id ? db.rules.find((r) => r.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, input);
      return existing;
    }
    const created: PriceRule = {
      id: shortId("rule"),
      name: input.name,
      scope: input.scope,
      target: input.target,
      discountType: input.discountType,
      value: input.value,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      active: input.active ?? true,
      createdAt: new Date().toISOString(),
      createdBy,
    };
    db.rules.unshift(created);
    return created;
  });
  // Logged outside the mutate() callback — log() performs its own store.mutate
  // call, and this store's mutate() is not re-entrant.
  if (!wasUpdate) log(rule.id, rule.name, "created");
  return rule;
}

export function toggleRule(id: string, active: boolean): PriceRule | null {
  const result = store.mutate((db) => {
    const r = db.rules.find((x) => x.id === id);
    if (!r) return null;
    r.active = active;
    return r;
  });
  if (result) log(result.id, result.name, active ? "activated" : "disabled");
  return result;
}

export function deleteRule(id: string): boolean {
  const rule = store.read().rules.find((r) => r.id === id);
  const ok = store.mutate((db) => {
    const before = db.rules.length;
    db.rules = db.rules.filter((r) => r.id !== id);
    return db.rules.length < before;
  });
  if (ok && rule) log(rule.id, rule.name, "deleted");
  return ok;
}

function isRuleLiveNow(r: PriceRule): boolean {
  if (!r.active) return false;
  const now = Date.now();
  return now >= new Date(r.startsAt).getTime() && now <= new Date(r.endsAt).getTime();
}

export function activeRulesNow(): PriceRule[] {
  return store.read().rules.filter(isRuleLiveNow);
}

/** Applies the best matching live rule (largest discount wins) to a base price. */
export function computeEffectivePrice(productId: string, category: string, basePrice: number): { price: number; rule: PriceRule | null; discountPct: number } {
  const candidates = activeRulesNow().filter(
    (r) => r.scope === "all" || (r.scope === "category" && r.target === category) || (r.scope === "product" && r.target === productId)
  );
  let best: { price: number; rule: PriceRule } | null = null;
  for (const r of candidates) {
    const price = r.discountType === "percent" ? basePrice * (1 - r.value / 100) : Math.max(0, basePrice - r.value);
    if (!best || price < best.price) best = { price: Math.round(price * 100) / 100, rule: r };
  }
  return best ? { price: best.price, rule: best.rule, discountPct: Math.round((1 - best.price / basePrice) * 100) } : { price: basePrice, rule: null, discountPct: 0 };
}

export function pricingStats(): { totalRules: number; liveNow: number; upcoming: number } {
  const rules = store.read().rules;
  const now = Date.now();
  return {
    totalRules: rules.length,
    liveNow: rules.filter(isRuleLiveNow).length,
    upcoming: rules.filter((r) => r.active && new Date(r.startsAt).getTime() > now).length,
  };
}
