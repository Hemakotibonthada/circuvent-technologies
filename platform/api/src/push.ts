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
  const { rows } = await pool.query<{ token: string }>(`SELECT token FROM push_tokens WHERE user_id = $1`, [userId]);
  const tokens = rows.map((r) => r.token).filter((t) => t.startsWith("ExponentPushToken") || t.startsWith("ExpoPushToken"));
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
