import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  getAccount,
  getPasswordReset,
  setPasswordReset,
  clearPasswordReset,
  setAccountPassword,
  revalidate,
  flushNow,
} from "@/lib/store";
import { hashPassword, signToken } from "@/lib/account";

export const runtime = "nodejs";

/**
 * POST /api/account/reset-password { email, otp, password } — step 2.
 * Verifies the emailed code and sets a new password, returning a fresh session
 * token so the user is signed in immediately.
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

    const { email, otp, password } = await request.json();
    const clean = String(email || "").trim().toLowerCase();
    if (!clean || !otp) {
      return NextResponse.json({ success: false, message: "Email and code are required." }, { status: 400 });
    }
    if (!password || String(password).length < 6) {
      return NextResponse.json({ success: false, message: "Use at least 6 characters for your new password." }, { status: 400 });
    }

    await revalidate(["passwordResets", "accounts"]);
    const p = getPasswordReset(clean);
    if (!p) {
      return NextResponse.json({ success: false, message: "No active reset request. Please start again." }, { status: 400 });
    }
    if (Date.now() > p.expires) {
      clearPasswordReset(clean);
      await flushNow();
      return NextResponse.json({ success: false, message: "That code expired. Please request a new one." }, { status: 400 });
    }
    if (String(otp).trim() !== p.otp) {
      p.attempts += 1;
      if (p.attempts >= 5) {
        clearPasswordReset(clean);
        await flushNow();
        return NextResponse.json({ success: false, message: "Too many incorrect attempts. Please request a new code." }, { status: 400 });
      }
      setPasswordReset(p);
      await flushNow();
      return NextResponse.json({ success: false, message: "Incorrect code. Please try again." }, { status: 400 });
    }

    const acc = getAccount(clean);
    if (!acc) {
      clearPasswordReset(clean);
      return NextResponse.json({ success: false, message: "Account not found." }, { status: 404 });
    }
    const { salt, hash } = hashPassword(String(password));
    setAccountPassword(clean, hash, salt);
    clearPasswordReset(clean);
    await flushNow();

    return NextResponse.json({
      success: true,
      message: "Your password has been reset.",
      token: signToken(clean),
      account: { email: acc.email, name: acc.name },
    });
  } catch {
    return NextResponse.json({ success: false, message: "Could not reset your password." }, { status: 500 });
  }
}
