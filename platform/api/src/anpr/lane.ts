import { pool } from "../db";
import { logger } from "../logger";
import { bus, frameTaps, publishCommand, type DeviceFrame, type DeviceUpdate } from "../mqtt";
import { onOwnershipChange } from "../ownership";
import { flushCapture, ingestFrame } from "./index";
import type { TriggerReasonName } from "./protocol";
import type { LaneDirection } from "./visits";

/**
 * ANPR on a camera that is not an ANPR camera.
 *
 * WHY THIS EXISTS
 *
 * `anpr-cam` firmware watches a lane, decides a vehicle is worth photographing,
 * takes a burst of sharp frames and publishes them on `cv/<id>/anpr` with a
 * header that groups them. Everything in `anpr/index.ts` is written against
 * that.
 *
 * An ordinary `camera` — the one already screwed to the wall — cannot do any of
 * it. It has no notion of a lane, a burst or a capture id. What it does have,
 * in firmware that shipped long before ANPR did, is exactly the two primitives
 * the job needs:
 *
 *   - it detects motion by frame differencing and publishes
 *     `{"type":"motion","source":"image"|"pir"}` on telemetry, and
 *   - it answers `{"action":"snapshot"}` by publishing one still on
 *     `cv/<id>/frame`.
 *
 * So the missing piece is not hardware. It is the decision of *when*, the
 * grouping of frames into a burst, and the lane's direction — all of which can
 * live on the server. That is what this file is: the `anpr-cam` trigger state
 * machine, running in the control plane, driving a camera by command.
 *
 * The difference this makes is the difference between "ANPR works if you buy
 * the ANPR camera" and "ANPR works on the camera you already own".
 *
 * WHERE THE SEAM IS
 *
 *   telemetry {type:"motion"} ──▶ [cooldown] ──▶ N x {"action":"snapshot"}
 *                                                        │
 *   cv/<id>/frame ──▶ bus device:frame ──▶ [collect] ─────┘
 *                                              │
 *                                              ▼
 *                                     anpr/index.ts ingestFrame()
 *
 * Nothing downstream knows the difference. The read, the vote, the allow list,
 * the visit, the occupancy count, the automation and the daily report are the
 * same code paths an `anpr-cam` drives — which is the point. A plate read from
 * a camera and a plate read from an ANPR camera must be the same kind of thing.
 *
 * WHAT IS HONESTLY WORSE ABOUT IT
 *
 * Stated here rather than discovered on a gate. The ANPR camera decides in
 * firmware, microseconds after the motion it saw, and its region of interest
 * excludes the trees. This path adds a broker round trip and the camera's own
 * `MOTION_COOLDOWN_MS`, so the first frame lands a beat later — fine for a
 * vehicle stopping at a barrier, marginal for one driving through at speed.
 * The camera's motion detector is whole-frame, so a footpath or a swaying
 * branch triggers a burst that an ROI would have ignored. And an ordinary
 * camera meters for the whole scene, so a retro-reflective plate at night
 * clips to white where `anpr-cam` deliberately meters down for it.
 *
 * The console says all of this where somebody is choosing between the two.
 */

export type LaneSource = "motion" | "manual";

export interface Lane {
  deviceId: string;
  ownerId: number;
  enabled: boolean;
  direction: LaneDirection;
  burst: number;
  burstGapMs: number;
  cooldownMs: number;
  illuminate: number;
  triggers: number;
  lastTriggerAt: string | null;
}

interface LaneRow {
  device_id: string;
  owner_id: string;
  enabled: boolean;
  direction: string;
  burst: number;
  burst_gap_ms: number;
  cooldown_ms: number;
  illuminate: number;
  triggers: string;
  last_trigger_at: Date | null;
}

/**
 * Bounds, and the reasoning for each.
 *
 * A lane is user-configurable, and every one of these numbers is something a
 * slider could otherwise be dragged to a value that costs money or breaks the
 * camera.
 */
const LIMITS = {
  /** Frames per burst. Above 8 the marginal frame is another photograph of a
   *  stationary car, and every frame past the third is a paid OCR call. */
  burst: { min: 1, max: 8, def: 3 },
  /** Gap between snapshot requests. Below ~150 ms an ESP32-CAM is still
   *  reading out the previous frame and simply drops the request. */
  burstGapMs: { min: 150, max: 3000, def: 400 },
  /** Minimum gap between triggers. Zero would let one vehicle idling in frame
   *  bill a recogniser call per motion event, forever. */
  cooldownMs: { min: 1000, max: 600_000, def: 8000 },
  /** Illuminator level for the burst. */
  illuminate: { min: 0, max: 100, def: 0 },
} as const;

