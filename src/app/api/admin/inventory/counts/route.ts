import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { listCounts, getCount, createCount, setCountLine, closeCount } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (id) return NextResponse.json({ count: getCount(id) });
  return NextResponse.json({ counts: listCounts() });
}

// POST { locationId?, productIds?, notes? } -> new count sheet
export async function POST(request: Request) {
  const me = guard(request, "inventory");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({ ok: true, count: createCount({ ...body, by: me.email }) });
}

// PATCH { id, action: "line", productId, counted }  OR  { id, action: "close" }
export async function PATCH(request: Request) {
  const me = guard(request, "inventory");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (body.action === "close") {
    const c = closeCount(body.id, me.email);
    if (!c) return NextResponse.json({ error: "Count not found / already closed" }, { status: 404 });
    return NextResponse.json({ ok: true, count: c });
  }
  const c = setCountLine(body.id, body.productId, Number(body.counted));
  if (!c) return NextResponse.json({ error: "Count not found / closed" }, { status: 404 });
  return NextResponse.json({ ok: true, count: c });
}
