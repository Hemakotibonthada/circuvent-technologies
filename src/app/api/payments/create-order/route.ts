import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { priceItems, type IncomingItem } from "@/lib/order-core";

export const runtime = "nodejs";

/**
 * POST /api/payments/create-order
 * Creates a Razorpay order (amount recomputed from the catalog) and returns
 * the order id + public key for the client checkout.
 */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { ok, retryAfter } = rateLimit("payments", ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json({ success: false, message: "Payment gateway is not configured." }, { status: 500 });
    }

    const body = await request.json();
    const items: IncomingItem[] = body?.items;
    const priced = priceItems(items, body?.coupon);
    if (!priced.ok) return NextResponse.json({ success: false, message: priced.error }, { status: 400 });

    const amount = Math.round(priced.total * 100); // paise
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount, currency: "INR", receipt: `rcpt_${Date.now()}`, payment_capture: 1 }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Razorpay create-order error:", data);
      return NextResponse.json(
        { success: false, message: data?.error?.description || "Could not start the payment." },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, orderId: data.id, amount, currency: "INR", keyId, total: priced.total });
  } catch (e) {
    console.error("create-order error:", e);
    return NextResponse.json({ success: false, message: "Something went wrong starting the payment." }, { status: 500 });
  }
}
