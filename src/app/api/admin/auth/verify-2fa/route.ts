import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import crypto from "crypto";
import { rateLimit } from "@/lib/rate-limit";
import { revalidate, getAdmin2faOtp, bumpAdmin2faAttempt, clearAdmin2faOtp, getAdminUser, flushNow } from "@/lib/store";
import { signAdminToken, ensureSeeded, adminPasswordAge } from "@/lib/admin-auth";
import { recordStaffLogin } from "@/lib/admin-staff-activity";
import { verifyTotp } from "@/lib/totp";
import { TOTP_PENDING } from "@/lib/admin-auth";

export const runtime = "nodejs";

/** Rotation flags returned alongside a freshly minted session token. */
function passwordFlags(user: Parameters<typeof adminPasswordAge>[0]) {
  const age = adminPasswordAge(user);
  return {
    mustChangePassword: age.expired,
    passwordExpiringSoon: age.expiringSoon,
    passwordDaysLeft: age.daysLeft,
  };
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// POST /api/admin/auth/verify-2fa { email, otp } — completes 2-step admin sign-in.
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const { ok, retryAfter } = rateLimit("account", ip);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    ensureSeeded();
    const { email, otp } = await request.json().catch(() => ({}));
    const clean = String(email || "").trim().toLowerCase();
    if (!clean || !otp) return NextResponse.json({ error: "Email and code are required." }, { status: 400 });

    await revalidate(["admin2fa", "adminUsers"]);

    const user = getAdminUser(clean);
    if (!user || !user.active) {
      return NextResponse.json({ error: "Account not found or inactive." }, { status: 401 });
    }

    // Both branches require server-side state created by a successful password
    // login. Without it the second factor would be the only factor.
    const p = getAdmin2faOtp(clean);
    if (!p) return NextResponse.json({ error: "No pending verification. Please sign in again." }, { status: 400 });
    if (Date.now() > p.expires) {
      clearAdmin2faOtp(clean);
      await flushNow();
      return NextResponse.json({ error: "That code expired. Please sign in again." }, { status: 400 });
    }

    const fail = async (message: string) => {
      bumpAdmin2faAttempt(clean);
      if (p.attempts + 1 >= 5) {
        clearAdmin2faOtp(clean);
        await flushNow();
        return NextResponse.json({ error: "Too many incorrect attempts. Please sign in again." }, { status: 400 });
      }
      await flushNow();
      return NextResponse.json({ error: message }, { status: 400 });
    };

    // Authenticator (TOTP) path — verify the code against the shared secret.
    if (user.twoFactorMethod === "totp" && user.totpSecret) {
      if (p.otp !== TOTP_PENDING) {
        return NextResponse.json({ error: "No pending verification. Please sign in again." }, { status: 400 });
      }
      if (!verifyTotp(user.totpSecret, String(otp))) {
        return fail("Incorrect code. Check your authenticator app.");
      }
      clearAdmin2faOtp(clean);
      await flushNow();
      recordStaffLogin(user.email, request.headers.get("user-agent") || undefined);
      return NextResponse.json({
        ok: true,
        token: signAdminToken(user.email),
        email: user.email,
        name: user.name,
        role: user.role,
      });
    }

    // Email-OTP path.
    if (p.otp === TOTP_PENDING) {
      return NextResponse.json({ error: "No pending verification. Please sign in again." }, { status: 400 });
    }
    if (!safeEqual(String(otp).trim(), p.otp)) {
      return fail("Incorrect code. Please try again.");
    }

    clearAdmin2faOtp(clean);
    await flushNow();

    recordStaffLogin(user.email, request.headers.get("user-agent") || undefined);
    return NextResponse.json({
      ok: true,
      token: signAdminToken(user.email),
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch {
    return NextResponse.json({ error: "Could not verify the code." }, { status: 500 });
  }
}
