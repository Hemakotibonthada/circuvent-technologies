// Circuvent - admin analytics/insights aggregation (server-only).
// Computes time-series + breakdowns from the shop store for the admin
// Analytics / Reports dashboards.

import { listOrders, listProducts, listCustomers, listReturns, listTickets, analytics } from "./store";

const dayKey = (iso: string) => (iso || "").slice(0, 10);

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

export function ordersByStatus() {
  const counts: Record<string, number> = {};
  for (const o of listOrders()) counts[o.status] = (counts[o.status] || 0) + 1;
  return counts;
}

export function fulfilmentFunnel() {
  const order = ["placed", "confirmed", "packed", "shipped", "out_for_delivery", "delivered"];
  const counts = ordersByStatus();
  // funnel: an order at a later stage passed through earlier ones
  const reached: Record<string, number> = {};
  const total = listOrders().filter((o) => o.status !== "cancelled").length;
  let running = total;
  const label: Record<string, string> = { placed: "Placed", confirmed: "Confirmed", packed: "Packed", shipped: "Shipped", out_for_delivery: "Out for delivery", delivered: "Delivered" };
  const stageIndex = (s: string) => order.indexOf(s);
  return order.map((st) => {
    const n = listOrders().filter((o) => o.status !== "cancelled" && stageIndex(o.status) >= stageIndex(st)).length;
    reached[st] = n;
    running = n;
    return { stage: label[st], count: n, pct: total ? Math.round((n / total) * 100) : 0 };
  });
}

export function paymentSplit() {
  const m: Record<string, { orders: number; revenue: number }> = {};
  for (const o of listOrders()) {
    const k = o.paymentMethod || "other";
    m[k] = m[k] || { orders: 0, revenue: 0 };
    m[k].orders++;
    if (o.paymentStatus === "paid") m[k].revenue += o.total;
  }
  const label: Record<string, string> = { razorpay: "Online (Razorpay)", cod: "Cash on Delivery", wallet: "Wallet" };
  return Object.entries(m).map(([k, v]) => ({ name: label[k] || k, ...v }));
}

export function paymentStatusSplit() {
  const m: Record<string, number> = {};
  for (const o of listOrders()) m[o.paymentStatus] = (m[o.paymentStatus] || 0) + 1;
  return m;
}

export function categorySales() {
  const nameToCat: Record<string, string> = {};
  for (const p of listProducts()) nameToCat[p.name] = p.category;
  const m: Record<string, { units: number; revenue: number }> = {};
  for (const o of listOrders()) {
    for (const it of o.items) {
      const cat = nameToCat[it.name] || "Other";
      m[cat] = m[cat] || { units: 0, revenue: 0 };
      m[cat].units += it.qty;
      m[cat].revenue += it.lineTotal;
    }
  }
  return Object.entries(m).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue);
}

export function topProducts(limit = 10) {
  const m: Record<string, { name: string; qty: number; revenue: number; orders: number }> = {};
  for (const o of listOrders()) {
    for (const it of o.items) {
      m[it.name] = m[it.name] || { name: it.name, qty: 0, revenue: 0, orders: 0 };
      m[it.name].qty += it.qty;
      m[it.name].revenue += it.lineTotal;
      m[it.name].orders++;
    }
  }
  return Object.values(m).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

export function topCustomers(limit = 10) {
  return listCustomers().filter((c) => c.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, limit)
    .map((c) => ({ name: c.name || c.email, email: c.email, spend: c.spend, orders: c.orders }));
}

export function couponUsage() {
  const m: Record<string, { uses: number; discount: number }> = {};
  for (const o of listOrders()) {
    if (!o.couponCode) continue;
    m[o.couponCode] = m[o.couponCode] || { uses: 0, discount: 0 };
    m[o.couponCode].uses++;
    m[o.couponCode].discount += o.discount || 0;
  }
  return Object.entries(m).map(([code, v]) => ({ code, ...v })).sort((a, b) => b.uses - a.uses);
}

export function returnsStats() {
  const r = listReturns();
  const byStatus: Record<string, number> = {};
  for (const x of r) byStatus[x.status] = (byStatus[x.status] || 0) + 1;
  const totalOrders = listOrders().length || 1;
  return { total: r.length, byStatus, ratePct: Math.round((r.length / totalOrders) * 1000) / 10 };
}

export function ticketsStats() {
  const t = listTickets();
  const byStatus: Record<string, number> = {};
  for (const x of t) byStatus[x.status] = (byStatus[x.status] || 0) + 1;
  return { total: t.length, byStatus };
}

/** weekday (rows) x hour (cols) order-count heatmap. */
export function hourlyHeatmap() {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const o of listOrders()) {
    const d = new Date(o.placedAt);
    if (isNaN(d.getTime())) continue;
    grid[d.getDay()][d.getHours()]++;
  }
  return { grid, rows: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], cols: Array.from({ length: 24 }, (_, i) => String(i)) };
}

export function newVsReturning() {
  const firstOrderCount: Record<string, number> = {};
  for (const o of listOrders()) {
    const e = (o.customer.email || "guest").toLowerCase();
    firstOrderCount[e] = (firstOrderCount[e] || 0) + 1;
  }
  let neu = 0, ret = 0;
  for (const n of Object.values(firstOrderCount)) { if (n === 1) neu++; else ret++; }
  return { new: neu, returning: ret };
}

export function dashboard(days = 30) {
  return {
    range: days,
    kpis: kpis(days),
    series: dailySeries(days),
    ordersByStatus: ordersByStatus(),
    funnel: fulfilmentFunnel(),
    paymentSplit: paymentSplit(),
    paymentStatusSplit: paymentStatusSplit(),
    categorySales: categorySales(),
    topProducts: topProducts(8),
    topCustomers: topCustomers(8),
    couponUsage: couponUsage(),
    returns: returnsStats(),
    tickets: ticketsStats(),
    heatmap: hourlyHeatmap(),
    newVsReturning: newVsReturning(),
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
      return toCsv(["Product", "Orders", "Units", "Revenue"], topProducts(1000).map((p) => [p.name, p.orders, p.qty, p.revenue]));
    case "customers":
      return toCsv(["Name", "Email", "Orders", "Spend"], topCustomers(1000).map((c) => [c.name, c.email, c.orders, c.spend]));
    case "categories":
      return toCsv(["Category", "Units", "Revenue"], categorySales().map((c) => [c.name, c.units, c.revenue]));
    case "coupons":
      return toCsv(["Code", "Uses", "Discount given"], couponUsage().map((c) => [c.code, c.uses, c.discount]));
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
