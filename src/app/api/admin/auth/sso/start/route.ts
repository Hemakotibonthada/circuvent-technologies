import { NextResponse, type NextRequest } from "next/server";
import { beginSso, packFlow, ssoConfigured, STATE_COOKIE, FLOW_TTL_MS } from "@/lib/admin-sso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands the browser to auth.circuvent.com to sign in.
 *
 * The callback URL is derived from the request rather than configured, so the
 * same build works on the production domain and on a preview deployment
 * without a second environment variable to keep in step. The identity service
 * still refuses any redirect URI it has not been told about, so this cannot be
 * pointed somewhere else by a crafted Host header alone.
 */
export async function GET(request: NextRequest) {
  if (!ssoConfigured()) {
    return NextResponse.json(
      { error: "Single sign-on is not configured for this deployment." },
      { status: 503 }
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/admin/auth/sso/callback`;
  const { url, verifier, state } = beginSso(redirectUri);

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, packFlow(state, verifier), {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    // Lax, not Strict: the browser arrives back here from another origin, and
    // Strict would withhold the cookie on exactly that navigation.
    sameSite: "lax",
    path: "/api/admin/auth/sso",
    maxAge: Math.floor(FLOW_TTL_MS / 1000),
  });
  return res;
}
