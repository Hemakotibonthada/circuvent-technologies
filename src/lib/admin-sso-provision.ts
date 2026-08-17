// Turning a Circuvent group into a staff role in this console.
//
// The console keeps its own staff list, and that was the only way in: somebody
// added to the "Admins" group in the identity service, with the console role
// set to Administrator, still got "no role in this console". The group said one
// thing and the console knew nothing about it.
//
// So the role asserted in the SSO token is now honoured — but only the role
// that means something. `website-admin` has a default role of `staff`, which
// every one of the thirty-seven Circuvent accounts resolves to, so mapping that
// onto console access would hand the console to the entire company. Only an
// explicit `admin` grant opens the door.
//
// SERVER ONLY.

import { randomBytes } from "node:crypto";
import type { AdminRole, AdminUser } from "./store";

/**
 * Console roles, strongest first — the order `ALL_ROLES` already uses.
 *
 * Kept here as a rank so an SSO grant can be compared against a role somebody
 * was given by hand, rather than one silently replacing the other.
 */
export const CONSOLE_ROLE_RANK: Record<AdminRole, number> = {
  superadmin: 50,
  manager: 40,
  inventory: 30,
  orders: 20,
  support: 10,
};

/**
 * What a role in the identity service means here.
 *
 * `admin` is the only one that grants anything. `staff` is the application's
 * default role, held by everybody with a Circuvent account and therefore
 * evidence of nothing: treating it as console access would be an escalation
 * dressed up as single sign-on.
 */
export function consoleRoleFromSso(ssoRole: string | null | undefined): AdminRole | null {
  if (typeof ssoRole !== "string") return null;
  switch (ssoRole.trim().toLowerCase()) {
    case "admin":
      return "superadmin";
    default:
      return null;
  }
}

/**
 * The role that should apply, given what they already had.
 *
 * The stronger of the two wins, which is the same rule the identity service
 * applies when a direct grant and a group grant disagree. A group must not
 * demote somebody an administrator promoted here, and a stale weaker row must
 * not hold back somebody who has just been added to Admins.
 */
export function strongerConsoleRole(
  existing: AdminRole | null | undefined,
  fromSso: AdminRole | null
): AdminRole | null {
  if (!fromSso) return existing ?? null;
  if (!existing) return fromSso;
  return CONSOLE_ROLE_RANK[fromSso] > CONSOLE_ROLE_RANK[existing] ? fromSso : existing;
}

/**
 * The `role` claim out of an id_token.
 *
 * The signature is not re-checked, which is deliberate rather than an omission:
 * this token was just handed back on our own back-channel call to the token
 * endpoint over TLS, so the transport already establishes who sent it, and
 * OpenID Connect Core 3.1.3.7 says so in as many words. A token that arrived
 * any other way would have to be verified.
 *
 * Anything malformed reads as no role at all, because the failure that matters
 * here is granting access on a claim we did not really understand.
 */
export function roleClaimFromIdToken(idToken: string | null | undefined): string | null {
  if (typeof idToken !== "string") return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      role?: unknown;
    };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/**
 * A staff row for somebody a group has just let in.
 *
 * The credentials are random bytes nobody holds, so the account exists for the
 * console's own lookups without also becoming a password that can be guessed
 * or sprayed. They arrived through single sign-on and that stays the way in.
 */
export function ssoStaffUser(email: string, name: string, role: AdminRole): AdminUser {
  const now = new Date().toISOString();
  return {
    email,
    name: name || email,
    // Not a password hash of anything. No input can produce these.
    hash: randomBytes(32).toString("hex"),
    salt: randomBytes(16).toString("hex"),
    role,
    active: true,
    createdAt: now,
    createdBy: "sso",
    ssoProvisioned: true,
    passwordChangedAt: now,
    tokenVersion: 0,
  };
}
