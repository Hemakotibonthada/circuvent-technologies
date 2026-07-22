import { NextResponse } from "next/server";
import { getWallet } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/wallet — balance + transaction history for the signed-in customer. */
export async function GET(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) {
    return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  }
  const w = getWallet(email);
  return NextResponse.json({ success: true, balance: w.balance, history: w.history });
}
