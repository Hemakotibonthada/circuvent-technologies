import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getAccount, createAccount } from "@/lib/store";
import { hashPassword, signToken } from "@/lib/account";

export const runtime = "nodejs";

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

    if (getAccount(email)) {
      return NextResponse.json(
        { success: false, message: "An account with this email already exists. Please sign in." },
        { status: 409 }
      );
    }

    const { salt, hash } = hashPassword(String(password));
    const clean = String(email).trim().toLowerCase();
    createAccount({ email: clean, name: String(name).trim(), hash, salt, createdAt: new Date().toISOString() });

    return NextResponse.json({
      success: true,
      token: signToken(clean),
      account: { email: clean, name: String(name).trim() },
    });
  } catch {
    return NextResponse.json({ success: false, message: "Could not create the account." }, { status: 500 });
  }
}
