/**
 * Telling the assistants that something in a house changed.
 *
 * THE PROBLEM THIS SOLVES
 *
 * A device's state changes for reasons neither assistant can see: somebody
 * presses the wall switch, a schedule fires, an automation runs, the relay
 * comes back after a power cut. Until now none of that reached Google or
 * Alexa, so the Home app showed whatever it last asked for and any routine
 * keyed on state ran against a value that might be hours old.
 *
 * WHY THE COALESCING IS NOT AN OPTIMISATION
 *
 * Device state arrives per MQTT message, and a board that publishes its whole
 * state object on every change produces several messages for one physical act
 * — a fan reports `power` and `level` and `speed` separately. Reporting each
 * would send three events for one button press. Alexa rate-limits per user and
 * Google per agent user, so the third event is not merely wasteful: it is the
 * one that gets dropped, and it is the one carrying the final value.
 *
 * So changes are gathered per user for a short window and sent once. The delay
 * is deliberately short — this is a person watching a lamp, and a second is
 * already noticeable.
 */
import { pool } from "../db";
import { logger } from "../logger";
import { isLinked } from "./links";
import { googlePushConfigured, reportState } from "./homegraph";
import { alexaEventsConfigured, sendChangeReport } from "./alexa-events";
import { googleState, isExposed, onOff, brightness, fanSpeed, type DeviceLike } from "./traits";
import { onlineColumn } from "../device-online";

/**
 * How long to gather changes before sending.
 *
 * Long enough to absorb the burst a single physical act produces, short enough
 * that a person watching the Home app does not see a lag. 800ms was chosen by
 * looking at what a fan publishes: three messages inside ~200ms.
 */
const COALESCE_MS = 800;

/** deviceId → the user it belongs to, cached briefly. */
const ownerCache = new Map<string, { uid: number; until: number }>();
const OWNER_TTL_MS = 60_000;

const pending = new Map<number, Set<string>>();
const timers = new Map<number, NodeJS.Timeout>();

/** Whether any push path is configured at all. */
export function proactiveConfigured(): boolean {
  return googlePushConfigured() || alexaEventsConfigured();
}

async function ownerOf(deviceId: string): Promise<number | null> {
  const hit = ownerCache.get(deviceId);
  if (hit && Date.now() < hit.until) return hit.uid;
  try {
    const { rows } = await pool.query<{ owner_id: string | null }>(
      `SELECT owner_id FROM devices WHERE id = $1`,
      [deviceId]
    );
    const uid = rows[0]?.owner_id == null ? null : Number(rows[0].owner_id);
    if (uid != null) ownerCache.set(deviceId, { uid, until: Date.now() + OWNER_TTL_MS });
    return uid;
  } catch {
    return null;
  }
}

/** Drops a device's cached owner. Called when ownership moves. */
export function forgetDeviceOwner(deviceId: string): void {
  ownerCache.delete(deviceId);
}

/**
 * Notes that a device changed. Cheap, synchronous, and safe to call from the
 * MQTT hot path — everything expensive happens on the timer.
 */
export function deviceChanged(deviceId: string): void {
  if (!proactiveConfigured()) return;
  void (async () => {
    const uid = await ownerOf(deviceId);
    if (uid == null) return;
    /*
     * The link check happens here rather than at flush time so an unlinked
     * account — which is almost all of them, early on — never even creates a
     * timer. A house full of devices belonging to somebody who has never
     * touched a smart speaker should cost nothing.
     */
    const [google, alexa] = await Promise.all([isLinked(uid, "google"), isLinked(uid, "alexa")]);
    if (!google && !alexa) return;

    let set = pending.get(uid);
    if (!set) {
      set = new Set();
      pending.set(uid, set);
    }
    set.add(deviceId);

    if (!timers.has(uid)) {
      timers.set(
        uid,
        setTimeout(() => {
          timers.delete(uid);
          const ids = pending.get(uid);
          pending.delete(uid);
          if (ids?.size) void flush(uid, [...ids], google, alexa);
        }, COALESCE_MS).unref()
      );
    }
  })();
}

/** Alexa property list for a device, mirroring the fulfilment handler. */
function alexaProps(d: DeviceLike): Array<Record<string, unknown>> {
  const now = new Date().toISOString();
  const m = onOff(d.type);
  const props: Array<Record<string, unknown>> = [];
  if (m) {
    props.push({
      namespace: "Alexa.PowerController",
      name: "powerState",
      value: d.state[m.field] ? "ON" : "OFF",
      timeOfSample: now,
      uncertaintyInMilliseconds: 500,
    });
  }
  const b = brightness(d.type);
  if (b && d.state[b.field] != null) {
    props.push({
      namespace: "Alexa.BrightnessController",
      name: "brightness",
      value: Math.max(0, Math.min(100, Number(d.state[b.field]) || 0)),
      timeOfSample: now,
      uncertaintyInMilliseconds: 500,
    });
  }
  const f = fanSpeed(d.type);
  if (f) {
    props.push({
      namespace: "Alexa.PercentageController",
      name: "percentage",
      value: f.toPercent(d.state),
      timeOfSample: now,
      uncertaintyInMilliseconds: 500,
    });
  }
  props.push({
    namespace: "Alexa.EndpointHealth",
    name: "connectivity",
    value: { value: d.online ? "OK" : "UNREACHABLE" },
    timeOfSample: now,
    uncertaintyInMilliseconds: 500,
  });
  return props;
}

async function flush(uid: number, deviceIds: string[], google: boolean, alexa: boolean): Promise<void> {
  try {
    const { rows } = await pool.query<DeviceLike & { owner_id: string }>(
      /*
       * onlineColumn() rather than the stored `online` flag. That column is
       * only written when the broker notices a disconnect, so a board that
       * lost power reads as online until something else corrects it — and
       * telling Google a dead lamp is reachable makes the assistant say "OK"
       * to a command that will never arrive.
       */
      `SELECT id, name, type, room, ${onlineColumn()}, state
         FROM devices WHERE owner_id = $1 AND id = ANY($2::text[])`,
      [uid, deviceIds]
    );
    /* Only devices voice can see. Reporting a lock's state to an assistant
       that was never told the lock exists is at best ignored and at worst a
       disclosure. */
    const visible = rows.filter((d) => isExposed(d.type));
    if (!visible.length) return;

    if (google && googlePushConfigured()) {
      await reportState(
        uid,
        visible.map((d) => {
          const s = googleState(d);
          /* Google's report takes the state without the QUERY envelope. */
          delete (s as Record<string, unknown>).status;
          return { deviceId: d.id, state: s };
        })
      );
    }

    if (alexa && alexaEventsConfigured()) {
      /* One event per endpoint — the protocol's shape, not a choice. Sent in
         sequence rather than in parallel so a burst does not arrive at the
         gateway as a spike it will rate-limit. */
      for (const d of visible) {
        await sendChangeReport(uid, { endpointId: d.id, properties: alexaProps(d) });
      }
    }
  } catch (err) {
    logger.warn({ err, uid }, "proactive state report failed");
  }
}

/** Test seam. */
export function resetReportState(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  pending.clear();
  ownerCache.clear();
}
