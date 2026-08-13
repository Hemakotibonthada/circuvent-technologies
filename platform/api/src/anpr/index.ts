import { config, topics } from "../config";
import { pool, recordEvent } from "../db";
import { logger } from "../logger";
import { bus, getMqtt, type DeviceUpdate } from "../mqtt";
import { onEvent } from "../automations";
import { onOwnershipChange } from "../ownership";
import { sendPushToHome } from "../push";
import { parseCapture, type AnprCapture, type TriggerReasonName } from "./protocol";
import { getRecogniser, type RawCandidate } from "./recognizer";
import { normalisePlate, prettyPlate, voteOnBurst, type PlateVerdict } from "./plate";
import { applyRead, laneDirection, type Direction, type LaneDirection } from "./visits";
import { isFirstSighting, onVehicleEntered, sweepOverstays } from "./site";
import { sweepDailyReports } from "./report";

/**
 * The ANPR pipeline: captures in, decisions out.
 *
 * WHERE THIS SITS
 *
 *   device ──cv/<id>/anpr──▶ [collect a burst] ──▶ [recognise] ──▶ [vote]
 *          ──▶ [apply rules] ──▶ [store + announce] ──▶ cv/<id>/cmd (echo)
 *
 * The device decides *when*; this decides *what* and *so what*. Nothing in the
 * firmware is trusted to make an access decision, because the allow-list lives
 * here and a plate string arriving on the wire is not authorisation.
 *
 * WHY A BURST IS COLLECTED RATHER THAN EACH FRAME RECOGNISED
 *
 * A single frame of a moving vehicle is a coin toss — motion blur, a headlight
 * flare, a wiper mid-sweep. Recognising each frame independently would produce
 * three reads of the same car, two of them wrong, three timeline entries and
 * possibly three gate pulses. Collecting the burst first means one arrival
 * produces one read, and disagreement between frames becomes evidence about
 * confidence rather than three separate claims.
 */

/** Ceiling per capture, matching MAX_FRAME_BYTES on the live-video path. */
const MAX_CAPTURE_BYTES = 512 * 1024;

/**
 * How long to wait for the rest of a burst.
 *
 * The firmware's own worst case is burst(8) x burstGapMs(2000) = 16 s, but a
 * gate runs at the defaults (3 x 220 ms) and a burst that has genuinely
 * stalled should not hold a vehicle's read hostage. Four seconds covers the
 * default burst many times over; a straggler that arrives later is treated as
 * a new capture, which is the safe way to be wrong.
 */
const BURST_WINDOW_MS = 4000;

/** Bursts held at once, across the whole fleet. Bounds memory under a storm. */
const MAX_PENDING_BURSTS = 32;

/**
 * Frames actually sent to the recogniser per burst.
 *
 * Every frame is a paid API call or a chunk of the VM's CPU, and the marginal
 * value falls away fast: two frames give agreement, three break a tie, and a
 * fourth of the same stationary car adds nothing. The frames chosen are the
 * largest ones — see pickSharpest.
 */
const MAX_RECOGNISE_FRAMES = 3;

/** Recognitions in flight. The VM in Docs/12-vm-runbook.md may be 1 vCPU. */
const MAX_INFLIGHT = 2;

interface PendingBurst {
  deviceId: string;
  captureId: number;
  ownerId: number;
  lane: LaneDirection;
  reason: TriggerReasonName;
  frames: Buffer[];
  expect: number;
  width: number;
  height: number;
  startedAt: number;
  timer: NodeJS.Timeout;
}

const pending = new Map<string, PendingBurst>();
const queue: PendingBurst[] = [];
let inflight = 0;

/** Owner + lane lookup, cached briefly like the webhook dispatcher does. */
const ownerCache = new Map<string, { ownerId: number | null; lane: LaneDirection; at: number }>();
const OWNER_TTL_MS = 30_000;

interface DeviceInfo {
  ownerId: number | null;
  lane: LaneDirection;
}

