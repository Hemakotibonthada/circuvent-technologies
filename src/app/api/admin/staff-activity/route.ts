import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { listStaffLogins, staffActivityStats } from "@/lib/admin-staff-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/staff-activity — staff login history (requires the "staff" area). */
export async function GET(request: Request) {
  if (!guard(request, "staff")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ success: true, events: listStaffLogins(), stats: staffActivityStats() });
}
