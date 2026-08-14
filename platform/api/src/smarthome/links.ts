/**
 * Which assistants a customer has linked, and how to reach them.
 *
 * WHY THIS EXISTS AT ALL, GIVEN THE TOKENS ARE STATELESS
 *
 * Account linking is a JWT exchange with nothing stored, which is what lets
 * the API scale sideways without sticky sessions. Three things need a record
 * anyway, and none of them are optional in a product with more than one
 * customer:
 *
 *   Unlinking. Google sends DISCONNECT and Alexa sends a skill-disabled
 *   event, and until now both were answered with an empty 200 that revoked
 *   nothing. Somebody who removes Circuvent from their Google Home has said
 *   plainly that they want it to stop; leaving a 90-day refresh token alive is
 *   ignoring them.
 *
 *   Pushing state. Google's Report State and Alexa's ChangeReport are calls we
 *   make to them, so we need to know who to call for. A user who has never
 *   linked must generate no traffic at all.
 *
 *   Telling the customer. "Which assistants can control my house?" is a
 *   question the account holder is entitled to an answer to, and it cannot be
 *   answered from a stateless token.
 */
import { pool } from "../db";
import { logger } from "../logger";
import { revokeAllSessions } from "../sessions";

export type Assistant = "google" | "alexa";

export interface AssistantLink {
  userId: number;
  assistant: Assistant;
  linkedAt: string;
  lastSyncAt: string | null;
  /** Present only for Alexa, which requires a grant to send events back. */
  hasEventGrant: boolean;
}

/**
 * Records that a user has linked an assistant.
 *
 * Called on every token exchange rather than only the first, because there is
 * no other reliable signal: the authorization code is redeemed by the vendor's
 * server, and a re-link after a password change looks identical to the first
 * one. Upserting keeps the row current and is idempotent.
 *
 * Never throws. A linking flow that fails because a bookkeeping row could not
 * be written would be a worse outcome than not having the row.
 */
export async function recordLink(userId: number, assistant: Assistant): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO assistant_links (user_id, assistant, linked_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id, assistant) DO UPDATE SET linked_at = now()`,
      [userId, assistant]
    );
  } catch (err) {
    logger.warn({ err, userId, assistant }, "could not record assistant link");
  }
}

/** Every assistant this account has linked. */
export async function linksFor(userId: number): Promise<AssistantLink[]> {
  try {
    const { rows } = await pool.query<{
      assistant: string;
      linked_at: string;
      last_sync_at: string | null;
      alexa_refresh_token: string | null;
    }>(
      `SELECT assistant, linked_at, last_sync_at, alexa_refresh_token
         FROM assistant_links WHERE user_id = $1 ORDER BY linked_at DESC`,
      [userId]
    );
    return rows
      .filter((r) => r.assistant === "google" || r.assistant === "alexa")
      .map((r) => ({
        userId,
        assistant: r.assistant as Assistant,
        linkedAt: r.linked_at,
        lastSyncAt: r.last_sync_at,
        hasEventGrant: !!r.alexa_refresh_token,
      }));
  } catch (err) {
    logger.warn({ err, userId }, "could not read assistant links");
    return [];
  }
}

/** Everyone who has linked this assistant, for a fan-out. */
export async function usersLinkedTo(assistant: Assistant): Promise<number[]> {
  try {
    const { rows } = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM assistant_links WHERE assistant = $1`,
      [assistant]
    );
    return rows.map((r) => Number(r.user_id));
  } catch {
    return [];
  }
}

