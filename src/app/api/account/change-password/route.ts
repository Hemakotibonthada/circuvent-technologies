import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getAccount, setAccountPassword, revalidate, flushNow } from "@/lib/store";
import { verifyPassword, hashPassword, signToken, verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";

/**
 * POST /api/account/change-password { currentPassword, newPassword } — signed-in.
 * Verifies the current password before setting the new one, and returns a fresh
 * token.
 */
export async function POST(request: Request) {
  try {
    const email = verifyToken(tokenFromRequest(request));
    if (!email) {
      return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { ok, retryAfter } = rateLimit("account", ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ success: false, message: "Current and new passwords are required." }, { status: 400 });
    }
    if (String(newPassword).length < 6) {
      return NextResponse.json({ success: false, message: "Use at least 6 characters for your new password." }, { status: 400 });
    }

    await revalidate(["accounts"]);
    const acc = getAccount(email);
    if (!acc || !verifyPassword(String(currentPassword), acc.salt, acc.hash)) {
      return NextResponse.json({ success: false, message: "Your current password is incorrect." }, { status: 400 });
    }

    const { salt, hash } = hashPassword(String(newPassword));
    setAccountPassword(email, hash, salt);
    await flushNow();

    return NextResponse.json({
      success: true,
      message: "Your password has been updated.",
      token: signToken(email),
    });
  } catch {
    return NextResponse.json({ success: false, message: "Could not change your password." }, { status: 500 });
  }
}
