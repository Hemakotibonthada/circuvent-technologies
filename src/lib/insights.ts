// Circuvent - admin analytics/insights aggregation (server-only).
// Computes time-series + breakdowns from the shop store for the admin
// Analytics / Reports dashboards.

import { listOrders, listProducts, listCustomers, listReturns, listTickets, analytics } from "./store";
import { businessDayKey, businessWeekdayHour, lastNBusinessDates } from "./business-time";

const dayKey = (iso: string) => businessDayKey(iso);

/**
 * Orders placed within the selected window.
 *
 * Every breakdown below used `listOrders()` directly, so the range control on
 * the Reports page moved the KPI strip and the time series and nothing else.
 * Category, product, customer, coupon, payment, funnel, returns and heatmap all
 * returned all-time totals no matter which button was pressed — verified
 * against production, where categorySales came back byte-identical for 7, 30
 * and 365 days while kpis.revenue for the same week was zero.
 *
 * A page that reports zero revenue this week beside a ₹4.3 lakh category chart
 * is not a cosmetic inconsistency. Whichever number a person acts on, one of
 * them was answering a question nobody asked, under a label that said
 * otherwise — and there is no way to tell from the screen which.
 *
 * The window is inclusive of today and `days` long, matching lastNDates() so
 * the breakdowns and the series always cover exactly the same span.
 */
export function ordersInRange(days: number) {
  const dates = new Set(lastNDates(days));
  return listOrders().filter((o) => dates.has(dayKey(o.placedAt)));
}

/** Customers created within the window, on the same basis. */
export function customersInRange(days: number) {
  const dates = new Set(lastNDates(days));
  return listCustomers().filter((c) => dates.has(dayKey(c.createdAt)));
}

export function lastNDates(days: number): string[] {
  return lastNBusinessDates(days);
}

export interface DailyPoint {
  date: string; label: string; revenue: number; gmv: number; orders: number; paidOrders: number; aov: number; newCustomers: number; units: number;
}

export function dailySeries(days = 30): DailyPoint[] {
  const orders = listOrders();
  const customers = listCustomers();
  const byDay: Record<string, { revenue: number; gmv: number; orders: number; paid: number; units: number }> = {};
  for (const o of orders) {
    const k = dayKey(o.placedAt);
    if (!k) continue;
    byDay[k] = byDay[k] || { revenue: 0, gmv: 0, orders: 0, paid: 0, units: 0 };
    byDay[k].orders++;
    byDay[k].gmv += o.total;
    byDay[k].units += o.items.reduce((s, it) => s + it.qty, 0);
    if (o.paymentStatus === "paid") { byDay[k].revenue += o.total; byDay[k].paid++; }
  }
  const newCust: Record<string, number> = {};
  for (const c of customers) { const k = dayKey(c.createdAt); if (k) newCust[k] = (newCust[k] || 0) + 1; }
  return lastNDates(days).map((d) => {
    const b = byDay[d];
    return {
      date: d, label: d.slice(5),
      revenue: b?.revenue || 0, gmv: b?.gmv || 0, orders: b?.orders || 0, paidOrders: b?.paid || 0,
      aov: b?.paid ? Math.round(b.revenue / b.paid) : 0, newCustomers: newCust[d] || 0, units: b?.units || 0,
    };
  });
}

function sumRange(series: DailyPoint[], key: keyof DailyPoint): number {
  return series.reduce((s, p) => s + (Number(p[key]) || 0), 0);
}

