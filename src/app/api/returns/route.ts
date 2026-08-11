import { NextResponse } from "next/server";
import { createReturn, listReturnsByEmail, getOrder } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";
import { returnEligibility } from "@/lib/return-eligibility";

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

  /*
   * Enforce the published window here, not just in the UI.
   *
   * /returns-policy promises seven days from delivery. The store only checked
   * ownership and duplicates, so a request on a year-old order was accepted and
   * then had to be turned down by hand — the customer had already been told it
   * was submitted. Hiding the button stops an accident; it does not stop a
   * POST. Refusing here with the reason lets somebody who genuinely needs an
   * exception go to support instead of waiting on a request that cannot be
   * granted.
   */
  const order = getOrder(String(orderNo), email);
  if (!order) return NextResponse.json({ success: false, message: "Order not found for your account." }, { status: 404 });

  const existing = listReturnsByEmail(email).find(
    (r) => r.orderNo === String(orderNo) && r.status !== "rejected"
  );
  const eligibility = returnEligibility(order, { existingStatus: existing?.status ?? null });
  if (!eligibility.canRequest) {
    return NextResponse.json({ success: false, message: eligibility.reason }, { status: 400 });
  }

  const res = createReturn({ orderNo: String(orderNo), email, reason: String(reason) });
  if (!res.ok) return NextResponse.json({ success: false, message: res.message }, { status: 400 });
  return NextResponse.json({ success: true, request: res.request });
}
