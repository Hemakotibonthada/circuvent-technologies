// Circuvent - admin analytics/insights aggregation (server-only).
// Computes time-series + breakdowns from the shop store for the admin
// Analytics / Reports dashboards.

import { listOrders, listProducts, listCustomers, listReturns, listTickets, analytics } from "./store";

const dayKey = (iso: string) => (iso || "").slice(0, 10);

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
function ordersInRange(days: number) {
  const dates = new Set(lastNDates(days));
  return listOrders().filter((o) => dates.has(dayKey(o.placedAt)));
}

/** Customers created within the window, on the same basis. */
function customersInRange(days: number) {
  const dates = new Set(lastNDates(days));
  return listCustomers().filter((c) => dates.has(dayKey(c.createdAt)));
}

function lastNDates(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
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
    const d = new Date(o.placedAt);
    if (isNaN(d.getTime())) continue;
    grid[d.getDay()][d.getHours()]++;
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

// -------- report exports (CSV) --------
function esc(v: unknown) { return `"${String(v ?? "").replace(/"/g, '""')}"`; }
function toCsv(head: string[], rows: (string | number)[][]) {
  return [head.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
}

export function reportCsv(type: string, days = 30): string {
  switch (type) {
    case "sales": {
      const s = dailySeries(days);
      return toCsv(["Date", "Orders", "Paid orders", "Revenue", "GMV", "AOV", "Units", "New customers"],
        s.map((p) => [p.date, p.orders, p.paidOrders, p.revenue, p.gmv, p.aov, p.units, p.newCustomers]));
    }
    case "products":
      return toCsv(["Product", "Orders", "Units", "Revenue"], topProducts(1000, days).map((p) => [p.name, p.orders, p.qty, p.revenue]));
    case "customers":
      return toCsv(["Name", "Email", "Orders", "Spend"], topCustomers(1000, days).map((c) => [c.name, c.email, c.orders, c.spend]));
    case "categories":
      return toCsv(["Category", "Units", "Revenue"], categorySales(days).map((c) => [c.name, c.units, c.revenue]));
    case "coupons":
      return toCsv(["Code", "Uses", "Discount given"], couponUsage(days).map((c) => [c.code, c.uses, c.discount]));
    case "tax": {
      // simple GST report: 18% assumed inclusive on paid revenue by day
      const s = dailySeries(days);
      return toCsv(["Date", "Taxable value", "GST @18% (incl.)", "Total (incl.)"],
        s.map((p) => [p.date, Math.round(p.revenue / 1.18), Math.round(p.revenue - p.revenue / 1.18), p.revenue]));
    }
    default:
      return toCsv(["metric", "value"], []);
  }
}
