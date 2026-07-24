// Admin alerting + report engine.
//
// `computeAlerts()` aggregates actionable items across the store (used by the
// header bell and the scheduled digest). `buildDigestHtml` / `buildReportHtml`
// render branded emails. Rule filtering + which channels fire are driven by the
// durable AlertSettings (store.ts). SERVER ONLY.

import {
  listOrders,
  listReturns,
  listTickets,
  getAlertSettings,
  type AlertSettings,
} from "./store";
import { lowStock, expiringBatches } from "./inventory";
import { dashboard } from "./insights";
import { SITE_URL, siteConfig } from "./config";

export type Severity = "info" | "warn" | "urgent";
export interface Alert {
  type: "order" | "stock" | "return" | "ticket" | "expiry";
  title: string;
  detail: string;
  tab: string;
  severity: Severity;
  at?: string;
}

export interface AlertResult {
  total: number;
  counts: {
    newOrders: number;
    processing: number;
    lowStock: number;
    pendingReturns: number;
    openTickets: number;
    expiring: number;
  };
  items: Alert[];
}

/** Aggregates actionable items across the store. */
export function computeAlerts(): AlertResult {
  const orders = listOrders();
  const newOrders = orders.filter((o) => o.status === "placed");
  const processing = orders.filter((o) => ["placed", "confirmed", "packed"].includes(o.status));
  const low = lowStock();
  const returns = listReturns().filter((r) => r.status === "requested");
  const tickets = listTickets().filter((t) => t.status === "open");
  const expiring = expiringBatches();

  const items: Alert[] = [];
  for (const o of newOrders.slice(0, 8)) {
    items.push({ type: "order", title: `New order ${o.orderNo}`, detail: `${o.customer.name || o.customer.email} · ₹${o.total}`, tab: "orders", severity: "urgent", at: o.placedAt });
  }
  for (const p of low.slice(0, 8)) {
    items.push({ type: "stock", title: `Low stock: ${p.name}`, detail: `${p.stock} left`, tab: "inventory", severity: p.stock === 0 ? "urgent" : "warn" });
  }
  for (const r of returns.slice(0, 6)) {
    items.push({ type: "return", title: `Return requested`, detail: `${r.orderNo} · ${r.reason || ""}`.slice(0, 60), tab: "returns", severity: "warn" });
  }
  for (const t of tickets.slice(0, 6)) {
    items.push({ type: "ticket", title: `Open ticket: ${t.subject}`.slice(0, 60), detail: t.name || t.email, tab: "support", severity: "info", at: t.updatedAt });
  }
  for (const b of expiring.slice(0, 6)) {
    items.push({ type: "expiry", title: `Batch ${b.batchNo} expiring`, detail: b.expiryDate ? new Date(b.expiryDate).toLocaleDateString("en-IN") : "", tab: "inventory", severity: "warn" });
  }

  const counts = {
    newOrders: newOrders.length,
    processing: processing.length,
    lowStock: low.length,
    pendingReturns: returns.length,
    openTickets: tickets.length,
    expiring: expiring.length,
  };
  const total = counts.newOrders + counts.lowStock + counts.pendingReturns + counts.openTickets + counts.expiring;
  return { total, counts, items };
}

const TYPE_ENABLED: Record<Alert["type"], keyof AlertSettings> = {
  order: "onNewOrder",
  stock: "onLowStock",
  return: "onPendingReturn",
  ticket: "onOpenTicket",
  expiry: "onExpiringBatch",
};

/** Filters alerts by the enabled rule toggles + low-stock threshold. */
export function filterBySettings(items: Alert[], settings: AlertSettings): Alert[] {
  return items.filter((it) => {
    if (!settings[TYPE_ENABLED[it.type]]) return false;
    if (it.type === "stock") {
      const left = Number((it.detail.match(/(\d+)/) || [])[1] ?? 0);
      if (left > settings.lowStockThreshold) return false;
    }
    return true;
  });
}

