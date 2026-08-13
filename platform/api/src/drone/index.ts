/**
 * Drone pipeline — ingestion, alerting and the sweeps.
 *
 * Entry points:
 *   handleTrackBatch()  cv/<id>/track, the packed position stream
 *   handleDroneState()  cv/<id>/state, the 1 Hz summary
 *   startDrone()        wires the timers; call once at boot
 *
 * The two inbound paths do different jobs and neither is redundant. The track
 * stream is the flight record — it is what gets read after an incident, and it
 * has to be complete. The state stream is what the aircraft *says about
 * itself*, arrives even when the aircraft is parked, and is the only thing
 * that reports a clean disarm promptly. Deriving landings from the track alone
 * would leave every flight open until the stale sweep noticed, which is three
 * minutes of a dashboard claiming an aircraft is flying while the pilot is
 * carrying it back to the car.
 */

import { config } from "../config";
import { pool, recordEvent } from "../db";
import { logger } from "../logger";
import { bus, type DeviceUpdate } from "../mqtt";
import { onOwnershipChange } from "../ownership";
import { sendPushToHome } from "../push";
import { parseTrack, type TrackBatch } from "./track";
import {
  applyBatch,
  closeFlight,
  forgetDevice,
  openFlight,
  recordFlightEvent,
  sweepStaleFlights,
} from "./flights";
import { getSettings } from "./settings";
import { sweepDailyDroneReports } from "./report";

/**
 * A batch is 16 bytes of header plus at most 20 records of 40 bytes. Anything
 * an order of magnitude past that is not a track batch, and parsing it would
 * mean trusting a length field from a device that is already misbehaving.
 */
const MAX_BATCH_BYTES = 8 * 1024;

const ownerCache = new Map<string, { ownerId: number | null; at: number }>();
const OWNER_TTL_MS = 30_000;

async function ownerFor(deviceId: string): Promise<number | null> {
  const hit = ownerCache.get(deviceId);
  if (hit && Date.now() - hit.at < OWNER_TTL_MS) return hit.ownerId;
  try {
    const { rows } = await pool.query<{ owner_id: number | null }>(
      `SELECT owner_id FROM devices WHERE id = $1`,
      [deviceId]
    );
    const ownerId = rows[0]?.owner_id ?? null;
    ownerCache.set(deviceId, { ownerId, at: Date.now() });
    return ownerId;
  } catch (err) {
    logger.error({ err, deviceId }, "drone device lookup failed");
    return null;
  }
}

/**
 * Called when a device is claimed, unclaimed or reassigned.
 *
 * Without this, a 30-second window exists in which an aircraft re-claimed by a
 * different account files its flight into the previous owner's log book — and
 * a flight log is exactly the kind of record that must not leak between
 * accounts.
 */
export function invalidateDroneOwner(deviceId: string): void {
  ownerCache.delete(deviceId);
  forgetDevice(deviceId);
}

// ---------------------------------------------------------------------------
// Track ingestion
// ---------------------------------------------------------------------------

/** Entry point from the MQTT bridge. Cheap and synchronous. */
export function handleTrackBatch(deviceId: string, payload: Buffer): void {
  if (payload.length === 0 || payload.length > MAX_BATCH_BYTES) return;
  const batch = parseTrack(payload);
  if (!batch) return;
  void ingest(deviceId, batch).catch((err) =>
    logger.error({ err, deviceId }, "drone track ingest failed")
  );
}

/** Gap detection, so a lossy link is visible rather than merely lossy. */
const lastSeq = new Map<string, number>();

async function ingest(deviceId: string, batch: TrackBatch): Promise<void> {
  // Ownership first. An unclaimed board on a bench must not write rows.
  const ownerId = await ownerFor(deviceId);
  if (ownerId == null) return;

  const prev = lastSeq.get(deviceId);
  if (prev !== undefined && batch.seq > prev + 1) {
    const missed = batch.seq - prev - 1;
    /*
     * Recorded rather than merely logged. A track with holes in it looks like
     * a track without them once it is drawn as a line, so the gap has to be
     * written down at the moment it is noticed — otherwise the only evidence
     * that the aircraft was out of contact for four seconds is an absence,
     * and an absence is not evidence.
     */
    await recordFlightEvent(
      deviceId,
      ownerId,
      "telemetry-gap",
      { missedBatches: missed, from: prev, to: batch.seq },
      "warn"
    );
  }
  lastSeq.set(deviceId, batch.seq);

  const flight = await applyBatch(deviceId, ownerId, batch);
  if (!flight) return;

  bus.emit("drone:track", { deviceId, ownerId, flightId: flight.id, samples: batch.samples.length });
}

