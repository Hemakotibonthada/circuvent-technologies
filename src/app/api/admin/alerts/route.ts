import { NextResponse } from "next/server";
import { adminFromRequest } from "@/lib/admin-auth";
import { listOrders, listReturns, listTickets } from "@/lib/store";
import { lowStock, expiringBatches } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Alert { type: string; title: string; detail: string; tab: string; severity: "info" | "warn" | "urgent"; at?: string }

// GET /api/admin/alerts — actionable items across the store for the admin bell.
export async function GET(request: Request) {
  const me = adminFromRequest(request);
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orders = listOrders();
  const newOrders = orders.filter((o) => o.status === "placed");
  const processing = orders.filter((o) => ["placed", "confirmed", "packed"].includes(o.status));
  const low = lowStock();
  const returns = listReturns().filter((r) => r.status === "requested");
  const tickets = listTickets().filter((t) => t.status === "open");
  const expiring = expiringBatches();

  const items: Alert[] = [];
  for (const o of newOrders.slice(0, 6)) {
    items.push({ type: "order", title: `New order ${o.orderNo}`, detail: `${o.customer.name || o.customer.email} · ₹${o.total}`, tab: "orders", severity: "urgent", at: o.placedAt });
  }
  for (const p of low.slice(0, 6)) {
    items.push({ type: "stock", title: `Low stock: ${p.name}`, detail: `${p.stock} left`, tab: "inventory", severity: p.stock === 0 ? "urgent" : "warn" });
  }
  for (const r of returns.slice(0, 4)) {
    items.push({ type: "return", title: `Return requested`, detail: `${r.orderNo} · ${r.reason || ""}`.slice(0, 60), tab: "returns", severity: "warn" });
  }
  for (const t of tickets.slice(0, 4)) {
    items.push({ type: "ticket", title: `Open ticket: ${t.subject}`.slice(0, 60), detail: t.name || t.email, tab: "support", severity: "info", at: t.updatedAt });
  }
  for (const b of expiring.slice(0, 4)) {
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

  return NextResponse.json({ ok: true, total, counts, items });
}
