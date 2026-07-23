import { NextResponse, after } from "next/server";
import crypto from "crypto";
import {
  priceItems,
  validateCustomer,
  genOrderNo,
  sendOrderEmails,
  type IncomingItem,
  type CustomerInfo,
} from "@/lib/order-core";
import { recordOrder, adjustStock, earnPoints } from "@/lib/store";

export const runtime = "nodejs";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * POST /api/payments/verify
 * Verifies the Razorpay payment signature, then finalizes the order
 * (recomputes totals, emails confirmation). Returns the placed order.
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      return NextResponse.json({ success: false, message: "Payment gateway is not configured." }, { status: 500 });
    }

    const body = await request.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ success: false, message: "Missing payment details." }, { status: 400 });
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    if (!safeEqual(expected, razorpay_signature)) {
      return NextResponse.json({ success: false, message: "Payment verification failed." }, { status: 400 });
    }

    const items: IncomingItem[] = body?.items;
    const c: CustomerInfo = body?.customer ?? {};
    const priced = priceItems(items, body?.coupon);
    if (!priced.ok) return NextResponse.json({ success: false, message: priced.error }, { status: 400 });
    const errors = validateCustomer(c);
    if (Object.keys(errors).length) return NextResponse.json({ success: false, errors }, { status: 400 });

    const orderNo = genOrderNo();
    const placedAt = new Date().toISOString();
    const customer = {
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
      city: c.city || "",
      state: c.state || "",
      pincode: c.pincode,
    };

    try {
      recordOrder({
        orderNo,
        placedAt,
        items: priced.lines,
        subtotal: priced.subtotal,
        shipping: priced.shipping,
        discount: priced.discount,
        couponCode: priced.couponCode,
        total: priced.total,
        customer,
        paymentMethod: "razorpay",
        paymentStatus: "paid",
        paymentId: razorpay_payment_id,
      });
      adjustStock(items, -1);
      if (c.email) earnPoints(c.email, priced.total, orderNo);
    } catch (e) {
      console.error("Order persistence error:", e);
    }

    after(async () => {
      await sendOrderEmails({
        orderNo,
        lines: priced.lines,
        subtotal: priced.subtotal,
        shipping: priced.shipping,
        discount: priced.discount,
        couponLabel: priced.couponLabel,
        total: priced.total,
        customer: c,
        paymentMethod: "razorpay",
        paymentStatus: "paid",
      });
    });

    return NextResponse.json({
      success: true,
      order: {
        orderNo,
        placedAt,
        items: priced.lines,
        subtotal: priced.subtotal,
        shipping: priced.shipping,
        discount: priced.discount,
        couponCode: priced.couponCode,
        total: priced.total,
        customer,
        paymentMethod: "razorpay",
        paymentId: razorpay_payment_id,
        paymentStatus: "paid",
        status: "placed",
        emailed: true,
      },
    });
  } catch (e) {
    console.error("verify error:", e);
    return NextResponse.json({ success: false, message: "Payment verification error." }, { status: 500 });
  }
}
