import { NextResponse } from "next/server";
import { adminFromRequest, requireArea } from "@/lib/admin-auth";
import { listAudit, revalidate } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/audit — recent admin/audit trail entries.
export async function GET(request: Request) {
  // The trail records every staff action across all areas, so it is gated on
  // "settings" rather than being readable by any signed-in admin.
  if (!requireArea(adminFromRequest(request), "settings")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await revalidate(["audit"]);
  return NextResponse.json({ ok: true, entries: listAudit(150) });
}