// ---------------------------------------------------------------------------
// State ingestion — arming, landing, failsafe, fence
// ---------------------------------------------------------------------------

interface Snapshot {
  armed: boolean;
  inAir: boolean;
  failsafe: boolean;
  fence: boolean;
  battPct: number;
  lowBattAlerted: boolean;
}
const snapshots = new Map<string, Snapshot>();

/**
 * Entry point from the MQTT state path.
 *
 * Only edges are acted on. Publishing at 1 Hz means a naive handler would send
 * a "failsafe active" push every second for the duration of a failsafe, and a
 * channel that does that gets muted before the next real alert arrives.
 */
export function handleDroneState(update: DeviceUpdate): void {
  if (update.kind !== "state") return;
  const st = update.payload as Record<string, unknown> | null;
  if (!st || typeof st !== "object") return;
  /*
   * A cheap shape check before the owner lookup.
   *
   * This listener sees every state message from every device on the platform,
   * so establishing "is this a drone" with a database query would add one
   * round trip per device per second across the whole fleet. `inAir` is
   * published by drone-link and by nothing else — `armed` would not do, since
   * the ANPR camera and the Sentinel both publish it.
   */
  if (!("inAir" in st)) return;
  void onState(update.deviceId, st).catch((err) =>
    logger.error({ err, deviceId: update.deviceId }, "drone state handling failed")
  );
}

async function onState(deviceId: string, st: Record<string, unknown>): Promise<void> {
  const ownerId = await ownerFor(deviceId);
  if (ownerId == null) return;

  const armed = st.armed === true;
  const inAir = st.inAir === true;
  const failsafe = st.failsafe === true;
  const fence = st.fence === true;
  const battPct = typeof st.battPct === "number" ? st.battPct : -1;

  const prev = snapshots.get(deviceId);
  const settings = await getSettings(ownerId);

  if (!prev) {
    snapshots.set(deviceId, { armed, inAir, failsafe, fence, battPct, lowBattAlerted: false });
    return;
  }

  const flight = armed || prev.armed ? await openFlight(deviceId) : null;

  if (inAir && !prev.inAir) {
    await recordFlightEvent(deviceId, ownerId, "takeoff", { alt: st.alt ?? 0 }, "info", flight?.id);
    await recordEvent(ownerId, "activity", "Aircraft airborne", `${deviceId} has taken off.`, deviceId);
  }

  /*
   * A clean disarm is the end of the flight, and it is closed here rather than
   * waiting for the track stream to fall silent. `ended_at` is now, because
   * unlike a stale flight we know exactly when it ended: the aircraft just
   * told us.
   */
  if (!armed && prev.armed) {
    const open = flight ?? (await openFlight(deviceId));
    if (open) await closeFlight(open, "landed", new Date());
    snapshots.set(deviceId, { armed, inAir: false, failsafe, fence, battPct, lowBattAlerted: false });
    await recordEvent(ownerId, "activity", "Aircraft landed", `${deviceId} has disarmed.`, deviceId);
    return;
  }

  if (armed && !prev.armed) {
    await recordFlightEvent(deviceId, ownerId, "armed", {}, "info", flight?.id);
  }

  if (failsafe && !prev.failsafe) {
    await recordFlightEvent(deviceId, ownerId, "failsafe", { mode: st.mode ?? null }, "alert", flight?.id);
    if (settings.alertFailsafe) {
      const body = `${deviceId} reported an autopilot failsafe${st.mode ? ` (${String(st.mode)})` : ""}.`;
      await recordEvent(ownerId, "security", "Drone failsafe", body, deviceId);
      await sendPushToHome(ownerId, { title: "Drone failsafe", body }, "adults");
    }
  }

  if (fence && !prev.fence) {
    await recordFlightEvent(
      deviceId,
      ownerId,
      "fence-breach",
      { alt: st.alt ?? null, dist: st.distHome ?? null },
      "alert",
      flight?.id
    );
    if (settings.alertFence) {
      const body = `${deviceId} left the configured flight area.`;
      await recordEvent(ownerId, "security", "Geofence breach", body, deviceId);
      await sendPushToHome(ownerId, { title: "Geofence breach", body }, "adults");
    }
  }

  /*
   * Low battery latches for the flight rather than re-firing.
   *
   * Battery percentage oscillates around a threshold under changing load — a
   * hover draws less than a climb — so an un-latched check sends a burst of
   * alerts every time the aircraft accelerates. The latch clears on disarm,
   * above, so the next flight gets a fresh warning.
   */
  const low = battPct >= 0 && battPct < settings.minBattPct;
  let lowAlerted = prev.lowBattAlerted;
  if (low && inAir && !prev.lowBattAlerted) {
    lowAlerted = true;
    await recordFlightEvent(deviceId, ownerId, "low-battery", { battPct }, "warn", flight?.id);
    if (settings.alertLowBatt) {
      const body = `${deviceId} is at ${battPct}% with the aircraft still airborne.`;
      await recordEvent(ownerId, "security", "Drone battery low", body, deviceId);
      await sendPushToHome(ownerId, { title: "Drone battery low", body }, "adults");
    }
  }

  snapshots.set(deviceId, { armed, inAir, failsafe, fence, battPct, lowBattAlerted: lowAlerted });
}

