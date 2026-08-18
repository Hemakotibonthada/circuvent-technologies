import type { PoolClient } from "pg";
import { pool } from "../db";
import { logger } from "../logger";

/**
 * Visit pairing: turning a stream of sightings into "in at 08:14, out at 17:32".
 *
 * WHY THIS IS NOT A JOIN
 *
 * A read is a sighting. A visit is two sightings matched across time, and the
 * matching is stateful: whether this read opens or closes a visit depends on
 * whether the vehicle is currently inside, which depends on every read before
 * it. That is a fold, not a join, so it is computed once as reads arrive and
 * stored — rather than re-derived per request, which would mean re-pairing
 * months of history every time somebody opens a vehicle profile.
 *
 * THE HARD PART IS MISSED READS, NOT THE HAPPY PATH
 *
 * Gate cameras miss. A car tailgates another through one barrier cycle; a
 * plate is unreadable in rain; a van leaves while the device is rebooting.
 *
 * The naive model — strict entry/exit alternation — is not merely incomplete
 * here, it is actively corrupting: one missed exit makes the *next* entry
 * close a visit that never ended, so that visit records a dwell time spanning
 * the gap, and every pairing after it is off by one, forever. The damage is
 * silent and unbounded.
 *
 * So an unpaired visit is a legitimate, named state rather than an error, and
 * pairing resynchronises at the next clean read.
 */

export type Direction = "in" | "out";
export type LaneDirection = Direction | "both";
export type VisitStatus = "open" | "closed" | "entry_missed" | "exit_missed";

export interface VisitRow {
  id: string;
  plate: string;
  entry_at: Date | null;
  exit_at: Date | null;
  entry_device: string | null;
  exit_device: string | null;
  entry_read_id: string | null;
  exit_read_id: string | null;
  status: string;
}

/** Normalises whatever the device published into a lane setting we honour. */
export function laneDirection(raw: unknown): LaneDirection {
  const s = String(raw ?? "").toLowerCase();
  if (s === "in" || s === "entry" || s === "entrance") return "in";
  if (s === "out" || s === "exit") return "out";
  return "both";
}

/**
 * Resolves which way this vehicle was travelling.
 *
 * A dedicated lane answers it outright. A shared lane ("both") is resolved by
 * alternating against the vehicle's own state: if it is currently inside, this
 * sighting is it leaving.
 *
 * That inference is only as good as the previous read, which is exactly why a
 * dedicated in/out lane is the better install and why the console says so. It
 * is still far better than the alternative of refusing to guess — a shared-lane
 * camera is the common cheap install, and "unknown" for every read would make
 * the entire feature useless there.
 */
export function resolveDirection(lane: LaneDirection, isInside: boolean): Direction {
  if (lane === "in" || lane === "out") return lane;
  return isInside ? "out" : "in";
}

interface ApplyArgs {
  ownerId: number;
  plate: string;
  deviceId: string;
  readId: number | null;
  lane: LaneDirection;
  /** Read timestamp. Defaults to now; injectable so tests are not clock-bound. */
  at?: Date;
}

export interface ApplyResult {
  direction: Direction;
  visitId: number | null;
  status: VisitStatus;
  /** Seconds inside, when this read closed a visit with a known entry. */
  durationSec: number | null;
}

/**
 * Applies one recognised read to the visit ledger.
 *
 * Runs inside a transaction that first takes an advisory lock on the
 * (owner, plate) pair. Two frames of the same burst can produce two reads, and
 * two cameras can see one vehicle within a second; without serialising them
 * both would find "no open visit" and open two, leaving a phantom visit that
 * never closes and a vehicle permanently "inside".
 *
 * THE LOCK IS ON THE PAIR, NOT ON THE ROW, AND THAT IS THE WHOLE POINT.
 *
 * This was `SELECT … FOR UPDATE` on the open visit, which reads as though it
 * serialises the pairing and does not: `FOR UPDATE` locks the rows a query
 * *returns*, and the case that has to be serialised is precisely the one that
 * returns none. Two concurrent arrivals for one plate both saw `open = null`,
 * both took zero locks, and both inserted an `open` visit — the exact phantom
 * the comment claimed to prevent. It is reachable in normal operation:
 * `MAX_INFLIGHT` is 2, OCR is a multi-second network call, and an entry/exit
 * camera pair sees one vehicle within a second.
 *
 * `pg_advisory_xact_lock` has no such gap — the lock exists whether or not a
 * row does — and it is held for the transaction, released on COMMIT or
 * ROLLBACK, and shared across control-plane replicas because it lives in
 * Postgres rather than in a process. The `FOR UPDATE` is kept as well: it costs
 * nothing under the advisory lock and keeps the row honest against any future
 * writer that does not take it.
 */
