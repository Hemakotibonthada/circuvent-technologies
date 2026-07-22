import { NextResponse } from "next/server";
import { listOrdersByEmail } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/account/orders — order history for the signed-in customer. */
export async function GET(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) {
    return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  }
  const orders = listOrdersByEmail(email).map((o) => ({
    orderNo: o.orderNo,
    placedAt: o.placedAt,
    items: o.items,
    total: o.total,
    status: o.status,
    trackingNumber: o.trackingNumber || null,
    carrier: o.carrier || null,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
  }));
  return NextResponse.json({ success: true, orders });
}
