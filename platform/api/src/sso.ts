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
  return Boolean(config.AUTH_ISSUER && config.SSO_CLIENT_ID);
}

const DISCOVERY_TTL_MS = 60 * 60 * 1000;
const JWKS_TTL_MS = 60 * 60 * 1000;

let discovery: { jwksUri: string; fetchedAt: number } | null = null;
let jwks: { keys: Jwk[]; fetchedAt: number } | null = null;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

async function jwksUri(): Promise<string> {
  if (discovery && Date.now() - discovery.fetchedAt < DISCOVERY_TTL_MS) {
    return discovery.jwksUri;
  }
  const doc = (await getJson(
    `${config.AUTH_ISSUER.replace(/\/+$/, "")}/.well-known/openid-configuration`
  )) as { jwks_uri?: string };
  if (!doc.jwks_uri) throw new Error("The identity provider published no jwks_uri");
  discovery = { jwksUri: doc.jwks_uri, fetchedAt: Date.now() };
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
async function signingKeys(force = false): Promise<Jwk[]> {
  if (!force && jwks && Date.now() - jwks.fetchedAt < JWKS_TTL_MS) return jwks.keys;
  const doc = (await getJson(await jwksUri())) as { keys?: Jwk[] };
  jwks = { keys: doc.keys ?? [], fetchedAt: Date.now() };
  return jwks.keys;
}

async function keyFor(kid: string | undefined): Promise<crypto.KeyObject> {
  let keys = await signingKeys();
  let jwk = keys.find((k) => !kid || k.kid === kid);

  if (!jwk) {
    keys = await signingKeys(true);
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

  const key = await keyFor(decoded.header.kid);
  const claims = jwt.verify(idToken, key, {
    algorithms: ["RS256"],
    issuer: config.AUTH_ISSUER.replace(/\/+$/, ""),
    audience: config.SSO_CLIENT_ID,
  }) as jwt.JwtPayload;

  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email) throw new Error("The token carries no email address");
  if (claims.email_verified === false) {
    throw new Error("The address on that token is not verified");
  }

  return {
    sub: String(claims.sub ?? ""),
    email,
    name: typeof claims.name === "string" ? claims.name : undefined,
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
    role: typeof claims.role === "string" ? claims.role : undefined,
  };
}

/** Clears the cached discovery and keys. Exposed for tests. */
export function resetSsoCaches(): void {
  discovery = null;
  jwks = null;
  logger.debug("sso caches cleared");
}
