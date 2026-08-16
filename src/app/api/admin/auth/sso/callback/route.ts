import { NextResponse, type NextRequest } from "next/server";
import {
  ISSUER,
  CLIENT_ID,
  STATE_COOKIE,
  HANDOFF_TTL_MS,
  newNonce,
  signHandoff,
  unpackFlow,
} from "@/lib/admin-sso";
import { ensureSeeded } from "@/lib/admin-auth";
import { getAdminUser } from "@/lib/store";
import { revalidate } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NONCE_COOKIE = "cv_admin_handoff";

/** Back to the console with something it can show a person. */
function fail(origin: string, reason: string) {
  const url = new URL("/admin", origin);
  url.searchParams.set("sso_error", reason);
  return NextResponse.redirect(url.toString());
}

/**
 * Completes the handshake and turns a Circuvent identity into a staff session.
 *
 * The rule this route exists to enforce: **signing in here does not make
 * anybody an administrator.** The identity service will happily authenticate
 * all thirty-six people with a Circuvent account, and none of that says
 * anything about who may refund an order or edit the catalogue. The address is
 * matched against the staff list and refused when it is not on it, so the
 * console's roles remain the only thing that grants access and SSO only
 * replaces the password.
 */
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const params = new URL(request.url).searchParams;

  const error = params.get("error");
  if (error) return fail(origin, error === "access_denied" ? "cancelled" : "provider");

  const code = params.get("code");
  const state = params.get("state");
  const flow = unpackFlow(request.cookies.get(STATE_COOKIE)?.value);

  // A missing or stale flow cookie is the ordinary case for a link somebody
  // has revisited or bookmarked, not an attack; it just cannot be completed.
  if (!code || !state || !flow) return fail(origin, "expired");
  if (state !== flow.state) return fail(origin, "state");

  let email: string;
  try {
    const tokenRes = await fetch(`${ISSUER}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${origin}/api/admin/auth/sso/callback`,
        client_id: CLIENT_ID,
        code_verifier: flow.verifier,
      }),
      cache: "no-store",
    });
    if (!tokenRes.ok) return fail(origin, "exchange");

    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) return fail(origin, "exchange");

    const infoRes = await fetch(`${ISSUER}/api/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
    });
    if (!infoRes.ok) return fail(origin, "userinfo");

    const info = (await infoRes.json()) as { email?: string; email_verified?: boolean };
    /*
     * An unverified address must not be honoured. Matching staff by email is
     * only sound while the identity service guarantees the person owns it;
     * without that, anybody who can register an account claiming
     * admin@circuvent.com would inherit that person's console role.
     */
    if (!info.email || info.email_verified === false) return fail(origin, "unverified");
    email = info.email.trim().toLowerCase();
  } catch {
    return fail(origin, "exchange");
  }

  ensureSeeded();
  await revalidate(["adminUsers"]);
  const staff = getAdminUser(email);
  if (!staff || !staff.active) return fail(origin, "not-staff");

  const nonce = newNonce();
  const handoff = signHandoff(email, nonce);

  const url = new URL("/admin", origin);
  url.searchParams.set("sso", handoff);
  const res = NextResponse.redirect(url.toString());

  // The flow is finished; leaving the verifier behind serves nobody.
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/admin/auth/sso" });
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/api/admin/auth/sso",
    maxAge: Math.floor(HANDOFF_TTL_MS / 1000),
  });
  return res;
}
