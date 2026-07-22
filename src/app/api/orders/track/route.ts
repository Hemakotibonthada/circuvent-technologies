import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getOrder } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/orders/track?order=CV-...&email=you@example.com
 * Public, cross-device order tracking. Returns status, history and any
 * tracking / carrier info an admin has added.
 */
export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok, retryAfter } = rateLimit("track", ip);
  if (!ok) {
    return NextResponse.json(
      { success: false, message: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const orderNo = (searchParams.get("order") || "").trim();
  const email = (searchParams.get("email") || "").trim();
  if (!orderNo || !email) {
    return NextResponse.json(
      { success: false, message: "Order number and email are required." },
      { status: 400 }
    );
  }

  const o = getOrder(orderNo, email);
  if (!o) {
    return NextResponse.json(
      { success: false, message: "No order found for that number and email." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    order: {
      orderNo: o.orderNo,
      placedAt: o.placedAt,
      items: o.items,
      subtotal: o.subtotal,
      shipping: o.shipping,
      total: o.total,
      status: o.status,
      trackingNumber: o.trackingNumber || null,
      carrier: o.carrier || null,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      history: o.history,
      customer: { email: o.customer.email },
    },
  });
}
