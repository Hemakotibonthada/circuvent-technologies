import { pool } from "./db";
import { publishCommand } from "./mqtt";
import { sendPushToUser } from "./push";
import { logger } from "./logger";

export interface Trigger {
  type: "state" | "time" | "event";
  deviceId?: string;
  // state triggers
  field?: string;
  op?: "<" | "<=" | ">" | ">=" | "==" | "!=" | "truthy" | "falsy";
  value?: number | string | boolean;
  // time triggers
  at?: string; // "HH:MM" (IST) for time triggers
  // event triggers (match a telemetry event, e.g. facedoor access / gate rfid / bell)
  eventType?: string; // payload.type, e.g. "access" | "bell" | "rfid"
  match?: Record<string, unknown>; // each key must equal payload[key]
}
export interface Action {
  type: "command" | "notify" | "tts";
  deviceId?: string;
  command?: Record<string, unknown>;
  title?: string;
  body?: string;
  text?: string; // for "tts" — supports {name} substitution from the triggering event
  delayMs?: number; // optional pause BEFORE this action (sequences)
}
type ActionOrList = Action | Action[];
interface AutomationRow {
  id: number;
  owner_id: number;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  action: ActionOrList;
}
interface EventCtx {
  name?: string; // e.g. matched owner name from a face/fingerprint event
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

/** Event trigger match: payload.type == eventType AND every `match` key equals. */
function matchEvent(payload: Record<string, unknown>, t: Trigger): boolean {
  if (t.eventType && String(payload.type) !== t.eventType) return false;
  if (t.match) {
    for (const [k, want] of Object.entries(t.match)) {
      // loose equality so "true"/true and 1/"1" both match app-authored rules
      if (payload[k] != want) return false; // eslint-disable-line eqeqeq
    }
  }
  return true;
}

function fillTemplate(s: string, ctx: EventCtx): string {
  return s.replace(/\{name\}/g, ctx.name && ctx.name.length ? ctx.name : "there");
}

async function runOne(ownerId: number, name: string, a: Action, ctx: EventCtx): Promise<void> {
  try {
    if (a.delayMs && a.delayMs > 0) await sleep(Math.min(a.delayMs, 30000));
    if ((a.type === "command" || a.type === "tts") && a.deviceId) {
      // Only if the owner actually owns the target device.
      const { rowCount } = await pool.query(`SELECT 1 FROM devices WHERE id = $1 AND owner_id = $2`, [a.deviceId, ownerId]);
      if (!rowCount) return;
      const command = a.type === "tts"
        ? { action: "say", text: fillTemplate(a.text || a.body || "Welcome home", ctx) }
        : a.command || {};
      publishCommand(a.deviceId, command);
      await pool.query(`INSERT INTO commands (device_id, user_id, payload) VALUES ($1, $2, $3)`, [a.deviceId, ownerId, command]);
      logger.info({ device: a.deviceId, type: a.type }, "automation action ran");
    } else if (a.type === "notify") {
      await sendPushToUser(ownerId, {
        title: a.title ? fillTemplate(a.title, ctx) : "Circuvent",
        body: a.body ? fillTemplate(a.body, ctx) : name,
      });
    }
  } catch (err) {
    logger.error({ err, type: a.type }, "automation action failed");
  }
}

async function runActions(a: AutomationRow, ctx: EventCtx = {}): Promise<void> {
  const list = Array.isArray(a.action) ? a.action : [a.action];
  for (const act of list) await runOne(a.owner_id, a.name, act, ctx);
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
    if (cond(next, a.trigger) && !cond(prev, a.trigger)) await runActions(a);
  }
}

/**
 * Event-triggered automations: fire when a matching telemetry event arrives
 * (e.g. facedoor `access` owner match -> greeting + lights + AC sequence).
 */
export async function onEvent(deviceId: string, payload: Record<string, unknown>): Promise<void> {
  if (!payload || typeof payload !== "object" || !payload.type) return;
  let rows: AutomationRow[];
  try {
    const q = await pool.query<AutomationRow>(
      `SELECT id, owner_id, name, enabled, trigger, action FROM automations
       WHERE enabled AND trigger->>'type' = 'event' AND trigger->>'deviceId' = $1`,
      [deviceId]
    );
    rows = q.rows;
  } catch (err) {
    logger.error({ err }, "automation event query failed");
    return;
  }
  const ctx: EventCtx = { name: typeof payload.name === "string" ? (payload.name as string) : undefined };
  for (const a of rows) {
    if (matchEvent(payload, a.trigger)) await runActions(a, ctx);
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
      for (const a of rows) await runActions(a);
    } catch (err) {
      logger.error({ err }, "automation time tick failed");
    }
  }, 20000);
}
