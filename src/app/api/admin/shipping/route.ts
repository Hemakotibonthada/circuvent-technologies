import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { listZones, upsertZone, deleteZone } from "@/lib/admin-shipping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "shipping")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ success: true, zones: listZones() });
}

export async function POST(request: Request) {
  if (!guard(request, "shipping")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (!b.name || !Array.isArray(b.pincodePrefixes)) {
      return NextResponse.json({ success: false, message: "name and pincodePrefixes[] required." }, { status: 400 });
    }
    const zone = upsertZone({
      id: b.id,
      name: b.name,
      pincodePrefixes: b.pincodePrefixes,
      ratePerOrder: Number(b.ratePerOrder) || 60,
      freeShippingThreshold: Number(b.freeShippingThreshold) || 999,
      etaDays: Number(b.etaDays) || 5,
      active: b.active !== false,
    });
    return NextResponse.json({ success: true, zone });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!guard(request, "shipping")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const ok = deleteZone(searchParams.get("id") || "");
  return NextResponse.json({ success: ok });
}
