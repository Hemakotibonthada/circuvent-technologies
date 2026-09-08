import { NextRequest, NextResponse } from "next/server";
import { ATTENDANCE_CLIENT_ID, ATTENDANCE_ISSUER, FLOW_COOKIE, SESSION_COOKIE, SESSION_TTL, SSO_PATH, boundIdentity, landingPath, openAttendance, sealAttendance, type AttendanceFlow, type AttendanceSession } from "@/lib/attendance-sso";
import { CONTROL_PLANE_URL, federationAllowedHere } from "@/lib/sso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const flow = openAttendance<AttendanceFlow>("flow", request.cookies.get(FLOW_COOKIE)?.value);
  const params = request.nextUrl.searchParams;
  const finish = (error?: string, session?: AttendanceSession) => {
    const url = new URL(flow?.landing || landingPath(origin), origin);
    url.searchParams.set("attendance_sso", error || "complete");
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.delete({ name: FLOW_COOKIE, path: SSO_PATH });
    response.cookies.delete({ name: SESSION_COOKIE, path: SSO_PATH });
    if (session) response.cookies.set(SESSION_COOKIE, sealAttendance("session", session), {
      httpOnly: true, secure: origin.startsWith("https:"), sameSite: "strict", path: SSO_PATH, maxAge: SESSION_TTL,
    });
    return response;
  };
  if (!flow || flow.redirectUri !== `${origin}${SSO_PATH}/callback` || !params.get("state") || params.get("state") !== flow.state) return finish("expired");
  if (params.has("error")) return finish(params.get("error") === "access_denied" ? "denied" : "provider");
  const code = params.get("code");
  if (!code) return finish("expired");
  if (!federationAllowedHere()) return finish("environment");
  try {
    const exchanged = await fetch(`${ATTENDANCE_ISSUER}/api/oauth/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: ATTENDANCE_CLIENT_ID,
        code, code_verifier: flow.verifier, redirect_uri: flow.redirectUri }),
      cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (!exchanged.ok) return finish("exchange");
    const tokens = await exchanged.json() as { id_token?: string; access_token?: string };
    if (typeof tokens.id_token !== "string") return finish("identity");
    const identity = boundIdentity(tokens.id_token, flow);
    if (!identity) return finish("identity");
    // The control plane validates signature, issuer, audience and expiry, then
    // reuses the existing verified-email account or provisions a normal user.
    // No admin role or site membership is assigned by this bridge.
    const verified = await fetch(`${CONTROL_PLANE_URL}/auth/sso`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: tokens.id_token }), cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (!verified.ok) return finish("session");
    const session = await verified.json() as AttendanceSession;
    if (typeof session.token !== "string" || !session.token || !Number.isInteger(session.user?.id) ||
        session.user?.email?.trim().toLowerCase() !== identity.email) return finish("identity");
    let organization: AttendanceSession["user"]["organization"];
    if (tokens.access_token) {
      const profileResponse = await fetch(`${ATTENDANCE_ISSUER}/api/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(10000),
      });
      if (!profileResponse.ok) return finish("identity");
      const profile = await profileResponse.json();
      if (profile.email?.trim().toLowerCase() !== identity.email || profile.email_verified !== true) return finish("identity");
      const org = profile.organization;
      if (org && typeof org.id === "string" && typeof org.name === "string" && (org.domain === null || typeof org.domain === "string")) {
        organization = { id: org.id, name: org.name, domain: org.domain };
      }
    }
    return finish(undefined, { token: session.token, refreshToken: session.refreshToken,
      user: { id: session.user.id, email: identity.email, name: String(session.user.name || "").slice(0, 120), avatarUrl: session.user.avatarUrl, ...(organization ? { organization } : {}) } });
  } catch { return finish("unavailable"); }
}