export function kpis(days = 30) {
  const cur = dailySeries(days);
  const all = dailySeries(days * 2);
  const prev = all.slice(0, days);
  const delta = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100);
  const curRev = sumRange(cur, "revenue"), prevRev = sumRange(prev, "revenue");
  const curOrd = sumRange(cur, "orders"), prevOrd = sumRange(prev, "orders");
  const curCust = sumRange(cur, "newCustomers"), prevCust = sumRange(prev, "newCustomers");
  const curUnits = sumRange(cur, "units"), prevUnits = sumRange(prev, "units");
  const curAov = sumRange(cur, "paidOrders") ? Math.round(curRev / sumRange(cur, "paidOrders")) : 0;
  const prevAov = sumRange(prev, "paidOrders") ? Math.round(prevRev / sumRange(prev, "paidOrders")) : 0;
  return {
    revenue: { value: curRev, delta: delta(curRev, prevRev), spark: cur.map((p) => p.revenue) },
    orders: { value: curOrd, delta: delta(curOrd, prevOrd), spark: cur.map((p) => p.orders) },
    aov: { value: curAov, delta: delta(curAov, prevAov), spark: cur.map((p) => p.aov) },
    newCustomers: { value: curCust, delta: delta(curCust, prevCust), spark: cur.map((p) => p.newCustomers) },
    units: { value: curUnits, delta: delta(curUnits, prevUnits), spark: cur.map((p) => p.units) },
  };
}

export function ordersByStatus(days = 30) {
  const counts: Record<string, number> = {};
  for (const o of ordersInRange(days)) counts[o.status] = (counts[o.status] || 0) + 1;
  return counts;
}

export function fulfilmentFunnel(days = 30) {
  const order = ["placed", "confirmed", "packed", "shipped", "out_for_delivery", "delivered"];
  const inRange = ordersInRange(days);
  const live = inRange.filter((o) => o.status !== "cancelled");
  const total = live.length;
  const label: Record<string, string> = { placed: "Placed", confirmed: "Confirmed", packed: "Packed", shipped: "Shipped", out_for_delivery: "Out for delivery", delivered: "Delivered" };
  const stageIndex = (s: string) => order.indexOf(s);
  return order.map((st) => {
    const n = live.filter((o) => stageIndex(o.status) >= stageIndex(st)).length;
    return { stage: label[st], count: n, pct: total ? Math.round((n / total) * 100) : 0 };
  });
}

export function paymentSplit(days = 30) {
  const m: Record<string, { orders: number; revenue: number }> = {};
  for (const o of ordersInRange(days)) {
    const k = o.paymentMethod || "other";
    m[k] = m[k] || { orders: 0, revenue: 0 };
    m[k].orders++;
    if (o.paymentStatus === "paid") m[k].revenue += o.total;
  }
  const label: Record<string, string> = { razorpay: "Online (Razorpay)", cod: "Cash on Delivery", wallet: "Wallet" };
  return Object.entries(m).map(([k, v]) => ({ name: label[k] || k, ...v }));
}

export function paymentStatusSplit(days = 30) {
  const m: Record<string, number> = {};
  for (const o of ordersInRange(days)) m[o.paymentStatus] = (m[o.paymentStatus] || 0) + 1;
  return m;
}

export function categorySales(days = 30) {
  const nameToCat: Record<string, string> = {};
  for (const p of listProducts()) nameToCat[p.name] = p.category;
  const m: Record<string, { units: number; revenue: number }> = {};
  for (const o of ordersInRange(days)) {
    for (const it of o.items) {
      const cat = nameToCat[it.name] || "Other";
      m[cat] = m[cat] || { units: 0, revenue: 0 };
      m[cat].units += it.qty;
      m[cat].revenue += it.lineTotal;
    }
  }
  return Object.entries(m).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue);
}

