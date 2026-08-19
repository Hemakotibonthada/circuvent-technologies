/**
 * A camera pressed into service as the eyes of a door lock.
 *
 * WHY THIS EXISTS
 *
 * The FaceDoor design says recognition "runs on the hub's AI node", which
 * posts a descriptor to /face/match. There is no such node in a Circuvent
 * home. The consequence was a feature that was complete on paper and inert in
 * practice: profiles could be created, thresholds tuned, attempt logs read —
 * and nothing, ever, looked at anybody's face. Enrolment from a phone worked
 * only to fill a table nobody consulted.
 *
 * This is the missing node, running on the control plane, driving the ordinary
 * ESP32 camera a customer already owns:
 *
 *   motion / bell ──▶ triggerDoor ──▶ cv/<id>/cmd {"action":"snapshot"} x N
 *                                                  │
 *   cv/<id>/frame ──▶ bus device:frame ────────────┘
 *                            │
 *                            ▼
 *                   POST face:8000/embed ──▶ decideFace ──▶ unlock
 *                                        └─▶ addSample   (during enrolment)
 *
 * It is deliberately the same *arrangement* as anpr/lane.ts, and deliberately
 * not the same code. The two share a mechanism and disagree about everything
 * that matters: a gate votes across a burst because a plate is a fixed string
 * that several frames should agree on, whereas a face is a moving target and
 * the first confident frame should win because somebody is standing there
 * waiting. Generalising them would put a car park barrier and a front door
 * behind one set of tuning constants.
 *
 * WHAT IS HONESTLY WORSE THAN A PURPOSE-BUILT DOORBELL CAMERA
 *
 * Stated here rather than discovered on a doorstep. The round trip is broker →
 * camera → broker → embedder, so recognition lands roughly a second after the
 * motion rather than instantly. The camera's motion detector is whole-frame,
 * so a cat sets off a burst. And the embedder needs a face about 120 pixels
 * tall (see platform/face/embed.py for the measurements behind that), which on
 * a VGA camera means standing close enough to press a doorbell — further away
 * the door will simply not recognise anyone, which is the safe direction but
 * is not the same as working.
 */
import { pool, recordEvent } from "../db";
import { logger } from "../logger";
import { bus, frameTaps, publishCommand, type DeviceFrame, type DeviceUpdate } from "../mqtt";
import { onOwnershipChange } from "../ownership";
import { getEmbedder } from "./embedder";
import { isDescriptor } from "./match";
import { addSample, decideFace } from "./service";

export type DoorSource = "motion" | "bell" | "manual" | "enrol";

export interface FaceDoor {
  deviceId: string;
  ownerId: number;
  lockId: string | null;
  enabled: boolean;
  burst: number;
  burstGapMs: number;
  cooldownMs: number;
  illuminate: number;
  triggers: number;
  lastTriggerAt: string | null;
}

interface DoorRow {
  device_id: string;
  owner_id: string;
  lock_id: string | null;
  enabled: boolean;
  burst: number;
  burst_gap_ms: number;
  cooldown_ms: number;
  illuminate: number;
  triggers: string;
  last_trigger_at: string | null;
}

/*
 * Bounds, applied on write.
 *
 * A burst of forty frames or a cooldown of zero is not a preference, it is a
 * camera being asked to overheat and a broker being asked to carry a video
 * stream it was never meant to carry.
 */
const LIMITS = {
  burst: { min: 1, max: 6, def: 3 },
  burstGapMs: { min: 200, max: 3000, def: 450 },
  cooldownMs: { min: 1000, max: 120000, def: 4000 },
  illuminate: { min: 0, max: 255, def: 0 },
};

const clamp = (v: number, b: { min: number; max: number; def: number }): number =>
  Number.isFinite(v) ? Math.min(b.max, Math.max(b.min, Math.round(v))) : b.def;

const DOOR_COLUMNS = `device_id, owner_id, lock_id, enabled, burst, burst_gap_ms,
                      cooldown_ms, illuminate, triggers, last_trigger_at`;

function doorShape(r: DoorRow): FaceDoor {
  return {
    deviceId: r.device_id,
    ownerId: Number(r.owner_id),
    lockId: r.lock_id,
    enabled: r.enabled,
    burst: r.burst,
    burstGapMs: r.burst_gap_ms,
    cooldownMs: r.cooldown_ms,
    illuminate: r.illuminate,
    triggers: Number(r.triggers),
    lastTriggerAt: r.last_trigger_at,
  };
}

