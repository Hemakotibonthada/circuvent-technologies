/**
 * Single sign-on against auth.circuvent.com.
 *
 * The control plane already had `/auth/federated`, which takes an email and an
 * HMAC of it. That is a shared secret: anything holding it can assert any
 * address, so it is only safe between two servers that trust each other
 * completely, and it says nothing about whether the person is really there.
 *
 * This is the other thing. It takes an ID token the identity provider signed
 * and checks that signature against the provider's published keys, so the
 * assertion is the provider's, not the caller's. A stolen client secret cannot
 * forge one; only the provider's private key can.
 *
 * No new dependency: Node imports a JWK directly, and `jsonwebtoken` verifies
 * against the resulting key.
 */

import crypto from "node:crypto";
import jwt from "jsonwebtoken";

import { config } from "./config";
import { logger } from "./logger";

interface Jwk {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  [k: string]: unknown;
}

export interface SsoClaims {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  role?: string;
}

/** Whether a deployment is wired to the identity provider at all. */
export function ssoEnabled(): boolean {
  return Boolean(config.AUTH_ISSUER && (config.SSO_CLIENT_ID || config.ATTENDANCE_SSO_CLIENT_ID));
}

const DISCOVERY_TTL_MS = 60 * 60 * 1000;
const JWKS_TTL_MS = 60 * 60 * 1000;

const discoveryCache = new Map<string, { jwksUri: string; fetchedAt: number }>();
const jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

async function jwksUri(issuer: string): Promise<string> {
  const discovery = discoveryCache.get(issuer);
  if (discovery && Date.now() - discovery.fetchedAt < DISCOVERY_TTL_MS) {
    return discovery.jwksUri;
  }
  const doc = (await getJson(
    `${issuer}/.well-known/openid-configuration`
  )) as { jwks_uri?: string };
  if (!doc.jwks_uri) throw new Error("The identity provider published no jwks_uri");
  discoveryCache.set(issuer, { jwksUri: doc.jwks_uri, fetchedAt: Date.now() });
  return doc.jwks_uri;
}

/**
 * The signing keys, cached.
 *
 * `force` refetches immediately, which is what a token carrying an unknown
 * `kid` means: the provider has rotated and the cache is simply stale. Without
 * it, every sign-in would fail for as long as the cache lived — a rotation
 * would read as "single sign-on is broken" for an hour.
 */
async function signingKeys(issuer: string, force = false): Promise<Jwk[]> {
  const jwks = jwksCache.get(issuer);
  if (!force && jwks && Date.now() - jwks.fetchedAt < JWKS_TTL_MS) return jwks.keys;
  const doc = (await getJson(await jwksUri(issuer))) as { keys?: Jwk[] };
  const keys = doc.keys ?? [];
  jwksCache.set(issuer, { keys, fetchedAt: Date.now() });
  return keys;
}

async function keyFor(kid: string | undefined, issuer: string): Promise<crypto.KeyObject> {
  let keys = await signingKeys(issuer);
  let jwk = keys.find((k) => !kid || k.kid === kid);

  if (!jwk) {
    keys = await signingKeys(issuer, true);
    jwk = keys.find((k) => !kid || k.kid === kid);
  }
  if (!jwk) throw new Error(`No signing key published for kid ${kid ?? "(none)"}`);

  return crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: "jwk" });
}

/**
 * Verifies an ID token and returns who it says this is.
 *
 * Throws on anything that does not check out. Every one of these matters:
 * the signature proves the provider issued it, the issuer proves it was *our*
 * provider, and the audience proves it was minted for this application rather
 * than replayed from another one that shares the same directory.
 */
export async function verifyIdToken(idToken: string): Promise<SsoClaims> {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded === "string") throw new Error("That is not a JWT");

  const alg = decoded.header.alg;
  if (alg !== "RS256") {
    // Refusing anything else is what stops an "alg: none" or HS256 token signed
    // with a public key being accepted as genuine.
    throw new Error(`Unsupported signing algorithm ${alg}`);
  }

  // Unverified audience selects an allowlisted configuration only. The token
  // must then pass signature, issuer and audience checks for that exact pair.
  const audience = typeof decoded.payload === "object" ? decoded.payload.aud : undefined;
  const attendance = Boolean(config.ATTENDANCE_SSO_CLIENT_ID && audience === config.ATTENDANCE_SSO_CLIENT_ID);
  if (!attendance && (!config.SSO_CLIENT_ID || audience !== config.SSO_CLIENT_ID)) throw new Error("Unknown SSO audience");
  const issuer = (attendance ? config.ATTENDANCE_SSO_ISSUER : config.AUTH_ISSUER).replace(/\/+$/, "");
  const key = await keyFor(decoded.header.kid, issuer);
  const claims = jwt.verify(idToken, key, {
    algorithms: ["RS256"],
    issuer,
    audience: attendance ? config.ATTENDANCE_SSO_CLIENT_ID : config.SSO_CLIENT_ID,
  }) as jwt.JwtPayload;

  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email) throw new Error("The token carries no email address");
  if (claims.email_verified === false) {
    throw new Error("The address on that token is not verified");
  }
  const attendanceAudience = config.ATTENDANCE_SSO_CLIENT_ID &&
    (Array.isArray(claims.aud) ? claims.aud.includes(config.ATTENDANCE_SSO_CLIENT_ID) : claims.aud === config.ATTENDANCE_SSO_CLIENT_ID);
  if (attendanceAudience &&
      (claims.email_verified !== true || typeof claims.sub !== "string" || !claims.sub ||
       !Number.isFinite(claims.exp) || typeof claims.scope === "string")) {
    throw new Error("Attendance requires a verified user ID token");
  }

  return {
    sub: String(claims.sub ?? ""),
    email,
    name: typeof claims.name === "string" ? claims.name : undefined,
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
    role: typeof claims.role === "string" ? claims.role : undefined,
  };
}

/**
 * What a user's stored avatar should become after a sign-in.
 *
 * The rule that is easy to get wrong: a token without a `picture` claim means
 * "the directory did not assert one", not "this person deleted their photo".
 * Treating the two the same blanks a perfectly good avatar every time an IdP
 * issues a lean token, and the user sees their picture vanish for no reason
 * they can act on. So an absent claim keeps what is already stored.
 *
 * Only http(s) URLs are accepted. A `picture` claim is attacker-influenced in
 * the sense that it ends up in an `<img src>` on an admin page, and letting a
 * `javascript:` or `data:` URL through there would be a scripting hazard.
 *
 * Returns null when nothing needs writing, so callers can skip the UPDATE.
 */
export function nextAvatarUrl(current: string, claim: string | undefined): string | null {
  if (!claim) return null;
  const trimmed = claim.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  if (trimmed === current) return null;
  return trimmed;
}

/** Clears the cached discovery and keys. Exposed for tests. */
export function resetSsoCaches(): void {
  discoveryCache.clear();
  jwksCache.clear();
  logger.debug("sso caches cleared");
}
