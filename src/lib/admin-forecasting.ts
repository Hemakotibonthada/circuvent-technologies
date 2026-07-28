// Inventory Forecasting — reorder-point suggestions computed from recent
// order velocity against current stock (reusing listOrders/listProducts
// from store.ts, read-only). No new inventory storage — this only produces
// recommendations for staff to act on via the existing Inventory tab.
//
// SERVER ONLY.

import { listOrders, listProducts } from "./store";

export interface ForecastRow {
  productId: string;
  name: string;
  currentStock: number;
  unitsSoldLast30d: number;
  avgDailyVelocity: number;
  daysOfStockLeft: number | null; // null = infinite (no recent sales)
  suggestedReorderQty: number;
  urgency: "ok" | "low" | "critical";
}

/** Computes a reorder forecast per product from the last N days of orders. */
export function computeForecast(days = 30, targetCoverDays = 45): ForecastRow[] {
  const cutoff = Date.now() - days * 86_400_000;
  const orders = listOrders().filter((o) => new Date(o.placedAt).getTime() >= cutoff && o.paymentStatus === "paid");
  const soldByProduct = new Map<string, number>();
  for (const o of orders) {
    for (const item of o.items) {
      if (!item.id) continue;
      soldByProduct.set(item.id, (soldByProduct.get(item.id) || 0) + item.qty);
    }
  }

  return listProducts().map((p) => {
    const unitsSold = soldByProduct.get(p.id) || 0;
    const velocity = unitsSold / days;
    const daysLeft = velocity > 0 ? Math.round(p.stock / velocity) : null;
    const suggested = velocity > 0 ? Math.max(0, Math.ceil(velocity * targetCoverDays - p.stock)) : 0;
    const urgency: ForecastRow["urgency"] = daysLeft !== null && daysLeft <= 7 ? "critical" : daysLeft !== null && daysLeft <= 21 ? "low" : "ok";
    return {
      productId: p.id,
      name: p.name,
      currentStock: p.stock,
      unitsSoldLast30d: unitsSold,
      avgDailyVelocity: Math.round(velocity * 100) / 100,
      daysOfStockLeft: daysLeft,
      suggestedReorderQty: suggested,
      urgency,
    };
  }).sort((a, b) => (a.daysOfStockLeft ?? Infinity) - (b.daysOfStockLeft ?? Infinity));
}
