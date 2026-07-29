import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/newsletter
 * 
 * Subscribes an email to the Buttondown newsletter.
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

    const { email } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: "Please provide a valid email address." },
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
        type: "regular",
      }),
    });

    if (response.status === 201) {
      return NextResponse.json({
        success: true,
        message: "You're subscribed! Welcome aboard.",
      });
    }

    if (response.status === 409) {
      return NextResponse.json({
        success: true,
        message: "You're already subscribed!",
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
