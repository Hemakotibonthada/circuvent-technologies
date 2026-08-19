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
export const CONTROL_PLANE_URL = (
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

/**
 * Normalises a host for comparison. Mirrors normaliseDataHost in db.ts, minus
 * the Neon pooled-endpoint rule, which has no meaning for an API host.
 */
function identityHost(urlOrHost: string): string {
  const raw = urlOrHost.trim();
  return raw.replace(/^[a-z]+:\/\//i, "").split(/[/:?]/)[0].toLowerCase();
}

/** Same test db.ts uses, so the two guards agree on what "production" means. */
function isProductionDeployment(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production")
  );
}

/**
 * Refuses to federate identity to a production control plane from a
 * non-production deployment.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE DATABASE GUARD
 *
 * `assertNotProductionData` in db.ts stopped dev from *reading* production
 * data, and it works. It does not stop dev from *authenticating* a production
 * customer, because that path never touches the shop database at all — it is an
 * outbound HTTPS call to the control plane, of which there is exactly one.
 *
 * So on dev, a sign-in that missed locally fell through to
 * api.circuvent.com/auth/login, the live fleet vouched for a real customer, and
 * `/api/account/login` then created that customer in the dev database with a
 * hash of their real password. Production users could sign in to dev, and dev
 * quietly accumulated live credentials while doing it. The isolation guard was
 * pointed at the wrong door.
 *
 * PROD_IDENTITY_HOSTS is a comma-separated list of control-plane hosts that
 * only production may authenticate against. It deliberately copies every safety
 * property of the database guard:
 *
 *   - checked on non-production deployments only, so an over-broad list can
 *     never take production down;
 *   - an empty list is a no-op, so this cannot break a deployment that has not
 *     opted in;
 *   - hosts are not credentials, so the same value is safe on every target.
 *
 * Unlike the database guard this returns false rather than throwing. A refused
 * federation must look to the caller exactly like credentials that did not
 * match — throwing would turn "this account does not exist here" into a 500,
 * and would tell an attacker which addresses exist on the live fleet.
 */
export function federationAllowedHere(): boolean {
  const listed = (process.env.PROD_IDENTITY_HOSTS || "")
    .split(",")
    .map((h) => identityHost(h))
    .filter(Boolean);
  if (listed.length === 0) return true;
  if (isProductionDeployment()) return true;

  const host = identityHost(CONTROL_PLANE_URL);
  if (host && listed.includes(host)) {
    /*
     * Loud in the log, silent to the caller. Somebody reading "invalid email or
     * password" on dev for an account they know exists needs to be able to find
     * out why, and the log is the only place that can say so without telling
     * the browser which addresses are real.
     */
    logger.warn("sso.federation_refused_non_production", {
      host,
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    });
    return false;
  }
  return true;
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
  /*
   * The same environment rule as the inbound direction. This one is already
   * gated by FEDERATION_SECRET, but a dev deployment that happens to hold the
   * production secret would otherwise mint live console sessions from a preview
   * build — and the secret being present is not the same as the deployment
   * being entitled to use it.
   */
  if (!federationAllowedHere()) return null;

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
  // A preview build must not authenticate a real customer against the live
  // fleet, nor copy their credentials into its own database afterwards.
  if (!federationAllowedHere()) return null;
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
