/**
 * Keeping the barrier's allow-list current, and recording who came through.
 *
 * THE TWO HALVES OF A GATE THAT WORKS
 *
 * The device holds a bare list of tag numbers in NVS and decides locally, so
 * the barrier keeps working when the network does not — which for a driveway
 * box on the end of a long cable run is a normal Tuesday, not an edge case.
 *
 * Everything that gives that list meaning is here: whose car it is, until when,
 * on which days. The device cannot evaluate those — it has no clock it can
 * trust — so this pushes the list of tags that may pass *right now* and pushes
 * it again as the rules come in and out of force.
 *
 * The other half is the log. A reader that admits the right cars and cannot
 * say which ones is a keypad with extra steps; "who came in last night" is the
 * question that gets asked, and it is the reason anybody fits one.
 */
import { pool, recordEvent } from "../db";
import { logger } from "../logger";
import { bus, publishCommand, type DeviceUpdate } from "../mqtt";
import { aclFor, aclString, decideGate, describeDecision, type GateTag } from "./access";

let started = false;

type TagRow = {
  id: string;
  tag: string;
  label: string;
  vehicle: string;
  active: boolean;
  valid_from: string | null;
  valid_to: string | null;
  days: number[] | null;
  from_minute: number | null;
  to_minute: number | null;
};

function toTag(r: TagRow): GateTag {
  return {
    id: Number(r.id),
    tag: Number(r.tag),
    label: r.label,
    vehicle: r.vehicle,
    active: r.active,
    validFrom: r.valid_from ? new Date(r.valid_from) : null,
    validTo: r.valid_to ? new Date(r.valid_to) : null,
    days: r.days ?? [],
    fromMinute: r.from_minute,
    toMinute: r.to_minute,
  };
}

export async function tagsFor(deviceId: string): Promise<GateTag[]> {
  const r = await pool.query<TagRow>(
    `SELECT id, tag, label, vehicle, active, valid_from, valid_to, days, from_minute, to_minute
       FROM gate_tags WHERE device_id = $1`,
    [deviceId],
  );
  return r.rows.map(toTag);
}

/**
 * What we last sent each gate.
 *
 * In memory on purpose. Its only job is to avoid re-sending an identical list,
 * and being wrong about it after a restart costs exactly one redundant publish
 * — whereas persisting it would create a second copy of the access list that
 * could disagree with the first.
 */
const lastPushed = new Map<string, string>();

/**
 * Pushes the allow-list, if it has changed.
 *
 * The whole list, not a delta. A device that missed a single removal — offline
 * for a minute, or a dropped message — would otherwise go on admitting a
 * vehicle whose access was revoked, and nothing would ever notice, because the
 * platform believes it sent the removal. Replacing the list makes every sync
 * self-correcting.
 */
export async function syncGate(deviceId: string, force = false): Promise<boolean> {
  const tags = await tagsFor(deviceId);
  const list = aclString(aclFor(tags, new Date()));

  if (!force && lastPushed.get(deviceId) === list) return false;
  lastPushed.set(deviceId, list);
  publishCommand(deviceId, { action: "setTags", tags: list });
  logger.info({ deviceId, count: list ? list.split(",").length : 0 }, "gate acl pushed");
  return true;
}

/** Every gate on the system, swept so time-of-day rules actually take effect. */
export async function syncAllGates(): Promise<void> {
  const r = await pool.query<{ id: string }>(`SELECT id FROM devices WHERE type = 'rfid-gate'`);
  for (const row of r.rows) {
    try {
      await syncGate(row.id);
    } catch (err) {
      logger.error({ err, deviceId: row.id }, "gate acl sync failed");
    }
  }
}

/**
 * A scan, recorded and explained.
 *
 * The device has already decided — it must, because it may be alone — so this
 * does not gate anything. It re-runs the decision to say *why*, which the
 * device cannot: it knows a number was not in its list, not that the pass
 * expired on Friday.
 *
 * Where the two disagree, the device's answer is what happened and is recorded
 * as such. A log that quietly rewrote history to match the rules would be
 * worse than useless the one time it mattered.
 */
export async function recordScan(
  deviceId: string,
  tagNumber: number,
  deviceAllowed: boolean,
): Promise<void> {
  const dev = await pool.query<{ owner_id: string | null }>(
    `SELECT owner_id FROM devices WHERE id = $1`,
    [deviceId],
  );
  const ownerId = dev.rows[0]?.owner_id;
  if (!ownerId) return;

  const tags = await tagsFor(deviceId);
  const match = tags.find((t) => t.tag === tagNumber);
  const decision = decideGate(match, new Date());

  /*
   * The reason is the platform's, the outcome is the device's. If the barrier
   * opened, it opened — and a mismatch is itself worth seeing, because it means
   * the pushed list is stale or somebody edited a rule seconds ago.
   */
  const reason = deviceAllowed && decision.reason !== "allowed" ? "allowed" : decision.reason;

  await pool.query(
    `INSERT INTO gate_events (device_id, owner_id, tag, tag_id, label, allowed, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      deviceId,
      ownerId,
      tagNumber,
      match?.id ?? null,
      match?.label ?? "",
      deviceAllowed,
      reason,
    ],
  );

  /*
   * Only denials reach the activity feed.
   *
   * A gate that admits forty cars a day would otherwise bury everything else a
   * household is told. A refusal at the barrier is the one somebody wants to
   * know about, and it is rare enough to be worth a notification.
   */
  if (!deviceAllowed) {
    await recordEvent(
      Number(ownerId),
      "gate",
      match?.label ? `${match.label} refused at the gate` : "Unknown tag refused at the gate",
      describeDecision(decision),
      deviceId,
    );
  }
}

/** Telemetry from a gate: `{type:"rfid", tag, allowed}`. */
const handler = async (u: DeviceUpdate): Promise<void> => {
  try {
    if (u.kind !== "telemetry") return;
    const p = (u.payload ?? {}) as Record<string, unknown>;
    if (p.type !== "rfid") return;
    const tagNumber = typeof p.tag === "number" ? p.tag : Number(p.tag);
    if (!Number.isFinite(tagNumber)) return;
    await recordScan(u.deviceId, tagNumber, p.allowed === true);
  } catch (err) {
    logger.error({ err, deviceId: u.deviceId }, "gate scan ingest failed");
  }
};

export function startGate(): void {
  if (started) return;
  started = true;
  bus.on("device:update", handler);
}

/** Test seam: drops only this module's listener, so a suite can exit cleanly. */
export function __resetGateForTests(): void {
  bus.off("device:update", handler);
  lastPushed.clear();
  started = false;
}
