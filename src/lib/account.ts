// Lightweight, dependency-free customer accounts for the Circuvent shop.
// Passwords are hashed with scrypt; sessions are stateless HMAC tokens.
// SERVER ONLY — uses node:crypto.

import crypto from "crypto";
import { lazySecret } from "./secrets";

const secret = lazySecret(["ACCOUNT_SECRET"], "customer sessions");

/**
 * Account-state lookup, injected by the store at import time.
 *
 * The dependency is inverted rather than imported directly because store.ts
 * uses a top-level await to hydrate, which cannot be evaluated by consumers
 * that load this module under CommonJS (the unit test runner). Every route
 * that verifies a token loads the store — directly or through admin-auth — so
 * the hook is always populated at request time.
 */
type AccountState = { blocked?: boolean; deletedAt?: string; tokenVersion?: number };
let lookupAccount: ((email: string) => AccountState | null) | null = null;

export function registerAccountLookup(fn: (email: string) => AccountState | null): void {
  lookupAccount = fn;
}

export function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const s = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, s, 64).toString("hex");
  return { salt: s, hash };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const h = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(h);
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Session tokens.
 *
 * The old format was `base64(email + ":" + HMAC(email))` — a pure function of
 * the address, so it never expired and could not be revoked: a password reset
 * or an admin block left a stolen token fully working for the lifetime of the
 * deployment. Tokens now carry an issue time and the account's token version,
 * both covered by the signature, and are re-checked against account state on
 * every use.
 */
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionClaims {
  email: string;
  issuedAt: number;
  version: number;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Signs a session token for an email, pinned to its current token version. */
export function signToken(email: string, version?: number): string {
  const e = email.trim().toLowerCase();
  const ver = version ?? lookupAccount?.(e)?.tokenVersion ?? 0;
  const payload = `${e}|${Date.now().toString(36)}|${ver}`;
  return Buffer.from(`${payload}:${sign(payload)}`).toString("base64");
}

/** Parses and cryptographically validates a token. Does not check account state. */
function readToken(token: string | null | undefined): SessionClaims | null {
  if (!token) return null;
  try {
    const dec = Buffer.from(token, "base64").toString("utf8");
    const idx = dec.lastIndexOf(":");
    if (idx < 0) return null;
    const payload = dec.slice(0, idx);
    const sig = dec.slice(idx + 1);
    const expected = sign(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const parts = payload.split("|");
    if (parts.length !== 3) return null; // pre-expiry format — no longer accepted
    const issuedAt = parseInt(parts[1], 36);
    const version = Number(parts[2]);
    if (!parts[0] || !Number.isFinite(issuedAt) || !Number.isFinite(version)) return null;
    return { email: parts[0], issuedAt, version };
  } catch {
    return null;
  }
}

/** Returns the email if the token is valid and the account may still use it. */
export function verifyToken(token: string | null | undefined): string | null {
  const claims = readToken(token);
  if (!claims) return null;
  if (Date.now() - claims.issuedAt > TOKEN_TTL_MS) return null;

  // When the account is in memory, its current state wins. A warm instance that
  // has not hydrated this account yet falls back to the signature, which is
  // still time-limited — it never grants more than the token already claimed.
  const acc = lookupAccount?.(claims.email);
  if (acc) {
    if (acc.blocked || acc.deletedAt) return null;
    if ((acc.tokenVersion || 0) !== claims.version) return null;
  }
  return claims.email;
}

/** Extracts the account token from a request's Authorization / x-account-token header. */
export function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return req.headers.get("x-account-token");
}
