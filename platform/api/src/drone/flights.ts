/**
 * Flight lifecycle — turning a stream of position samples into a log book.
 *
 * A flight starts when the aircraft arms and ends when it disarms. Both come
 * from the autopilot rather than from anything inferred here, and that is the
 * point: they are unambiguous, and they are the boundary a regulator, an
 * insurer and a pilot all already think in.
 *
 * THE ALTERNATIVE, AND WHY IT IS WRONG
 *
 * The obvious cheaper design is to store only positions and cut them into
 * flights wherever there is a gap. It fails on the case that matters. A radio
 * dropout behind a treeline in the middle of a long transect looks exactly
 * like a landing followed by a take-off, so the log book invents a flight that
 * never happened — and, worse, two consecutive real flights from the same spot
 * with a quick battery swap produce no gap at all and get merged into one.
 * Every derived number then inherits the error: duration, distance, cycle
 * count on the pack.
 *
 * MISSING DATA IS A STATE, NOT A GUESS
 *
 * The same principle the ANPR pairing engine settled on applies here. When an
 * aircraft stops reporting and never comes back, the flight is closed as
 * `stale`, never as `landed`. A flight that ends in silence is precisely the
 * one an investigator goes looking for, and a log book that quietly records it
 * as a normal landing has hidden the only record of it. `ended_at` for a stale
 * flight is the last sample we actually received, not the moment we noticed —
 * writing "now" would attribute minutes of flight time that may not have
 * happened.
 */

import { pool } from "../db";
import { logger } from "../logger";
import { haversineM, hasFix, type TrackBatch, type TrackSample } from "./track";

/**
 * How long an armed aircraft may go silent before its flight is closed as
 * stale.
 *
 * Three minutes, not thirty seconds. Telemetry drops behind a building or a
 * ridge routinely and comes back; closing a flight on the first gap would
 * shred a single sortie into a dozen log entries. Three minutes is longer than
 * any dropout that ends well and shorter than any useful investigation window.
 */
export const STALE_AFTER_MS = 3 * 60 * 1000;

export interface FlightRow {
  id: string;
  owner_id: number;
  device_id: string;
  boot_id: string;
  started_at: string;
  ended_at: string | null;
  took_off_at: string | null;
  landed_at: string | null;
  max_alt_m: number;
  max_dist_m: number;
  distance_m: number;
  max_speed_ms: number;
  batt_start_pct: number | null;
  batt_end_pct: number | null;
  batt_used_mah: number | null;
  home_lat: number | null;
  home_lon: number | null;
  samples: number;
  outcome: string;
  failsafe: boolean;
  fence_breach: boolean;
  notes: string | null;
}

/** In-memory tail of each open flight, so distance can accumulate. */
interface Cursor {
  flightId: string;
  lastLat: number | null;
  lastLon: number | null;
  lastSeq: number;
  bootId: number;
}
const cursors = new Map<string, Cursor>();

/** Forget cached flight cursors for a device (ownership change, tests). */
export function forgetDevice(deviceId: string): void {
  cursors.delete(deviceId);
}

export function __resetCursorsForTests(): void {
  cursors.clear();
}

/** Records a discrete flight event. Best-effort: never blocks ingestion. */
export async function recordFlightEvent(
  deviceId: string,
  ownerId: number | null,
  kind: string,
  detail: Record<string, unknown> = {},
  severity: "info" | "warn" | "alert" = "info",
  flightId?: string | null
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO flight_events (flight_id, device_id, owner_id, kind, detail, severity)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [flightId ?? null, deviceId, ownerId, kind, JSON.stringify(detail), severity]
    );
  } catch (err) {
    logger.error({ err, deviceId, kind }, "flight event insert failed");
  }
}

/** The open flight for a device, if any. */
export async function openFlight(deviceId: string): Promise<FlightRow | null> {
  const { rows } = await pool.query<FlightRow>(
    `SELECT * FROM flights WHERE device_id = $1 AND outcome = 'open'
     ORDER BY started_at DESC LIMIT 1`,
    [deviceId]
  );
  return rows[0] ?? null;
}

/**
 * Starts a flight, or returns the one already open.
 *
 * A different `bootId` closes whatever was open first. The companion computer
 * rebooting mid-flight is the one case where the previous flight genuinely
 * cannot be continued — the millisecond clock the samples are stamped with has
 * restarted, so appending to the old flight would write samples that appear to
 * travel backwards in time.
 */
