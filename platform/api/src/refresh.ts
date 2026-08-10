import crypto from "node:crypto";
import { pool } from "./db";
import { logger } from "./logger";
import { revokeAllSessions } from "./sessions";

/**
 * Refresh tokens with rotation and reuse detection.
 *
 * `token_epoch` (see sessions.ts) can end a session, but it cannot tell a
 * thief's use of a token from the owner's — both present a valid signature, and
 * nothing distinguishes them. That is the gap this closes.
 *
 * Each refresh token is single-use. Redeeming one marks it used and issues a
 * replacement in the same family. So if a token is ever presented twice, one of
 * two things happened: the token was copied, or a legitimate client retried.
 * Both are treated as compromise, because the alternative is deciding which one
 * it was, and there is no way to know.
 *
 * On reuse the whole family is destroyed and every session for the account is
 * revoked. That logs the real user out — deliberately. Being signed out is an
 * inconvenience; leaving an attacker with a working chain is not.
 *
 * SECURITY: tokens are stored as a SHA-256 hash, not bcrypt. Lookup is *by* the
 * hash, and bcrypt's per-row salt would make that a full-table scan. A fast
 * hash is safe here only because the token is 256 bits of CSPRNG output, so
 * there is nothing to guess — never store a user-chosen secret this way.
 */

/**
 * How long a refresh token remains valid.
 *
 * One day, down from sixty. A refresh chain is the real lifetime of a sign-in:
 * the console renews automatically on any 401, so while this was sixty days a
 * short access token bought nothing — it was renewed straight past, and the
 * session continued for two months across an unbounded number of tokens.
 *
 * The clients also refuse to renew more than 24 hours after the sign-in, so a
 * deployment still running the old value is capped by them. This makes the
 * server agree rather than relying on that.
 */
export const REFRESH_TTL_DAYS = 1;

export interface IssuedRefresh {
  token: string;
  familyId: string;
  expiresAt: Date;
}

function hash(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function newToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Mints a refresh token, starting a new family unless one is continued. */
export async function issueRefreshToken(uid: number, familyId?: string): Promise<IssuedRefresh> {
  const token = newToken();
  const family = familyId ?? crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [uid, family, hash(token), expiresAt],
  );

  return { token, familyId: family, expiresAt };
}

export type RefreshOutcome =
  | { ok: true; uid: number; next: IssuedRefresh }
  | { ok: false; reason: "unknown" | "expired" | "reused" };

/**
 * Redeems a refresh token and rotates it.
 *
 * The update is conditional on `used_at IS NULL` and returns the row, so two
 * concurrent redemptions of the same token cannot both succeed — the database
 * decides, not a read-then-write race in the application.
 */
export async function rotateRefreshToken(token: string): Promise<RefreshOutcome> {
  const tokenHash = hash(token);

  const claim = await pool.query<{ id: string; user_id: string; family_id: string; expires_at: string }>(
    `UPDATE refresh_tokens SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL
     RETURNING id, user_id, family_id, expires_at`,
    [tokenHash],
  );

  if (claim.rowCount === 1) {
    const row = claim.rows[0];
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { ok: false, reason: "expired" };
    }
    const uid = Number(row.user_id);
    const next = await issueRefreshToken(uid, row.family_id);
    return { ok: true, uid, next };
  }

  // Nothing was claimed. Either the token does not exist, or it exists and was
  // already used — and those mean very different things.
  const existing = await pool.query<{ user_id: string; family_id: string }>(
    `SELECT user_id, family_id FROM refresh_tokens WHERE token_hash = $1`,
    [tokenHash],
  );

  if (existing.rowCount === 0) return { ok: false, reason: "unknown" };

  const { user_id, family_id } = existing.rows[0];
  const uid = Number(user_id);

  // Replay. Tear the family down and end every session for the account: we
  // cannot tell which holder is genuine, so neither keeps access.
  await revokeFamily(family_id);
  await revokeAllSessions(uid);
  logger.warn({ uid, familyId: family_id }, "refresh token reuse detected; family and sessions revoked");

  return { ok: false, reason: "reused" };
}

/** Deletes every token in a family. */
export async function revokeFamily(familyId: string): Promise<void> {
  await pool.query(`DELETE FROM refresh_tokens WHERE family_id = $1`, [familyId]);
}

/** Deletes every refresh token for an account — used alongside session revocation. */
export async function revokeAllRefreshTokens(uid: number): Promise<void> {
  await pool.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [uid]);
}

/** Housekeeping: drop tokens that expired or were used long ago. */
export async function pruneRefreshTokens(): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM refresh_tokens
     WHERE expires_at < now()
        OR (used_at IS NOT NULL AND used_at < now() - interval '7 days')`,
  );
  return rowCount ?? 0;
}