const doors = new Map<string, FaceDoor>();
/** Reverse index, so a bell press on the lock finds its camera in one step. */
const byLock = new Map<string, string>();

function index(): void {
  byLock.clear();
  for (const d of doors.values()) if (d.lockId) byLock.set(d.lockId, d.deviceId);
}

async function loadDoors(): Promise<void> {
  try {
    const { rows } = await pool.query<DoorRow>(`SELECT ${DOOR_COLUMNS} FROM face_doors`);
    doors.clear();
    for (const r of rows) doors.set(r.device_id, doorShape(r));
    index();
    logger.info({ doors: doors.size }, "face door cameras loaded");
  } catch (err) {
    logger.error({ err }, "face door load failed");
  }
}

async function refreshDoor(deviceId: string): Promise<void> {
  try {
    const { rows } = await pool.query<DoorRow>(
      `SELECT ${DOOR_COLUMNS} FROM face_doors WHERE device_id = $1`,
      [deviceId]
    );
    if (rows[0]) doors.set(deviceId, doorShape(rows[0]));
    else doors.delete(deviceId);
    index();
  } catch (err) {
    logger.error({ err, deviceId }, "face door refresh failed");
  }
}

/* ------------------------------------------------------------------ */
/* Enrolment windows                                                   */
/* ------------------------------------------------------------------ */

interface EnrolWindow {
  profileId: number;
  name: string;
  until: number;
  taken: number;
  /** Set once so a full profile does not keep re-triggering the camera. */
  finished: boolean;
}

/*
 * Keyed by the device the *roster* hangs off, which is the lock when one is
 * paired and the camera otherwise. The same key is used everywhere a profile
 * is looked up, so a door with a lock fitted later does not orphan its people.
 */
const windows = new Map<string, EnrolWindow>();

/** The device face_profiles rows belong to for a given camera. */
export function rosterDeviceFor(deviceId: string): string {
  return doors.get(deviceId)?.lockId ?? deviceId;
}

/**
 * Opens the capture window that makes device-side enrolment mean something.
 *
 * The firmware already runs its own timer and refuses to unlock while it is
 * enrolling — that is the guarantee the door owns. This is the server's half:
 * it decides that frames arriving now are samples rather than attempts. It is
 * given a slightly shorter life than the door's window so the two cannot
 * disagree about who is still enrolling, and the frames arriving in the last
 * moment are never filed against a window the door has already closed.
 */
export function openEnrolWindow(
  rosterDeviceId: string,
  profileId: number,
  name: string,
  seconds: number
): void {
  windows.set(rosterDeviceId, {
    profileId,
    name,
    until: Date.now() + Math.max(5, seconds - 3) * 1000,
    taken: 0,
    finished: false,
  });
  logger.info({ rosterDeviceId, profileId, seconds }, "face enrolment window open");
}

export function closeEnrolWindow(rosterDeviceId: string): void {
  windows.delete(rosterDeviceId);
}

function activeWindow(rosterDeviceId: string): EnrolWindow | null {
  const w = windows.get(rosterDeviceId);
  if (!w) return null;
  if (Date.now() > w.until) {
    windows.delete(rosterDeviceId);
    return null;
  }
  return w;
}

/** Whether a camera is currently gathering samples rather than judging them. */
export function isEnrolling(deviceId: string): boolean {
  return activeWindow(rosterDeviceFor(deviceId)) !== null;
}

/* ------------------------------------------------------------------ */
/* Capture                                                             */
/* ------------------------------------------------------------------ */

interface ActiveCapture {
  captureId: number;
  door: FaceDoor;
  frames: number;
  want: number;
  source: DoorSource;
  /** Set once a frame has produced a grant, so the rest are dropped. */
  settled: boolean;
  timers: NodeJS.Timeout[];
  /**
   * Frames are embedded one at a time, in arrival order.
   *
   * The embedder holds a single lock around the model — OpenCV's nets are not
   * thread-safe — so firing a burst of three at once does not make anything
   * parallel. It only means the third request spends the first two embeds
   * sitting in a queue, and on a shared-core VM that was enough to push it
   * past the ten-second timeout: the model found the face, wrote the answer,
   * and the API had already given up and closed the socket. The log showed a
   * successful embed and no access attempt, which is a genuinely confusing
   * pair of facts to be looking at.
   *
   * Serialising here also makes the "first confident frame wins" rule pay:
   * once one frame has opened the door, the rest are dropped without ever
   * being sent.
   */
  chain: Promise<void>;
}

