import { NextResponse } from "next/server";
import { adminFromRequest } from "@/lib/admin-auth";
import { computeAlerts } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/alerts — actionable items across the store for the admin bell.
export async function GET(request: Request) {
  const me = adminFromRequest(request);
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { total, counts, items } = computeAlerts();
  return NextResponse.json({ ok: true, total, counts, items });
}
