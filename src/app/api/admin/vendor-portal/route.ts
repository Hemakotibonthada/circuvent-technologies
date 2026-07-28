import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { logAudit } from "@/lib/store";
import {
  listVendors,
  upsertVendor,
  deleteVendor,
  logPerformanceEvent,
  listPerformanceEvents,
  vendorScorecard,
  listQuoteRequests,
  createQuoteRequest,
  decideQuoteRequest,
  vendorStats,
} from "@/lib/admin-vendors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "vendors")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get("vendorId");
  const vendors = listVendors();
  const scorecards = Object.fromEntries(vendors.map((v) => [v.id, vendorScorecard(v.id)]));
  return NextResponse.json({
    success: true,
    vendors,
    scorecards,
    quotes: listQuoteRequests(vendorId || undefined),
    events: vendorId ? listPerformanceEvents(vendorId) : [],
    stats: vendorStats(),
  });
}

export async function POST(request: Request) {
  const me = guard(request, "vendors");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (b.kind === "event") {
      if (!b.vendorId || !b.type) return NextResponse.json({ success: false, message: "vendorId and type required." }, { status: 400 });
      const event = logPerformanceEvent(b.vendorId, b.type, b.detail || "", me.name);
      return NextResponse.json({ success: true, event });
    }
    if (b.kind === "quote") {
      if (!b.vendorId || !b.title) return NextResponse.json({ success: false, message: "vendorId and title required." }, { status: 400 });
      const quote = createQuoteRequest({ vendorId: b.vendorId, title: b.title, itemsDescription: b.itemsDescription || "", quotedAmount: b.quotedAmount });
      return NextResponse.json({ success: true, quote });
    }
    // default: vendor upsert
    if (!b.companyName || !b.contactName || !b.email) {
      return NextResponse.json({ success: false, message: "companyName, contactName and email are required." }, { status: 400 });
    }
    const vendor = upsertVendor(b);
    logAudit("vendors.upsert", vendor.companyName);
    return NextResponse.json({ success: true, vendor });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const me = guard(request, "vendors");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (b.action === "decide-quote") {
      const quote = decideQuoteRequest(b.id, !!b.approved, b.note);
      if (!quote) return NextResponse.json({ success: false, message: "Not found." }, { status: 404 });
      logAudit("vendors.quote.decide", `${quote.id} -> ${quote.status}`);
      return NextResponse.json({ success: true, quote });
    }
    return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!guard(request, "vendors")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const ok = deleteVendor(searchParams.get("id") || "");
  return NextResponse.json({ success: ok });
}
