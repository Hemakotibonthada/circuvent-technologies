import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { getSettings, updateSettings } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ settings: getSettings() });
}
export async function PATCH(request: Request) {
  if (!guard(request, "inventory")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({ ok: true, settings: updateSettings(body) });
}
