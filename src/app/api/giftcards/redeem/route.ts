import { NextResponse } from "next/server";
import { redeemGiftCard, revalidate, flushNow } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/giftcards/redeem { code } — redeem a gift card to wallet. */
export async function POST(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in to redeem a gift card." }, { status: 401 });

  const { code } = await request.json().catch(() => ({}));
  if (!code || typeof code !== "string") {
    return NextResponse.json({ success: false, message: "Enter a gift card code." }, { status: 400 });
  }

  // Read the current card + wallet from the durable store first, and persist
  // before responding. Without this, two concurrent redeems on different
  // serverless instances both see an unused card and both credit the wallet.
  await revalidate(["giftCards", "wallets"]);
  const res = redeemGiftCard(code, email);
  if (!res.ok) return NextResponse.json({ success: false, message: res.error }, { status: 400 });
  await flushNow();
  return NextResponse.json({ success: true, credited: res.credited, balance: res.balance, message: `₹${res.credited} added to your wallet.` });
}
