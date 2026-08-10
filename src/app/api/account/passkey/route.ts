import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { getAccount, revalidate } from "@/lib/store";
import { signToken, tokenFromRequest, verifyToken } from "@/lib/account";
import {
  finishAuthentication,
  finishRegistration,
  startAuthentication,
  startRegistration,
} from "@/lib/passkey-ceremony";
import { credentialsFor, removeCredential } from "@/lib/passkeys";
import { mintConsoleSession, federationConfigured } from "@/lib/sso";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Passkeys for customers, which is also how /smarthome gets one.
 *
 * The console's own accounts live in the control plane, which has no WebAuthn
 * and which this deployment cannot add one to. But it already trusts this
 * backend to vouch for a customer it has authenticated — that is what the
 * federation bridge is — so a passkey verified here is worth a console session
 * for the same address, exactly as a password verified here already is.
 *
 * Which means the console gets passkeys without the control plane learning what
 * a passkey is.
 */

const origin = (req: Request) => req.headers.get("origin") || new URL(req.url).origin;

export async function GET(req: Request) {
  const email = verifyToken(tokenFromRequest(req));
  if (!email) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  return NextResponse.json({
    passkeys: credentialsFor("account", email).map((c) => ({
      id: c.id,
      label: c.label,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const { ok, retryAfter } = rateLimit("account", clientIp(req));
  if (!ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  let body: { step?: string; email?: string; label?: string; response?: unknown; console?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const step = String(body.step ?? "");

  if (step === "register-options" || step === "register-verify") {
    const signedIn = verifyToken(tokenFromRequest(req));
    if (!signedIn) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

    if (step === "register-options") {
      const r = await startRegistration("account", signedIn, origin(req));
      if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
      return NextResponse.json({ options: r.options });
    }

    const r = await finishRegistration(
      "account",
      signedIn,
      origin(req),
      body.response as never,
      String(body.label ?? "Passkey")
    );
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
    logger.info("passkey.registered", { scope: "account", email: signedIn });
    return NextResponse.json({ success: true });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  if (step === "login-options") {
    const r = await startAuthentication("account", email, origin(req));
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
    return NextResponse.json({ options: r.options });
  }

  if (step === "login-verify") {
    const r = await finishAuthentication("account", email, origin(req), body.response as never);
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });

    await revalidate(["accounts"]);
    const acc = getAccount(r.owner);
    if (!acc || acc.blocked || acc.deletedAt) {
      logger.warn("passkey.login_refused_inactive", { email: r.owner });
      return NextResponse.json({ error: "That account cannot sign in." }, { status: 403 });
    }

    const payload: Record<string, unknown> = {
      success: true,
      token: signToken(acc.email),
      account: { email: acc.email, name: acc.name },
    };

    /*
     * A console session too, when the sign-in was for /smarthome.
     *
     * Requested explicitly rather than always: minting one has to reach the
     * control plane over the network, and a customer signing in to the shop
     * should not wait on that, nor be failed by it.
     */
    if (body.console) {
      if (!federationConfigured()) {
        payload.consoleError = "Single sign-on is not enabled on this deployment yet.";
      } else {
        const session = await mintConsoleSession(acc.email, acc.name);
        if (session) {
          payload.console = session;
        } else {
          payload.consoleError = "Signed in, but the smart-home service could not be reached.";
        }
      }
    }

    logger.info("passkey.login", { scope: "account", email: acc.email });
    return NextResponse.json(payload);
  }

  return NextResponse.json({ error: "Unknown step" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const email = verifyToken(tokenFromRequest(req));
  if (!email) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Which passkey?" }, { status: 400 });

  const removed = removeCredential("account", email, id);
  if (removed) logger.info("passkey.removed", { scope: "account", email });
  return NextResponse.json({ success: removed });
}
