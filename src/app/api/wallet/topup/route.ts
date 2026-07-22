import { NextResponse } from "next/server";
import crypto from "crypto";
import { rateLimit } from "@/lib/rate-limit";
import { creditWallet } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";

const MIN = 100;
const MAX = 100000;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * POST /api/wallet/topup
 *  { mode: "create", amount }  -> creates a Razorpay order for a wallet top-up
 *  { mode: "verify", amount, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *      -> verifies the payment and credits the wallet (store credit)
 * Requires a signed-in account (Authorization: Bearer <token>).
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

    const email = verifyToken(tokenFromRequest(request));
    if (!email) {
      return NextResponse.json({ success: false, message: "Please sign in to top up your wallet." }, { status: 401 });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json({ success: false, message: "Payment gateway is not configured." }, { status: 500 });
    }

    const body = await request.json();
    const amount = Math.round(Number(body?.amount) || 0);
    if (amount < MIN || amount > MAX) {
      return NextResponse.json(
        { success: false, message: `Enter an amount between ₹${MIN} and ₹${MAX}.` },
        { status: 400 }
      );
    }

    if (body?.mode === "create") {
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      const res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amount * 100,
          currency: "INR",
          receipt: `wallet_${Date.now()}`,
          payment_capture: 1,
          notes: { purpose: "wallet_topup", email },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("Wallet top-up create error:", data);
        return NextResponse.json(
          { success: false, message: data?.error?.description || "Could not start the top-up." },
          { status: 502 }
        );
      }
      return NextResponse.json({ success: true, orderId: data.id, amount: amount * 100, currency: "INR", keyId });
    }

    if (body?.mode === "verify") {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body || {};
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return NextResponse.json({ success: false, message: "Missing payment details." }, { status: 400 });
      }
      const expected = crypto
        .createHmac("sha256", keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");
      if (!safeEqual(expected, razorpay_signature)) {
        return NextResponse.json({ success: false, message: "Payment verification failed." }, { status: 400 });
      }
      const w = creditWallet(email, amount, "Wallet top-up", razorpay_payment_id);
      return NextResponse.json({ success: true, balance: w.balance });
    }

    return NextResponse.json({ success: false, message: "Unknown request." }, { status: 400 });
  } catch (e) {
    console.error("wallet topup error:", e);
    return NextResponse.json({ success: false, message: "Something went wrong." }, { status: 500 });
  }
}
