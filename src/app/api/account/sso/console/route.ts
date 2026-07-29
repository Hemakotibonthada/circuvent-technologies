import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { getAccount, revalidate } from "@/lib/store";
import { tokenFromRequest, verifyToken } from "@/lib/account";
import { mintConsoleSession, federationConfigured } from "@/lib/sso";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * POST /api/account/sso/console — trade a shop session for a console session.
 *
 * The storefront and the smart-home console keep separate user tables, so a
 * customer who signed up on the shop has no console account and vice versa.
 * Rather than copying password hashes between two different schemes, this
 * backend vouches for a customer it has already authenticated and the control
 * plane issues its own session for the same address.
 *
 * The shop session is verified here, server-side, before anything is minted,
 * and the federation secret never leaves this process.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const { ok, retryAfter } = rateLimit("account", ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    if (!federationConfigured()) {
      return NextResponse.json(
        { success: false, message: "Single sign-on is not configured." },
        { status: 501 }
      );
    }

    const email = verifyToken(tokenFromRequest(request));
    if (!email) {
      return NextResponse.json({ success: false, message: "Please sign in first." }, { status: 401 });
    }

    await revalidate(["accounts"]);
    const acc = getAccount(email);
    if (!acc || acc.blocked || acc.deletedAt) {
      return NextResponse.json({ success: false, message: "Please sign in first." }, { status: 401 });
    }

    const session = await mintConsoleSession(acc.email, acc.name);
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Could not reach the smart-home service." },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, ...session });
  } catch (err) {
    logger.error("sso.console_exchange_failed", {}, err);
    return NextResponse.json({ success: false, message: "Could not sign you in." }, { status: 500 });
  }
}