export async function applyRead(args: ApplyArgs): Promise<ApplyResult | null> {
  const { ownerId, plate, deviceId, readId, lane } = args;
  if (!plate) return null;
  const at = args.at ?? new Date();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    /*
     * Keyed on owner *and* plate so two different vehicles never wait on each
     * other, and the same vehicle at two gates always does. hashtext collides
     * at 1 in 4 billion, and a collision costs one pairing waiting briefly for
     * an unrelated one — not a wrong answer.
     */
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [
      `anpr-visit:${ownerId}:${plate}`,
    ]);

    const { rows } = await client.query<VisitRow>(
      `SELECT id, plate, entry_at, exit_at, entry_device, exit_device,
              entry_read_id, exit_read_id, status
         FROM plate_visits
        WHERE owner_id = $1 AND plate = $2 AND status = 'open'
        ORDER BY entry_at DESC NULLS LAST
        LIMIT 1
          FOR UPDATE`,
      [ownerId, plate]
    );
    const open = rows[0] ?? null;
    const direction = resolveDirection(lane, !!open);

    const result = direction === "in"
      ? await enter(client, ownerId, plate, deviceId, readId, at, open)
      : await leave(client, ownerId, plate, deviceId, readId, at, open);

    await client.query("COMMIT");
    return { direction, ...result };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error({ err, plate }, "anpr visit pairing failed");
    return null;
  } finally {
    client.release();
  }
}

async function enter(
  client: PoolClient,
  ownerId: number,
  plate: string,
  deviceId: string,
  readId: number | null,
  at: Date,
  open: VisitRow | null
): Promise<{ visitId: number | null; status: VisitStatus; durationSec: null }> {
  /*
   * Arriving while already recorded as inside means the departure was never
   * read. The previous visit is closed as `exit_missed` with NO exit time
   * rather than being back-filled with this arrival: inventing a departure
   * timestamp would produce a dwell figure that looks authoritative and is
   * fabricated, and dwell statistics are exactly what somebody would later
   * bill or audit against.
   */
  if (open) {
    await client.query(
      `UPDATE plate_visits SET status = 'exit_missed', updated_at = now() WHERE id = $1`,
      [open.id]
    );
  }

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO plate_visits (owner_id, plate, entry_at, entry_read_id, entry_device, status)
     VALUES ($1, $2, $3, $4, $5, 'open') RETURNING id`,
    [ownerId, plate, at, readId, deviceId]
  );
  return { visitId: Number(rows[0].id), status: "open", durationSec: null };
}

async function leave(
  client: PoolClient,
  ownerId: number,
  plate: string,
  deviceId: string,
  readId: number | null,
  at: Date,
  open: VisitRow | null
): Promise<{ visitId: number | null; status: VisitStatus; durationSec: number | null }> {
  /*
   * Leaving with nothing open means the arrival was never read — the vehicle
   * was already inside when the system started watching, or its entry was
   * missed. Recorded as a completed visit with a null entry so the departure
   * is not lost, and flagged so no dwell time is computed from a start that
   * was never observed.
   */
  if (!open) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO plate_visits (owner_id, plate, exit_at, exit_read_id, exit_device, status)
       VALUES ($1, $2, $3, $4, $5, 'entry_missed') RETURNING id`,
      [ownerId, plate, at, readId, deviceId]
    );
    return { visitId: Number(rows[0].id), status: "entry_missed", durationSec: null };
  }

  await client.query(
    `UPDATE plate_visits
        SET exit_at = $2, exit_read_id = $3, exit_device = $4,
            status = 'closed', updated_at = now()
      WHERE id = $1`,
    [open.id, at, readId, deviceId]
  );

  const entry = open.entry_at ? open.entry_at.getTime() : null;
  // Clamped at zero: clock skew between the API container and a read that
  // arrived out of order must not produce a negative stay.
  const durationSec = entry === null ? null : Math.max(0, Math.round((at.getTime() - entry) / 1000));
  return { visitId: Number(open.id), status: "closed", durationSec };
}

