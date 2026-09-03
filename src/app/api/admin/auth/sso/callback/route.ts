import { NextResponse, type NextRequest } from "next/server";
import {
  ISSUER,
  CLIENT_ID,
  STATE_COOKIE,
  HANDOFF_TTL_MS,
  newNonce,
  signHandoff,
  safeAvatarUrl,
  unpackFlow,
} from "@/lib/admin-sso";
import { ensureSeeded } from "@/lib/admin-auth";
import {
  consoleRoleFromSso,
  roleClaimFromIdToken,
  ssoStaffUser,
  strongerConsoleRole,
} from "@/lib/admin-sso-provision";
import { ssoLandingPath } from "@/lib/host-mounts";
import { getAdminUser } from "@/lib/store";
import { flushNow, revalidate, upsertAdminUser } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NONCE_COOKIE = "cv_admin_handoff";

function requestHost(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-host");
  const raw =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    new URL(request.url).host;
  return raw.split(":")[0];
}

/** Back to the console that started the handshake, not always /admin. */
function fail(origin: string, host: string, reason: string) {
  const url = new URL(ssoLandingPath(host), origin);
  url.searchParams.set("sso_error", reason);
  return NextResponse.redirect(url.toString());
}

/**
 * Completes the handshake and turns a Circuvent identity into a staff session.
 *
 * The rule this route enforces: **authenticating is not the same as being let
 * in.** The identity service will happily sign in all thirty-seven people with
 * a Circuvent account, and none of that says anything about who may refund an
 * order or edit the catalogue. Two things can grant a role here, and nothing
 * else does:
 *
 *  - a row on the console's own staff list, or
 *  - an explicit Administrator grant for this console in the identity service,
 *    whether given directly or through a group such as Admins.
 *
 * The second is why this route changed. Somebody put ceo@circuvent.com in a
 * group that grants Administrator on the Circuvent Admin Console, and the
 * console still turned them away, because it read only its own list and the
 * group might as well not have existed. What the group says now takes effect.
 *
 * What it deliberately does *not* honour is the `staff` role: that is this
 * application's default, held by everybody with an account, so treating it as
 * console access would hand the console to the whole company.
 */
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const host = requestHost(request);
  const params = new URL(request.url).searchParams;

  const error = params.get("error");
  if (error) return fail(origin, host, error === "access_denied" ? "cancelled" : "provider");

  const code = params.get("code");
  const state = params.get("state");
  const flow = unpackFlow(request.cookies.get(STATE_COOKIE)?.value);

  // A missing or stale flow cookie is the ordinary case for a link somebody
  // has revisited or bookmarked, not an attack; it just cannot be completed.
  if (!code || !state || !flow) return fail(origin, host, "expired");
  if (state !== flow.state) return fail(origin, host, "state");

  let email: string;
  let displayName = "";
  let avatarUrl = "";
  let grantedRole: ReturnType<typeof consoleRoleFromSso> = null;
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
    if (!tokenRes.ok) return fail(origin, host, "exchange");

    const tokens = (await tokenRes.json()) as { access_token?: string; id_token?: string };
    if (!tokens.access_token) return fail(origin, host, "exchange");

    // The role the identity service resolved for *this* console, which is where
    // a group grant surfaces. Absent or unrecognised means no grant, never a
    // guess.
    grantedRole = consoleRoleFromSso(roleClaimFromIdToken(tokens.id_token));

    const infoRes = await fetch(`${ISSUER}/api/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
    });
    if (!infoRes.ok) return fail(origin, host, "userinfo");

    const info = (await infoRes.json()) as {
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };
    /*
     * An unverified address must not be honoured. Matching staff by email is
     * only sound while the identity service guarantees the person owns it;
     * without that, anybody who can register an account claiming
     * admin@circuvent.com would inherit that person's console role.
     */
    if (!info.email || info.email_verified === false) return fail(origin, host, "unverified");
    email = info.email.trim().toLowerCase();
    displayName = typeof info.name === "string" ? info.name.trim() : "";
    avatarUrl = safeAvatarUrl(info.picture);
  } catch {
    return fail(origin, host, "exchange");
  }

  ensureSeeded();
  await revalidate(["adminUsers"]);
  const staff = getAdminUser(email);

  /*
   * A deactivated account stays deactivated. Whoever switched it off here did
   * so knowingly, and a group grant must not quietly undo that — the same
   * precedence the identity service applies, where a revocation outranks
   * anything a group hands out.
   */
  if (staff && !staff.active) return fail(origin, host, "not-staff");

  if (!staff) {
    if (!grantedRole) return fail(origin, host, "not-staff");
    upsertAdminUser({ ...ssoStaffUser(email, displayName, grantedRole), avatarUrl });
    /*
     * Awaited, not left to the background flush. The console redirects to
     * the product that started the handshake, which then calls the exchange
     * endpoint — a separate invocation
     * that re-reads this row from the database. A scheduled write would be
     * racing a browser round trip, and losing that race looks exactly like the
     * bug being fixed here.
     */
    await flushNow();
  } else {
    const role = strongerConsoleRole(staff.role, grantedRole);
    /*
     * The photo is refreshed here too, because the identity service owns it and
     * staff change it there. An empty `avatarUrl` means userinfo asserted no
     * usable picture this time, which is not the same as "the picture was
     * removed" — treating it as such would blank a good avatar on any sign-in
     * where the claim happened to be absent.
     */
    const nextAvatar = avatarUrl || staff.avatarUrl || "";
    const roleChanged = Boolean(role && role !== staff.role);
    // Only write when something actually changed, so an ordinary sign-in by
    // somebody already on the list stays a read.
    if (roleChanged || nextAvatar !== (staff.avatarUrl ?? "")) {
      upsertAdminUser({ ...staff, role: role ?? staff.role, avatarUrl: nextAvatar });
      await flushNow();
    }
  }

  const nonce = newNonce();
  const handoff = signHandoff(email, nonce);

  const url = new URL(ssoLandingPath(host), origin);
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
