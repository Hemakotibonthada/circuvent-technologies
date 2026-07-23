import { NextResponse } from "next/server";
import { listGiftCards, issueGiftCard, setGiftCardActive, logAudit } from "@/lib/store";
import { guard } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — list all issued gift cards
export async function GET(request: Request) {
  if (!guard(request, "coupons")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ giftCards: listGiftCards() });
}

// POST — issue a new gift card
export async function POST(request: Request) {
  const me = guard(request, "coupons");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  if (!amount || amount < 1) return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
  const card = issueGiftCard(amount, me.email, body.issuedTo, body.note);
  logAudit("giftcard.issue", `${me.email} issued ${card.code} for ₹${card.amount}`);
  return NextResponse.json({ ok: true, giftCard: card });
}

// PATCH — activate / deactivate a gift card
export async function PATCH(request: Request) {
  const me = guard(request, "coupons");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { code, active } = await request.json().catch(() => ({}));
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const ok = setGiftCardActive(String(code), !!active);
  if (!ok) return NextResponse.json({ error: "Gift card not found" }, { status: 404 });
  logAudit("giftcard.toggle", `${me.email} set ${code} active=${!!active}`);
  return NextResponse.json({ ok: true });
}
