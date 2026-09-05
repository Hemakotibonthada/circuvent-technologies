import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import {
  findInvoicesForSubscription,
  findSubscriptionByEmail,
  listInvoices,
  listSubscriptions,
} from "@/lib/saas-store";
import { getProductBySlug } from "@/lib/saas-products";

export const runtime = "nodejs";

/**
 * GET /api/saas/portal?email= or ?subscriptionId=
 * Lists the customer's subscriptions and invoices.
 *
 * For demo / portal access without account login, the caller may pass an
 * email. When the account is signed in, that email is preferred.
 */
export async function GET(request: Request) {
  try {
    const ip = clientIp(request);
    const { ok, retryAfter } = rateLimit("saas-portal", ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const url = new URL(request.url);
    const email = (url.searchParams.get("email") || "").trim().toLowerCase();
    const subscriptionId = (url.searchParams.get("subscriptionId") || "").trim();
    const productSlug = (url.searchParams.get("product") || "").trim().toLowerCase();

    if (!email && !subscriptionId) {
      return NextResponse.json(
        { success: false, message: "Provide email or subscriptionId." },
        { status: 400 }
      );
    }

    let subscriptions = listSubscriptions();
    if (subscriptionId) {
      subscriptions = subscriptions.filter((s) => s.id === subscriptionId);
    }
    if (email) {
      subscriptions = subscriptions.filter(
        (s) => s.customerEmail.toLowerCase() === email
      );
    }
    if (productSlug) {
      subscriptions = subscriptions.filter((s) => s.productSlug === productSlug);
    }

    const invoices = listInvoices().filter((i) =>
      subscriptions.some((s) => s.id === i.subscriptionId)
    );

    // Enrich with product metadata
    const enriched = subscriptions.map((s) => ({
      ...s,
      product: getProductBySlug(s.productSlug) ?? null,
      invoices: findInvoicesForSubscription(s.id),
    }));

    return NextResponse.json({
      success: true,
      subscriptions: enriched,
      invoices: invoices.map((i) => {
        const owner = subscriptions.find((s) => s.id === i.subscriptionId);
        return {
          ...i,
          product: owner ? getProductBySlug(owner.productSlug) ?? null : null,
        };
      }),
    });
  } catch (e) {
    console.error("saas portal error:", e);
    return NextResponse.json(
      { success: false, message: "Could not load portal data." },
      { status: 500 }
    );
  }
}
