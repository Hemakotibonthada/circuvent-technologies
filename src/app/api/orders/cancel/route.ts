import { NextResponse } from "next/server";
import { cancelOrderByCustomer } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";

/** POST /api/orders/cancel { orderNo } — customer self-service cancellation. */
export async function POST(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });

  const { orderNo } = await request.json();
  if (!orderNo) return NextResponse.json({ success: false, message: "orderNo is required." }, { status: 400 });

  const res = cancelOrderByCustomer(String(orderNo), email);
  if (!res.ok) return NextResponse.json({ success: false, message: res.message }, { status: 400 });
  return NextResponse.json({ success: true, refunded: res.refunded || 0 });
}
