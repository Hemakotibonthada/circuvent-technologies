/**
 * The Guardian subsystem.
 *
 * Only one thing runs on a timer here, and it is the one thing the device
 * cannot do for itself: work out which police station is nearest to where the
 * wearer currently is, and push that number down so the device's offline path
 * — SMS over its own SIM, no network, no phone — reaches the right one.
 *
 * The sweep is deliberately not driven by every position report. A Guardian
 * publishes its position continuously; resolving and pushing on each one would
 * be a command every few seconds, over a metered mobile connection, writing
 * NVS each time. Once every few minutes is far inside the distance anybody
 * covers on foot.
 */
import { pool, recordEvent } from "../db";
import { logger } from "../logger";
import { publishCommand } from "../mqtt";
import {
  openIncidentFor,
  openIncidentOf,
  refreshStationFor,
  startGuardian,
} from "./incident";
import {
  escalationFor,
  journeyAction,
  shouldEscalate,
  type EscalationStep,
} from "./watch";

export { guardianRouter } from "./routes";
export { startGuardian, __resetGuardianForTests } from "./incident";

/*
 * Five minutes.
 *
 * A wearer walking covers about 400m in that time and a car rather more, but
 * the thing being chosen is which station is *told* — and stations are not
 * dense enough for a few hundred metres to change the answer. Meanwhile the
 * cost of getting it wrong for five minutes is nil, because the device still
 * has a working number the whole time.
 */
const STATION_INTERVAL_MS = 5 * 60_000;

let timers: NodeJS.Timeout[] = [];

/**
 * Keeps every online Guardian's cached station current.
 *
 * Devices that are offline are skipped rather than queued: the command would
 * not arrive, and when they come back they publish a position, which brings
 * them into the next sweep anyway.
 */
export async function sweepStations(): Promise<void> {
  const r = await pool.query<{
    id: string;
    state: Record<string, unknown> | null;
  }>(
    `SELECT id, state FROM devices
      WHERE type = 'guardian' AND state IS NOT NULL`,
  );

  for (const row of r.rows) {
    const state = row.state ?? {};
    const lat = typeof state.lat === "number" ? state.lat : null;
    const lng = typeof state.lng === "number" ? state.lng : null;
    if (lat === null || lng === null) continue;

    /*
     * What the device says it is carrying. `police` is published as 1/0 —
     * whether it has one at all — rather than the number itself, because a
     * device's retained state is visible to more places than an emergency
     * contact list should be. So the comparison that avoids a needless push
     * is made on the resolved number against what we last sent; a device with
     * no number at all always gets one.
     */
    const hasNumber = state.police === 1 || state.police === true;
    try {
      await refreshStationFor(row.id, lat, lng, hasNumber ? lastPushed.get(row.id) ?? "" : "", "");
    } catch (err) {
      logger.error({ err, deviceId: row.id }, "guardian station sweep failed");
    }
  }
}

/**
 * What we last told each device.
 *
 * In memory on purpose: it is a cache whose only job is to avoid a redundant
 * command, and being wrong about it costs one extra publish after a restart.
 * Persisting the emergency number the platform sent would put a second copy of
 * it somewhere it does not need to be.
 */
export const lastPushed = new Map<string, string>();

export function startGuardianSystem(): void {
  if (timers.length) return;
  startGuardian();

  const t = setInterval(() => {
    void sweepStations().catch((err) => logger.error({ err }, "guardian sweep failed"));
  }, STATION_INTERVAL_MS);

  /*
   * Journeys and escalation run far more often than the station sweep, because
   * both are about somebody who may be in trouble right now. Thirty seconds is
   * chosen against the grace periods they enforce — a minute for the nudge,
   * three for the first escalation — so neither is ever more than a sweep late.
   */
  const watch = setInterval(() => {
    void sweepWatches().catch((err) => logger.error({ err }, "guardian watch sweep failed"));
  }, WATCH_INTERVAL_MS);

  /* Unreferenced so they cannot hold the process open during a shutdown. */
  t.unref?.();
  watch.unref?.();
  timers = [t, watch];

  /*
   * The first pass is delayed rather than run at boot: the broker is still
   * connecting, and a command published before the MQTT client is up goes
   * nowhere while looking like it was sent.
   */
  const first = setTimeout(() => {
    void sweepStations().catch(() => {});
  }, 25_000);
  first.unref?.();
  timers.push(first);

  logger.info("guardian system started");
}

