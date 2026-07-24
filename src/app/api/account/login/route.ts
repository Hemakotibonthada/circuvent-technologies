import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getAccount, revalidate } from "@/lib/store";
import { verifyPassword, signToken } from "@/lib/account";

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

    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ success: false, message: "Email and password are required." }, { status: 400 });
    }

    await revalidate(["accounts"]);
    const acc = getAccount(String(email));
    if (!acc || !verifyPassword(String(password), acc.salt, acc.hash)) {
      return NextResponse.json({ success: false, message: "Invalid email or password." }, { status: 401 });
    }
    if (acc.blocked) {
      return NextResponse.json(
        { success: false, message: "This account has been suspended. Please contact support." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      token: signToken(acc.email),
      account: { email: acc.email, name: acc.name },
    });
  } catch {
    return NextResponse.json({ success: false, message: "Could not sign you in." }, { status: 500 });
  }
}
