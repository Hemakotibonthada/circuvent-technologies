import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { listRates, upsertRate, deleteRate } from "@/lib/admin-currency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "currency")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ success: true, rates: listRates() });
}

export async function POST(request: Request) {
  if (!guard(request, "currency")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (!b.code || !b.symbol || b.rateFromInr === undefined) {
      return NextResponse.json({ success: false, message: "code, symbol and rateFromInr required." }, { status: 400 });
    }
    const rate = upsertRate({ code: b.code, symbol: b.symbol, rateFromInr: Number(b.rateFromInr) });
    return NextResponse.json({ success: true, rate });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!guard(request, "currency")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const ok = deleteRate(searchParams.get("id") || "");
  return NextResponse.json({ success: ok });
}
