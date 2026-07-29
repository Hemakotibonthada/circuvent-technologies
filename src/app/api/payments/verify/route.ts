import { NextResponse, after } from "next/server";
import {
  priceItems,
  validateCustomer,
  genOrderNo,
  sendOrderEmails,
  type IncomingItem,
  type CustomerInfo,
} from "@/lib/order-core";
import {
  recordOrder,
  adjustStock,
  earnPoints,
  rewardReferralOnPaidOrder,
  debitWallet,
  consumePayment,
  releasePayment,
  revalidate,
  flushNow,
} from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";
import { verifyCapturedPayment } from "@/lib/razorpay";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * POST /api/payments/verify
 * Confirms the Razorpay payment with the gateway, checks that what was
 * captured matches what this cart costs, then finalizes the order.
 *
 * SECURITY: the checkout handback signature only covers `order_id|payment_id`.
 * It carries no amount and never expires, so on its own one real payment could
 * be replayed into unlimited paid orders of any value. Two controls prevent
 * that and both must stay: the captured amount is compared against the
 * server-recomputed total, and the payment id is claimed exactly once.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
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

    const items: IncomingItem[] = body?.items;
    const c: CustomerInfo = body?.customer ?? {};
    const priced = priceItems(items, body?.coupon);
    if (!priced.ok) return NextResponse.json({ success: false, message: priced.error }, { status: 400 });
    const errors = validateCustomer(c);
    if (Object.keys(errors).length) return NextResponse.json({ success: false, errors }, { status: 400 });

    // A wallet part-payment reduces what had to be paid online, so it has to be
    // settled before the amount check — and only for the account that owns it.
    const requestedWallet = Math.max(0, Math.min(Math.round(Number(body?.walletApply) || 0), priced.total));
    const tokenEmail = verifyToken(tokenFromRequest(request));
    const walletOwner =
      requestedWallet > 0 && tokenEmail && tokenEmail.toLowerCase() === String(c.email || "").toLowerCase()
        ? tokenEmail
        : null;
    if (requestedWallet > 0 && !walletOwner) {
      logger.warn("payments.wallet_apply_unauthorized", {});
      return NextResponse.json(
        { success: false, message: "Sign in to the account that owns this wallet to use its balance." },
        { status: 401 }
      );
    }
    const walletIntent = walletOwner ? requestedWallet : 0;

    // The gateway is the authority on what was actually paid.
    const expectedPaise = Math.round((priced.total - walletIntent) * 100);
    if (payment.amountPaise !== expectedPaise) {
      logger.warn("payments.amount_mismatch", {
        paymentId: payment.id,
        capturedPaise: payment.amountPaise,
        expectedPaise,
      });
      return NextResponse.json(
        { success: false, message: "The amount paid does not match this order. Nothing has been charged twice." },
        { status: 400 }
      );
    }

    await revalidate(["wallets", "orders", "consumedPayments", "loyalty", "referrals", "products"]);

    // Claim the payment id before anything is written. This is what makes a
    // replay of the same (order, payment, signature) triple a no-op.
    const claimed = consumePayment({
      paymentId: payment.id,
      purpose: "order",
      email: String(c.email || "").toLowerCase(),
      amountPaise: payment.amountPaise,
      ref: payment.orderId,
    });
    if (!claimed) {
      return NextResponse.json(
        { success: false, message: "This payment has already been used for an order." },
        { status: 409 }
      );
    }

    let walletUsed = 0;
    if (walletOwner && walletIntent > 0) {
      const res = debitWallet(walletOwner, walletIntent, `Order (wallet part-payment)`, payment.id);
      if (!res.ok) {
        // They only paid the remainder online, so without the balance the order
        // is underpaid. Release the claim so a retry after a top-up can succeed.
        releasePayment(payment.id);
        await flushNow();
        return NextResponse.json(
          { success: false, message: "Your wallet balance changed. Please retry the payment." },
          { status: 409 }
        );
      }
      walletUsed = walletIntent;
    }
    const payMethod = walletUsed > 0 ? "razorpay+wallet" : "razorpay";

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
        paymentMethod: payMethod,
        paymentStatus: "paid",
        paymentId: razorpay_payment_id,
      });
      adjustStock(items, -1);
      if (c.email) {
        earnPoints(c.email, priced.total, orderNo);
        rewardReferralOnPaidOrder(c.email, orderNo);
      }
      await flushNow();
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
        paymentMethod: payMethod,
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
        paymentMethod: payMethod,
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
