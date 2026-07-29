import { NextResponse } from "next/server";
import { getLoyalty, redeemPointsToWallet, revalidate, flushNow } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/loyalty — points balance + history. */
export async function GET(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  await revalidate(["loyalty"]);
  const l = getLoyalty(email);
  return NextResponse.json({ success: true, points: l.points, history: l.history });
}

/** POST /api/loyalty { points } — redeem points to wallet (1 point = ₹1). */
export async function POST(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  const { points } = await request.json();
  // Same lost-update hazard as the gift-card path: read fresh, write durably.
  await revalidate(["loyalty", "wallets"]);
  const res = redeemPointsToWallet(email, Number(points) || 0);
  if (!res.ok) return NextResponse.json({ success: false, message: res.message }, { status: 400 });
  await flushNow();
  return NextResponse.json({ success: true, points: res.points, wallet: res.wallet });
}
