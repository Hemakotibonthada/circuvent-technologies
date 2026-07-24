import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  getPendingRegistration,
  setPendingRegistration,
  clearPendingRegistration,
  createAccount,
  getAccount,
  getOrCreateReferral,
  linkReferral,
  revalidate,
  flushNow,
} from "@/lib/store";
import { signToken } from "@/lib/account";

export const runtime = "nodejs";

/**
 * POST /api/account/verify-otp — step 2 of sign-up.
 * Confirms the emailed code and creates the account, returning a session token.
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

    const { email, otp } = await request.json();
    if (!email || !otp) {
      return NextResponse.json({ success: false, message: "Email and code are required." }, { status: 400 });
    }

    const clean = String(email).trim().toLowerCase();
    await revalidate(["pending", "accounts"]);
    const p = getPendingRegistration(clean);
    if (!p) {
      return NextResponse.json(
        { success: false, message: "No pending verification. Please sign up again." },
        { status: 400 }
      );
    }
    if (Date.now() > p.expires) {
      clearPendingRegistration(clean);
      return NextResponse.json(
        { success: false, message: "That code expired. Please request a new one." },
        { status: 400 }
      );
    }
    if (String(otp).trim() !== p.otp) {
      p.attempts += 1;
      if (p.attempts >= 5) {
        clearPendingRegistration(clean);
        return NextResponse.json(
          { success: false, message: "Too many incorrect attempts. Please sign up again." },
          { status: 400 }
        );
      }
      setPendingRegistration(p);
      return NextResponse.json({ success: false, message: "Incorrect code. Please try again." }, { status: 400 });
    }

    if (!getAccount(clean)) {
      createAccount({ email: p.email, name: p.name, hash: p.hash, salt: p.salt, createdAt: new Date().toISOString() });
      getOrCreateReferral(p.email);
      if (p.ref) linkReferral(p.email, p.ref);
    }
    clearPendingRegistration(clean);
    // Guarantee the new account is durable before responding so the user can
    // immediately sign in on any device / serverless instance.
    await flushNow();

    return NextResponse.json({
      success: true,
      token: signToken(p.email),
      account: { email: p.email, name: p.name },
    });
  } catch {
    return NextResponse.json({ success: false, message: "Could not verify the code." }, { status: 500 });
  }
}