export async function beginFlight(
  deviceId: string,
  ownerId: number,
  bootId: number,
  first?: TrackSample
): Promise<FlightRow | null> {
  const existing = await openFlight(deviceId);
  if (existing) {
    if (Number(existing.boot_id) === bootId) return existing;
    await closeFlight(existing, "stale", null);
    cursors.delete(deviceId);
  }

  const home = first && hasFix(first) ? first : null;
  try {
    const { rows } = await pool.query<FlightRow>(
      `INSERT INTO flights (owner_id, device_id, boot_id, batt_start_pct, home_lat, home_lon)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [ownerId, deviceId, bootId, first?.battPct ?? null, home?.lat ?? null, home?.lon ?? null]
    );
    const row = rows[0];
    if (!row) return null;
    cursors.set(deviceId, {
      flightId: row.id,
      lastLat: home?.lat ?? null,
      lastLon: home?.lon ?? null,
      lastSeq: -1,
      bootId,
    });
    await recordFlightEvent(deviceId, ownerId, "armed", { bootId }, "info", row.id);
    return row;
  } catch (err) {
    logger.error({ err, deviceId }, "flight insert failed");
    return null;
  }
}

/**
 * Closes a flight.
 *
 * `endedAt` is passed in rather than defaulted to now() because the two callers
 * mean different things by "when": a clean disarm ends now, a stale flight
 * ended whenever we last heard from it. Defaulting would silently give a lost
 * aircraft credit for the flight time it spent missing.
 */
export async function closeFlight(
  flight: FlightRow,
  outcome: "landed" | "stale" | "aborted",
  endedAt: Date | null
): Promise<void> {
  const at = endedAt ?? new Date();
  try {
    await pool.query(
      `UPDATE flights
          SET outcome = $2, ended_at = $3, landed_at = COALESCE(landed_at, $3), updated_at = now()
        WHERE id = $1 AND outcome = 'open'`,
      [flight.id, outcome, at.toISOString()]
    );
    cursors.delete(flight.device_id);
    await recordFlightEvent(
      flight.device_id,
      flight.owner_id,
      outcome === "landed" ? "landed" : "flight-" + outcome,
      { outcome },
      outcome === "stale" ? "alert" : "info",
      flight.id
    );
    if (outcome === "landed") await creditBatteryCycle(flight);
  } catch (err) {
    logger.error({ err, flightId: flight.id }, "flight close failed");
  }
}

/**
 * Counts one cycle against the pack a flight was flown on.
 *
 * Only on a real landing, and only when a pack was actually assigned. A stale
 * flight has an unknown ending — the aircraft may have landed on its own or
 * may be in a field — and inventing a cycle for it would slowly inflate the
 * count that a retirement decision is made from.
 */
async function creditBatteryCycle(flight: FlightRow): Promise<void> {
  const batteryId = (flight as unknown as { battery_id?: string | null }).battery_id;
  if (!batteryId) return;
  try {
    await pool.query(
      `UPDATE drone_batteries
          SET cycles = cycles + 1,
              first_used = COALESCE(first_used, now()),
              last_used = now()
        WHERE id = $1`,
      [batteryId]
    );
  } catch (err) {
    logger.error({ err, batteryId }, "battery cycle credit failed");
  }
}

/**
 * Applies one decoded batch to the log.
 *
 * Returns the flight it landed in, or null when the batch carried nothing
 * worth recording.
 */
export async function applyBatch(
  deviceId: string,
  ownerId: number,
  batch: TrackBatch
): Promise<FlightRow | null> {
  if (!batch.samples.length) return null;

  const armedInBatch = batch.armed || batch.samples.some((s) => s.armed);
  let flight = await openFlight(deviceId);

  if (!flight) {
    if (!armedInBatch) return null;      // disarmed chatter — nothing to log
    flight = await beginFlight(deviceId, ownerId, batch.bootId, batch.samples[0]);
    if (!flight) return null;
  } else if (Number(flight.boot_id) !== batch.bootId) {
    await closeFlight(flight, "stale", null);
    flight = await beginFlight(deviceId, ownerId, batch.bootId, batch.samples[0]);
    if (!flight) return null;
  }

  let cursor = cursors.get(deviceId);
  if (!cursor || cursor.flightId !== flight.id) {
    cursor = {
      flightId: flight.id,
      lastLat: flight.home_lat,
      lastLon: flight.home_lon,
      lastSeq: -1,
      bootId: batch.bootId,
    };
    cursors.set(deviceId, cursor);
  }

  /*
   * Batches arriving out of order or twice are both possible on a lossy link.
   * Re-applying one would double-count distance and inflate the sample count,
   * so a batch that is not newer than the last one seen is dropped whole.
   */
  if (batch.seq <= cursor.lastSeq && cursor.lastSeq !== -1) return flight;
  cursor.lastSeq = batch.seq;

  const now = Date.now();
  const lastMs = batch.samples[batch.samples.length - 1]!.ms;

  let maxAlt = flight.max_alt_m;
  let maxDist = flight.max_dist_m;
  let maxSpeed = flight.max_speed_ms;
  let added = 0;
  let distance = 0;
  let failsafe = flight.failsafe;
  let fence = flight.fence_breach;
  let tookOff: Date | null = null;
  let lastPct: number | null = null;

  const values: unknown[] = [];
  const tuples: string[] = [];

  for (const s of batch.samples) {
    if (!hasFix(s)) continue;

    // Wall-clock time for a sample is derived from its position in the batch,
    // because the device only knows milliseconds since it booted and its clock
    // may never have been set.
    const at = new Date(now - (lastMs - s.ms));

    if (s.alt > maxAlt) maxAlt = s.alt;
    if (s.distHomeM > maxDist) maxDist = s.distHomeM;
    if (s.speedMs > maxSpeed) maxSpeed = s.speedMs;
    if (s.failsafe) failsafe = true;
    if (s.fenceBreach) fence = true;
    if (s.inAir && !flight.took_off_at && !tookOff) tookOff = at;
    if (s.battPct !== null) lastPct = s.battPct;

    if (cursor.lastLat !== null && cursor.lastLon !== null) {
      const step = haversineM(cursor.lastLat, cursor.lastLon, s.lat, s.lon);
      /*
       * A single GPS glitch can jump hundreds of metres between consecutive
       * samples. At 10 Hz nothing this platform carries covers more than a few
       * metres per sample, so a step beyond 200 m is a bad fix rather than
       * movement, and adding it would permanently corrupt the flight's
       * distance. The position is still recorded; only the distance credit is
       * withheld.
       */
      if (step < 200) distance += step;
    }
    cursor.lastLat = s.lat;
    cursor.lastLon = s.lon;

    const base = values.length;
    tuples.push(
      `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},` +
        `$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},` +
        `$${base + 13},$${base + 14},$${base + 15},$${base + 16},$${base + 17},$${base + 18})`
    );
    values.push(
      flight.id,
      at.toISOString(),
      s.lat,
      s.lon,
      s.alt,
      s.altMsl,
      s.headingDeg,
      s.speedMs,
      s.climbMs,
      s.battV,
      s.battPct,
      s.sats,
      s.hdop,
      s.mode,
      s.rollDeg,
      s.pitchDeg,
      s.distHomeM,
      (s.armed ? 1 : 0) | (s.inAir ? 2 : 0) | (s.failsafe ? 4 : 0) | (s.fenceBreach ? 8 : 0)
    );
    added++;
  }

  if (!added) return flight;

  try {
    // One multi-row INSERT rather than a statement per sample: at 10 Hz across
    // a fleet the round-trip cost dominates everything else in this path.
    await pool.query(
      `INSERT INTO flight_track
         (flight_id, at, lat, lon, alt_m, alt_msl_m, heading_deg, speed_ms, climb_ms,
          batt_v, batt_pct, sats, hdop, mode, roll_deg, pitch_deg, dist_home_m, flags)
       VALUES ${tuples.join(",")}`,
      values
    );
  } catch (err) {
    logger.error({ err, deviceId }, "track insert failed");
    return flight;
  }

  try {
    const { rows } = await pool.query<FlightRow>(
      `UPDATE flights
          SET max_alt_m = $2, max_dist_m = $3, max_speed_ms = $4,
              distance_m = distance_m + $5, samples = samples + $6,
              failsafe = $7, fence_breach = $8,
              took_off_at = COALESCE(took_off_at, $9),
              batt_end_pct = COALESCE($10, batt_end_pct),
              batt_start_pct = COALESCE(batt_start_pct, $10),
              updated_at = now()
        WHERE id = $1 RETURNING *`,
      [
        flight.id,
        maxAlt,
        maxDist,
        maxSpeed,
        distance,
        added,
        failsafe,
        fence,
        tookOff ? tookOff.toISOString() : null,
        lastPct,
      ]
    );
    if (rows[0]) flight = rows[0];
  } catch (err) {
    logger.error({ err, flightId: flight.id }, "flight summary update failed");
  }

  // A batch whose samples all say disarmed, on a flight that was open, is the
  // landing. The state topic normally gets here first; this is the backstop for
  // when it does not.
  if (!armedInBatch && flight.outcome === "open") {
    await closeFlight(flight, "landed", new Date());
  }

  return flight;
}

/**
 * Closes flights whose aircraft stopped reporting.
 *
 * Run on a timer. Deliberately does not touch flights that are merely long —
 * an endurance airframe can legitimately stay up for hours, and a sweep that
 * closed flights on duration would cut exactly the flights worth recording.
 */
export async function sweepStaleFlights(): Promise<number> {
  try {
    const { rows } = await pool.query<FlightRow>(
      `SELECT * FROM flights WHERE outcome = 'open' AND updated_at < now() - ($1 || ' milliseconds')::interval`,
      [String(STALE_AFTER_MS)]
    );
    for (const f of rows) {
      // Ended when we last heard from it, not when we noticed.
      const { rows: last } = await pool.query<{ at: string }>(
        `SELECT at FROM flight_track WHERE flight_id = $1 ORDER BY at DESC LIMIT 1`,
        [f.id]
      );
      const endedAt = last[0]?.at ? new Date(last[0].at) : new Date(f.started_at);
      await closeFlight(f, "stale", endedAt);
    }
    return rows.length;
  } catch (err) {
    logger.error({ err }, "stale flight sweep failed");
    return 0;
  }
}

export interface FlightSummary {
  id: string;
  deviceId: string;
  startedAt: string;
  endedAt: string | null;
  tookOffAt: string | null;
  durationSec: number | null;
  airborneSec: number | null;
  maxAltM: number;
  maxDistM: number;
  distanceM: number;
  maxSpeedMs: number;
  battStartPct: number | null;
  battEndPct: number | null;
  outcome: string;
  failsafe: boolean;
  fenceBreach: boolean;
  samples: number;
  notes: string | null;
}

function seconds(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return ms >= 0 ? Math.round(ms / 1000) : null;
}

export function toSummary(f: FlightRow): FlightSummary {
  return {
    id: String(f.id),
    deviceId: f.device_id,
    startedAt: f.started_at,
    endedAt: f.ended_at,
    tookOffAt: f.took_off_at,
    durationSec: seconds(f.started_at, f.ended_at),
    /*
     * Airborne time is null, not zero, when the aircraft armed and never left
     * the ground. Zero would be a claim that it flew for no time; null is the
     * truth, which is that there was no flight to measure.
     */
    airborneSec: seconds(f.took_off_at, f.landed_at ?? f.ended_at),
    maxAltM: Number(f.max_alt_m) || 0,
    maxDistM: Number(f.max_dist_m) || 0,
    distanceM: Number(f.distance_m) || 0,
    maxSpeedMs: Number(f.max_speed_ms) || 0,
    battStartPct: f.batt_start_pct,
    battEndPct: f.batt_end_pct,
    outcome: f.outcome,
    failsafe: f.failsafe,
    fenceBreach: f.fence_breach,
    samples: Number(f.samples) || 0,
    notes: f.notes,
  };
}

/** Flights for an owner, newest first. */
export async function listFlights(
  ownerId: number,
  opts: { deviceId?: string; limit?: number; since?: string } = {}
): Promise<FlightSummary[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const params: unknown[] = [ownerId];
  let where = `owner_id = $1`;
  if (opts.deviceId) { params.push(opts.deviceId); where += ` AND device_id = $${params.length}`; }
  if (opts.since) { params.push(opts.since); where += ` AND started_at >= $${params.length}`; }
  params.push(limit);
  const { rows } = await pool.query<FlightRow>(
    `SELECT * FROM flights WHERE ${where} ORDER BY started_at DESC LIMIT $${params.length}`,
    params
  );
  return rows.map(toSummary);
}

export interface TrackPoint {
  at: string;
  lat: number;
  lon: number;
  alt: number;
  speed: number | null;
  batt: number | null;
  mode: string | null;
}

/**
 * The track for one flight.
 *
 * `step` thins the result rather than truncating it. A twenty-minute flight at
 * 10 Hz is 12,000 points; a map cannot draw that usefully and a phone should
 * not download it. Truncating to the first N points would draw the beginning of
 * the flight and silently omit the end — which is the half that matters after
 * an incident — so this samples evenly across the whole flight instead.
 */
export async function flightTrack(
  ownerId: number,
  flightId: string,
  maxPoints = 2000
): Promise<TrackPoint[]> {
  const { rows: own } = await pool.query(
    `SELECT 1 FROM flights WHERE id = $1 AND owner_id = $2`,
    [flightId, ownerId]
  );
  if (!own.length) return [];

  const { rows: cnt } = await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM flight_track WHERE flight_id = $1`,
    [flightId]
  );
  const total = Number(cnt[0]?.n ?? 0);
  const step = total > maxPoints ? Math.ceil(total / maxPoints) : 1;

  const { rows } = await pool.query<{
    at: string; lat: number; lon: number; alt_m: number;
    speed_ms: number | null; batt_pct: number | null; mode: string | null; rn: string;
  }>(
    `SELECT at, lat, lon, alt_m, speed_ms, batt_pct, mode FROM (
       SELECT *, row_number() OVER (ORDER BY at) AS rn
         FROM flight_track WHERE flight_id = $1
     ) t WHERE (rn - 1) % $2 = 0 ORDER BY at`,
    [flightId, step]
  );

  return rows.map((r) => ({
    at: r.at,
    lat: Number(r.lat),
    lon: Number(r.lon),
    alt: Number(r.alt_m),
    speed: r.speed_ms === null ? null : Number(r.speed_ms),
    batt: r.batt_pct === null ? null : Number(r.batt_pct),
    mode: r.mode,
  }));
}