const brandHeader = (title: string) => `
  <div style="background:linear-gradient(135deg,#06b6d4,#8b5cf6);padding:20px 24px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:10px">
    <img src="${SITE_URL}${siteConfig.logo}" alt="Circuvent" width="28" height="28" style="border-radius:6px" />
    <h1 style="color:#fff;margin:0;font-size:18px">${title}</h1>
  </div>`;

const sevColor: Record<Severity, string> = { urgent: "#ef4444", warn: "#f59e0b", info: "#06b6d4" };

/** Renders the alert digest email. Returns null when there's nothing to send. */
export function buildDigestHtml(): { subject: string; html: string; count: number } | null {
  const settings = getAlertSettings();
  const { counts, items } = computeAlerts();
  const relevant = filterBySettings(items, settings);
  if (relevant.length === 0) return null;

  const rows = relevant
    .map(
      (it) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f7">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sevColor[it.severity]};margin-right:8px"></span>
          <b style="color:#0c1222">${it.title}</b>
          <div style="color:#64748b;font-size:12px;margin-left:16px">${it.detail}</div>
        </td>
      </tr>`
    )
    .join("");

  const summary = [
    counts.newOrders && `${counts.newOrders} new order(s)`,
    counts.lowStock && `${counts.lowStock} low-stock`,
    counts.pendingReturns && `${counts.pendingReturns} return(s)`,
    counts.openTickets && `${counts.openTickets} ticket(s)`,
    counts.expiring && `${counts.expiring} expiring`,
  ]
    .filter(Boolean)
    .join(" · ");

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
      ${brandHeader("Store alerts")}
      <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
        <p style="font-size:13px;color:#475569;margin:0 0 12px">${summary || "Action items awaiting you."}</p>
        <table style="width:100%;border-collapse:collapse">${rows}</table>
        <a href="${SITE_URL}/admin" style="display:inline-block;margin-top:18px;background:#0891b2;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:10px">Open admin dashboard</a>
      </div>
    </div>`;
  return { subject: `Circuvent alerts — ${relevant.length} item(s) need attention`, html, count: relevant.length };
}

/** Renders a periodic performance report email from the insights dashboard. */
export function buildReportHtml(days = 30): { subject: string; html: string } {
  const d = dashboard(days);
  const k = d.kpis;
  const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  const kpiCard = (label: string, value: string) => `
    <td style="padding:12px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;text-align:center">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em">${label}</div>
      <div style="font-size:20px;font-weight:800;color:#0c1222;margin-top:4px">${value}</div>
    </td>`;

  const topRows = (d.topProducts || [])
    .slice(0, 5)
    .map(
      (p: { name: string; qty: number; revenue: number }) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #eef2f7;color:#0c1222">${p.name}</td><td style="text-align:right;color:#64748b">${p.qty} · ${inr(p.revenue)}</td></tr>`
    )
    .join("");

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
      ${brandHeader(`Performance report — last ${days} days`)}
      <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
        <table style="width:100%;border-collapse:separate;border-spacing:8px 0"><tr>
          ${kpiCard("Revenue", inr(k.revenue.value))}
          ${kpiCard("Orders", String(k.orders.value))}
          ${kpiCard("AOV", inr(k.aov.value))}
        </tr></table>
        <h3 style="font-size:14px;color:#0c1222;margin:20px 0 8px">Top products</h3>
        <table style="width:100%;border-collapse:collapse">${topRows || '<tr><td style="color:#94a3b8">No sales in this period.</td></tr>'}</table>
        <a href="${SITE_URL}/admin" style="display:inline-block;margin-top:18px;background:#0891b2;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:10px">View full dashboard</a>
        <p style="font-size:11px;color:#94a3b8;margin-top:16px">Circuvent Technologies · automated report</p>
      </div>
    </div>`;
  return { subject: `Circuvent report — ${inr(k.revenue.value)} from ${k.orders.value} order(s) (${days}d)`, html };
}