const active = new Map<string, ActiveCapture>();
const lastTrigger = new Map<string, number>();
let captureSeq = 0;

/** Bursts in flight across the fleet. The embedder is the shared bottleneck. */
const MAX_ACTIVE = 4;
const FRAME_GRACE_MS = 2500;
const MAX_FRAMES_PER_CAPTURE = 8;

function endCapture(deviceId: string): void {
  const cap = active.get(deviceId);
  if (!cap) return;
  for (const t of cap.timers) clearTimeout(t);
  active.delete(deviceId);
  frameTaps.delete(deviceId);
  if (cap.door.illuminate > 0) {
    try {
      publishCommand(deviceId, { action: "flash", level: 0 });
    } catch (err) {
      logger.error({ err, deviceId }, "face door illuminator off failed");
    }
  }
}

/**
 * Asks the camera for a burst of frames.
 *
 * Returns the capture id, or null when the door refused — disabled, unknown,
 * inside its cooldown, or the fleet is already at its ceiling. Null is an
 * ordinary answer, not an error.
 */
export function triggerDoor(deviceId: string, source: DoorSource): number | null {
  const door = doors.get(deviceId);
  if (!door || !door.enabled) return null;
  if (active.has(deviceId)) return null;

  const now = Date.now();
  /*
   * The cooldown applies to motion only.
   *
   * A bell press, an enrolment and a "capture now" button are all somebody
   * deliberately asking, usually while standing at the door watching nothing
   * happen. Silently ignoring those for the next few seconds is the behaviour
   * that makes a doorbell feel broken.
   */
  if (source === "motion") {
    if (now - (lastTrigger.get(deviceId) ?? 0) < door.cooldownMs) return null;
  }
  if (active.size >= MAX_ACTIVE) {
    logger.warn({ deviceId }, "face door trigger dropped — too many bursts in flight");
    return null;
  }

  lastTrigger.set(deviceId, now);
  const captureId = ++captureSeq;
  const cap: ActiveCapture = {
    captureId,
    door,
    frames: 0,
    want: door.burst,
    source,
    settled: false,
    timers: [],
    chain: Promise.resolve(),
  };
  active.set(deviceId, cap);
  // Opened before the first command, so a fast camera cannot beat the tap.
  frameTaps.add(deviceId);

  try {
    if (door.illuminate > 0) publishCommand(deviceId, { action: "flash", level: door.illuminate });
    for (let i = 0; i < door.burst; i++) {
      if (i === 0) {
        publishCommand(deviceId, { action: "snapshot" });
        continue;
      }
      const t = setTimeout(() => {
        const cur = active.get(deviceId);
        if (!cur || cur.captureId !== captureId || cur.settled) return;
        try {
          publishCommand(deviceId, { action: "snapshot" });
        } catch (err) {
          logger.error({ err, deviceId }, "face door snapshot publish failed");
        }
      }, i * door.burstGapMs);
      t.unref?.();
      cap.timers.push(t);
    }

    const done = setTimeout(
      () => {
        if (active.get(deviceId)?.captureId === captureId) endCapture(deviceId);
      },
      (door.burst - 1) * door.burstGapMs + FRAME_GRACE_MS
    );
    done.unref?.();
    cap.timers.push(done);
  } catch (err) {
    logger.error({ err, deviceId }, "face door trigger failed");
    endCapture(deviceId);
    return null;
  }

  void pool
    .query(
      `UPDATE face_doors SET triggers = triggers + 1, last_trigger_at = now() WHERE device_id = $1`,
      [deviceId]
    )
    .catch((err) => logger.error({ err, deviceId }, "face door counter update failed"));

  logger.debug({ deviceId, captureId, source }, "face door triggered");
  return captureId;
}

/**
 * One frame: embed it, then either enrol it or judge it.
 *
 * Frames are handled as they land rather than collected and voted on. A face
 * is not a number plate — there is no string for three frames to agree about,
 * and the person is waiting — so the first frame that produces a confident
 * match opens the door and the remaining frames of that burst are dropped.
 */
