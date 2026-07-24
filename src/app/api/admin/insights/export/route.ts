import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { reportCsv } from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/insights/export?type=sales|products|customers|categories|coupons|tax&range=30
export async function GET(request: Request) {
  if (!guard(request, "analytics")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "sales";
  const range = Math.min(365, Math.max(7, Number(searchParams.get("range")) || 30));
  const csv = reportCsv(type, range);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="circuvent-${type}-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
