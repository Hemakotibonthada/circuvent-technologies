import { pool } from "./db";

/**
 * Session validity, memoised for a short window.
 *
 * A JWT proves only that we signed it. Until this module existed nothing could
 * end a session early, which on a platform that opens doors and gates is the
 * wrong default:
 *
 *   - a lost or stolen phone kept full control until the token expired;
 *   - deleting or disabling an account left its token working — the admin
 *     delete handler even says so, and worked around it for device commands
 *     alone, so the account could still read events and mint gate passes;
 *   - changing a password signed nobody out;
 *   - there was no "sign out everywhere" at all.
 *
 * Every token now carries the account's `token_epoch`. Bumping that column
 * invalidates every token ever issued to the account, immediately and without
 * any server-side session store.
 *
 * The lookup is one primary-key read, memoised the same way and for the same
 * reason as `ownership.ts`: `requireAuth` runs on every authenticated request
 * and used to be pure signature verification, so an unconditional round-trip
 * would be new latency on the hot path.
 *
 * SECURITY: every code path that bumps `token_epoch`, sets `blocked`, or
 * deletes a user MUST call `invalidateUser`, or the revocation will not take
 * effect until the entry expires. The cache is process-local — exactly like
 * `ownershipCache` — so if the API is scaled past one replica this has to move
 * to Redis, or the TTL has to drop to zero. Invalidation does not cross
 * process boundaries.
 */

export interface SessionState {
  tokenEpoch: number;
  blocked: boolean;
}

const sessionCache = new Map<number, { state: SessionState; expires: number }>();

export const SESSION_TTL_MS = 5_000;

/** Drop the cached session state for one account. */
export function invalidateUser(uid: number | string): void {
  sessionCache.delete(Number(uid));
}

/** Clear everything. Used by tests and on shutdown. */
export function clearSessionCache(): void {
  sessionCache.clear();
}

/** Current session state, or null when the account no longer exists. */
export async function loadSessionState(uid: number): Promise<SessionState | null> {
  const hit = sessionCache.get(uid);
  if (hit && Date.now() < hit.expires) return hit.state;

  const { rows } = await pool.query<{ token_epoch: string; blocked: boolean }>(
    `SELECT token_epoch, blocked FROM users WHERE id = $1`,
    [uid],
  );
  const row = rows[0];
  if (!row) {
    // A deleted account must not be cached as valid, and re-reading on every
    // request from a deleted account is not a path worth optimising.
    sessionCache.delete(uid);
    return null;
  }

  const state: SessionState = {
    // Postgres returns BIGINT as a string.
    tokenEpoch: Number(row.token_epoch) || 0,
    blocked: row.blocked === true,
  };
  sessionCache.set(uid, { state, expires: Date.now() + SESSION_TTL_MS });
  return state;
}

export type SessionVerdict = "ok" | "unknown-user" | "blocked" | "revoked";

/**
 * Decides whether a token that already passed signature verification still
 * represents a live session.
 *
 * `tokenEpoch` is the `te` claim. Tokens minted before this feature carry no
 * claim and arrive as 0, which matches the column default, so existing sessions
 * survive the deploy and are revocable from the first bump onward.
 */
export async function checkSession(uid: number, tokenEpoch: number): Promise<SessionVerdict> {
  const state = await loadSessionState(uid);
  if (!state) return "unknown-user";
  if (state.blocked) return "blocked";
  // Strictly less-than, so a token minted at the current epoch stays valid and
  // only older ones die. Equal is the normal case.
  if (tokenEpoch < state.tokenEpoch) return "revoked";
  return "ok";
}

/**
 * Ends every session for an account and returns the new epoch.
 *
 * Callers that mint a replacement token must use the returned value, otherwise
 * they would immediately invalidate the token they just issued.
 */
export async function revokeAllSessions(uid: number): Promise<number> {
  const { rows } = await pool.query<{ token_epoch: string }>(
    `UPDATE users SET token_epoch = token_epoch + 1 WHERE id = $1 RETURNING token_epoch`,
    [uid],
  );
  invalidateUser(uid);
  return Number(rows[0]?.token_epoch ?? 0) || 0;
}

/** The epoch to stamp into a newly minted token. */
export async function currentEpoch(uid: number): Promise<number> {
  const state = await loadSessionState(uid);
  return state?.tokenEpoch ?? 0;
}