async function deviceInfo(deviceId: string): Promise<DeviceInfo> {
  const hit = ownerCache.get(deviceId);
  if (hit && Date.now() - hit.at < OWNER_TTL_MS) return { ownerId: hit.ownerId, lane: hit.lane };
  try {
    const { rows } = await pool.query<{ owner_id: number | null; state: Record<string, unknown> | null }>(
      `SELECT owner_id, state FROM devices WHERE id = $1`,
      [deviceId]
    );
    const ownerId = rows[0]?.owner_id ?? null;
    // The lane comes from what the firmware published, so a camera remounted
    // on the exit side reports its own new role rather than needing a
    // server-side setting kept in step by hand.
    const lane = laneDirection(rows[0]?.state?.direction);
    ownerCache.set(deviceId, { ownerId, lane, at: Date.now() });
    return { ownerId, lane };
  } catch (err) {
    logger.error({ err, deviceId }, "anpr device lookup failed");
    return { ownerId: null, lane: "both" };
  }
}

/** Called when a device is claimed, unclaimed or deleted. */
export function invalidateAnprOwner(deviceId: string): void {
  ownerCache.delete(deviceId);
}

/**
 * Entry point from the MQTT bridge. Synchronous and cheap on the hot path:
 * everything expensive happens after the burst has been collected.
 */
export function handleAnprCapture(deviceId: string, payload: Buffer): void {
  if (payload.length === 0 || payload.length > MAX_CAPTURE_BYTES) return;
  const capture = parseCapture(payload);
  if (!capture) return;
  void collect(deviceId, capture).catch((err) =>
    logger.error({ err, deviceId }, "anpr collect failed")
  );
}

async function collect(deviceId: string, c: AnprCapture): Promise<void> {
  // Ownership first, before a single byte is buffered or a provider is paid.
  // An unclaimed camera on a bench must not cost money or memory, and a device
  // that has just been unclaimed must stop being processed immediately — the
  // same rule the live-video path applies on every frame.
  const { ownerId, lane } = await deviceInfo(deviceId);
  if (ownerId == null) return;

  const key = `${deviceId}:${c.captureId}`;
  let b = pending.get(key);

  if (!b) {
    if (pending.size >= MAX_PENDING_BURSTS) {
      logger.warn({ deviceId }, "anpr pending burst limit reached — capture dropped");
      return;
    }
    b = {
      deviceId,
      captureId: c.captureId,
      ownerId,
      lane,
      reason: c.reason,
      frames: [],
      expect: Math.min(c.burst, 8),
      width: c.width,
      height: c.height,
      startedAt: Date.now(),
      timer: setTimeout(() => close(key), BURST_WINDOW_MS),
    };
    // A burst that never completes must not pin the event loop open at
    // shutdown; it is not work worth delaying an exit for.
    b.timer.unref?.();
    pending.set(key, b);
  }

  b.frames.push(c.jpeg);
  if (b.frames.length >= b.expect) close(key);
}

function close(key: string): void {
  const b = pending.get(key);
  if (!b) return;
  clearTimeout(b.timer);
  pending.delete(key);

  if (inflight >= MAX_INFLIGHT) {
    // Dropping the oldest rather than the newest: at a gate the most recent
    // vehicle is the one still sitting at the barrier waiting to be let in.
    if (queue.length >= MAX_PENDING_BURSTS) queue.shift();
    queue.push(b);
    return;
  }
  void run(b);
}

async function run(b: PendingBurst): Promise<void> {
  inflight++;
  try {
    await process(b);
  } catch (err) {
    logger.error({ err, deviceId: b.deviceId }, "anpr processing failed");
  } finally {
    inflight--;
    const next = queue.shift();
    if (next) void run(next);
  }
}

/**
 * Picks the frames most likely to be readable.
 *
 * At a fixed JPEG quantiser, file size tracks high-frequency detail: a sharp
 * plate has edges to encode and a motion-blurred one does not, so the larger
 * frame of two taken 220 ms apart is very reliably the sharper one. It costs a
 * length comparison, needs no decode, and beats "take the first frame", which
 * is systematically the worst one because the vehicle is still moving.
 */
function pickSharpest(frames: Buffer[], n: number): Buffer[] {
  return [...frames].sort((a, b) => b.length - a.length).slice(0, n);
}

interface RuleRow {
  id: string;
  kind: string;
  label: string;
  valid_from: Date | null;
  valid_to: Date | null;
}

