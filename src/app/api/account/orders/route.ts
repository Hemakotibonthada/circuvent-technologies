import { NextResponse } from "next/server";
import { listOrdersByEmail, listReturnsByEmail, revalidate } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/account/orders — order history for the signed-in customer. */
export async function GET(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) {
    return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  }
  // Reflect orders placed / updated on other serverless instances.
  await revalidate(["orders", "returns"]);

  /*
   * The return window runs from delivery, and whether one is already in
   * progress decides whether to offer another — so both travel with the order.
   * The alternative was a second request from a different part of the page,
   * which would have let the orders list offer a return that the returns list
   * already knew was under way.
   */
  const returns = listReturnsByEmail(email);
  const returnFor = new Map<string, string>();
  for (const r of returns) {
    if (r.status !== "rejected") returnFor.set(r.orderNo, r.status);
  }

  const orders = listOrdersByEmail(email).map((o) => ({
    orderNo: o.orderNo,
    placedAt: o.placedAt,
    items: o.items,
    total: o.total,
    status: o.status,
    updatedAt: o.updatedAt || null,
    history: o.history || [],
    returnStatus: returnFor.get(o.orderNo) || null,
    trackingNumber: o.trackingNumber || null,
    carrier: o.carrier || null,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    customer: o.customer,
  }));
  return NextResponse.json({ success: true, orders });
}