export function topProducts(limit = 10, days = 30) {
  const m: Record<string, { name: string; qty: number; revenue: number; orders: number }> = {};
  for (const o of ordersInRange(days)) {
    for (const it of o.items) {
      m[it.name] = m[it.name] || { name: it.name, qty: 0, revenue: 0, orders: 0 };
      m[it.name].qty += it.qty;
      m[it.name].revenue += it.lineTotal;
      m[it.name].orders++;
    }
  }
  return Object.values(m).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

/**
 * Top customers by spend *within the window*.
 *
 * This read `customer.spend`, which is a lifetime total maintained on the
 * record, so a "top customers this week" table was really "top customers ever"
 * — and a customer who bought nothing in the window still ranked first. Spend
 * is recomputed from the orders in range so the column means what its heading
 * says.
 */
export function topCustomers(limit = 10, days = 30) {
  const m: Record<string, { name: string; email: string; spend: number; orders: number }> = {};
  for (const o of ordersInRange(days)) {
    const email = (o.customer.email || "guest").toLowerCase();
    m[email] = m[email] || { name: o.customer.name || email, email, spend: 0, orders: 0 };
    m[email].orders++;
    if (o.paymentStatus === "paid") m[email].spend += o.total;
  }
  return Object.values(m).filter((c) => c.spend > 0 || c.orders > 0)
    .sort((a, b) => b.spend - a.spend).slice(0, limit);
}

export function couponUsage(days = 30) {
  const m: Record<string, { uses: number; discount: number }> = {};
  for (const o of ordersInRange(days)) {
    if (!o.couponCode) continue;
    m[o.couponCode] = m[o.couponCode] || { uses: 0, discount: 0 };
    m[o.couponCode].uses++;
    m[o.couponCode].discount += o.discount || 0;
  }
  return Object.entries(m).map(([code, v]) => ({ code, ...v })).sort((a, b) => b.uses - a.uses);
}

export function returnsStats(days = 30) {
  const dates = new Set(lastNDates(days));
  const r = listReturns().filter((x) => {
    const at = (x as { createdAt?: string }).createdAt;
    // A return with no timestamp cannot be placed in the window. Counting it
    // anyway would inflate the rate for every range equally, which is the
    // failure this whole change is about.
    return at ? dates.has(dayKey(at)) : false;
  });
  const byStatus: Record<string, number> = {};
  for (const x of r) byStatus[x.status] = (byStatus[x.status] || 0) + 1;
  const totalOrders = ordersInRange(days).length || 1;
  return { total: r.length, byStatus, ratePct: Math.round((r.length / totalOrders) * 1000) / 10 };
}

export function ticketsStats(days = 30) {
  const dates = new Set(lastNDates(days));
  const t = listTickets().filter((x) => {
    const at = (x as { createdAt?: string }).createdAt;
    return at ? dates.has(dayKey(at)) : false;
  });
  const byStatus: Record<string, number> = {};
  for (const x of t) byStatus[x.status] = (byStatus[x.status] || 0) + 1;
  return { total: t.length, byStatus };
}

/** weekday (rows) x hour (cols) order-count heatmap. */
export function hourlyHeatmap(days = 30) {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const o of ordersInRange(days)) {
    // Bucketed in the business timezone: the server runs in UTC, so
    // getDay()/getHours() put the evening peak in the small hours and moved
    // late orders into the wrong weekday.
    const at = businessWeekdayHour(o.placedAt);
    if (!at) continue;
    grid[at.weekday][at.hour]++;
  }
  return { grid, rows: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], cols: Array.from({ length: 24 }, (_, i) => String(i)) };
}

/**
 * New versus returning *within the window*.
 *
 * Counting orders per email inside the window and calling anyone with one order
 * "new" is wrong — a customer of three years who ordered once this week is not
 * new. Whether they are new is decided by looking at their whole history for an
 * earlier order.
 */
export function newVsReturning(days = 30) {
  const dates = new Set(lastNDates(days));
  const earliest: Record<string, string> = {};
  for (const o of listOrders()) {
    const e = (o.customer.email || "guest").toLowerCase();
    const k = dayKey(o.placedAt);
    if (!k) continue;
    if (!earliest[e] || k < earliest[e]) earliest[e] = k;
  }
  const seen = new Set<string>();
  let neu = 0, ret = 0;
  for (const o of ordersInRange(days)) {
    const e = (o.customer.email || "guest").toLowerCase();
    if (seen.has(e)) continue;
    seen.add(e);
    if (dates.has(earliest[e])) neu++; else ret++;
  }
  return { new: neu, returning: ret };
}

