import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { revalidate, setAdmin2faOtp, flushNow } from "@/lib/store";
import { sendAdmin2faEmail } from "@/lib/order-core";
import {
  authenticate,
  adminFromRequest,
  signAdminToken,
  ensureSeeded,
  adminPasswordAge,
  DEFAULT_ADMIN_EMAIL,
  TOTP_PENDING,
} from "@/lib/admin-auth";
import { recordStaffLogin } from "@/lib/admin-staff-activity";

function genOtp(): string {
  // crypto, not Math.random: a login code is a credential, and V8's PRNG state
  // is recoverable from other outputs the same process hands to callers.
  return String(crypto.randomInt(100000, 1000000));
}

// POST — Sign in with email + password
export async function POST(request: NextRequest) {
  try {
    ensureSeeded();
    await revalidate(["adminUsers"]);
    const body = await request.json().catch(() => ({}));
    // Backwards-compatible: an old client that sends only { password } is treated
    // as the default owner account.
    const email = (body.email || DEFAULT_ADMIN_EMAIL).toString().trim().toLowerCase();
    const password = (body.password || "").toString();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const user = authenticate(email, password);
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Two-step verification: if enabled for this account, either email a code
    // (method "email") or require an authenticator code (method "totp") at
    // /api/admin/auth/verify-2fa before issuing a token.
    if (user.twoFactorEnabled) {
      const method = user.twoFactorMethod === "totp" && user.totpSecret ? "totp" : "email";
      if (method === "email") {
        const otp = genOtp();
        setAdmin2faOtp(user.email, otp);
        await flushNow();
        // Awaited, not deferred: if this code never sends, the admin cannot
        // complete sign-in at all. Reporting the failure is far better than
        // showing a code prompt that no code will ever arrive for.
        const sent = await sendAdmin2faEmail(user.email, user.name, otp);
        if (!sent) {
          return NextResponse.json(
            {
              ok: false,
              message:
                "Could not send your sign-in code. Please try again, or contact support if this continues.",
            },
            { status: 502 }
          );
        }
      } else {
        // Record that the password stage passed. Without this marker the TOTP
        // branch of verify-2fa would accept a code as the *only* factor, and
        // its guesses would not be counted against the attempt limit.
        setAdmin2faOtp(user.email, TOTP_PENDING);
        await flushNow();
      }
      return NextResponse.json({ twoFactor: true, method, email: user.email });
    }

    recordStaffLogin(user.email, request.headers.get("user-agent") || undefined);
    // A token is still issued when the password is expired. It has to be: the
    // change-password endpoint itself requires authentication. The console
    // gates every other panel on `mustChangePassword` instead.
    const age = adminPasswordAge(user);
    return NextResponse.json({
      ok: true,
      token: signAdminToken(user.email),
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl ?? "",
      mustChangePassword: age.expired,
      passwordExpiringSoon: age.expiringSoon,
      passwordDaysLeft: age.daysLeft,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// GET — Verify an existing token and return the current identity + role
export async function GET(request: NextRequest) {
  await revalidate(["adminUsers"]);
  const user = adminFromRequest(request);
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const age = adminPasswordAge(user);
  return NextResponse.json({
    authenticated: true,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl ?? "",
    mustChangePassword: age.expired,
    passwordExpiringSoon: age.expiringSoon,
    passwordDaysLeft: age.daysLeft,
  });
}
