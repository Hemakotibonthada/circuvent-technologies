import { pool } from "./db";
import { publishCommand } from "./mqtt";
import { sendPushToUser } from "./push";
import { logger } from "./logger";

export interface Trigger {
  type: "state" | "time";
  deviceId?: string;
  field?: string;
  op?: "<" | "<=" | ">" | ">=" | "==" | "!=" | "truthy" | "falsy";
  value?: number | string | boolean;
  at?: string; // "HH:MM" (IST) for time triggers
}
export interface Action {
  type: "command" | "notify";
  deviceId?: string;
  command?: Record<string, unknown>;
  title?: string;
  body?: string;
}
interface AutomationRow {
  id: number;
  owner_id: number;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  action: Action;
}

function cond(state: Record<string, unknown> | null | undefined, t: Trigger): boolean {
  if (!t.field) return false;
  const v = state ? state[t.field] : undefined;
  switch (t.op) {
    case "truthy": return !!v;
    case "falsy": return !v;
    case "==": return v == t.value; // eslint-disable-line eqeqeq
    case "!=": return v != t.value; // eslint-disable-line eqeqeq
    case "<": return Number(v) < Number(t.value);
    case "<=": return Number(v) <= Number(t.value);
    case ">": return Number(v) > Number(t.value);
    case ">=": return Number(v) >= Number(t.value);
    default: return false;
  }
}

async function runAction(a: AutomationRow): Promise<void> {
  try {
    if (a.action.type === "command" && a.action.deviceId && a.action.command) {
      // Only if the owner actually owns the target device.
      const { rowCount } = await pool.query(`SELECT 1 FROM devices WHERE id = $1 AND owner_id = $2`, [a.action.deviceId, a.owner_id]);
      if (!rowCount) return;
      publishCommand(a.action.deviceId, a.action.command);
      await pool.query(`INSERT INTO commands (device_id, user_id, payload) VALUES ($1, $2, $3)`, [a.action.deviceId, a.owner_id, a.action.command]);
      logger.info({ automation: a.id, device: a.action.deviceId }, "automation ran command");
    } else if (a.action.type === "notify") {
      await sendPushToUser(a.owner_id, { title: a.action.title || "Circuvent", body: a.action.body || a.name });
    }
  } catch (err) {
    logger.error({ err, automation: a.id }, "automation action failed");
  }
}

/**
 * Edge-triggered state automations: fire when the condition becomes true
 * (true now, was not true before) for the device that just updated.
 */
export async function onStateChange(deviceId: string, prev: Record<string, unknown> | null, next: Record<string, unknown>): Promise<void> {
  let rows: AutomationRow[];
  try {
    const q = await pool.query<AutomationRow>(
      `SELECT id, owner_id, name, enabled, trigger, action FROM automations
       WHERE enabled AND trigger->>'type' = 'state' AND trigger->>'deviceId' = $1`,
      [deviceId]
    );
    rows = q.rows;
  } catch (err) {
    logger.error({ err }, "automation state query failed");
    return;
  }
  for (const a of rows) {
    if (cond(next, a.trigger) && !cond(prev, a.trigger)) await runAction(a);
  }
}

/** Time-triggered automations — checked once a minute (times are IST). */
export function startAutomationScheduler(): void {
  let lastMinute = "";
  setInterval(async () => {
    const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    if (now === lastMinute) return;
    lastMinute = now;
    try {
      const { rows } = await pool.query<AutomationRow>(
        `SELECT id, owner_id, name, enabled, trigger, action FROM automations
         WHERE enabled AND trigger->>'type' = 'time' AND trigger->>'at' = $1`,
        [now]
      );
      for (const a of rows) await runAction(a);
    } catch (err) {
      logger.error({ err }, "automation time tick failed");
    }
  }, 20000);
}
