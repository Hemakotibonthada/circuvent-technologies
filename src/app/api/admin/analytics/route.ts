import { NextResponse } from "next/server";
import { analytics, listAudit, lowStockProducts, salesSeries } from "@/lib/store";
import { adminFromRequest, requireArea } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyAdmin(request: Request): boolean {
  return requireArea(adminFromRequest(request), "analytics");
}

/** GET /api/admin/analytics — commerce KPIs + recent audit log. */
export async function GET(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    success: true,
    stats: analytics(),
    audit: listAudit(30),
    lowStock: lowStockProducts(5),
    sales: salesSeries(14),
  });
}
