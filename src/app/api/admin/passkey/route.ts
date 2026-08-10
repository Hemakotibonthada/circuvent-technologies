import { NextResponse } from "next/server";
import { adminFromRequest, signAdminToken } from "@/lib/admin-auth";
import { getAdminUser } from "@/lib/store";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import {
  finishAuthentication,
  finishRegistration,
  startAuthentication,
  startRegistration,
} from "@/lib/passkey-ceremony";
import { credentialsFor, removeCredential } from "@/lib/passkeys";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Passkeys for the staff console.
 *
 * A passkey replaces the password AND the second factor rather than sitting
 * beside them: the ceremony requires user verification, so a successful sign-in
 * means the device was present and the person proved themselves to it. That is
 * both of the things a password plus an emailed code were establishing, without
 * a shared secret that can be phished, reused, or read off a screen.
 *
 * Registering one requires an existing staff session. Whoever can add a passkey
 * can sign in with it indefinitely, so the bar for adding one is the bar for
 * signing in — never lower.
 */

const origin = (req: Request) => req.headers.get("origin") || new URL(req.url).origin;

export async function GET(req: Request) {
  const admin = adminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  return NextResponse.json({
    passkeys: credentialsFor("admin", admin.email).map((c) => ({
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

  let body: { step?: string; email?: string; label?: string; response?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const step = String(body.step ?? "");

  if (step === "register-options" || step === "register-verify") {
    const admin = adminFromRequest(req);
    if (!admin) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    if (step === "register-options") {
      const r = await startRegistration("admin", admin.email, origin(req));
      if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
      return NextResponse.json({ options: r.options });
    }

    const r = await finishRegistration(
      "admin",
      admin.email,
      origin(req),
      body.response as never,
      String(body.label ?? "Passkey")
    );
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
    logger.info("passkey.registered", { scope: "admin", email: admin.email });
    return NextResponse.json({ success: true });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  if (step === "login-options") {
    const r = await startAuthentication("admin", email, origin(req));
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
    return NextResponse.json({ options: r.options });
  }

  if (step === "login-verify") {
    const r = await finishAuthentication("admin", email, origin(req), body.response as never);
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });

    /*
     * Being who you say you are is not the same as still being staff.
     *
     * A passkey keeps working until it is deleted, and deleting the account is
     * the thing an administrator actually does when somebody leaves. Without
     * this check a removed or blocked account signs in with a key nobody
     * thought to revoke separately.
     */
    const user = getAdminUser(r.owner);
    if (!user || !user.active) {
      logger.warn("passkey.login_refused_inactive", { email: r.owner });
      return NextResponse.json({ error: "That account cannot sign in." }, { status: 403 });
    }

    logger.info("passkey.login", { scope: "admin", email: r.owner });
    return NextResponse.json({
      token: signAdminToken(user.email, user.tokenVersion),
      admin: { email: user.email, name: user.name, role: user.role },
    });
  }

  return NextResponse.json({ error: "Unknown step" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const admin = adminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Which passkey?" }, { status: 400 });

  const removed = removeCredential("admin", admin.email, id);
  if (removed) logger.info("passkey.removed", { scope: "admin", email: admin.email });
  return NextResponse.json({ success: removed });
}
