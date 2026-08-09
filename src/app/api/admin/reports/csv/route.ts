import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { buildReport, reportToCsv, isReportType } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/reports/csv?type=sales&range=30 → CSV of raw numbers, ideal for
// spreadsheets. Shares the exact figures of the on-screen report and the PDF.
export async function GET(request: Request) {
  if (!guard(request, "analytics")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "sales";
  const range = Math.min(365, Math.max(7, Number(searchParams.get("range")) || 30));
  if (!isReportType(type)) return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
  const csv = reportToCsv(buildReport(type, range));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="circuvent-${type}-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
