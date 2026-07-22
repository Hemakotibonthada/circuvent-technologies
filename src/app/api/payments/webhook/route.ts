import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * POST /api/payments/webhook
 * Razorpay webhook receiver. Verifies the signature against
 * RAZORPAY_WEBHOOK_SECRET, then acknowledges the event.
 * Configure the endpoint at https://dashboard.razorpay.com/app/webhooks
 * with URL https://circuvent.com/api/payments/webhook
 */
export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ success: false, message: "Webhook not configured." }, { status: 500 });
  }

  const signature = request.headers.get("x-razorpay-signature") || "";
  const raw = await request.text();

  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  if (!valid) {
    return NextResponse.json({ success: false, message: "Invalid signature." }, { status: 400 });
  }

  try {
    const event = JSON.parse(raw);
    const paymentId = event?.payload?.payment?.entity?.id ?? "";
    console.log(`Razorpay webhook: ${event?.event ?? "unknown"} ${paymentId}`);
    // Reconciliation hook: when a persistent order store exists, mark the order
    // paid/failed here based on event.event (payment.captured, payment.failed, ...).
  } catch {
    /* ignore malformed body — signature already verified */
  }

  return NextResponse.json({ success: true });
}