const WATCH_INTERVAL_MS = 30_000;

/**
 * Overdue journeys, and alarms nobody has answered.
 *
 * Both are the same shape of problem — a timer over a decision — and both fail
 * the same two ways: firing early on somebody who is fine, and never firing on
 * somebody who is not. The policy is in watch.ts and tested; this is only the
 * plumbing.
 */
export async function sweepWatches(): Promise<void> {
  const now = Date.now();

  /* ---- journeys ---- */
  const journeys = await pool.query<{
    id: string;
    device_id: string;
    owner_id: string;
    due_at: string;
    nudged_at: string | null;
  }>(
    `SELECT id, device_id, owner_id, due_at, nudged_at
       FROM guardian_journeys WHERE status = 'running'`,
  );

  for (const j of journeys.rows) {
    const action = journeyAction(
      { startedAt: 0, dueAt: new Date(j.due_at).getTime(), status: "running" },
      now,
      j.nudged_at !== null,
    );

    if (action.kind === "nudge") {
      await pool.query(`UPDATE guardian_journeys SET nudged_at = now() WHERE id = $1`, [j.id]);
      await recordEvent(
        Number(j.owner_id),
        "guardian",
        "Journey overdue",
        "No arrival confirmed. An alarm will be raised shortly unless it is cancelled.",
        j.device_id,
      );
    } else if (action.kind === "raise") {
      await pool.query(
        `UPDATE guardian_journeys SET status = 'overdue', closed_at = now() WHERE id = $1`,
        [j.id],
      );
      /*
       * Told to the device as well as recorded here. The device runs the same
       * deadline itself and will usually have raised it already — this is the
       * case where it was asleep, out of coverage, or restarted, and the
       * platform is the only one still counting.
       */
      publishCommand(j.device_id, { action: "panic" });
      const existing = await openIncidentOf(j.device_id);
      if (!existing) {
        const dev = await pool.query<{ state: Record<string, unknown> | null }>(
          `SELECT state FROM devices WHERE id = $1`,
          [j.device_id],
        );
        await openIncidentFor(j.device_id, dev.rows[0]?.state ?? {}, "app");
      }
      logger.warn({ deviceId: j.device_id }, "guardian journey overdue — alarm raised");
    }
  }

  /* ---- escalation ---- */
  const open = await pool.query<{
    id: string;
    device_id: string;
    owner_id: string;
    opened_at: string;
    acknowledged_at: string | null;
    escalated: string;
  }>(
    `SELECT id, device_id, owner_id, opened_at, acknowledged_at, escalated
       FROM guardian_incidents
      WHERE status IN ('open','acknowledged') AND source <> 'test'`,
  );

  for (const i of open.rows) {
    const step = escalationFor(
      new Date(i.opened_at).getTime(),
      i.acknowledged_at ? new Date(i.acknowledged_at).getTime() : null,
      now,
    );
    const done = i.escalated.split(",").filter(Boolean) as EscalationStep[];
    if (!shouldEscalate(step, done)) continue;

    await pool.query(`UPDATE guardian_incidents SET escalated = $2 WHERE id = $1`, [
      i.id,
      [...done, step].join(","),
    ]);

    if (step === "widen") {
      await recordEvent(
        Number(i.owner_id),
        "guardian",
        "SOS not acknowledged",
        "Nobody has confirmed they are dealing with this. Everyone on the contact list is being told again.",
        i.device_id,
      );
      /* Ask the device to resend, which is the only channel that reaches a
         contact with no app and no data. */
      publishCommand(i.device_id, { action: "panic" });
    } else if (step === "authorities") {
      await recordEvent(
        Number(i.owner_id),
        "guardian",
        "SOS still unanswered",
        "Escalated to the emergency number.",
        i.device_id,
      );
      publishCommand(i.device_id, { action: "escalate" });
    }
    logger.warn({ incidentId: i.id, step }, "guardian incident escalated");
  }
}

/** Test seam: stops the timers so a suite can exit. */
export function __stopGuardianForTests(): void {
  for (const t of timers) clearInterval(t);
  timers = [];
}
