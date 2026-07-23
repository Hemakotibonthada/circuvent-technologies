import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { listLocations, upsertLocation, deleteLocation } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ locations: listLocations() });
}
export async function POST(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!body.name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  return NextResponse.json({ ok: true, location: upsertLocation(body) });
}
export async function DELETE(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") || "";
  return NextResponse.json({ ok: deleteLocation(id) });
}
