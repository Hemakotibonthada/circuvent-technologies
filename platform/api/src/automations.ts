import { pool } from "./db";
import { publishCommand } from "./mqtt";
import { normaliseCommand, needsRepair } from "./device-commands";
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
  /**
   * Optional day filter for time triggers: 0=Sunday … 6=Saturday, evaluated in
   * IST like `at` is. Omitted or empty means every day, which is how every
   * schedule created before this field existed behaves — so old rows keep
   * running unchanged.
   */
  days?: number[];
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

/**
 * Runs one action.
 *
 * Throws on failure rather than swallowing it, so runActions can record *why*
 * a rule did not do what it said. The previous version logged and returned,
 * which meant a schedule targeting a device the user no longer owns looked
 * identical to one that worked.
 */
async function runOne(ownerId: number, name: string, a: Action, ctx: EventCtx): Promise<void> {
  if (a.delayMs && a.delayMs > 0) await sleep(Math.min(a.delayMs, 30000));
  if ((a.type === "command" || a.type === "tts") && a.deviceId) {
    // Ownership, and the device type in the same round trip.
    //
    // The type is needed to normalise the stored command, and fetching it
    // separately would double the queries on the hot path of every rule.
    const { rows } = await pool.query<{ type: string }>(
      `SELECT type FROM devices WHERE id = $1 AND owner_id = $2`,
      [a.deviceId, ownerId],
    );
    if (!rows.length) {
      // Named, not silent. "That device is not in your fleet" is a fix the
      // user can act on; a rule that quietly does nothing is not.
      throw new Error(`device ${a.deviceId} is not in this account`);
    }
    const deviceType = rows[0].type;

    const raw = a.type === "tts"
      ? { action: "say", text: fillTemplate(a.text || a.body || "Welcome home", ctx) }
      : a.command || {};

    /*
     * Repaired on the way out.
     *
     * Every switch timer ever saved stored a state key with no action, which
     * the device discards on its first line — the rule ran, MQTT delivered,
     * and the relay never moved. Fixing the apps stops new ones being
     * written that way; this is what makes the ones already in the database
     * work, without asking anyone to recreate a schedule they set months ago.
     */
    const command = normaliseCommand(deviceType, raw) ?? raw;
    if (needsRepair(deviceType, raw)) {
      // Logged per action so the repair is visible in the logs rather than
      // inferred from relays mysteriously starting to work.
      logger.info(
        { device: a.deviceId, deviceType, from: raw, to: command },
        "automation command repaired to a shape the device reads",
      );
    }

    publishCommand(a.deviceId, command);
    await pool.query(`INSERT INTO commands (device_id, user_id, payload) VALUES ($1, $2, $3)`, [a.deviceId, ownerId, command]);
    logger.info({ device: a.deviceId, type: a.type }, "automation action ran");
  } else if (a.type === "notify") {
    await sendPushToUser(ownerId, {
      title: a.title ? fillTemplate(a.title, ctx) : "Circuvent",
      body: a.body ? fillTemplate(a.body, ctx) : name,
    });
  }
}

/**
 * Runs every action of a rule and records the outcome on the row.
 *
 * The record is the point. A timer that saved correctly, showed the right
 * next-run time and never moved a relay was indistinguishable from one that
 * worked — from the app, from the API, and from anything a user can see. Now
 * "last ran" either advances or it does not, and when it does not there is a
 * reason attached.
 */
async function runActions(a: AutomationRow, ctx: EventCtx = {}): Promise<void> {
  const list = Array.isArray(a.action) ? a.action : [a.action];
  let failure: string | null = null;
  for (const act of list) {
    try {
      await runOne(a.owner_id, a.name, act, ctx);
    } catch (err) {
      // First failure is kept: it is the one that explains the rest, and a
      // later cascading error would bury it.
      failure ??= err instanceof Error ? err.message : "action failed";
      logger.error({ err, automation: a.id, type: act.type }, "automation action failed");
    }
  }
  try {
    await pool.query(
      `UPDATE automations
          SET last_run_at = now(), last_run_ok = $2, last_error = $3, run_count = run_count + 1
        WHERE id = $1`,
      [a.id, failure === null, failure],
    );
  } catch (err) {
    // Bookkeeping must never take down a rule that actually ran.
    logger.error({ err, automation: a.id }, "could not record automation run");
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
      `SELECT a.id, a.owner_id, a.name, a.enabled, a.trigger, a.action FROM automations a
       JOIN devices d ON d.id = $1 AND d.owner_id = a.owner_id
       WHERE a.enabled AND a.trigger->>'type' = 'state' AND a.trigger->>'deviceId' = $1`,
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
      `SELECT a.id, a.owner_id, a.name, a.enabled, a.trigger, a.action FROM automations a
       JOIN devices d ON d.id = $1 AND d.owner_id = a.owner_id
       WHERE a.enabled AND a.trigger->>'type' = 'event' AND a.trigger->>'deviceId' = $1`,
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

/** Today's weekday in IST, 0=Sunday … 6=Saturday. */
function istWeekday(now: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** HH:MM in IST — the form stored in `trigger.at`. */
export function istClock(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

/**
 * A globally unique key for one minute, in IST.
 *
 * The date has to be part of it. Keying on HH:MM alone would let today's 07:30
 * claim block tomorrow's.
 */
export function tickKey(now: Date): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return `${date}T${istClock(now)}`;
}

/**
 * Claims a minute for exactly one process.
 *
 * Returns true only for the caller that inserted the row. The primary key makes
 * this atomic, so N replicas racing on the same minute produce exactly one
 * winner — and because the claim is in the database rather than in memory, a
 * process that restarts mid-minute cannot re-run a tick it already ran.
 */
export async function claimTick(key: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO scheduler_ticks (tick_key) VALUES ($1) ON CONFLICT DO NOTHING`,
    [key],
  );
  return rowCount === 1;
}

/** Keeps the claim table from growing without bound. */
async function pruneTicks(): Promise<void> {
  await pool.query(`DELETE FROM scheduler_ticks WHERE ran_at < now() - interval '2 days'`);
}

/** Time-triggered automations — checked once a minute (times are IST). */
export function startAutomationScheduler(): void {
  setInterval(async () => {
    const at = new Date();
    const now = istClock(at);
    const key = tickKey(at);

    try {
      // The claim replaces the process-local `lastMinute` that used to guard
      // this. It also serves as the once-a-minute gate, since the interval runs
      // more often than once a minute on purpose (so a missed tick is retried).
      if (!(await claimTick(key))) return;

      const weekday = istWeekday(at);
      const { rows } = await pool.query<AutomationRow>(
        `SELECT id, owner_id, name, enabled, trigger, action FROM automations
         WHERE enabled AND trigger->>'type' = 'time' AND trigger->>'at' = $1`,
        [now]
      );
      for (const a of rows) {
        const days = a.trigger?.days;
        // No day filter (or an unusable one) means "every day" — never skip a
        // schedule because of a malformed field.
        if (Array.isArray(days) && days.length > 0 && !days.includes(weekday)) continue;
        await runActions(a);
      }

      // Cheap, and only on a claimed tick, so it runs about once a minute
      // across the whole deployment rather than once per replica per interval.
      if (at.getUTCMinutes() === 0) await pruneTicks();
    } catch (err) {
      logger.error({ err }, "automation time tick failed");
    }
  }, 20000);
}
