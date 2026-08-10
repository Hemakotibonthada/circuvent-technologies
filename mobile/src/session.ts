/*
 * A session ends 24 hours after signing in, whatever the token says.
 *
 * Mirrors src/lib/session-expiry.ts on the web, deliberately: the app talks to
 * the same control plane and renews the same way, so it had the same hole. The
 * app renews silently whenever a request comes back 401, which means a shorter
 * access token achieves nothing — the refresh mints another and the session
 * continues for as long as the refresh chain lives, across an unbounded number
 * of short-lived tokens.
 *
 * So what is capped is the sign-in. The clock starts when credentials were
 * presented and a renewal does not restart it.
 *
 * Not imported from the web project because Metro will not resolve a module
 * outside the app root. The two are tested from the same suite so they cannot
 * quietly disagree.
 */

export const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

/**
 * When a session began, or null if that cannot be established.
 *
 * A start in the future is clamped to now: a device with a skewed clock, or an
 * edited stamp, must not be granted a longer session than the cap.
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

  // The earliest, because a renewal updates iat and must not extend anything.
  return Math.min(Math.min(...candidates), opts.now);
}

/** An unknowable start counts as over: we cannot claim it is inside 24 hours. */
export function sessionExpired(startedAt: number | null, now: number): boolean {
  if (startedAt === null) return true;
  return now - startedAt >= MAX_SESSION_MS;
}

/**
 * The iat claim, in seconds, without verifying the signature.
 *
 * Safe for this one use: anyone able to forge the payload can already mint
 * tokens, and the only thing done with the value is to end a session sooner.
 */
export function issuedAtFromJwt(token: string | null | undefined): number | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(part.length + ((4 - (part.length % 4)) % 4), "=");
    const json =
      typeof atob === "function" ? atob(normalized) : Buffer.from(normalized, "base64").toString("utf8");
    const payload = JSON.parse(json) as { iat?: unknown };
    return typeof payload?.iat === "number" && payload.iat > 0 ? payload.iat : null;
  } catch {
    return null;
  }
}