const clamp = (v: number, b: { min: number; max: number; def: number }): number =>
  Number.isFinite(v) ? Math.min(Math.max(Math.round(v), b.min), b.max) : b.def;

function laneShape(r: LaneRow): Lane {
  const d = r.direction === "in" || r.direction === "out" ? r.direction : "both";
  return {
    deviceId: r.device_id,
    ownerId: Number(r.owner_id),
    enabled: r.enabled,
    direction: d,
    burst: r.burst,
    burstGapMs: r.burst_gap_ms,
    cooldownMs: r.cooldown_ms,
    illuminate: r.illuminate,
    triggers: Number(r.triggers),
    lastTriggerAt: r.last_trigger_at ? r.last_trigger_at.toISOString() : null,
  };
}

const LANE_COLUMNS = `device_id, owner_id, enabled, direction, burst, burst_gap_ms,
                      cooldown_ms, illuminate, triggers, last_trigger_at`;

/* ------------------------------------------------------------------ */
/* The cache                                                           */
/* ------------------------------------------------------------------ */

/**
 * Every enabled lane, in memory.
 *
 * A motion event arrives on the hot path and must be answered in the couple of
 * hundred milliseconds a vehicle is still in frame. A SELECT per event would
 * put Postgres in that path for every twitch of every camera in the fleet, to
 * answer a question whose answer changes when somebody edits a setting. So the
 * table is loaded once and the cache is invalidated by the writes, which are
 * rare and all in this file.
 */
const lanes = new Map<string, Lane>();
let loaded = false;

async function loadLanes(): Promise<void> {
  try {
    const { rows } = await pool.query<LaneRow>(
      `SELECT ${LANE_COLUMNS} FROM anpr_lanes WHERE enabled`
    );
    lanes.clear();
    /*
     * Filtered here as well as in the statement, so this agrees with
     * `refreshLane` — which checks the flag on the row it read back rather
     * than trusting a WHERE clause. Two loaders that disagree about what
     * "enabled" means is how a lane ends up in the map after being switched
     * off, and `isLane()` then routes a manual capture down the lane path for
     * a camera that is not being driven.
     */
    for (const r of rows) {
      if (r.enabled) lanes.set(r.device_id, laneShape(r));
    }
    loaded = true;
    if (lanes.size) logger.info({ lanes: lanes.size }, "ANPR camera lanes loaded");
  } catch (err) {
    // Not fatal, and deliberately not retried in a tight loop: the table may
    // not exist yet on a control plane booting against an older database, and
    // the next write reloads it anyway.
    logger.error({ err }, "anpr lane load failed");
  }
}

/**
 * Reloads every lane from the database.
 *
 * Called at boot, and exported because a control plane that has had rows
 * changed underneath it — a restore, a manual fix, a second replica writing —
 * otherwise keeps driving cameras from a cache nobody can clear without a
 * restart.
 */
export async function reloadLanes(): Promise<void> {
  return loadLanes();
}

/** Re-reads one lane after a write. Cheaper and safer than reloading the table. */
async function refreshLane(deviceId: string): Promise<void> {
  try {
    const { rows } = await pool.query<LaneRow>(
      `SELECT ${LANE_COLUMNS} FROM anpr_lanes WHERE device_id = $1`,
      [deviceId]
    );
    const row = rows[0];
    if (row && row.enabled) lanes.set(deviceId, laneShape(row));
    else lanes.delete(deviceId);
  } catch (err) {
    logger.error({ err, deviceId }, "anpr lane refresh failed");
  }
}

/* ------------------------------------------------------------------ */
/* The active burst                                                    */
/* ------------------------------------------------------------------ */

interface ActiveCapture {
  captureId: number;
  ownerId: number;
  frames: number;
  want: number;
  /** What started it, carried onto the stored read's `trigger` column. */
  reason: TriggerReasonName;
  /**
   * Frames handed to the pipeline that may not have landed in it yet.
   *
   * `ingestFrame` is asynchronous — the pipeline resolves the device's owner
   * before buffering anything — so the burst must not be flushed until these
   * have settled. See the note on `flushCapture`.
   */
  ingests: Promise<void>[];
  timers: NodeJS.Timeout[];
  illuminated: boolean;
}

const active = new Map<string, ActiveCapture>();
const lastTrigger = new Map<string, number>();