/** True when this user has linked this assistant. */
export async function isLinked(userId: number, assistant: Assistant): Promise<boolean> {
  try {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM assistant_links WHERE user_id = $1 AND assistant = $2`,
      [userId, assistant]
    );
    return !!rowCount;
  } catch {
    return false;
  }
}

/**
 * Alexa's grant, stored so we can send events to it later.
 *
 * Alexa hands this over once, during `Alexa.Authorization/AcceptGrant`, and
 * never again. Losing it means proactive updates stop for that user until they
 * disable and re-enable the skill, so it is written before the AcceptGrant
 * response is sent rather than after.
 */
export async function saveAlexaGrant(
  userId: number,
  refreshToken: string,
  accessToken: string,
  expiresInSeconds: number
): Promise<void> {
  await pool.query(
    `INSERT INTO assistant_links (user_id, assistant, linked_at, alexa_refresh_token, alexa_access_token, alexa_expires_at)
     VALUES ($1, 'alexa', now(), $2, $3, now() + ($4 || ' seconds')::interval)
     ON CONFLICT (user_id, assistant) DO UPDATE
       SET alexa_refresh_token = EXCLUDED.alexa_refresh_token,
           alexa_access_token  = EXCLUDED.alexa_access_token,
           alexa_expires_at    = EXCLUDED.alexa_expires_at`,
    [userId, refreshToken, accessToken, String(Math.max(0, expiresInSeconds))]
  );
}

export interface AlexaGrant {
  refreshToken: string;
  accessToken: string | null;
  /** Null when unknown; treated as expired. */
  expiresAt: string | null;
}

export async function alexaGrant(userId: number): Promise<AlexaGrant | null> {
  const { rows } = await pool.query<{
    alexa_refresh_token: string | null;
    alexa_access_token: string | null;
    alexa_expires_at: string | null;
  }>(
    `SELECT alexa_refresh_token, alexa_access_token, alexa_expires_at
       FROM assistant_links WHERE user_id = $1 AND assistant = 'alexa'`,
    [userId]
  );
  const r = rows[0];
  if (!r?.alexa_refresh_token) return null;
  return {
    refreshToken: r.alexa_refresh_token,
    accessToken: r.alexa_access_token,
    expiresAt: r.alexa_expires_at,
  };
}

/** Records a refreshed Alexa access token. */
export async function updateAlexaAccessToken(
  userId: number,
  accessToken: string,
  expiresInSeconds: number
): Promise<void> {
  await pool.query(
    `UPDATE assistant_links
        SET alexa_access_token = $2,
            alexa_expires_at = now() + ($3 || ' seconds')::interval
      WHERE user_id = $1 AND assistant = 'alexa'`,
    [userId, accessToken, String(Math.max(0, expiresInSeconds))]
  );
}

export async function markSynced(userId: number, assistant: Assistant): Promise<void> {
  try {
    await pool.query(
      `UPDATE assistant_links SET last_sync_at = now() WHERE user_id = $1 AND assistant = $2`,
      [userId, assistant]
    );
  } catch {
    /* bookkeeping only */
  }
}

/**
 * Unlinks an assistant and revokes the grant behind it.
 *
 * DELETING THE ROW IS NOT ENOUGH, AND THAT IS THE WHOLE POINT
 *
 * The row is bookkeeping; the refresh token is the access. A user who removes
 * Circuvent from Google Home and keeps a working 90-day token has been told
 * "unlinked" and has not been unlinked. So this bumps the account's token
 * epoch, which is the existing kill switch every other revocation path uses —
 * the same one that makes "sign out everywhere" work.
 *
 * That is blunt: it also signs out the phone and the console. Blunt in this
 * direction is correct. Someone unlinking an assistant is far more likely to
 * be removing access they no longer want than to be tidying up, and the cost
 * of over-revoking is signing in again, while the cost of under-revoking is a
 * stranger keeping a house key.
 *
 * Returns false when there was nothing to unlink, so a caller can tell "done"
 * from "there was nothing there".
 */
export async function unlink(userId: number, assistant: Assistant): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM assistant_links WHERE user_id = $1 AND assistant = $2`,
    [userId, assistant]
  );
  try {
    await revokeAllSessions(userId);
  } catch (err) {
    /*
     * Logged loudly. If the row is gone but the epoch did not move, the user
     * has been shown "unlinked" while the token still works — the exact state
     * this function exists to prevent, and one nothing else will notice.
     */
    logger.error({ err, userId, assistant }, "unlink removed the record but could not revoke tokens");
    throw err;
  }
  return !!rowCount;
}