interface Decision {
  decision: "allow" | "deny" | "watch" | "unknown";
  ruleId: number | null;
  label: string;
}

/**
 * Applies the account's plate rules.
 *
 * Deny wins over allow, unconditionally. A plate that appears on both lists is
 * already prevented by a unique index, but the precedence still has to be
 * stated: if the two ever disagree, refusing entry is recoverable by a person
 * at the gate and admitting the wrong vehicle is not.
 *
 * A read the recogniser was not sure about never resolves to `allow`. It may
 * still resolve to `deny` — being unsure is a reason not to open a barrier,
 * never a reason to skip a block.
 */
async function decide(
  ownerId: number,
  deviceId: string,
  plate: string,
  confident: boolean
): Promise<Decision> {
  if (!plate) return { decision: "unknown", ruleId: null, label: "" };

  const { rows } = await pool.query<RuleRow>(
    `SELECT id, kind, label, valid_from, valid_to
       FROM plate_rules
      WHERE owner_id = $1
        AND plate = $2
        AND enabled
        AND (device_id IS NULL OR device_id = $3)
        AND (valid_from IS NULL OR valid_from <= now())
        AND (valid_to   IS NULL OR valid_to   >= now())
      ORDER BY CASE kind WHEN 'deny' THEN 0 WHEN 'watch' THEN 1 ELSE 2 END,
               device_id NULLS LAST`,
    [ownerId, plate, deviceId]
  );

  const hit = rows[0];
  if (!hit) return { decision: "unknown", ruleId: null, label: "" };

  const kind = hit.kind === "deny" || hit.kind === "watch" || hit.kind === "allow" ? hit.kind : "unknown";
  if (kind === "allow" && !confident) {
    return { decision: "unknown", ruleId: Number(hit.id), label: hit.label };
  }
  return { decision: kind, ruleId: Number(hit.id), label: hit.label };
}