/**
 * Concurrent bursts across the whole fleet.
 *
 * Each one holds a frame tap open and is publishing snapshot commands, and the
 * recogniser behind them is already bounded at `MAX_INFLIGHT` of 2. A ceiling
 * here stops a storm — a thunderstorm at dusk moving every camera in a housing
 * estate at once — from queueing hundreds of bursts the VM will process long
 * after the vehicles have gone.
 */
const MAX_ACTIVE = 8;

/**
 * How long a capture stays open after the last snapshot was asked for.
 *
 * A snapshot is a request-response across a broker to a device that may be
 * mid-readout, so the frame does not come back instantly. Two seconds is
 * comfortably longer than an ESP32-CAM takes to answer at SVGA and still
 * shorter than `BURST_WINDOW_MS` in the pipeline, so the capture is flushed
 * deliberately rather than timing out.
 */
const FRAME_GRACE_MS = 2000;

/** Frames accepted per capture. Bounds a camera that is also live-streaming. */
const MAX_FRAMES_PER_CAPTURE = 8;

let captureSeq = Math.floor(Date.now() / 1000);

function endCapture(deviceId: string): void {
  const cap = active.get(deviceId);
  if (!cap) return;
  for (const t of cap.timers) clearTimeout(t);
  active.delete(deviceId);
  frameTaps.delete(deviceId);
  if (cap.illuminated) {
    // Always turned off, on every exit path. A flash LED left on is a nuisance
    // in a hallway and the fastest way to cook an ESP32-CAM.
    try {
      publishCommand(deviceId, { action: "flash", level: 0 });
    } catch {
      /* the broker is down; the device expires the level itself on reboot */
    }
  }

  /*
   * Flushed only once every frame already handed over has actually landed.
   *
   * `ingestFrame` is asynchronous: the pipeline resolves the device's owner
   * before it buffers a byte, so a frame passed in on the line above is not in
   * the collector yet. Flushing synchronously closed the burst on whichever
   * frames had won that race, and the stragglers then arrived to find no burst
   * and opened a second one — which timed out four seconds later as a second
   * read. Every capture produced two rows: one vehicle, two arrivals, and an
   * in/out ledger that immediately disagreed with itself.
   *
   * `allSettled`, not `all`: a frame the pipeline rejected must not stop the
   * rest of the burst being processed.
   */
  void Promise.allSettled(cap.ingests).then(() => flushCapture(deviceId, cap.captureId));
}

/**
 * Asks a camera for a burst.
 *
 * Returns the capture id, or null when the lane refused — disabled, unknown,
 * inside its cooldown, or the fleet is already at its ceiling. Null is an
 * ordinary answer, not an error: a cooldown doing its job is the common case.
 */
