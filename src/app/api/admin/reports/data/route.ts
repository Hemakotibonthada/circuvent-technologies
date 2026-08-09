import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { buildReport, isReportType } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/reports/data?type=sales&range=30 → the raw ReportTable JSON.
// The client formats it with reports-format so the figures render identically
// to the CSV and PDF (all three consume the same raw numbers).
export async function GET(request: Request) {
  if (!guard(request, "analytics")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "sales";
  const range = Math.min(365, Math.max(7, Number(searchParams.get("range")) || 30));
  if (!isReportType(type)) return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
  const table = buildReport(type, range);
  return NextResponse.json({ table });
}
