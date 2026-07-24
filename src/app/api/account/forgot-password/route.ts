import { NextResponse, after } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getAccount, setPasswordReset, revalidate, flushNow } from "@/lib/store";
import { sendPasswordResetEmail } from "@/lib/order-core";

export const runtime = "nodejs";

function genOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * POST /api/account/forgot-password — step 1 of password reset.
 * Always returns success (never reveals whether an email is registered, to
 * prevent account enumeration). When the account exists, a reset code is
 * created and emailed.
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

    const { email } = await request.json();
    const clean = String(email || "").trim().toLowerCase();
    const generic = {
      success: true,
      message: "If an account exists for that email, we've sent a reset code.",
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return NextResponse.json(generic);

    await revalidate(["accounts"]);
    const acc = getAccount(clean);
    if (acc && !acc.blocked) {
      const otp = genOtp();
      setPasswordReset({ email: clean, otp, expires: Date.now() + 15 * 60 * 1000, attempts: 0 });
      await flushNow();
      after(async () => {
        await sendPasswordResetEmail(clean, acc.name || "", otp);
      });
    }
    return NextResponse.json(generic);
  } catch {
    return NextResponse.json({ success: false, message: "Could not start password reset." }, { status: 500 });
  }
}
