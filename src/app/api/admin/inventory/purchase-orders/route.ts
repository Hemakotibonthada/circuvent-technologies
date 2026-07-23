import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import {
  listPurchaseOrders, createPurchaseOrder, updatePurchaseOrder,
  receivePurchaseOrder, deletePurchaseOrder,
} from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ purchaseOrders: listPurchaseOrders() });
}

// POST { supplierId, items:[{productId,qty,costPrice}], expectedAt?, notes? }
export async function POST(request: Request) {
  const me = guard(request, "inventory");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!body.supplierId || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "supplierId and items required" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, po: createPurchaseOrder({ ...body, by: me.email }) });
}

// PATCH { id, action?: "receive", received?, ...patch }
export async function PATCH(request: Request) {
  const me = guard(request, "inventory");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (body.action === "receive") {
    const po = receivePurchaseOrder(body.id, body.received || [], me.email);
    if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });
    return NextResponse.json({ ok: true, po });
  }
  const po = updatePurchaseOrder(body.id, body);
  if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });
  return NextResponse.json({ ok: true, po });
}

export async function DELETE(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") || "";
  return NextResponse.json({ ok: deletePurchaseOrder(id) });
}
