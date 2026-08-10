/*
 * A session ends 24 hours after someone signed in, whatever the token says.
 *
 * The three sign-ins here disagreed wildly about how long they should last:
 * staff sessions 12 hours, shop sessions 30 days, and console sessions a
 * 30-day access token backed by a 60-day refresh token. The last one is the
 * reason this is measured from the sign-in rather than from the token.
 *
 * The console renews silently whenever a request comes back 401, so shortening
 * the access token achieves nothing at all -- the refresh simply mints another
 * one, and the session continues for sixty days across an unbounded number of
 * perfectly short-lived tokens. Capping the token would have looked like a fix
 * and changed nothing, which is the failure mode worth avoiding.
 *
 * So what is capped is the sign-in. The clock starts when credentials were
 * presented and is not restarted by a renewal.
 */

export const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

/**
 * When a session began, or null if that cannot be established.
 *
 * `stamp` is what we recorded at sign-in. `tokenIssuedAt` is the JWT's own iat
 * claim, in seconds, which covers sessions that predate this being recorded --
 * without it, shipping this would sign out everybody holding a valid session.
 *
 * A start in the future is clamped to now. Otherwise a device with a skewed
 * clock, or an edited stamp, would be granted a session longer than the cap:
 * the one thing this function exists to prevent.
 */
export function sessionStartedAt(opts: {
  stamp?: number | null;
  tokenIssuedAt?: number | null;
  now: number;
}): number | null {
  const fromStamp = Number.isFinite(opts.stamp) ? (opts.stamp as number) : null;
  const fromToken = Number.isFinite(opts.tokenIssuedAt) ? (opts.tokenIssuedAt as number) * 1000 : null;

  const candidates = [fromStamp, fromToken].filter((v): v is number => v !== null && v > 0);
  if (!candidates.length) return null;

  // The earliest of the two, because a renewal updates iat and must not extend
  // the session; the recorded sign-in is the one that counts.
  return Math.min(Math.min(...candidates), opts.now);
}

/**
 * Whether the session is over.
 *
 * An unknown start counts as over. We cannot assert that a session is within
 * its first 24 hours when we do not know when it began, and the safe reading of
 * "cannot tell" is to ask for the password again.
 */
export function sessionExpired(startedAt: number | null, now: number): boolean {
  if (startedAt === null) return true;
  return now - startedAt >= MAX_SESSION_MS;
}

/** Milliseconds left, floored at zero. For scheduling the sign-out. */
export function msUntilExpiry(startedAt: number | null, now: number): number {
  if (startedAt === null) return 0;
  return Math.max(0, startedAt + MAX_SESSION_MS - now);
}

/**
 * The iat claim of a JWT, in seconds, or null.
 *
 * Read without verifying the signature, which is safe for this one purpose: an
 * attacker who can forge the payload can already mint tokens, and the only use
 * made of the value is to expire a session sooner. Nothing is granted by it.
 */
export function issuedAtFromJwt(token: string | null | undefined): number | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(part.length + ((4 - (part.length % 4)) % 4), "=");
    const json = typeof atob === "function" ? atob(normalized) : Buffer.from(normalized, "base64").toString("utf8");
    const payload = JSON.parse(json) as { iat?: unknown };
    return typeof payload?.iat === "number" && payload.iat > 0 ? payload.iat : null;
  } catch {
    return null;
  }
}
