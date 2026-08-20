import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { logAudit } from "@/lib/store";
import {
  listAffiliates,
  upsertAffiliate,
  decideAffiliate,
  listConversions,
  recordConversion,
  commissionOwed,
  requestPayout,
  decidePayout,
  listPayouts,
  affiliateStats,
  revalidateAffiliates,
  flushAffiliates,
} from "@/lib/admin-affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "affiliates")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await revalidateAffiliates();
  const affiliates = listAffiliates();
  const owed = Object.fromEntries(affiliates.map((a) => [a.id, commissionOwed(a.id)]));
  return NextResponse.json({
    success: true,
    affiliates,
    owed,
    conversions: listConversions(),
    payouts: listPayouts(),
    stats: affiliateStats(),
  });
}

export async function POST(request: Request) {
  const me = guard(request, "affiliates");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await revalidateAffiliates();
    const b = await request.json();
    if (b.kind === "conversion") {
      if (!b.affiliateId || !b.orderNo || b.orderTotal === undefined) return NextResponse.json({ success: false, message: "affiliateId, orderNo, orderTotal required." }, { status: 400 });
      const conversion = recordConversion(b.affiliateId, b.orderNo, Number(b.orderTotal));
      if (!conversion) return NextResponse.json({ success: false, message: "Affiliate not found." }, { status: 404 });
      await flushAffiliates();
      return NextResponse.json({ success: true, conversion });
    }
    if (b.kind === "payout") {
      if (!b.affiliateId || !b.amount) return NextResponse.json({ success: false, message: "affiliateId and amount required." }, { status: 400 });
      const payout = requestPayout(b.affiliateId, Number(b.amount));
      await flushAffiliates();
      return NextResponse.json({ success: true, payout });
    }
    if (!b.name || !b.email) return NextResponse.json({ success: false, message: "name and email required." }, { status: 400 });
    const affiliate = upsertAffiliate({ name: b.name, email: b.email, commissionPct: Number(b.commissionPct) || 10 });
    logAudit("affiliates.upsert", affiliate.name);
    await flushAffiliates();
    return NextResponse.json({ success: true, affiliate });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const me = guard(request, "affiliates");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await revalidateAffiliates();
    const b = await request.json();
    if (b.kind === "payout") {
      const payout = decidePayout(b.id, b.status);
      if (!payout) return NextResponse.json({ success: false, message: "Not found." }, { status: 404 });
      logAudit("affiliates.payout.decide", `${b.id} -> ${b.status}`);
      await flushAffiliates();
      return NextResponse.json({ success: true, payout });
    }
    const affiliate = decideAffiliate(b.id, b.status);
    if (!affiliate) return NextResponse.json({ success: false, message: "Not found." }, { status: 404 });
    await flushAffiliates();
    return NextResponse.json({ success: true, affiliate });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}
