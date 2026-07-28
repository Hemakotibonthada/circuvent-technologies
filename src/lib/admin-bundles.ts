// Product Bundles — combo SKUs made of existing catalog products at a
// bundle price. Reuses `listProducts()` from store.ts (read-only) to look up
// live prices for savings calculations instead of duplicating product data.
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";
import { listProducts } from "./store";

export interface Bundle {
  id: string;
  name: string;
  productIds: string[];
  bundlePrice: number;
  active: boolean;
  createdAt: string;
}

const store = createFileStore<{ bundles: Bundle[] }>("admin-bundles.json", () => ({ bundles: [] }));

export function listBundles(): Bundle[] {
  return store.read().bundles;
}

export function upsertBundle(input: Partial<Bundle> & { name: string; productIds: string[]; bundlePrice: number }): Bundle {
  return store.mutate((db) => {
    const existing = input.id ? db.bundles.find((b) => b.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, input);
      return existing;
    }
    const created: Bundle = { id: shortId("bundle"), name: input.name, productIds: input.productIds, bundlePrice: input.bundlePrice, active: input.active ?? true, createdAt: new Date().toISOString() };
    db.bundles.unshift(created);
    return created;
  });
}

export function deleteBundle(id: string): boolean {
  return store.mutate((db) => {
    const before = db.bundles.length;
    db.bundles = db.bundles.filter((b) => b.id !== id);
    return db.bundles.length < before;
  });
}

export interface BundleWithSavings extends Bundle {
  catalogTotal: number;
  savings: number;
  savingsPct: number;
  productNames: string[];
}

/** Enriches every bundle with live catalog pricing so admins see real savings. */
export function bundlesWithSavings(): BundleWithSavings[] {
  const catalog = listProducts();
  return listBundles().map((b) => {
    const products = b.productIds.map((id) => catalog.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
    const catalogTotal = products.reduce((s, p) => s + p.price, 0);
    const savings = Math.max(0, catalogTotal - b.bundlePrice);
    return { ...b, catalogTotal, savings, savingsPct: catalogTotal ? Math.round((savings / catalogTotal) * 100) : 0, productNames: products.map((p) => p.name) };
  });
}
