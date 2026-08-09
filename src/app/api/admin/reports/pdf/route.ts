import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { buildReport, isReportType, companyInfo } from "@/lib/reports";
import { renderReportPdf } from "@/lib/reports-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/reports/pdf?type=tax&range=30 → a real, server-generated PDF.
// Produced with pdf-lib (no headless browser), so it runs on Vercel's default
// serverless runtime: company header, summary strip, paginated table with the
// column header repeated per page, a bold totals row, sections, notes and a
// "Page X of Y" footer.
export async function GET(request: Request) {
  if (!guard(request, "analytics")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "sales";
  const range = Math.min(365, Math.max(7, Number(searchParams.get("range")) || 30));
  if (!isReportType(type)) return NextResponse.json({ error: "Unknown report type" }, { status: 400 });

  const table = buildReport(type, range);
  const orientationParam = searchParams.get("orientation");
  const orientation = orientationParam === "portrait" || orientationParam === "landscape" ? orientationParam : "auto";
  const pdf = await renderReportPdf(table, { company: companyInfo(), orientation });
  const body = new Uint8Array(pdf);
  const filename = `circuvent-${type}-report-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
