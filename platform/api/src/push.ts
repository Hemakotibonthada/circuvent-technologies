import { pool } from "./db";
import { logger } from "./logger";

export async function registerPushToken(userId: number, token: string, platform: string): Promise<void> {
  if (!token) return;
  await pool.query(
    `INSERT INTO push_tokens (token, user_id, platform) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform`,
    [token, userId, platform || ""]
  );
}

/** Unregister a token. Scoped to its owner unless called by an internal cleanup. */
export async function removePushToken(token: string, userId?: number): Promise<void> {
  if (userId === undefined) {
    await pool.query(`DELETE FROM push_tokens WHERE token = $1`, [token]);
    return;
  }
  await pool.query(`DELETE FROM push_tokens WHERE token = $1 AND user_id = $2`, [token, userId]);
}

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Send an Expo push notification to every device the user has registered. */
export async function sendPushToUser(userId: number, msg: PushMessage): Promise<void> {
  await sendToTokens(await tokensFor([userId]), msg);
}

/**
 * Who in a household should hear about something.
 *
 * A home alert is not one person's business. The owner may be asleep, abroad,
 * or the one member of the family without their phone — and an alert that
 * reaches nobody is the same as no alert.
 *
 * The audience is chosen per alert rather than fanned out to everybody,
 * because the two mistakes are not symmetric. Telling a houseguest that a
 * smoke alarm has gone off is at worst startling; telling a cleaner that the
 * house is empty and the back door is unlocked is a different thing entirely.
 */
export type Audience =
  /** Anybody in the house, including guests. Fire, water, gas, panic. */
  | "everyone"
  /** People who live here. Devices going offline, automations firing. */
  | "residents"
  /** Adults only. Locks, alarms, cameras, anything about the property. */
  | "adults";

const ROLES_FOR: Record<Audience, string[]> = {
  everyone: ["adult", "limited", "guest"],
  residents: ["adult", "limited"],
  adults: ["adult"],
};

/**
 * Notify a household about something that happened in it.
 *
 * The owner always hears about it — they are the account, and every one of
 * these alerts was addressed to them before households existed. Members are
 * added according to the audience.
 *
 * Failures are per-recipient and never propagate: an alert that reaches four
 * of five phones is worth far more than one that throws because a fifth token
 * had been revoked.
 */
export async function sendPushToHome(
  homeId: number,
  msg: PushMessage,
  audience: Audience = "residents"
): Promise<void> {
  const recipients = [homeId];
  try {
    const { rows } = await pool.query<{ member_id: string }>(
      `SELECT member_id FROM home_members WHERE home_id = $1 AND role = ANY($2::text[])`,
      [homeId, ROLES_FOR[audience]]
    );
    for (const r of rows) recipients.push(Number(r.member_id));
  } catch (err) {
    /* A hub that has not been migrated yet has no home_members table. The
       owner still gets the alert, which is exactly what happened before. */
    logger.warn({ err, homeId }, "household fan-out failed; notifying owner only");
  }
  await sendToTokens(await tokensFor(recipients), msg);
}

async function tokensFor(userIds: number[]): Promise<string[]> {
  if (!userIds.length) return [];
  const { rows } = await pool.query<{ token: string }>(
    `SELECT token FROM push_tokens WHERE user_id = ANY($1::bigint[])`,
    [userIds]
  );
  return rows
    .map((r) => r.token)
    .filter((t) => t.startsWith("ExponentPushToken") || t.startsWith("ExpoPushToken"));
}

async function sendToTokens(tokens: string[], msg: PushMessage): Promise<void> {
  if (!tokens.length) return;

  const messages = tokens.map((to) => ({
    to,
    title: msg.title,
    body: msg.body,
    data: msg.data ?? {},
    sound: "default",
    priority: "high",
  }));

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
    const out = (await res.json().catch(() => null)) as { data?: Array<{ status?: string; details?: { error?: string } }> } | null;
    if (Array.isArray(out?.data)) {
      for (let i = 0; i < out!.data!.length; i++) {
        const r = out!.data![i];
        if (r?.status === "error" && r?.details?.error === "DeviceNotRegistered") {
          await removePushToken(tokens[i]).catch(() => {});
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "push send failed");
  }
}