async function handleFrame(deviceId: string, cap: ActiveCapture, data: Buffer): Promise<void> {
  const embedder = getEmbedder();
  const result = await embedder.embed(data, "image/jpeg");

  if (!result.descriptor) {
    // Overwhelmingly this is "nobody is looking at the camera", which is the
    // normal outcome of a burst the cat triggered. Logged at debug so a busy
    // doorway does not drown the log in non-events.
    logger.debug({ deviceId, reason: result.reason, ms: result.ms }, "face frame yielded nothing");
    return;
  }
  if (!isDescriptor(result.descriptor)) {
    logger.warn({ deviceId }, "embedder returned a descriptor this door cannot use");
    return;
  }

  const roster = cap.door.lockId ?? deviceId;
  const win = activeWindow(roster);

  if (win) {
    if (win.finished) return;
    const added = await addSample(win.profileId, result.descriptor, "door");
    if (added.ok) {
      win.taken = added.total;
      /*
       * Tell the door, so the person being enrolled can watch the count climb
       * instead of guessing whether standing still is working. This is the
       * only feedback they get — they are looking at a doorframe, not a phone.
       */
      try {
        publishCommand(cap.door.lockId ?? deviceId, { action: "sample", count: added.total });
      } catch {
        /* the display is a courtesy; a broker hiccup must not fail an enrolment */
      }
      logger.info({ deviceId, profileId: win.profileId, total: added.total }, "face sample enrolled");
      if (added.total >= 12) {
        win.finished = true;
        closeEnrolWindow(roster);
        try {
          publishCommand(cap.door.lockId ?? deviceId, { action: "enrol", mode: "off" });
        } catch {
          /* the door closes its own window on a timer regardless */
        }
      }
    } else if (added.code === "different-person") {
      /*
       * Somebody else stepped into frame mid-enrolment. Refusing is the whole
       * point — a profile that quietly absorbs two faces is a profile that can
       * no longer tell them apart, and neither can the access log.
       */
      logger.warn({ deviceId, profileId: win.profileId }, "face sample refused — different person");
    }
    // "too-similar" is the expected result for most frames of a burst and is
    // not worth a line in the log.
    return;
  }

  if (cap.settled) return;
  const decision = await decideFace(roster, cap.door.ownerId, result.descriptor, {
    lockId: cap.door.lockId ?? deviceId,
    via: cap.source,
  });
  if (decision.grant) cap.settled = true;
}

function onFrame(f: DeviceFrame): void {
  const cap = active.get(f.deviceId);
  if (!cap) return;
  if (cap.settled || cap.frames >= MAX_FRAMES_PER_CAPTURE) return;
  cap.frames++;

  const data = f.data;
  cap.chain = cap.chain
    .then(() => {
      // Re-checked here rather than only above: by the time this frame's turn
      // comes round, an earlier one may already have opened the door.
      if (cap.settled) return;
      return handleFrame(f.deviceId, cap, data);
    })
    .catch((err) => logger.error({ err, deviceId: f.deviceId }, "face frame handling failed"));
}

function onUpdate(u: DeviceUpdate): void {
  if (u.kind !== "telemetry") return;
  const p = u.payload as { type?: unknown; state?: unknown } | null;
  if (!p || typeof p !== "object") return;

  // Motion on the camera itself.
  if (doors.has(u.deviceId) && p.type === "motion") {
    triggerDoor(u.deviceId, "motion");
    return;
  }

  // Anything from the paired lock.
  const cameraId = byLock.get(u.deviceId);
  if (!cameraId) return;

  if (p.type === "bell") {
    // Somebody pressed the bell and is, by definition, standing in front of
    // the camera looking at the door. There is no better moment to look.
    triggerDoor(cameraId, "bell");
    return;
  }

  if (p.type === "enrol") {
    if (p.state === "requested") {
      // Somebody used the door's own admin menu. The door cannot name a person
      // or invent a profile id — those live here, with the household's roster —
      // so it asks, and this answers.
      void enrolFromDoor(u.deviceId, cameraId);
    } else if (p.state === "started") {
      // The door has entered enrolment mode. Keep capturing for the window.
      startEnrolCapture(cameraId);
    } else if (p.state === "stopped") {
      closeEnrolWindow(rosterDeviceFor(cameraId));
      stopEnrolCapture(cameraId);
    }
  }
}

/** How long a device-initiated enrolment window stays open. */
const DOOR_ENROL_SECONDS = 120;

