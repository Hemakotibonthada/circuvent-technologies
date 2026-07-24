import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { dashboard } from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/insights?range=30 -> full analytics dashboard payload
export async function GET(request: Request) {
  if (!guard(request, "analytics")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const range = Math.min(365, Math.max(7, Number(new URL(request.url).searchParams.get("range")) || 30));
  return NextResponse.json({ ok: true, ...dashboard(range) });
}
