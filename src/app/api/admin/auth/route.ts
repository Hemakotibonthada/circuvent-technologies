import { NextRequest, NextResponse } from "next/server";
import {
  authenticate,
  adminFromRequest,
  signAdminToken,
  ensureSeeded,
  DEFAULT_ADMIN_EMAIL,
} from "@/lib/admin-auth";

// POST — Sign in with email + password
export async function POST(request: NextRequest) {
  try {
    ensureSeeded();
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
