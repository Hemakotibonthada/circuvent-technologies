// Lightweight, dependency-free customer accounts for the Circuvent shop.
// Passwords are hashed with scrypt; sessions are stateless HMAC tokens.
// SERVER ONLY — uses node:crypto.

import crypto from "crypto";

const SECRET =
  process.env.ACCOUNT_SECRET || process.env.ADMIN_PASSWORD || "circuvent-dev-secret";

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

/** Signs a stateless session token bound to an email. */
export function signToken(email: string): string {
  const e = email.trim().toLowerCase();
  const sig = crypto.createHmac("sha256", SECRET).update(e).digest("hex");
  return Buffer.from(`${e}:${sig}`).toString("base64");
}

/** Returns the email if the token is valid, else null. */
export function verifyToken(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const dec = Buffer.from(token, "base64").toString("utf8");
    const idx = dec.lastIndexOf(":");
    if (idx < 0) return null;
    const email = dec.slice(0, idx);
    const sig = dec.slice(idx + 1);
    const expected = crypto.createHmac("sha256", SECRET).update(email).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return email;
    return null;
  } catch {
    return null;
  }
}

/** Extracts the account token from a request's Authorization / x-account-token header. */
export function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return req.headers.get("x-account-token");
}
