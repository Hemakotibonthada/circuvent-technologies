import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import crypto from "crypto";
import { rateLimit, rateLimitIdentity } from "@/lib/rate-limit";
import { getAccount, setPasswordReset, revalidate, flushNow } from "@/lib/store";
import { sendPasswordResetEmail } from "@/lib/order-core";

export const runtime = "nodejs";

function genOtp(): string {
  // A reset code is a credential. Math.random is V8's xorshift128+, whose state
  // is recoverable from other outputs the same process returns to callers
  // (address / ticket ids), which would make the code predictable.
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * POST /api/account/forgot-password — step 1 of password reset.
 * Always returns success (never reveals whether an email is registered, to
 * prevent account enumeration). When the account exists, a reset code is
 * created and emailed.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const { ok, retryAfter } = rateLimit("account", ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { email } = await request.json();
    const clean = String(email || "").trim().toLowerCase();
    const generic = {
      success: true,
      message: "If an account exists for that email, we've sent a reset code.",
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return NextResponse.json(generic);

    // Cap per address so the reset mail can't be used to flood one inbox from
    // many source IPs. Still returns the generic body — no enumeration signal.
    if (!rateLimitIdentity("forgot-password", clean, 3).ok) return NextResponse.json(generic);

    await revalidate(["accounts"]);
    const acc = getAccount(clean);
    if (acc && !acc.blocked) {
      const otp = genOtp();
      setPasswordReset({ email: clean, otp, expires: Date.now() + 15 * 60 * 1000, attempts: 0 });
      await flushNow();
      // Awaited so a failed send is recorded in the evidence log rather than
      // vanishing with the request. The response stays generic either way —
      // reporting the failure here would reveal whether the account exists.
      await sendPasswordResetEmail(clean, acc.name || "", otp);
    }
    return NextResponse.json(generic);
  } catch {
    return NextResponse.json({ success: false, message: "Could not start password reset." }, { status: 500 });
  }
}
