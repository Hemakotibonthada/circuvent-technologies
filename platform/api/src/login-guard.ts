/**
 * Locks out an address that is guessing.
 *
 * The rate limiter in front of /auth allows twenty requests a minute per IP.
 * That stops a flood; it does not stop a brute force. Twenty a minute is
 * twelve hundred an hour, sustained indefinitely, which is a perfectly
 * workable rate for walking a password list — the limiter was never the
 * control that made guessing pointless, it only set the pace.
 *
 * So failures are counted and, past a threshold, the address is refused
 * outright for an hour. The window matters as much as the count: five
 * failures spread over a week is somebody with an old password in a manager,
 * five in fifteen minutes is a script.
 *
 * Counted per address AND per account, because either alone leaves a gap. IP
 * alone lets a botnet try one password against every account from a different
 * address each time; account alone lets one address work through a list of
 * accounts, failing once each, and never trip a thing.
 *
 * A success clears the address's record. Someone who mistypes twice and then
 * gets in should not be a third of the way to a lockout for the next quarter
 * of an hour.
 */

import { pool } from "./db";
import { logger } from "./logger";

/** Failures tolerated before the door closes. */
export const MAX_FAILURES = 5;

/** How far back failures are counted. Older ones are forgiven. */
export const FAILURE_WINDOW_MINUTES = 15;

/** How long a lockout lasts. */
export const LOCKOUT_MINUTES = 60;

export interface LockoutState {
  blocked: boolean;
  retryAfterSeconds: number;
}

const NOT_BLOCKED: LockoutState = { blocked: false, retryAfterSeconds: 0 };

/**
 * Is this address, or this account, currently locked out?
 *
 * Checked before the password is verified, so a locked-out caller cannot use
 * the endpoint as an oracle at all.
 */
export async function checkLockout(ip: string, email: string | null): Promise<LockoutState> {
  const { rows } = await pool.query<{ retry_after: number }>(
    `SELECT CEIL(EXTRACT(EPOCH FROM (MAX(blocked_until) - now())))::int AS retry_after
       FROM auth_lockouts
      WHERE blocked_until > now()
        AND (scope_kind = 'ip' AND scope_value = $1
             OR ($2::text IS NOT NULL AND scope_kind = 'email' AND scope_value = $2))`,
    [ip, email]
  );

  const retry = rows[0]?.retry_after ?? 0;
  return retry > 0 ? { blocked: true, retryAfterSeconds: retry } : NOT_BLOCKED;
}

async function bump(kind: "ip" | "email", value: string): Promise<boolean> {
  /*
   * One statement, so two requests arriving together cannot both read four
   * failures and each write five. The window reset lives in the same UPDATE
   * for the same reason.
   */
  const { rows } = await pool.query<{ failures: number; blocked_until: string | null }>(
    `INSERT INTO auth_lockouts (scope_kind, scope_value, failures, window_started_at)
     VALUES ($1, $2, 1, now())
     ON CONFLICT (scope_kind, scope_value) DO UPDATE
        SET failures = CASE
              WHEN auth_lockouts.window_started_at < now() - make_interval(mins => $3)
              THEN 1
              ELSE auth_lockouts.failures + 1
            END,
            window_started_at = CASE
              WHEN auth_lockouts.window_started_at < now() - make_interval(mins => $3)
              THEN now()
              ELSE auth_lockouts.window_started_at
            END,
            blocked_until = CASE
              WHEN (CASE
                      WHEN auth_lockouts.window_started_at < now() - make_interval(mins => $3)
                      THEN 1
                      ELSE auth_lockouts.failures + 1
                    END) >= $4
              THEN now() + make_interval(mins => $5)
              ELSE auth_lockouts.blocked_until
            END,
            updated_at = now()
     RETURNING failures, blocked_until`,
    [kind, value, FAILURE_WINDOW_MINUTES, MAX_FAILURES, LOCKOUT_MINUTES]
  );

  const row = rows[0];
  return Boolean(row && row.failures >= MAX_FAILURES);
}

/**
 * Records a failed credential check.
 *
 * Returns whether this failure closed the door, so the caller can say so
 * rather than letting the next attempt discover it.
 */
export async function recordFailure(ip: string, email: string | null): Promise<boolean> {
  const results = await Promise.all([
    bump("ip", ip),
    email ? bump("email", email) : Promise.resolve(false),
  ]);
  const locked = results.some(Boolean);
  if (locked) logger.warn({ ip, email }, "auth lockout engaged");
  return locked;
}

/** Clears the address's record after a genuine sign-in. */
export async function clearFailures(ip: string, email: string | null): Promise<void> {
  await pool.query(
    `DELETE FROM auth_lockouts
      WHERE (scope_kind = 'ip' AND scope_value = $1)
         OR ($2::text IS NOT NULL AND scope_kind = 'email' AND scope_value = $2)`,
    [ip, email]
  );
}

/** The address a request came from, as the proxy reports it. */
export function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.ip ?? "unknown";
}