/** True when the plate currently has an open visit. */
export async function isInside(ownerId: number, plate: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM plate_visits WHERE owner_id = $1 AND plate = $2 AND status = 'open' LIMIT 1`,
    [ownerId, plate]
  );
  return rows.length > 0;
}

export interface VehicleSummary {
  plate: string;
  passes: number;
  entries: number;
  exits: number;
  firstSeen: string;
  lastSeen: string;
  inside: boolean;
  visits: number;
  /** Mean completed stay in seconds, or null when none has completed. */
  avgStaySec: number | null;
  totalStaySec: number;
  devices: string[];
  rule: string | null;
  label: string | null;
  lastConfidence: number;
}

/**
 * Every distinct vehicle this account has seen.
 *
 * Aggregated from reads and visits rather than kept in a denormalised
 * `vehicles` table. A counter table would have to be written on every read and
 * corrected on every retention sweep, and the first divergence would be
 * invisible — a vehicle showing 40 passes with 38 reads behind it, with no way
 * to tell which is right. Deriving is a little more work per query and cannot
 * drift.
 */
export async function listVehicles(ownerId: number, days: number, limit: number): Promise<VehicleSummary[]> {
  const { rows } = await pool.query<{
    plate: string; passes: string; entries: string; exits: string;
    first_seen: Date; last_seen: Date; devices: string[]; last_confidence: number;
    visits: string; open_visits: string; avg_stay: string | null; total_stay: string | null;
    rule_kind: string | null; rule_label: string | null;
  }>(
    `WITH r AS (
       SELECT plate,
              COUNT(*)                                              AS passes,
              COUNT(*) FILTER (WHERE direction = 'in')              AS entries,
              COUNT(*) FILTER (WHERE direction = 'out')             AS exits,
              MIN(ts)                                               AS first_seen,
              MAX(ts)                                               AS last_seen,
              ARRAY_AGG(DISTINCT device_id)                         AS devices,
              (ARRAY_AGG(confidence ORDER BY ts DESC))[1]           AS last_confidence
         FROM plate_reads
        WHERE owner_id = $1 AND plate <> '' AND ts >= now() - ($2 || ' days')::interval
        GROUP BY plate
     ),
     v AS (
       SELECT plate,
              COUNT(*)                                   AS visits,
              COUNT(*) FILTER (WHERE status = 'open')    AS open_visits,
              AVG(EXTRACT(EPOCH FROM (exit_at - entry_at)))
                FILTER (WHERE status = 'closed' AND entry_at IS NOT NULL)   AS avg_stay,
              SUM(EXTRACT(EPOCH FROM (exit_at - entry_at)))
                FILTER (WHERE status = 'closed' AND entry_at IS NOT NULL)   AS total_stay
         FROM plate_visits
        WHERE owner_id = $1
        GROUP BY plate
     )
     SELECT r.*,
            COALESCE(v.visits, 0)      AS visits,
            COALESCE(v.open_visits, 0) AS open_visits,
            v.avg_stay, v.total_stay,
            pr.kind  AS rule_kind,
            pr.label AS rule_label
       FROM r
       LEFT JOIN v ON v.plate = r.plate
       -- DISTINCT ON keeps one rule per plate: a device-scoped rule and a
       -- global one can both match, and duplicating the row would double the
       -- vehicle in the list.
       --
       -- The validity window is applied here as well as in decide(). Without
       -- it the register labels a vehicle "allow" or "deny" from a rule whose
       -- window lapsed at noon — a contractor's expired pass reading exactly
       -- like a permanent resident's, which Docs/20-anpr.md §8 says must not
       -- happen. The gate itself was never affected (decide() honours the
       -- window and the decision is stored per read); this is the screen
       -- somebody checks before believing the gate.
       LEFT JOIN LATERAL (
         SELECT kind, label FROM plate_rules
          WHERE owner_id = $1 AND plate = r.plate AND enabled
            AND (valid_from IS NULL OR valid_from <= now())
            AND (valid_to   IS NULL OR valid_to   >= now())
          ORDER BY CASE kind WHEN 'deny' THEN 0 WHEN 'allow' THEN 1 ELSE 2 END
          LIMIT 1
       ) pr ON true
      ORDER BY r.last_seen DESC
      LIMIT $3`,
    [ownerId, days, limit]
  );

  return rows.map((r) => ({
    plate: r.plate,
    passes: Number(r.passes),
    entries: Number(r.entries),
    exits: Number(r.exits),
    firstSeen: r.first_seen.toISOString(),
    lastSeen: r.last_seen.toISOString(),
    inside: Number(r.open_visits) > 0,
    visits: Number(r.visits),
    avgStaySec: r.avg_stay === null ? null : Math.round(Number(r.avg_stay)),
    totalStaySec: r.total_stay === null ? 0 : Math.round(Number(r.total_stay)),
    devices: r.devices ?? [],
    rule: r.rule_kind,
    label: r.rule_label,
    lastConfidence: Number(r.last_confidence ?? 0),
  }));
}

export interface VisitView {
  id: number;
  entryAt: string | null;
  exitAt: string | null;
  entryDevice: string | null;
  exitDevice: string | null;
  entryReadId: number | null;
  exitReadId: number | null;
  status: VisitStatus;
  durationSec: number | null;
}

/** Visit history for one plate, newest first. */
export async function visitsFor(ownerId: number, plate: string, limit: number): Promise<VisitView[]> {
  const { rows } = await pool.query<VisitRow>(
    `SELECT id, plate, entry_at, exit_at, entry_device, exit_device,
            entry_read_id, exit_read_id, status
       FROM plate_visits
      WHERE owner_id = $1 AND plate = $2
      ORDER BY COALESCE(entry_at, exit_at) DESC
      LIMIT $3`,
    [ownerId, plate, limit]
  );

  return rows.map((v) => ({
    id: Number(v.id),
    entryAt: v.entry_at ? v.entry_at.toISOString() : null,
    exitAt: v.exit_at ? v.exit_at.toISOString() : null,
    entryDevice: v.entry_device,
    exitDevice: v.exit_device,
    entryReadId: v.entry_read_id ? Number(v.entry_read_id) : null,
    exitReadId: v.exit_read_id ? Number(v.exit_read_id) : null,
    status: v.status as VisitStatus,
    // Only a visit with both ends observed has a duration. A missed read must
    // not be reported as a stay of zero, which reads as a real measurement.
    durationSec:
      v.entry_at && v.exit_at && v.status === "closed"
        ? Math.max(0, Math.round((v.exit_at.getTime() - v.entry_at.getTime()) / 1000))
        : null,
  }));
}
