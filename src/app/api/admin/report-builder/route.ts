import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { listSavedReports, saveReport, deleteReport, runReport, type ReportDimension } from "@/lib/admin-report-builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "reportbuilder")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ success: true, reports: listSavedReports() });
}

/** POST /api/admin/report-builder — { kind: "save"|"run", dimensions[], fromDate?, toDate?, name? } */
export async function POST(request: Request) {
  if (!guard(request, "reportbuilder")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    const dimensions = (Array.isArray(b.dimensions) ? b.dimensions : []) as ReportDimension[];
    if (!dimensions.length) return NextResponse.json({ success: false, message: "At least one dimension required." }, { status: 400 });

    if (b.kind === "save") {
      if (!b.name) return NextResponse.json({ success: false, message: "name required." }, { status: 400 });
      const report = saveReport({ name: b.name, dimensions, fromDate: b.fromDate, toDate: b.toDate });
      return NextResponse.json({ success: true, report });
    }
    const rows = runReport(dimensions, b.fromDate, b.toDate);
    return NextResponse.json({ success: true, rows });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!guard(request, "reportbuilder")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const ok = deleteReport(searchParams.get("id") || "");
  return NextResponse.json({ success: ok });
}
