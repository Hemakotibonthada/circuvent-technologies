import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { listTransfers, createTransfer, receiveTransfer, cancelTransfer } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ transfers: listTransfers() });
}

// POST { fromLocationId, toLocationId, items:[{productId,qty}], notes? }
export async function POST(request: Request) {
  const me = guard(request, "inventory");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!body.fromLocationId || !body.toLocationId || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "from/to location + items required" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, transfer: createTransfer({ ...body, by: me.email }) });
}

// PATCH { id, action: "receive"|"cancel" }
export async function PATCH(request: Request) {
  const me = guard(request, "inventory");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const t = body.action === "cancel" ? cancelTransfer(body.id, me.email) : receiveTransfer(body.id, me.email);
  if (!t) return NextResponse.json({ error: "Transfer not found / not in transit" }, { status: 404 });
  return NextResponse.json({ ok: true, transfer: t });
}
