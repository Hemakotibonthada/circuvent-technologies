import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { listProductRows, getMeta, updateMeta } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET -> all product rows (product + inventory meta + live stock/value); ?productId= for one
export async function GET(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const productId = new URL(request.url).searchParams.get("productId");
  if (productId) return NextResponse.json({ meta: getMeta(productId) });
  return NextResponse.json({ rows: listProductRows() });
}

// PATCH { productId, ...meta fields }
export async function PATCH(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!body.productId) return NextResponse.json({ error: "productId required" }, { status: 400 });
  const { productId, ...patch } = body;
  return NextResponse.json({ ok: true, meta: updateMeta(productId, patch) });
}
