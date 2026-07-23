import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { listMovements, recordMovement, setStock } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?productId=&type=&limit=
export async function GET(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  return NextResponse.json({
    movements: listMovements({
      productId: searchParams.get("productId") || undefined,
      type: searchParams.get("type") || undefined,
      limit: Number(searchParams.get("limit")) || 500,
    }),
  });
}

// POST { productId, mode: "delta"|"set", qty, reason }
export async function POST(request: Request) {
  const me = guard(request, "inventory");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const { productId, mode, qty, reason } = body;
  if (!productId || qty === undefined) return NextResponse.json({ error: "productId and qty required" }, { status: 400 });

  const mv = mode === "set"
    ? setStock(String(productId), Number(qty), reason || "Manual set", me.email)
    : recordMovement(String(productId), Number(qty) >= 0 ? "manual_in" : "manual_out", Number(qty), { reason: reason || "Manual adjustment", by: me.email });

  if (!mv) return NextResponse.json({ ok: true, note: "No change" });
  return NextResponse.json({ ok: true, movement: mv });
}
