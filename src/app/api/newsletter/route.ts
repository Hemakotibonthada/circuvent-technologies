import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/newsletter
 *
 * Subscribes an email to the Buttondown newsletter using confirmed (double)
 * opt-in.
 *
 * Two rules here are deliberate and must not be relaxed:
 *
 *  1. `consent` must be explicitly true. The caller ticks a separate,
 *     non-prechecked box that asks for nothing but marketing consent, so
 *     subscribing is never a side effect of some other action.
 *  2. We do NOT send `type: "regular"`. Buttondown's default creates the
 *     subscriber as `unactivated` and emails a confirmation link, so an
 *     address only joins the list once its owner clicks it. Passing
 *     `type: "regular"` would let anyone subscribe someone else's address
 *     without their knowledge.
 *
 * Consent metadata is stored alongside the subscriber so we can evidence when
 * and where each person opted in.
 */
export async function POST(request: Request) {
  try {
    // Rate limiting — 5 subscriptions per minute per IP
    const ip = clientIp(request);
    const { ok, retryAfter } = rateLimit("newsletter", ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { email, consent, source } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: "Please provide a valid email address." },
        { status: 400 }
      );
    }

    if (consent !== true) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Please tick the consent box to confirm you'd like to receive these emails.",
        },
        { status: 400 }
      );
    }

    const BUTTONDOWN_API_KEY = process.env.BUTTONDOWN_API_KEY;

    if (!BUTTONDOWN_API_KEY) {
      console.error("BUTTONDOWN_API_KEY not configured");
      return NextResponse.json(
        { success: false, error: "Newsletter service not configured." },
        { status: 500 }
      );
    }

    const response = await fetch("https://api.buttondown.com/v1/subscribers", {
      method: "POST",
      headers: {
        Authorization: `Token ${BUTTONDOWN_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address: email,
        metadata: {
          consent_given_at: new Date().toISOString(),
          consent_source:
            typeof source === "string" && source ? source : "circuvent.com",
          consent_ip: ip,
          consent_method: "explicit checkbox + confirmed opt-in",
        },
      }),
    });

    if (response.status === 201) {
      return NextResponse.json({
        success: true,
        message:
          "Almost there — check your inbox and click the confirmation link to finish subscribing.",
      });
    }

    if (response.status === 409) {
      return NextResponse.json({
        success: true,
        message: "You're already on the list!",
      });
    }

    const errorData = await response.json().catch(() => null);
    console.error("Buttondown error:", response.status, errorData);

    return NextResponse.json(
      { success: false, error: "Failed to subscribe. Please try again." },
      { status: 500 }
    );
  } catch (error) {
    console.error("Newsletter error:", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