async function process(b: PendingBurst): Promise<void> {
  const started = Date.now();
  const recogniser = getRecogniser();
  const chosen = pickSharpest(b.frames, MAX_RECOGNISE_FRAMES);

  const candidates: RawCandidate[] = [];
  let reason = "";
  for (const jpeg of chosen) {
    const r = await recogniser.recognise(jpeg);
    if (r.candidates.length) candidates.push(...r.candidates);
    else if (r.reason && !reason) reason = r.reason;
  }

  const verdict: PlateVerdict | null = voteOnBurst(candidates);
  const recognised = !!verdict && verdict.valid;
  const confident = recognised && verdict!.confidence >= config.ANPR_MIN_CONFIDENCE;

  if (!recognised && verdict) {
    // Something was read and it was not a registration. That is a different
    // problem from "nothing was read" — usually the camera is aimed at a
    // bumper sticker or a dealer frame — so it gets its own reason instead of
    // being flattened into "no plate".
    reason = "invalid_format";
  } else if (!verdict && !reason) {
    reason = "no_plate";
  }

  const plate = recognised ? verdict!.plate : "";
  const { decision, ruleId, label } = await decide(b.ownerId, b.deviceId, plate, confident);

  // The image kept is the one recognition actually ran on, not an arbitrary
  // frame: when a read is disputed, the picture has to be the evidence rather
  // than a different photograph of the same car.
  const maxThumb = config.ANPR_THUMBNAIL_MAX_KB * 1024;
  const source = chosen[0];
  const thumb = maxThumb > 0 && source && source.length <= maxThumb ? source.toString("base64") : null;

  let readId: number | null = null;
  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO plate_reads
         (device_id, owner_id, capture_id, plate, plate_raw, confidence, votes, samples,
          kind, status, reason, decision, rule_id, trigger, thumb, ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id`,
      [
        b.deviceId,
        b.ownerId,
        b.captureId,
        plate,
        candidates[0]?.raw ?? "",
        recognised ? verdict!.confidence : 0,
        verdict?.votes ?? 0,
        verdict?.samples ?? chosen.length,
        verdict?.kind ?? "unknown",
        recognised ? "recognised" : "unrecognised",
        recognised ? "" : reason,
        decision,
        ruleId,
        b.reason,
        thumb,
        Date.now() - started,
      ]
    );
    readId = Number(rows[0]?.id ?? 0) || null;
  } catch (err) {
    logger.error({ err, deviceId: b.deviceId }, "anpr read insert failed");
  }

  /*
   * Pair the read into a visit.
   *
   * Only recognised plates: an unreadable capture cannot be attributed to a
   * vehicle, and guessing which one it was would corrupt the in/out ledger for
   * whichever plate it was guessed as.
   *
   * Deliberately after the INSERT rather than before, so the visit can point at
   * a real read id and the timeline still has the sighting even if pairing
   * fails. `applyRead` swallows its own errors and returns null, so a database
   * hiccup costs the direction on one read rather than the read itself.
   */
  let direction: Direction | null = null;
  let visitId: number | null = null;
  let stayEndedSec: number | null = null;
  if (recognised) {
    // Asked before pairing, and excluding the read just inserted: after
    // pairing there is always a visit, and without the exclusion every vehicle
    // looks like a returning one so the alert never fires.
    const firstEver = await isFirstSighting(b.ownerId, plate, readId);

    const paired = await applyRead({
      ownerId: b.ownerId,
      plate,
      deviceId: b.deviceId,
      readId,
      lane: b.lane,
    });
    if (paired) {
      direction = paired.direction;
      visitId = paired.visitId;
      stayEndedSec = paired.durationSec;
      if (readId) {
        await pool
          .query(`UPDATE plate_reads SET direction = $2, visit_id = $3 WHERE id = $1`, [
            readId,
            direction,
            visitId,
          ])
          .catch((err) => logger.error({ err }, "anpr read direction update failed"));
      }
      // Occupancy consequences only make sense for an arrival — a departure
      // frees a space rather than filling one.
      if (direction === "in") {
        await onVehicleEntered(b.ownerId, plate, b.deviceId, firstEver);
      }
    }
  }

  await announce(b, {
    plate,
    recognised,
    confident,
    confidence: recognised ? verdict!.confidence : 0,
    decision,
    label,
    reason,
    readId,
    direction,
    visitId,
    stayEndedSec,
    frames: b.frames.length,
  });
}

interface Announcement {
  plate: string;
  recognised: boolean;
  confident: boolean;
  confidence: number;
  decision: Decision["decision"];
  label: string;
  reason: string;
  readId: number | null;
  direction: Direction | null;
  visitId: number | null;
  /** Seconds inside, when this read closed a visit. */
  stayEndedSec: number | null;
  frames: number;
}

/** "2h 14m" — for a notification, where seconds are noise. */
function humanStay(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${Math.max(1, m)}m`;
}

/**
 * Publishes the result everywhere it needs to go: the live socket, webhooks,
 * automations, the activity feed, push, and back to the device.
 *
 * The plate event is put on the same in-process bus that real telemetry uses,
 * rather than republished to MQTT. Republishing would mean the control plane
 * impersonating the device on its own topic — the one place in the system
 * where a message's origin is load-bearing — and would loop straight back in
 * through the subscription that produced it.
 */
async function announce(b: PendingBurst, a: Announcement): Promise<void> {
  const at = new Date().toISOString();
  const payload = {
    type: "plate",
    plate: a.plate,
    pretty: a.plate ? prettyPlate(a.plate) : "",
    confidence: a.confidence,
    decision: a.decision,
    label: a.label,
    status: a.recognised ? "recognised" : "unrecognised",
    reason: a.reason || undefined,
    trigger: b.reason,
    // Direction and visit ride the same event, so a webhook receiver building
    // its own occupancy view never has to re-derive the pairing we just did.
    direction: a.direction ?? undefined,
    visitId: a.visitId ?? undefined,
    staySec: a.stayEndedSec ?? undefined,
    capture: b.captureId,
    readId: a.readId,
    frames: a.frames,
    ts: Math.floor(Date.now() / 1000),
  };

  // Persisted as telemetry as well as stored in plate_reads: the timeline, the
  // charts and /v1/devices/:id/telemetry all read that table, and a plate read
  // that is invisible to every existing surface would have to have each of
  // them taught about it separately.
  try {
    await pool.query(
      `INSERT INTO telemetry (device_id, payload) SELECT $1, $2
        WHERE EXISTS (SELECT 1 FROM devices WHERE id = $1)`,
      [b.deviceId, payload]
    );
  } catch (err) {
    logger.error({ err }, "anpr telemetry insert failed");
  }

  bus.emit("device:update", {
    deviceId: b.deviceId,
    kind: "telemetry",
    payload,
    at,
  } satisfies DeviceUpdate);

  // Event-triggered automations. `{ type: "plate" }` matches the existing
  // `event` trigger with no new trigger kind, so a rule can already say
  // "when device X reads plate KA01AB1234, open the gate".
  try {
    await onEvent(b.deviceId, payload as unknown as Record<string, unknown>);
  } catch (err) {
    logger.error({ err }, "anpr automation dispatch failed");
  }

  const name = a.plate ? prettyPlate(a.plate) : "Unreadable plate";
  /*
   * "Arrived" / "left" rather than "seen".
   *
   * Once direction is known, the neutral wording is strictly worse: a resident
   * scanning the feed wants to know whether the car is still on the property,
   * and "Vehicle seen" at 18:04 answers nothing. Where direction could not be
   * resolved the neutral word is still used, because inventing one would be a
   * confident claim about something that was not observed.
   */
  const movement = a.direction === "in" ? "arrived" : a.direction === "out" ? "left" : "was seen";
  const stay = a.stayEndedSec != null ? ` after ${humanStay(a.stayEndedSec)}` : "";

  if (a.decision === "deny") {
    /*
     * A blocked vehicle *leaving* has not been denied entry — it is already
     * inside and is now on its way out, which is a different fact and often a
     * relief rather than an alarm. Saying "denied entry" there is simply
     * false, and a security feed that states something false about a vehicle
     * is worse than one that says less.
     */
    const outbound = a.direction === "out";
    const title = outbound ? "Blocked vehicle left" : "Blocked vehicle";
    const body = outbound
      ? `${name} left the property${stay}.`
      : `${name} was denied entry.`;
    await recordEvent(b.ownerId, "security", title, body, b.deviceId);
    await sendPushToHome(b.ownerId, { title, body }, "adults");
  } else if (a.decision === "watch") {
    await recordEvent(b.ownerId, "security", "Watchlist vehicle", `${name}${a.label ? ` (${a.label})` : ""} ${movement}${stay}.`, b.deviceId);
    await sendPushToHome(b.ownerId, { title: "Watchlist vehicle", body: `${name} ${movement}${stay}.` }, "adults");
  } else if (a.decision === "allow") {
    await recordEvent(b.ownerId, "activity", a.direction === "out" ? "Vehicle left" : "Vehicle admitted", `${name}${a.label ? ` — ${a.label}` : ""}${stay}`, b.deviceId);
  } else if (a.recognised) {
    await recordEvent(b.ownerId, "activity", a.direction === "out" ? "Vehicle left" : "Vehicle seen", `${name} ${movement}${stay}.`, b.deviceId);
  } else {
    // Recorded rather than dropped. "A vehicle arrived and we could not read
    // it" is the entry that tells an installer to move the camera; silence
    // looks identical to a camera that is switched off.
    await recordEvent(
      b.ownerId,
      "info",
      "Vehicle not identified",
      a.reason === "no_recogniser"
        ? "A vehicle was captured. No plate recogniser is configured."
        : `A vehicle was captured but no plate could be read (${a.reason || "unknown"}).`,
      b.deviceId
    );
  }

  // Echo to the device so a panel at the gate, and an installer standing at
  // the lens, can see what was read. `open` is only ever sent for a confident
  // allow — the device pulses its relay on this and nothing else.
  try {
    getMqtt().publish(
      topics.cmd(b.deviceId),
      JSON.stringify({
        action: "result",
        plate: a.plate,
        confidence: a.confidence,
        decision: a.decision,
        open: a.decision === "allow" && a.confident,
      }),
      { qos: 1 }
    );
  } catch {
    // The broker restarting must not fail the read that is already stored.
  }
}

/**
 * Deletes expired plate history.
 *
 * Two ages, on purpose: images are cleared first and the row survives. See the
 * note on ANPR_IMAGE_RETENTION_DAYS in config.ts — "this plate came at 19:42"
 * is what an access review needs months later, while the photograph of the
 * street it was taken from is not.
 */
export async function sweepPlateRetention(): Promise<void> {
  try {
    if (config.ANPR_IMAGE_RETENTION_DAYS > 0) {
      await pool.query(
        `UPDATE plate_reads SET thumb = NULL
          WHERE thumb IS NOT NULL AND ts < now() - ($1 || ' days')::interval`,
        [config.ANPR_IMAGE_RETENTION_DAYS]
      );
    }
    await pool.query(`DELETE FROM plate_reads WHERE ts < now() - ($1 || ' days')::interval`, [
      config.ANPR_RETENTION_DAYS,
    ]);

    /*
     * Visits expire on the same clock as the reads they were built from.
     *
     * They have no foreign key to plate_reads — a visit outlives the two reads
     * that formed it by design, so that deleting one read cannot silently
     * destroy a stay — which means nothing deletes them implicitly. Without
     * this they grow forever, and they are the *more* sensitive half of the
     * data: a read is one sighting, a visit is a record of when a named person's
     * vehicle arrived and left. Keeping those indefinitely would contradict the
     * whole reason ANPR_RETENTION_DAYS exists.
     *
     * Dated by the visit's own clock rather than created_at, because an
     * entry_missed row is created when the vehicle *left* and its only real
     * timestamp is exit_at.
     *
     * Old `open` visits are swept too. A visit still open past the retention
     * window is a missed exit, not a car parked for three months, and leaving
     * it would keep a vehicle counted as "on the property" forever.
     */
    await pool.query(
      `DELETE FROM plate_visits
        WHERE COALESCE(exit_at, entry_at, created_at) < now() - ($1 || ' days')::interval`,
      [config.ANPR_RETENTION_DAYS]
    );
  } catch (err) {
    logger.error({ err }, "anpr retention sweep failed");
  }
}

let sweepTimer: NodeJS.Timeout | null = null;
let overstayTimer: NodeJS.Timeout | null = null;
let reportTimer: NodeJS.Timeout | null = null;

/** Wires the retention and overstay sweeps. Call once at boot. */
export function startAnpr(): void {
  if (sweepTimer) return;
  // Ownership can move under a camera — claim, unclaim, admin reassignment —
  // and this pipeline caches the owner for 30 s. Without dropping it on the
  // change, a device re-claimed by a different account inside that window
  // would file the new owner's plate reads into the previous owner's log.
  onOwnershipChange(invalidateAnprOwner);
  void sweepPlateRetention();
  sweepTimer = setInterval(() => void sweepPlateRetention(), 24 * 60 * 60 * 1000);
  sweepTimer.unref?.();

  /*
   * Overstay runs on its own, much shorter, clock.
   *
   * Retention is a daily housekeeping job; an overstay is something somebody
   * is meant to act on, and a five-hour-late alert about a vehicle that should
   * have left at noon is not worth sending. Ten minutes is well inside the
   * resolution anyone configures (the limit is set in hours) while costing one
   * indexed UPDATE per tick across the whole fleet.
   */
  overstayTimer = setInterval(() => void sweepOverstays(), 10 * 60 * 1000);
  overstayTimer.unref?.();

  /*
   * The daily report rides the same ten-minute tick.
   *
   * It only has to land inside the configured hour, and `scheduler_ticks`
   * claims it per owner per IST day, so running the check six times an hour
   * costs one indexed SELECT and cannot produce a second email. A dedicated
   * hourly timer would be more precise about nothing and would miss the hour
   * entirely if the process restarted across it.
   */
  reportTimer = setInterval(() => void sweepDailyReports(), 10 * 60 * 1000);
  reportTimer.unref?.();

  logger.info({ provider: getRecogniser().name }, "ANPR pipeline started");
}

/** Test seam: drains timers and buffers so a suite can exit cleanly. */
export function __resetAnprForTests(): void {
  if (config.NODE_ENV !== "test") throw new Error("test-only");
  for (const b of pending.values()) clearTimeout(b.timer);
  pending.clear();
  queue.length = 0;
  inflight = 0;
  ownerCache.clear();
  if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
  if (overstayTimer) { clearInterval(overstayTimer); overstayTimer = null; }
  if (reportTimer) { clearInterval(reportTimer); reportTimer = null; }
}

export { normalisePlate };