export function triggerLane(deviceId: string, source: LaneSource): number | null {
  const lane = lanes.get(deviceId);
  if (!lane || !lane.enabled) return null;

  // Already collecting. A second trigger during a burst is the same vehicle;
  // extending the burst would blur two arrivals into one read.
  if (active.has(deviceId)) return null;

  const now = Date.now();
  /*
   * The cooldown applies to motion, never to a person pressing the button.
   *
   * "Capture now" that silently does nothing for the next eight seconds is a
   * control that appears broken, and the operator pressing it is usually
   * standing at the barrier looking at the vehicle the camera just missed.
   */
  if (source === "motion") {
    const prev = lastTrigger.get(deviceId) ?? 0;
    if (now - prev < lane.cooldownMs) return null;
  }

  if (active.size >= MAX_ACTIVE) {
    logger.warn({ deviceId }, "anpr lane trigger dropped — too many bursts in flight");
    return null;
  }

  lastTrigger.set(deviceId, now);
  const captureId = ++captureSeq;

  const cap: ActiveCapture = {
    captureId,
    ownerId: lane.ownerId,
    frames: 0,
    want: lane.burst,
    // Recorded honestly. A read the installer produced by pressing a button and
    // one a vehicle produced by arriving are different events, and a log that
    // calls them both "motion" makes a test capture indistinguishable from a
    // car in the report and in the timeline.
    reason: source === "manual" ? "manual" : "motion",
    ingests: [],
    timers: [],
    illuminated: lane.illuminate > 0,
  };
  active.set(deviceId, cap);
  // Opened before the first command, so the frame cannot beat the tap.
  frameTaps.add(deviceId);

  try {
    if (cap.illuminated) publishCommand(deviceId, { action: "flash", level: lane.illuminate });

    for (let i = 0; i < lane.burst; i++) {
      if (i === 0) {
        publishCommand(deviceId, { action: "snapshot" });
        continue;
      }
      const t = setTimeout(() => {
        // The capture may have been ended by a claim change or a shutdown
        // between scheduling and firing.
        if (active.get(deviceId)?.captureId !== captureId) return;
        try {
          publishCommand(deviceId, { action: "snapshot" });
        } catch (err) {
          logger.error({ err, deviceId }, "anpr lane snapshot publish failed");
        }
      }, i * lane.burstGapMs);
      t.unref?.();
      cap.timers.push(t);
    }

    const done = setTimeout(
      () => {
        if (active.get(deviceId)?.captureId === captureId) endCapture(deviceId);
      },
      (lane.burst - 1) * lane.burstGapMs + FRAME_GRACE_MS
    );
    done.unref?.();
    cap.timers.push(done);
  } catch (err) {
    // The broker refused. Tear down rather than leaving a tap open and a lane
    // that believes it is mid-burst forever.
    logger.error({ err, deviceId }, "anpr lane trigger failed");
    endCapture(deviceId);
    return null;
  }

  void pool
    .query(
      `UPDATE anpr_lanes SET triggers = triggers + 1, last_trigger_at = now() WHERE device_id = $1`,
      [deviceId]
    )
    .catch((err) => logger.error({ err, deviceId }, "anpr lane counter update failed"));

  logger.debug({ deviceId, captureId, source, burst: lane.burst }, "anpr lane triggered");
  return captureId;
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function onFrame(f: DeviceFrame): void {
  const cap = active.get(f.deviceId);
  if (!cap) return;
  if (cap.frames >= MAX_FRAMES_PER_CAPTURE) return;
  cap.frames++;

  cap.ingests.push(
    ingestFrame(f.deviceId, f.data, {
      captureId: cap.captureId,
      /*
       * The burst size declared to the collector is the number of frames asked
       * for, so it closes as soon as they have all arrived rather than waiting
       * out its window. It is floored at what has actually turned up, because a
       * camera that is *also* live-streaming will deliver more frames than were
       * requested and a declared burst smaller than the frames received would
       * close the collector early and throw the rest away.
       */
      burst: Math.max(cap.want, cap.frames),
      reason: cap.reason,
    })
  );

  if (cap.frames >= cap.want) {
    // Every frame asked for is in. Nothing is gained by holding the tap open
    // for the grace period, and a lane that finishes promptly is a lane that
    // can trigger again for the next vehicle.
    endCapture(f.deviceId);
  }
}

function onUpdate(u: DeviceUpdate): void {
  if (u.kind !== "telemetry") return;
  if (!lanes.has(u.deviceId)) return;
  const p = u.payload as { type?: unknown } | null;
  if (!p || typeof p !== "object" || p.type !== "motion") return;
  triggerLane(u.deviceId, "motion");
}

let started = false;

/**
 * Wires the camera lanes. Call once at boot, after the MQTT bridge.
 *
 * Idempotent, because `startAnpr` and the test seam both reach it.
 */
export function startCameraLanes(): void {
  if (started) return;
  started = true;

  void loadLanes();
  bus.on("device:update", onUpdate);
  bus.on("device:frame", onFrame);

  /*
   * A camera that changes hands stops being a lane immediately.
   *
   * The row would go with the device on a delete, but a *transfer* keeps the
   * row and changes `devices.owner_id` — and a lane still holding the previous
   * owner's id would file the new owner's plate reads into the old owner's
   * log. Dropping the lane is the safe direction: the new owner turns ANPR on
   * again if they want it, rather than inheriting a camera that is quietly
   * photographing their driveway for somebody else.
   */
  onOwnershipChange((deviceId) => {
    if (!lanes.has(deviceId)) return;
    void pool
      .query(`DELETE FROM anpr_lanes WHERE device_id = $1`, [deviceId])
      .catch((err) => logger.error({ err, deviceId }, "anpr lane cleanup failed"));
    lanes.delete(deviceId);
    endCapture(deviceId);
  });
}

/* ------------------------------------------------------------------ */
/* The API surface                                                     */
/* ------------------------------------------------------------------ */

export async function listLanes(ownerId: number): Promise<Lane[]> {
  const { rows } = await pool.query<LaneRow>(
    `SELECT ${LANE_COLUMNS} FROM anpr_lanes WHERE owner_id = $1 ORDER BY device_id`,
    [ownerId]
  );
  return rows.map(laneShape);
}

export async function getLane(ownerId: number, deviceId: string): Promise<Lane | null> {
  const { rows } = await pool.query<LaneRow>(
    `SELECT ${LANE_COLUMNS} FROM anpr_lanes WHERE device_id = $1 AND owner_id = $2`,
    [deviceId, ownerId]
  );
  return rows[0] ? laneShape(rows[0]) : null;
}

export interface LanePatch {
  enabled?: boolean;
  direction?: string;
  burst?: number;
  burstGapMs?: number;
  cooldownMs?: number;
  illuminate?: number;
}

/**
 * Creates or updates a lane.
 *
 * The owner is taken from the `devices` row inside the statement rather than
 * from the session, so a caller cannot enrol somebody else's camera by naming
 * it: the INSERT selects nothing when the device is not theirs, and the route
 * turns that into a 404. Writing the session's id here instead would create a
 * lane pointing at a device the account does not own, and that lane would then
 * drive snapshots on a stranger's camera.
 */
export async function saveLane(
  ownerId: number,
  deviceId: string,
  patch: LanePatch
): Promise<Lane | null> {
  const direction =
    patch.direction === "in" || patch.direction === "out" || patch.direction === "both"
      ? patch.direction
      : null;

  const { rows } = await pool.query<LaneRow>(
    `INSERT INTO anpr_lanes (device_id, owner_id, enabled, direction, burst,
                             burst_gap_ms, cooldown_ms, illuminate)
     SELECT d.id, d.owner_id,
            COALESCE($3::boolean, true),
            COALESCE($4::text, 'both'),
            COALESCE($5::int, ${LIMITS.burst.def}),
            COALESCE($6::int, ${LIMITS.burstGapMs.def}),
            COALESCE($7::int, ${LIMITS.cooldownMs.def}),
            COALESCE($8::int, ${LIMITS.illuminate.def})
       FROM devices d
      WHERE d.id = $1 AND d.owner_id = $2
     ON CONFLICT (device_id) DO UPDATE SET
       enabled      = COALESCE($3::boolean, anpr_lanes.enabled),
       direction    = COALESCE($4::text,    anpr_lanes.direction),
       burst        = COALESCE($5::int,     anpr_lanes.burst),
       burst_gap_ms = COALESCE($6::int,     anpr_lanes.burst_gap_ms),
       cooldown_ms  = COALESCE($7::int,     anpr_lanes.cooldown_ms),
       illuminate   = COALESCE($8::int,     anpr_lanes.illuminate),
       updated_at   = now()
     RETURNING ${LANE_COLUMNS}`,
    [
      deviceId,
      ownerId,
      patch.enabled ?? null,
      direction,
      patch.burst === undefined ? null : clamp(patch.burst, LIMITS.burst),
      patch.burstGapMs === undefined ? null : clamp(patch.burstGapMs, LIMITS.burstGapMs),
      patch.cooldownMs === undefined ? null : clamp(patch.cooldownMs, LIMITS.cooldownMs),
      patch.illuminate === undefined ? null : clamp(patch.illuminate, LIMITS.illuminate),
    ]
  );

  const row = rows[0];
  if (!row) return null;

  await refreshLane(deviceId);
  /*
   * The pipeline caches a device's lane direction for 30 seconds. Without
   * dropping it here, a lane switched from "both" to "in" keeps filing reads
   * against the old direction for half a minute after the console has
   * confirmed the change — which reads as the setting not having taken.
   */
  invalidateLaneCache(deviceId);
  // A disabled lane must stop mid-burst rather than finishing one.
  if (!row.enabled) endCapture(deviceId);
  return laneShape(row);
}

export async function deleteLane(ownerId: number, deviceId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM anpr_lanes WHERE device_id = $1 AND owner_id = $2`,
    [deviceId, ownerId]
  );
  lanes.delete(deviceId);
  endCapture(deviceId);
  invalidateLaneCache(deviceId);
  return (rowCount ?? 0) > 0;
}

/** True when this device is currently driven as a lane. */
export function isLane(deviceId: string): boolean {
  return lanes.has(deviceId);
}

/** Whether the cache has been populated. Surfaced for diagnostics. */
export function lanesLoaded(): boolean {
  return loaded;
}

/*
 * Imported lazily to keep the module graph acyclic: anpr/index.ts imports this
 * file's trigger for the manual capture route, so a static import back would
 * close the cycle.
 */
function invalidateLaneCache(deviceId: string): void {
  void import("./index").then((m) => m.invalidateAnprOwner(deviceId));
}

/** Test seam: drops timers, taps and cached rows so a suite can exit cleanly. */
export function __resetLanesForTests(): void {
  for (const deviceId of [...active.keys()]) endCapture(deviceId);
  lanes.clear();
  lastTrigger.clear();
  loaded = false;
}