// ---------------------------------------------------------------------------
// Live view
// ---------------------------------------------------------------------------

export interface LiveAircraft {
  deviceId: string;
  name: string | null;
  online: boolean;
  state: Record<string, unknown>;
  flightId: string | null;
  warnings: string[];
}

/** Every aircraft on an account, with its live state and current flight. */
export async function liveAircraft(ownerId: number): Promise<LiveAircraft[]> {
  const { onlineColumn } = await import("../device-online");
  const { rows } = await pool.query<{
    id: string; name: string | null; online: boolean; state: Record<string, unknown> | null;
  }>(
    /*
     * Liveness is derived, never read raw. `devices.online` only returns to
     * false when the broker manages to publish a last will, so an aircraft
     * that lost power in a field — the exact case worth knowing about — would
     * otherwise read "online" forever, and this panel would show it as
     * reachable and armed next to a live-looking battery figure.
     *
     * Both airframes are listed: `drone-link` bridges somebody else's
     * autopilot, `drone-x1` is our own flight stack. They publish the same
     * state keys and the same track records, so everything downstream — the
     * log book, the safety gate, the daily report — treats them identically.
     */
    `SELECT id, name, ${onlineColumn()}, state FROM devices
      WHERE owner_id = $1 AND type IN ('drone-link','drone-x1')
      ORDER BY name NULLS LAST, id`,
    [ownerId]
  );
  if (!rows.length) return [];

  const { rows: open } = await pool.query<{ id: string; device_id: string }>(
    `SELECT id, device_id FROM flights WHERE owner_id = $1 AND outcome = 'open'`,
    [ownerId]
  );
  const byDevice = new Map(open.map((f) => [f.device_id, String(f.id)]));

  const { warningsFor, limitsFor } = await import("./safety");
  const limits = await limitsFor(ownerId);

  return rows.map((d) => ({
    deviceId: d.id,
    name: d.name,
    online: d.online,
    state: d.state ?? {},
    flightId: byDevice.get(d.id) ?? null,
    warnings: warningsFor(d.state as never, limits),
  }));
}

// ---------------------------------------------------------------------------
// Boot wiring
// ---------------------------------------------------------------------------

let staleTimer: NodeJS.Timeout | null = null;
let reportTimer: NodeJS.Timeout | null = null;

export function startDrone(): void {
  if (staleTimer) return;
  onOwnershipChange(invalidateDroneOwner);

  // Arming, landing, failsafe and fence all arrive on the state topic, so the
  // lifecycle listens there rather than inferring them from the track stream.
  bus.on("device:update", handleDroneState);

  /*
   * The stale sweep runs every 30 seconds against a partial index on open
   * flights, so it costs nothing when nothing is flying. It is frequent
   * because its output is a correction to something the console is currently
   * showing — an aircraft displayed as airborne that is not — and a correction
   * that arrives ten minutes late has already misled somebody.
   */
  staleTimer = setInterval(() => void sweepStaleFlights(), 30_000);
  staleTimer.unref?.();

  // Same ten-minute tick as the ANPR report, claimed per owner per IST day in
  // scheduler_ticks, so replicas and restarts cannot produce a second email.
  reportTimer = setInterval(() => void sweepDailyDroneReports(), 10 * 60 * 1000);
  reportTimer.unref?.();

  logger.info("drone pipeline started");
}

/** Test seam: drains timers and caches so a suite can exit cleanly. */
export function __resetDroneForTests(): void {
  if (config.NODE_ENV !== "test") throw new Error("test-only");
  ownerCache.clear();
  snapshots.clear();
  lastSeq.clear();
  bus.off("device:update", handleDroneState);
  if (staleTimer) { clearInterval(staleTimer); staleTimer = null; }
  if (reportTimer) { clearInterval(reportTimer); reportTimer = null; }
}
