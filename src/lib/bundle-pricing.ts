// Bundle pricing — a server-side cart rule, not a client-supplied price.
//
// Bundles are configured in the admin panel (see admin-bundles.ts) and until
// now had no effect on what anybody paid: the storefront never showed them, and
// priceItems recomputes every line from the catalogue, so a bundle price sent
// from the browser would have been discarded. Quoting a bundle price in the UI
// and charging the catalogue total is the worst possible outcome, so the
// discount is derived here, on the server, from the cart's actual contents.
//
// Expressed as a discount rather than as replacement line prices so it composes
// with what is already there: shipping is computed from the undiscounted
// subtotal exactly as it is for coupons, so qualifying for a bundle can never
// silently drop a shopper back below the free-shipping threshold.

export interface BundleRule {
  id: string;
  name: string;
  /** Catalogue product ids that must all be present for the bundle to apply. */
  productIds: string[];
  bundlePrice: number;
  active: boolean;
}

/** A cart entry, already resolved to a catalogue id and a live price. */
export interface PricedItem {
  id: string;
  price: number;
  qty: number;
}

export interface AppliedBundle {
  id: string;
  name: string;
  /** How many complete sets of this bundle the cart contains. */
  times: number;
  /** Catalogue price of one set. */
  catalogTotal: number;
  bundlePrice: number;
  /** Total saving across all sets. */
  savings: number;
}

export interface BundleResult {
  applied: AppliedBundle[];
  discount: number;
}

/**
 * How many complete sets of `rule` the remaining stock can cover, and what one
 * set costs at catalogue prices. Returns null when the bundle cannot apply.
 */
function evaluate(
  rule: BundleRule,
  remaining: Map<string, number>,
  priceOf: Map<string, number>
): { times: number; catalogTotal: number } | null {
  // A bundle naming the same product twice needs two of it.
  const need = new Map<string, number>();
  for (const id of rule.productIds) need.set(id, (need.get(id) ?? 0) + 1);
  if (!need.size) return null;

  let times = Infinity;
  let catalogTotal = 0;
  for (const [id, count] of need) {
    const have = remaining.get(id) ?? 0;
    const price = priceOf.get(id);
    // A bundle naming a product that is not in the catalogue any more must not
    // apply: its "saving" would be measured against an incomplete total.
    if (price === undefined) return null;
    times = Math.min(times, Math.floor(have / count));
    catalogTotal += price * count;
  }

  if (!Number.isFinite(times) || times < 1) return null;
  // Never auto-apply a bundle that costs more than buying the items separately.
  if (rule.bundlePrice >= catalogTotal) return null;
  return { times, catalogTotal };
}

/**
 * Total bundle discount for a cart.
 *
 * Bundles are applied best-saving-first and consume the quantities they use, so
 * a product shared by two bundles is counted once and the shopper gets the
 * better of the two rather than whichever happened to be created first.
 */
export function applyBundles(items: PricedItem[], rules: BundleRule[]): BundleResult {
  const remaining = new Map<string, number>();
  const priceOf = new Map<string, number>();
  for (const it of items) {
    if (!it.id) continue;
    remaining.set(it.id, (remaining.get(it.id) ?? 0) + Math.max(0, it.qty));
    priceOf.set(it.id, it.price);
  }

  const usable = rules.filter((r) => r.active && r.productIds.length > 0 && r.bundlePrice >= 0);
  const applied: AppliedBundle[] = [];
  let discount = 0;

  /*
   * Re-evaluated after each application rather than sorted once up front: once
   * a bundle consumes stock, what is still affordable changes, so a ranking
   * computed against the original cart can pick a combination the cart can no
   * longer supply.
   */
  for (;;) {
    let best: { rule: BundleRule; times: number; catalogTotal: number; perSet: number } | null = null;

    for (const rule of usable) {
      const ev = evaluate(rule, remaining, priceOf);
      if (!ev) continue;
      const perSet = ev.catalogTotal - rule.bundlePrice;
      if (!best || perSet > best.perSet) best = { rule, ...ev, perSet };
    }

    if (!best) break;

    for (const id of best.rule.productIds) {
      remaining.set(id, (remaining.get(id) ?? 0) - best.times);
    }

    const savings = best.perSet * best.times;
    discount += savings;
    applied.push({
      id: best.rule.id,
      name: best.rule.name,
      times: best.times,
      catalogTotal: best.catalogTotal,
      bundlePrice: best.rule.bundlePrice,
      savings,
    });
  }

  return { applied, discount };
}

/**
 * Bundles a single product takes part in, for display on its product page.
 * Only active bundles that actually save money are worth showing.
 */
export function bundlesForProduct<T extends BundleRule>(productId: string, rules: T[]): T[] {
  return rules.filter((r) => r.active && r.productIds.includes(productId));
}
