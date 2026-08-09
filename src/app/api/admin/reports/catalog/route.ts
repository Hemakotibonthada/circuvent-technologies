import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { REPORT_CATALOG, REPORT_GROUPS } from "@/lib/reports-format";
import { companyInfo } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/reports/catalog → the report catalogue, groups and the company
// header (so the panel can show who the reports are billed as). The catalogue
// itself is static config the client could import, but the company info is
// env-derived server state, so this endpoint carries both.
export async function GET(request: Request) {
  if (!guard(request, "analytics")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({
    catalog: REPORT_CATALOG,
    groups: REPORT_GROUPS,
    company: companyInfo(),
  });
}
