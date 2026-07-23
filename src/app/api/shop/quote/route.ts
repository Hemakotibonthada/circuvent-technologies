import { NextResponse } from "next/server";
import { priceItems, type IncomingItem } from "@/lib/order-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/shop/quote { items, coupon? }
 * Server-authoritative price breakdown using LIVE store prices + coupon, so the
 * checkout summary always matches what Razorpay / the order will actually charge.
 */
export async function POST(request: Request) {
  const { items, coupon } = await request.json().catch(() => ({}));
  const p = priceItems(items as IncomingItem[], coupon);
  if (!p.ok) return NextResponse.json({ success: false, message: p.error }, { status: 400 });
  return NextResponse.json({
    success: true,
    lines: p.lines,
    subtotal: p.subtotal,
    shipping: p.shipping,
    discount: p.discount,
    couponCode: p.couponCode,
    couponLabel: p.couponLabel,
    total: p.total,
  });
}