/**
 * Enrolment asked for at the door itself.
 *
 * The person standing there has already proved they know the admin PIN, which
 * is what authorises this; the door has no way to know *whose* face is about
 * to be taken, so a profile is created with a placeholder name and the window
 * opens immediately. Naming happens afterwards, in the app, where there is a
 * keyboard — asking somebody to type a name on a 4x4 keypad would be worse
 * than useless.
 *
 * The placeholder is deliberately conspicuous. A face that opens the front
 * door and is labelled "Enrolled at the door 14:32" is an obvious loose end in
 * the roster; one labelled "User" would not be.
 */
async function enrolFromDoor(lockId: string, cameraId: string): Promise<void> {
  const door = doors.get(cameraId);
  if (!door) return;
  const roster = door.lockId ?? cameraId;

  try {
    const when = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const name = `Enrolled at the door ${when}`;
    const created = await pool.query<{ id: string; name: string }>(
      `INSERT INTO face_profiles (owner_id, device_id, name, role)
       VALUES ($1, $2, $3, 'resident')
       ON CONFLICT (device_id, name) DO UPDATE SET updated_at = now()
       RETURNING id, name`,
      [door.ownerId, roster, name]
    );
    const profileId = Number(created.rows[0].id);

    openEnrolWindow(roster, profileId, created.rows[0].name, DOOR_ENROL_SECONDS);
    publishCommand(lockId, {
      action: "enrol",
      mode: "face",
      profileId,
      name: created.rows[0].name,
      seconds: DOOR_ENROL_SECONDS,
    });
    startEnrolCapture(cameraId);

    await recordEvent(
      door.ownerId,
      "face",
      "Enrolment started at the door",
      `Started from the door's keypad — give this face a name in the app`,
      lockId
    );
    logger.info({ lockId, cameraId, profileId }, "face enrolment requested at the door");
  } catch (err) {
    logger.error({ err, lockId }, "door-initiated enrolment failed");
    try {
      publishCommand(lockId, { action: "enrol", mode: "off" });
    } catch {
      /* the door closes its own window on a timer regardless */
    }
  }
}

/* ------------------------------------------------------------------ */
/* Enrolment capture loop                                              */
/* ------------------------------------------------------------------ */

const enrolTimers = new Map<string, NodeJS.Timeout>();

/**
 * Keeps asking the camera for frames for as long as the window is open.
 *
 * Enrolment is the one time a door should be greedy: the person is standing
 * there co-operating, and a profile built from three frames of one pose is a
 * profile that stops working the first time they wear a hat.
 */
export function startEnrolCapture(cameraId: string): void {
  stopEnrolCapture(cameraId);
  const tick = () => {
    if (!activeWindow(rosterDeviceFor(cameraId))) {
      stopEnrolCapture(cameraId);
      return;
    }
    triggerDoor(cameraId, "enrol");
  };
  const t = setInterval(tick, 2500);
  t.unref?.();
  enrolTimers.set(cameraId, t);
  tick();
}

