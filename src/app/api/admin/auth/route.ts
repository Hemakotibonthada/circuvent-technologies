import { NextRequest, NextResponse, after } from "next/server";
import { revalidate, setAdmin2faOtp, flushNow } from "@/lib/store";
import { sendAdmin2faEmail } from "@/lib/order-core";
import {
  authenticate,
  adminFromRequest,
  signAdminToken,
  ensureSeeded,
  DEFAULT_ADMIN_EMAIL,
} from "@/lib/admin-auth";

function genOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
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
        after(async () => {
          await sendAdmin2faEmail(user.email, user.name, otp);
        });
      }
      return NextResponse.json({ twoFactor: true, method, email: user.email });
    }

    return NextResponse.json({
      ok: true,
      token: signAdminToken(user.email),
      email: user.email,
      name: user.name,
      role: user.role,
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
  return NextResponse.json({
    authenticated: true,
    email: user.email,
    name: user.name,
    role: user.role,
  });
}
