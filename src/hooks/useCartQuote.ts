"use client";

import { useEffect, useState } from "react";

export interface QuotedBundle {
  id: string;
  name: string;
  times: number;
  catalogTotal: number;
  bundlePrice: number;
  savings: number;
}

export interface CartQuote {
  subtotal: number;
  shipping: number;
  discount: number;
  bundleDiscount: number;
  bundles: QuotedBundle[];
  total: number;
}

interface QuoteItem {
  id: string;
  slug: string;
  qty: number;
}

/**
 * Server-authoritative totals for the current cart.
 *
 * The cart used to add up its own lines, which was fine while price was the
 * only input. Bundle discounts are derived on the server from the cart's
 * contents (a price posted from the browser is discarded by priceItems), so a
 * locally computed total would have shown one figure in the cart and a lower
 * one at checkout with no explanation for the difference.
 *
 * Returns null until a quote arrives, and on failure, so callers fall back to
 * their local arithmetic rather than rendering an empty summary: a cart that
 * shows no total because a fetch failed is worse than one that is briefly
 * missing a discount line.
 */
export function useCartQuote(items: QuoteItem[]): CartQuote | null {
  const [quote, setQuote] = useState<CartQuote | null>(null);

  // Re-quote whenever the contents change, not on every render: the identity of
  // the items array changes constantly, its contents rarely.
  const key = items.map((i) => `${i.id}:${i.qty}`).join("|");

  useEffect(() => {
    if (!items.length) {
      setQuote(null);
      return;
    }
    let alive = true;
    fetch("/api/shop/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items.map((i) => ({ id: i.id, slug: i.slug, qty: i.qty })) }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.success) return;
        setQuote({
          subtotal: d.subtotal ?? 0,
          shipping: d.shipping ?? 0,
          discount: d.discount ?? 0,
          bundleDiscount: d.bundleDiscount ?? 0,
          bundles: d.bundles ?? [],
          total: d.total ?? 0,
        });
      })
      .catch(() => {
        if (alive) setQuote(null);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return quote;
}
