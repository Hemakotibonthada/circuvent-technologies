import crypto from "crypto";

/**
 * Server-side Razorpay payment verification.
 *
 * The signature Razorpay hands the browser only covers `order_id|payment_id`.
 * It says nothing about *how much* was captured, it stays valid forever, and
 * it is returned to the client — so on its own it cannot authorise a credit.
 * Anything that moves money must additionally confirm the payment with
 * Razorpay's API and claim the payment id exactly once.
 */

export interface RazorpayPayment {
  id: string;
  orderId: string;
  /** Captured amount in paise, straight from the gateway. */
  amountPaise: number;
  currency: string;
  status: string;
  email: string;
  notes: Record<string, string>;
}

export type VerifyResult =
  | { ok: true; payment: RazorpayPayment }
  | { ok: false; status: number; message: string };

export function razorpayKeys(): { keyId: string; keySecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Checkout handback signature: HMAC-SHA256(order_id|payment_id). */
export function checkoutSignatureValid(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string
): boolean {
  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqual(expected, signature);
}

/** Fetches a payment from Razorpay. Returns null if it cannot be read. */
export async function fetchPayment(paymentId: string): Promise<RazorpayPayment | null> {
  const keys = razorpayKeys();
  if (!keys) return null;
  const auth = Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64");
  try {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const d = (await res.json()) as Record<string, unknown>;
    return {
      id: String(d.id ?? ""),
      orderId: String(d.order_id ?? ""),
      amountPaise: Number(d.amount ?? 0),
      currency: String(d.currency ?? "INR"),
      status: String(d.status ?? ""),
      email: String(d.email ?? ""),
      notes: (d.notes as Record<string, string>) ?? {},
    };
  } catch {
    return null;
  }
}

/**
 * The single gate every money-moving route must pass.
 *
 * Confirms the handback signature, then re-reads the payment from Razorpay and
 * requires it to be captured against the same order. Callers must use the
 * returned `amountPaise` — never a figure from the request body — and must
 * claim the payment id through `consumePayment` before applying it.
 */
export async function verifyCapturedPayment(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<VerifyResult> {
  const { orderId, paymentId, signature } = input;
  if (!orderId || !paymentId || !signature) {
    return { ok: false, status: 400, message: "Missing payment details." };
  }
  const keys = razorpayKeys();
  if (!keys) return { ok: false, status: 500, message: "Payment gateway is not configured." };

  if (!checkoutSignatureValid(orderId, paymentId, signature, keys.keySecret)) {
    return { ok: false, status: 400, message: "Payment verification failed." };
  }

  const payment = await fetchPayment(paymentId);
  if (!payment) {
    return { ok: false, status: 502, message: "Could not confirm the payment with the gateway." };
  }
  if (payment.orderId !== orderId) {
    return { ok: false, status: 400, message: "Payment verification failed." };
  }
  if (payment.status !== "captured") {
    return { ok: false, status: 402, message: "That payment has not been captured yet." };
  }
  if (!(payment.amountPaise > 0)) {
    return { ok: false, status: 400, message: "Payment verification failed." };
  }
  return { ok: true, payment };
}
