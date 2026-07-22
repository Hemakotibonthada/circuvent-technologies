import { NextResponse } from "next/server";
import { createReturn, listReturnsByEmail } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/returns — the signed-in customer's return requests. */
export async function GET(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  return NextResponse.json({ success: true, returns: listReturnsByEmail(email) });
}

/** POST /api/returns { orderNo, reason } — request a return for an order. */
export async function POST(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });

  const { orderNo, reason } = await request.json();
  if (!orderNo || !reason || String(reason).trim().length < 3) {
    return NextResponse.json({ success: false, message: "Order and a reason are required." }, { status: 400 });
  }
  const res = createReturn({ orderNo: String(orderNo), email, reason: String(reason) });
  if (!res.ok) return NextResponse.json({ success: false, message: res.message }, { status: 400 });
  return NextResponse.json({ success: true, request: res.request });
}
