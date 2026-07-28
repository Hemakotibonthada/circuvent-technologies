import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { logAudit } from "@/lib/store";
import { listHsnMappings, upsertHsnMapping, deleteHsnMapping, listGstReturns, generateGstReport, getInvoiceSequence, nextInvoiceNumber, updateSequencePrefix, taxStats } from "@/lib/admin-tax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "tax")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({
    success: true,
    mappings: listHsnMappings(),
    returns: listGstReturns(),
    sequence: getInvoiceSequence(),
    stats: taxStats(),
  });
}

export async function POST(request: Request) {
  const me = guard(request, "tax");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (b.kind === "generate-return") {
      if (!b.periodLabel) return NextResponse.json({ success: false, message: "periodLabel required." }, { status: 400 });
      const record = generateGstReport(b.periodLabel);
      logAudit("tax.gst.generate", record.periodLabel);
      return NextResponse.json({ success: true, record });
    }
    if (b.kind === "reserve-invoice-number") {
      const number = nextInvoiceNumber();
      return NextResponse.json({ success: true, number });
    }
    if (b.kind === "update-prefix") {
      const sequence = updateSequencePrefix(b.prefix || "CVT/GST");
      return NextResponse.json({ success: true, sequence });
    }
    if (!b.matchType || !b.matchValue || !b.hsnCode) {
      return NextResponse.json({ success: false, message: "matchType, matchValue and hsnCode required." }, { status: 400 });
    }
    const mapping = upsertHsnMapping({ id: b.id, matchType: b.matchType, matchValue: b.matchValue, hsnCode: b.hsnCode, gstRatePct: Number(b.gstRatePct) || 18 });
    return NextResponse.json({ success: true, mapping });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!guard(request, "tax")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const ok = deleteHsnMapping(searchParams.get("id") || "");
  return NextResponse.json({ success: ok });
}
