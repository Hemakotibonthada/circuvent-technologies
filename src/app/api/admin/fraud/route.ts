import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { logAudit } from "@/lib/store";
import { getSettings, updateSettings, listBlocklist, addBlocklistEntry, removeBlocklistEntry, listReviews, decideOrder, computeFlaggedOrders, fraudStats } from "@/lib/admin-fraud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "fraud")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({
    success: true,
    settings: getSettings(),
    blocklist: listBlocklist(),
    reviews: listReviews(),
    flagged: computeFlaggedOrders(),
    stats: fraudStats(),
  });
}

export async function POST(request: Request) {
  const me = guard(request, "fraud");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (b.kind === "blocklist") {
      if (!b.type || !b.value) return NextResponse.json({ success: false, message: "type and value required." }, { status: 400 });
      const entry = addBlocklistEntry(b.type, b.value, b.reason || "");
      logAudit("fraud.blocklist.add", `${entry.type}:${entry.value}`);
      return NextResponse.json({ success: true, entry });
    }
    if (b.kind === "settings") {
      const settings = updateSettings(b.settings || {});
      return NextResponse.json({ success: true, settings });
    }
    return NextResponse.json({ success: false, message: "Unknown kind." }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const me = guard(request, "fraud");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { orderNo, decision, note } = await request.json();
    if (!orderNo || !decision) return NextResponse.json({ success: false, message: "orderNo and decision required." }, { status: 400 });
    const review = decideOrder(orderNo, decision, me.name, note);
    logAudit("fraud.review.decide", `${orderNo} -> ${decision}`);
    return NextResponse.json({ success: true, review });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!guard(request, "fraud")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const ok = removeBlocklistEntry(searchParams.get("id") || "");
  return NextResponse.json({ success: ok });
}
