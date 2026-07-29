import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { priceItems, type IncomingItem } from "@/lib/order-core";
import { validateCoupon } from "@/lib/coupons";

export const runtime = "nodejs";

/** POST /api/coupons/validate { items, code } — server-authoritative discount check. */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const { ok, retryAfter } = rateLimit("orders", ip);
  if (!ok) {
    return NextResponse.json(
      { success: false, message: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const { items, code } = await request.json();
  const priced = priceItems(items as IncomingItem[]);
  if (!priced.ok) return NextResponse.json({ success: false, message: priced.error }, { status: 400 });

  const r = validateCoupon(String(code || ""), priced.subtotal, priced.shipping);
  const total = Math.max(0, priced.subtotal + priced.shipping - (r.valid ? r.discount : 0));
  return NextResponse.json({
    success: r.valid,
    code: r.code,
    discount: r.discount,
    label: r.label,
    message: r.message,
    subtotal: priced.subtotal,
    shipping: priced.shipping,
    total,
  });
}
