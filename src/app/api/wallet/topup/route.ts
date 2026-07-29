import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { creditWallet, consumePayment, releasePayment, revalidate, flushNow } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";
import { razorpayKeys, verifyCapturedPayment } from "@/lib/razorpay";

export const runtime = "nodejs";

const MIN = 100;
const MAX = 100000;

/**
 * POST /api/wallet/topup
 *  { mode: "create", amount }  -> creates a Razorpay order for a wallet top-up
 *  { mode: "verify", amount, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *      -> verifies the payment and credits the wallet (store credit)
 * Requires a signed-in account (Authorization: Bearer <token>).
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
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

    const keys = razorpayKeys();
    if (!keys) {
      return NextResponse.json({ success: false, message: "Payment gateway is not configured." }, { status: 500 });
    }
    const { keyId, keySecret } = keys;

    const body = await request.json();

    if (body?.mode === "create") {
      const amount = Math.round(Number(body?.amount) || 0);
      if (amount < MIN || amount > MAX) {
        return NextResponse.json(
          { success: false, message: `Enter an amount between ₹${MIN} and ₹${MAX}.` },
          { status: 400 }
        );
      }
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
      const check = await verifyCapturedPayment({
        orderId: String(razorpay_order_id || ""),
        paymentId: String(razorpay_payment_id || ""),
        signature: String(razorpay_signature || ""),
      });
      if (!check.ok) {
        return NextResponse.json({ success: false, message: check.message }, { status: check.status });
      }
      const { payment } = check;

      // The order carries the account it was raised for. A payment made for
      // someone else's top-up must not land in this wallet.
      const orderedFor = (payment.notes?.email || "").trim().toLowerCase();
      if (payment.notes?.purpose !== "wallet_topup" || (orderedFor && orderedFor !== email)) {
        return NextResponse.json({ success: false, message: "Payment verification failed." }, { status: 400 });
      }

      // Balances are read-modify-written in memory, so pull the current copy in
      // before crediting and push it back out before responding.
      await revalidate(["wallets", "consumedPayments"]);

      // Claim the payment id first. The checkout signature stays valid for ever,
      // so this is what stops one capture crediting the wallet twice.
      const claimed = consumePayment({
        paymentId: payment.id,
        purpose: "wallet_topup",
        email,
        amountPaise: payment.amountPaise,
        ref: payment.orderId,
      });
      if (!claimed) {
        return NextResponse.json(
          { success: false, message: "That payment has already been credited." },
          { status: 409 }
        );
      }

      try {
        // Credit what the gateway actually captured — never the body value.
        const w = creditWallet(email, Math.round(payment.amountPaise / 100), "Wallet top-up", payment.id);
        await flushNow();
        return NextResponse.json({ success: true, balance: w.balance });
      } catch (e) {
        releasePayment(payment.id);
        throw e;
      }
    }

    return NextResponse.json({ success: false, message: "Unknown request." }, { status: 400 });
  } catch (e) {
    console.error("wallet topup error:", e);
    return NextResponse.json({ success: false, message: "Something went wrong." }, { status: 500 });
  }
}
