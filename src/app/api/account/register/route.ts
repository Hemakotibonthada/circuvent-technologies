import { NextResponse, after } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getAccount, setPendingRegistration } from "@/lib/store";
import { hashPassword } from "@/lib/account";
import { sendOtpEmail } from "@/lib/order-core";

export const runtime = "nodejs";

function genOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * POST /api/account/register — step 1 of sign-up.
 * Validates, stashes a pending registration with a 6-digit OTP, and emails
 * the code (in the background so the response returns instantly). The account
 * is only created once the code is confirmed at /api/account/verify-otp.
 */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { ok, retryAfter } = rateLimit("account", ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { name, email, password } = await request.json();
    const errors: Record<string, string> = {};
    if (!name || String(name).trim().length < 2) errors.name = "Please enter your name.";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email.";
    if (!password || String(password).length < 6) errors.password = "Use at least 6 characters.";
    if (Object.keys(errors).length) return NextResponse.json({ success: false, errors }, { status: 400 });

    const clean = String(email).trim().toLowerCase();
    if (getAccount(clean)) {
      return NextResponse.json(
        { success: false, message: "An account with this email already exists. Please sign in." },
        { status: 409 }
      );
    }

    const { salt, hash } = hashPassword(String(password));
    const cleanName = String(name).trim();
    const otp = genOtp();
    setPendingRegistration({
      email: clean,
      name: cleanName,
      hash,
      salt,
      otp,
      expires: Date.now() + 10 * 60 * 1000,
      attempts: 0,
    });

    // Send the code after the response so sign-up feels instant.
    after(async () => {
      await sendOtpEmail(clean, cleanName, otp);
    });

    return NextResponse.json({
      success: true,
      pending: true,
      email: clean,
      message: `We've emailed a 6-digit code to ${clean}.`,
    });
  } catch {
    return NextResponse.json({ success: false, message: "Could not start sign-up." }, { status: 500 });
  }
}
