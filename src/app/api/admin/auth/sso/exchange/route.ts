import { NextResponse, type NextRequest } from "next/server";
import { verifyHandoff } from "@/lib/admin-sso";
import {
  ensureSeeded,
  signAdminToken,
  adminPasswordAge,
} from "@/lib/admin-auth";
import { getAdminUser, revalidate } from "@/lib/store";
import { recordStaffLogin } from "@/lib/admin-staff-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NONCE_COOKIE = "cv_admin_handoff";

/**
 * Swaps the redirect's one-time code for the console's usual bearer token.
 *
 * This step exists so the token itself never travels in a URL, where it would
 * sit in browser history, in any proxy log along the way, and in the referrer
 * of the next request the page makes. The code in the URL is useless on its
 * own: redeeming it also requires the nonce cookie, which only exists on the
 * browser that began the sign-in, and it stops working after ninety seconds.
 *
 * Deleting the cookie on the way out is what makes it single-use.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { code?: string };
  const nonce = request.cookies.get(NONCE_COOKIE)?.value;
  const email = verifyHandoff(body.code, nonce);

  if (!email) {
    return NextResponse.json(
      { error: "That sign-in link has expired. Please sign in again." },
      { status: 401 }
    );
  }

  ensureSeeded();
  await revalidate(["adminUsers"]);

  /*
   * Checked again rather than trusted from the code. The callback verified it
   * a moment ago, but a role can be revoked between the two requests, and the
   * account state — not the signature — is what should decide.
   */
  const staff = getAdminUser(email);
  if (!staff || !staff.active) {
    return NextResponse.json({ error: "This account cannot sign in." }, { status: 403 });
  }

  recordStaffLogin(staff.email, request.headers.get("user-agent") || undefined);
  const age = adminPasswordAge(staff);

  const res = NextResponse.json({
    ok: true,
    token: signAdminToken(staff.email),
    email: staff.email,
    name: staff.name,
    role: staff.role,
    avatarUrl: staff.avatarUrl ?? "",
    /*
     * Never true for an SSO sign-in, and deliberately so: the password that
     * expired is the console's own, and this person did not use it. Forcing a
     * change here would demand they set a local password purely to get past a
     * screen about a credential they no longer sign in with.
     */
    mustChangePassword: false,
    passwordExpiringSoon: age.expiringSoon,
    passwordDaysLeft: age.daysLeft,
  });
  res.cookies.delete({ name: NONCE_COOKIE, path: "/api/admin/auth/sso" });
  return res;
}