export function stopEnrolCapture(cameraId: string): void {
  const t = enrolTimers.get(cameraId);
  if (t) clearInterval(t);
  enrolTimers.delete(cameraId);
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

let started = false;

/** Wires the door cameras. Call once at boot, after the MQTT bridge. */
export function startFaceDoors(): void {
  if (started) return;
  started = true;

  void loadDoors();
  bus.on("device:update", onUpdate);
  bus.on("device:frame", onFrame);

  /*
   * A camera that changes hands stops being a door immediately.
   *
   * The row would go with the device on a delete, but a *transfer* keeps the
   * row and changes devices.owner_id — and a door still holding the previous
   * owner's id would file the new owner's callers into the old owner's log,
   * and could unlock a lock they no longer own.
   */
  onOwnershipChange((deviceId) => {
    if (!doors.has(deviceId) && !byLock.has(deviceId)) return;
    const cameraId = doors.has(deviceId) ? deviceId : byLock.get(deviceId)!;
    void pool
      .query(`DELETE FROM face_doors WHERE device_id = $1`, [cameraId])
      .catch((err) => logger.error({ err, cameraId }, "face door cleanup failed"));
    doors.delete(cameraId);
    closeEnrolWindow(cameraId);
    stopEnrolCapture(cameraId);
    endCapture(cameraId);
    index();
  });
}

/* ------------------------------------------------------------------ */
/* The API surface                                                     */
/* ------------------------------------------------------------------ */

export async function listDoors(ownerId: number): Promise<FaceDoor[]> {
  const { rows } = await pool.query<DoorRow>(
    `SELECT ${DOOR_COLUMNS} FROM face_doors WHERE owner_id = $1 ORDER BY device_id`,
    [ownerId]
  );
  return rows.map(doorShape);
}

export async function getDoor(ownerId: number, deviceId: string): Promise<FaceDoor | null> {
  const { rows } = await pool.query<DoorRow>(
    `SELECT ${DOOR_COLUMNS} FROM face_doors WHERE owner_id = $1 AND device_id = $2`,
    [ownerId, deviceId]
  );
  return rows[0] ? doorShape(rows[0]) : null;
}

export interface DoorPatch {
  lockId?: string | null;
  enabled?: boolean;
  burst?: number;
  burstGapMs?: number;
  cooldownMs?: number;
  illuminate?: number;
}

export async function saveDoor(
  ownerId: number,
  deviceId: string,
  patch: DoorPatch
): Promise<FaceDoor | null> {
  const current = await getDoor(ownerId, deviceId);
  const next = {
    lockId: patch.lockId !== undefined ? patch.lockId : (current?.lockId ?? null),
    enabled: patch.enabled ?? current?.enabled ?? true,
    burst: clamp(patch.burst ?? current?.burst ?? LIMITS.burst.def, LIMITS.burst),
    burstGapMs: clamp(patch.burstGapMs ?? current?.burstGapMs ?? LIMITS.burstGapMs.def, LIMITS.burstGapMs),
    cooldownMs: clamp(patch.cooldownMs ?? current?.cooldownMs ?? LIMITS.cooldownMs.def, LIMITS.cooldownMs),
    illuminate: clamp(patch.illuminate ?? current?.illuminate ?? LIMITS.illuminate.def, LIMITS.illuminate),
  };

  const { rows } = await pool.query<DoorRow>(
    `INSERT INTO face_doors (device_id, owner_id, lock_id, enabled, burst, burst_gap_ms,
                             cooldown_ms, illuminate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (device_id) DO UPDATE SET
       lock_id = EXCLUDED.lock_id, enabled = EXCLUDED.enabled, burst = EXCLUDED.burst,
       burst_gap_ms = EXCLUDED.burst_gap_ms, cooldown_ms = EXCLUDED.cooldown_ms,
       illuminate = EXCLUDED.illuminate, updated_at = now()
     RETURNING ${DOOR_COLUMNS}`,
    [
      deviceId,
      ownerId,
      next.lockId,
      next.enabled,
      next.burst,
      next.burstGapMs,
      next.cooldownMs,
      next.illuminate,
    ]
  );
  if (!rows[0]) return null;
  await refreshDoor(deviceId);
  await recordEvent(
    ownerId,
    "face",
    current ? "Door camera updated" : "Door camera set up",
    next.lockId ? `Paired with ${next.lockId}` : "No lock paired yet",
    deviceId
  );
  return doorShape(rows[0]);
}

export async function deleteDoor(ownerId: number, deviceId: string): Promise<boolean> {
  const r = await pool.query(`DELETE FROM face_doors WHERE owner_id = $1 AND device_id = $2`, [
    ownerId,
    deviceId,
  ]);
  doors.delete(deviceId);
  closeEnrolWindow(deviceId);
  stopEnrolCapture(deviceId);
  endCapture(deviceId);
  index();
  return Boolean(r.rowCount);
}

/** True when this camera is currently driven as a door. */
export function isDoorCamera(deviceId: string): boolean {
  return doors.has(deviceId);
}

/** The camera watching a given lock, if any. */
export function cameraForLock(lockId: string): string | null {
  return byLock.get(lockId) ?? null;
}

/** Test seam: drops timers, taps and cached rows so a suite can exit cleanly. */
export function __resetFaceDoorsForTests(): void {
  for (const id of [...active.keys()]) endCapture(id);
  for (const t of enrolTimers.values()) clearInterval(t);
  enrolTimers.clear();
  windows.clear();
  doors.clear();
  byLock.clear();
  lastTrigger.clear();
  started = false;
  bus.off("device:update", onUpdate);
  bus.off("device:frame", onFrame);
}

/** Test seam: seeds a door without touching the database. */
export function __setDoorForTests(door: FaceDoor): void {
  doors.set(door.deviceId, door);
  index();
}