export function dashboard(days = 30) {
  return {
    range: days,
    kpis: kpis(days),
    series: dailySeries(days),
    // Every breakdown takes the same window as the KPIs above it. They used to
    // take none, so the range control moved two of these fifteen fields.
    ordersByStatus: ordersByStatus(days),
    funnel: fulfilmentFunnel(days),
    paymentSplit: paymentSplit(days),
    paymentStatusSplit: paymentStatusSplit(days),
    categorySales: categorySales(days),
    topProducts: topProducts(8, days),
    topCustomers: topCustomers(8, days),
    couponUsage: couponUsage(days),
    returns: returnsStats(days),
    tickets: ticketsStats(days),
    heatmap: hourlyHeatmap(days),
    newVsReturning: newVsReturning(days),
    base: analytics(),
  };
}

// ---------------------------------------------------------------------------
// Additional order/return-only aggregations
//
// These read exactly the same collections the fourteen breakdowns above do
// (orders, returns, customers) and honour the same `days` window, so they can
// be composed by the reports engine without pulling in inventory or tax
// modules. Nothing here invents a figure: every number is a sum or ratio of a
// stored field, and where a field is absent (e.g. a status timestamp) the row
// is excluded rather than defaulted, matching returnsStats() above.
// ---------------------------------------------------------------------------

/**
 * Payment reconciliation by method.
 *
 * Splits every order in the window by payment method and settles it into one of
 * three real buckets from `paymentStatus`: captured (paid), pending, or failed
 * (anything else — refunded/cancelled/unknown). `captured` is money actually
 * collected; `pendingValue` is exposure still owed (typically COD awaiting
 * delivery). No figure is assumed — an order with no method lands under
 * "unknown" rather than being dropped.
 */
export function paymentReconciliation(days = 30) {
  const label: Record<string, string> = { razorpay: "Online (Razorpay)", cod: "Cash on Delivery", wallet: "Wallet", other: "Other" };
  const m: Record<string, { method: string; orders: number; captured: number; capturedOrders: number; pendingValue: number; pendingOrders: number; failedOrders: number }> = {};
  for (const o of ordersInRange(days)) {
    const k = o.paymentMethod || "other";
    m[k] = m[k] || { method: label[k] || k, orders: 0, captured: 0, capturedOrders: 0, pendingValue: 0, pendingOrders: 0, failedOrders: 0 };
    const row = m[k];
    row.orders++;
    if (o.paymentStatus === "paid") { row.captured += o.total; row.capturedOrders++; }
    else if (o.paymentStatus === "pending") { row.pendingValue += o.total; row.pendingOrders++; }
    else row.failedOrders++;
  }
  return Object.values(m).sort((a, b) => b.captured - a.captured);
}

/**
 * Discount effectiveness — coupon-bearing orders versus the rest.
 *
 * Compares average order value and paid revenue for orders that redeemed a
 * coupon against those that did not, so the discount spend can be weighed
 * against the basket lift it did or did not produce. `roi` is paid revenue
 * generated per rupee of discount given (revenue / discount); it is only
 * meaningful when discount > 0, so it is reported as null otherwise rather than
 * shown as a divide-by-zero infinity.
 */
export function discountEffectiveness(days = 30) {
  const bucket = () => ({ orders: 0, paidOrders: 0, revenue: 0, discount: 0, units: 0 });
  const withCoupon = bucket();
  const without = bucket();
  for (const o of ordersInRange(days)) {
    const b = o.couponCode ? withCoupon : without;
    b.orders++;
    b.units += o.items.reduce((s, it) => s + it.qty, 0);
    if (o.paymentStatus === "paid") { b.paidOrders++; b.revenue += o.total; }
    b.discount += o.discount || 0;
  }
  const aov = (b: ReturnType<typeof bucket>) => (b.paidOrders ? Math.round(b.revenue / b.paidOrders) : 0);
  const totalDiscount = withCoupon.discount + without.discount;
  return {
    withCoupon: { ...withCoupon, aov: aov(withCoupon) },
    withoutCoupon: { ...without, aov: aov(without) },
    aovLift: aov(withCoupon) - aov(without),
    totalDiscount,
    roi: withCoupon.discount > 0 ? Math.round((withCoupon.revenue / withCoupon.discount) * 100) / 100 : null,
  };
}

