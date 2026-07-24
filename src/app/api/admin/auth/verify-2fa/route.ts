import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { revalidate, getAdmin2faOtp, bumpAdmin2faAttempt, clearAdmin2faOtp, getAdminUser, flushNow } from "@/lib/store";
import { signAdminToken, ensureSeeded } from "@/lib/admin-auth";

export const runtime = "nodejs";

// POST /api/admin/auth/verify-2fa { email, otp } — completes 2-step admin sign-in.
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
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
    const p = getAdmin2faOtp(clean);
    if (!p) return NextResponse.json({ error: "No pending verification. Please sign in again." }, { status: 400 });
    if (Date.now() > p.expires) {
      clearAdmin2faOtp(clean);
      await flushNow();
      return NextResponse.json({ error: "That code expired. Please sign in again." }, { status: 400 });
    }
    if (String(otp).trim() !== p.otp) {
      bumpAdmin2faAttempt(clean);
      if (p.attempts + 1 >= 5) {
        clearAdmin2faOtp(clean);
        await flushNow();
        return NextResponse.json({ error: "Too many incorrect attempts. Please sign in again." }, { status: 400 });
      }
      await flushNow();
      return NextResponse.json({ error: "Incorrect code. Please try again." }, { status: 400 });
    }

    const user = getAdminUser(clean);
    if (!user || !user.active) {
      clearAdmin2faOtp(clean);
      return NextResponse.json({ error: "Account not found or inactive." }, { status: 401 });
    }
    clearAdmin2faOtp(clean);
    await flushNow();

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
