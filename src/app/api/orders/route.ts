import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  priceItems,
  validateCustomer,
  genOrderNo,
  sendOrderEmails,
  type IncomingItem,
  type CustomerInfo,
} from "@/lib/order-core";

export const runtime = "nodejs";

/**
 * POST /api/orders
 * Places a Cash-on-Delivery / offline order: recomputes totals from the
 * catalog, emails a confirmation + store notification, returns the order.
 * Online card/UPI payments go through /api/payments/*.
 */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { ok, retryAfter } = rateLimit("orders", ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await request.json();
    const items: IncomingItem[] = body?.items;
    const c: CustomerInfo = body?.customer ?? {};

    const priced = priceItems(items);
    if (!priced.ok) return NextResponse.json({ success: false, message: priced.error }, { status: 400 });

    const errors = validateCustomer(c);
    if (Object.keys(errors).length > 0) return NextResponse.json({ success: false, errors }, { status: 400 });

    const orderNo = genOrderNo();
    const placedAt = new Date().toISOString();
    const emailed = await sendOrderEmails({
      orderNo,
      lines: priced.lines,
      subtotal: priced.subtotal,
      shipping: priced.shipping,
      total: priced.total,
      customer: c,
      paymentMethod: c.paymentMethod || "cod",
      paymentStatus: "pending",
    });

    return NextResponse.json({
      success: true,
      order: {
        orderNo,
        placedAt,
        items: priced.lines,
        subtotal: priced.subtotal,
        shipping: priced.shipping,
        total: priced.total,
        customer: {
          name: c.name,
          email: c.email,
          phone: c.phone,
          address: c.address,
          city: c.city || "",
          state: c.state || "",
          pincode: c.pincode,
        },
        paymentMethod: c.paymentMethod || "cod",
        status: "placed",
        emailed,
      },
    });
  } catch (error) {
    console.error("Orders error:", error);
    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
