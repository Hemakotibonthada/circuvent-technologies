import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { listBatches, addBatch, deleteBatch, expiringBatches } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  if (searchParams.get("expiring")) return NextResponse.json({ batches: expiringBatches(Number(searchParams.get("days")) || undefined) });
  return NextResponse.json({ batches: listBatches(searchParams.get("productId") || undefined) });
}
export async function POST(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!body.productId || !body.batchNo) return NextResponse.json({ error: "productId and batchNo required" }, { status: 400 });
  return NextResponse.json({ ok: true, batch: addBatch(body) });
}
export async function DELETE(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") || "";
  return NextResponse.json({ ok: deleteBatch(id) });
}