/**
 * Customer retention within the window.
 *
 * "New" is decided against a customer's whole order history (their earliest
 * order date), not against activity inside the window — the same correction
 * newVsReturning() makes. `repeatCustomers` are window buyers with more than one
 * lifetime order; `oneTime` bought exactly once ever. Rates are null when there
 * are no window customers to divide by, so an empty period reads as "no data"
 * rather than 0%.
 */
export function customerRetention(days = 30) {
  const dates = new Set(lastNDates(days));
  const all = listOrders();
  const lifetime: Record<string, { first: string; count: number }> = {};
  for (const o of all) {
    const e = (o.customer.email || "guest").toLowerCase();
    const k = dayKey(o.placedAt);
    if (!k) continue;
    lifetime[e] = lifetime[e] || { first: k, count: 0 };
    lifetime[e].count++;
    if (k < lifetime[e].first) lifetime[e].first = k;
  }
  const windowCustomers = new Set<string>();
  let windowOrders = 0;
  for (const o of ordersInRange(days)) { windowCustomers.add((o.customer.email || "guest").toLowerCase()); windowOrders++; }
  let neu = 0, returning = 0, repeat = 0, oneTime = 0;
  for (const e of windowCustomers) {
    const lt = lifetime[e];
    if (!lt) continue;
    if (dates.has(lt.first)) neu++; else returning++;
    if (lt.count > 1) repeat++; else oneTime++;
  }
  const total = windowCustomers.size;
  return {
    customers: total,
    newCustomers: neu,
    returningCustomers: returning,
    repeatCustomers: repeat,
    oneTimeCustomers: oneTime,
    orders: windowOrders,
    repeatRatePct: total ? Math.round((repeat / total) * 1000) / 10 : null,
    returningRatePct: total ? Math.round((returning / total) * 1000) / 10 : null,
    avgOrdersPerCustomer: total ? Math.round((windowOrders / total) * 100) / 100 : null,
  };
}

/**
 * Monthly acquisition cohorts and their forward retention.
 *
 * Every customer is assigned to the calendar month of their first-ever order.
 * For that cohort we then count, month by month after acquisition, how many
 * placed at least one further order — the classic retention triangle. Only the
 * most recent `months` cohorts are returned. Built from full order history
 * (retention is a lifetime question), independent of the reports date range.
 */
export function acquisitionCohorts(months = 6) {
  const monthKey = (iso: string) => (iso || "").slice(0, 7);
  const now = new Date();
  const cohortMonths: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    cohortMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const byCustomer: Record<string, string[]> = {};
  for (const o of listOrders()) {
    const e = (o.customer.email || "guest").toLowerCase();
    const mk = monthKey(o.placedAt);
    if (!mk) continue;
    (byCustomer[e] = byCustomer[e] || []).push(mk);
  }
  const firstOf: Record<string, string> = {};
  for (const [e, ms] of Object.entries(byCustomer)) firstOf[e] = ms.slice().sort()[0];

  const monthsSince = (from: string, to: string) => {
    const [fy, fm] = from.split("-").map(Number);
    const [ty, tm] = to.split("-").map(Number);
    return (ty - fy) * 12 + (tm - fm);
  };

  return cohortMonths.map((cm) => {
    const members = Object.keys(firstOf).filter((e) => firstOf[e] === cm);
    const size = members.length;
    const retained: number[] = [];
    for (let offset = 1; offset <= months; offset++) {
      const n = members.filter((e) => byCustomer[e].some((mk) => monthsSince(cm, mk) === offset)).length;
      retained.push(n);
    }
    return { cohort: cm, size, retained, retainedPct: retained.map((n) => (size ? Math.round((n / size) * 1000) / 10 : 0)) };
  });
}

