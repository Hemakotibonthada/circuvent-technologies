import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import {
  createInvoice,
  createSubscription,
  updateSubscriptionStatus,
} from "@/lib/saas-store";
import { getProductBySlug, SAAS_PLANS } from "@/lib/saas-products";
import { verifyCapturedPayment } from "@/lib/razorpay";

export const runtime = "nodejs";

/**
 * POST /api/saas/checkout
 * Creates a subscription (or invoice) for a SaaS product plan.
 *
 * Body:
 * {
 *   productSlug, planId, orgName, customerEmail, seats,
 *   paymentMode: "razorpay" | "manual" | "wallet",
 *   razorpay_order_id?, razorpay_payment_id?, razorpay_signature?
 * }
 *
 * Payment is optional for custom/enterprise plans. When Razorpay is used,
 * we verify the capture then activate the subscription.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const { ok, retryAfter } = rateLimit("saas-checkout", ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
    }

    const productSlug = String(body.productSlug || "");
    const planId = String(body.planId || "");
    const orgName = String(body.orgName || "").trim();
    const customerEmail = String(body.customerEmail || "").trim().toLowerCase();
    const seats = Math.max(1, Number(body.seats) || 1);
    const paymentMode = String(body.paymentMode || "manual");

    const product = getProductBySlug(productSlug);
    if (!product) {
      return NextResponse.json({ success: false, message: "Unknown product." }, { status: 404 });
    }

    const plan =
      product.plans.find((p) => p.id === planId) ||
      SAAS_PLANS.find((p) => p.id === planId);
    if (!plan) {
      return NextResponse.json({ success: false, message: "Unknown plan." }, { status: 400 });
    }

    if (!orgName || !customerEmail) {
      return NextResponse.json(
        { success: false, message: "Organisation name and email are required." },
        { status: 400 }
      );
    }

    // Per-seat monthly plans charge one month of the plan price.
    const charge = plan.price > 0 ? plan.price : 0;

    const sub = createSubscription({
      orgName,
      customerEmail,
      productSlug: product.slug,
      planId: plan.id,
      planName: plan.name,
      seats,
      priceLabel:
        plan.price <= 0
          ? "Custom"
          : `₹${plan.price.toLocaleString("en-IN")} / seat / mo`,
    });

    if (paymentMode === "razorpay") {
      const orderId = String(body.razorpay_order_id || "");
      const paymentId = String(body.razorpay_payment_id || "");
      const signature = String(body.razorpay_signature || "");
      if (!orderId || !paymentId || !signature) {
        return NextResponse.json(
          { success: false, message: "Payment details required for Razorpay." },
          { status: 400 }
        );
      }
      const check = await verifyCapturedPayment({
        orderId,
        paymentId,
        signature,
      });
      if (!check.ok) {
        return NextResponse.json(
          { success: false, message: check.message },
          { status: check.status }
        );
      }

      updateSubscriptionStatus(sub.id, "active");
      const invoice = createInvoice({
        subscriptionId: sub.id,
        customerEmail,
        amount: charge,
        description: `${product.name} · ${plan.name}`,
        status: "paid",
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
      });

      return NextResponse.json({
        success: true,
        subscription: { ...sub, status: "active" },
        invoice,
        amount: charge,
      });
    }

    // Manual / free: activate subscription and optionally create invoice.
    updateSubscriptionStatus(sub.id, "active");
    if (charge > 0 && paymentMode === "manual") {
      createInvoice({
        subscriptionId: sub.id,
        customerEmail,
        amount: charge,
        description: `${product.name} · ${plan.name} (manual)`,
        status: "pending",
      });
    }

    return NextResponse.json({
      success: true,
      subscription: { ...sub, status: "active" },
      amount: charge,
    });
  } catch (e) {
    console.error("saas checkout error:", e);
    return NextResponse.json(
      { success: false, message: "Something went wrong starting the checkout." },
      { status: 500 }
    );
  }
}
