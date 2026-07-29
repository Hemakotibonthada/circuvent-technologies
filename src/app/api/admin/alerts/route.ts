import { NextResponse } from "next/server";
import { adminFromRequest, roleCan, type AdminArea } from "@/lib/admin-auth";
import { computeAlerts, type Alert } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Each alert kind belongs to an admin area, so the bell can be filtered. */
const AREA_FOR_TYPE: Record<Alert["type"], AdminArea> = {
  order: "orders",
  stock: "inventory",
  return: "returns",
  ticket: "support",
  expiry: "inventory",
};

// GET /api/admin/alerts — actionable items the caller's role is allowed to see.
export async function GET(request: Request) {
  const me = adminFromRequest(request);
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // A support-only staff account must not learn order values or stock levels
  // through the notification bell, so scope both the list and the counters.
  const { counts, items } = computeAlerts();
  const can = (a: AdminArea) => roleCan(me.role, a);
  const visible = items.filter((i) => can(AREA_FOR_TYPE[i.type]));
  const scoped = {
    newOrders: can("orders") ? counts.newOrders : 0,
    processing: can("orders") ? counts.processing : 0,
    lowStock: can("inventory") ? counts.lowStock : 0,
    pendingReturns: can("returns") ? counts.pendingReturns : 0,
    openTickets: can("support") ? counts.openTickets : 0,
    expiring: can("inventory") ? counts.expiring : 0,
  };
  const total =
    scoped.newOrders + scoped.lowStock + scoped.pendingReturns + scoped.openTickets + scoped.expiring;
  return NextResponse.json({ ok: true, total, counts: scoped, items: visible });
}
