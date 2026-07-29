// Single sign-on between the storefront and the smart-home control plane.
//
// The two halves of the product grew their own accounts: the shop stores
// customers in this app's own store (scrypt), while the console keeps users in
// the control plane's Postgres (bcrypt) behind a separate API. Signing up on
// one left you unknown to the other.
//
// Password hashes cannot be shared across two different schemes, and copying
// them between databases would be both fragile and a much larger blast radius
// if either store leaked. Instead each side vouches for a customer it has
// already authenticated, and the other issues its own session for the same
// email address. Email is the join key: both systems already treat it as
// unique and case-insensitive.
//
// SERVER ONLY — holds the federation secret.

import crypto from "crypto";
import { logger } from "./logger";

/**
 * Control-plane base URL.
 *
 * Read here rather than imported from control-plane.ts: that module is the
 * browser client and pulling it into a server route drags localStorage-bound
 * code along with it for the sake of one string.
 */
const CONTROL_PLANE_URL = (
  process.env.CONTROL_PLANE_URL ||
  process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ||
  "https://api.circuvent.com"
).replace(/\/$/, "");

/**
 * Shared secret proving a request comes from this backend.
 *
 * Deliberately read directly rather than through requireSecret(): federation
 * is optional, and a deployment that has not configured it should quietly not
 * offer SSO rather than fail every request that touches this module.
 */
function secret(): string {
  return (process.env.FEDERATION_SECRET || "").trim();
}

/** Whether SSO can be attempted at all. */
export function federationConfigured(): boolean {
  return secret().length >= 32;
}

export interface ConsoleSession {
  token: string;
  user: { id: number; email: string; name: string };
}

/**
 * Asks the control plane for a console session for an already-authenticated
 * customer, creating the console account if this is their first visit.
 *
 * Returns null rather than throwing when the control plane is unreachable or
 * refuses: SSO is an enhancement, and a shop that cannot reach the smart-home
 * service should still let people shop.
 */
export async function mintConsoleSession(email: string, name?: string): Promise<ConsoleSession | null> {
  if (!federationConfigured()) return null;

  const clean = email.trim().toLowerCase();
  const ts = String(Date.now());
  const sig = crypto.createHmac("sha256", secret()).update(`${ts}.${clean}`).digest("hex");

  try {
    const res = await fetch(`${CONTROL_PLANE_URL}/auth/federated`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-federation-timestamp": ts,
        "x-federation-signature": sig,
      },
      body: JSON.stringify({ email: clean, name: name || "" }),
      // The customer is waiting on this; a control plane that is slow to answer
      // should not hold the sign-in open indefinitely.
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      logger.warn("sso.federated_refused", { status: res.status, email: clean });
      return null;
    }

    const data = (await res.json()) as Partial<ConsoleSession>;
    if (!data?.token || !data.user) {
      logger.warn("sso.federated_incomplete", { email: clean });
      return null;
    }
    return { token: data.token, user: data.user };
  } catch (err) {
    logger.error("sso.federated_failed", { email: clean }, err);
    return null;
  }
}

/**
 * Verifies credentials against the control plane.
 *
 * Used for the other direction: somebody who signed up in the smart-home app
 * and has never used the shop still needs their existing password to work at
 * the storefront. Returns the account's display name on success.
 */
export async function verifyAgainstControlPlane(
  email: string,
  password: string
): Promise<{ email: string; name: string } | null> {
  const clean = email.trim().toLowerCase();
  try {
    const res = await fetch(`${CONTROL_PLANE_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: clean, password }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: { email?: string; name?: string } };
    if (!data?.user?.email) return null;
    return { email: data.user.email.trim().toLowerCase(), name: data.user.name || "" };
  } catch (err) {
    logger.warn("sso.control_plane_check_failed", { email: clean });
    void err;
    return null;
  }
}