/**
 * Order fulfilment SLA.
 *
 * Uses the timestamps recorded in each order's status history to measure how
 * long orders actually take between stages. An order only contributes to a
 * transition when both endpoints carry a real timestamp — a missing event is
 * left out of that average rather than counted as zero hours, so a store that
 * never records "shipped" reports no shipping SLA instead of a fake 0h. Cancel
 * rate is over all orders in the window.
 */
export function fulfilmentSla(days = 30) {
  const inRange = ordersInRange(days);
  const HOUR = 3600000;
  const at = (o: { placedAt: string; history?: { status: string; at: string }[] }, status: string): number | null => {
    if (status === "placed") { const t = new Date(o.placedAt).getTime(); return isNaN(t) ? null : t; }
    const ev = (o.history || []).find((h) => h.status === status);
    if (!ev) return null;
    const t = new Date(ev.at).getTime();
    return isNaN(t) ? null : t;
  };
  const transitions: { key: string; from: string; to: string; label: string }[] = [
    { key: "processing", from: "placed", to: "shipped", label: "Placed → Shipped" },
    { key: "delivery", from: "shipped", to: "delivered", label: "Shipped → Delivered" },
    { key: "endToEnd", from: "placed", to: "delivered", label: "Placed → Delivered" },
  ];
  const stages = transitions.map((tr) => {
    let sum = 0, count = 0;
    for (const o of inRange) {
      const a = at(o, tr.from), b = at(o, tr.to);
      if (a === null || b === null || b < a) continue;
      sum += (b - a) / HOUR;
      count++;
    }
    return { key: tr.key, label: tr.label, avgHours: count ? Math.round((sum / count) * 10) / 10 : null, count };
  });
  const delivered = inRange.filter((o) => o.status === "delivered").length;
  const cancelled = inRange.filter((o) => o.status === "cancelled").length;
  const total = inRange.length;
  const e2e = stages.find((s) => s.key === "endToEnd");
  return {
    orders: total,
    delivered,
    cancelled,
    deliveredRatePct: total ? Math.round((delivered / total) * 1000) / 10 : null,
    cancelRatePct: total ? Math.round((cancelled / total) * 1000) / 10 : null,
    avgFulfilmentHours: e2e ? e2e.avgHours : null,
    stages,
  };
}

/**
 * Refunds & returns for the window.
 *
 * Returns are placed in the window by their `createdAt`; one with no timestamp
 * is excluded (it cannot be dated), the same rule returnsStats() uses.
 * `refundValue` sums `refundAmount` only where present, so an approved return
 * whose refund has not been keyed in does not silently contribute 0 to a
 * money total that would then read as settled.
 */
export function refundsReport(days = 30) {
  const dates = new Set(lastNDates(days));
  const inWindow = listReturns().filter((r) => {
    const at = (r as { createdAt?: string }).createdAt;
    return at ? dates.has(dayKey(at)) : false;
  });
  const byStatus: Record<string, number> = {};
  const byReason: Record<string, { count: number; refundValue: number }> = {};
  let refundValue = 0, refundedCount = 0, refundAmountKnown = 0;
  for (const r of inWindow) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const reason = (r.reason || "Unspecified").slice(0, 60);
    byReason[reason] = byReason[reason] || { count: 0, refundValue: 0 };
    byReason[reason].count++;
    if (typeof r.refundAmount === "number") {
      refundValue += r.refundAmount;
      byReason[reason].refundValue += r.refundAmount;
      refundAmountKnown++;
    }
    if (r.status === "refunded") refundedCount++;
  }
  const orderCount = ordersInRange(days).length;
  return {
    total: inWindow.length,
    refundedCount,
    refundValue,
    refundAmountKnown,
    byStatus,
    byReason: Object.entries(byReason).map(([reason, v]) => ({ reason, ...v })).sort((a, b) => b.count - a.count),
    returnRatePct: orderCount ? Math.round((inWindow.length / orderCount) * 1000) / 10 : null,
  };
}
