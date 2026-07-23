import { NextResponse } from "next/server";
import { getOrCreateReferral, REFERRAL_REWARD_AMOUNT } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/referral — my referral code, share link and stats. */
export async function GET(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });

  const ref = getOrCreateReferral(email);
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    success: true,
    code: ref.code,
    link: `${origin}/shop?ref=${ref.code}`,
    referredCount: ref.referredEmails.length,
    reward: REFERRAL_REWARD_AMOUNT,
    referredBy: ref.referredBy ?? null,
    rewarded: ref.rewarded,
  });
}
