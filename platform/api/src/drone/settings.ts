/**
 * Per-account drone policy, and the battery register.
 *
 * WHY BATTERIES ARE FIRST-CLASS OBJECTS HERE
 *
 * A lithium-polymer pack is the only part of a multirotor that wears out on a
 * schedule anybody can act on. Motors and ESCs mostly fail suddenly or not at
 * all; a pack degrades predictably over a couple of hundred charge cycles,
 * loses the ability to hold voltage under load, and then one day sags below
 * the point where the aircraft can stay in the air — usually on the last leg
 * home, because that is when it is emptiest.
 *
 * Tracking hours against the *airframe* cannot see this: the pack that did 190
 * cycles and the pack that did 6 are the same aircraft. Tracking cycles
 * against the *pack* is how the whole industry manages it, and it is what
 * turns "something on this drone is getting old" into "retire this pack".
 */

import { pool } from "../db";
import { logger } from "../logger";

export interface DroneSettings {
  maxAltM: number;
  maxRangeM: number;
  minBattPct: number;
  operatorId: string | null;
  reportEmail: string | null;
  reportHour: number;
  alertFailsafe: boolean;
  alertFence: boolean;
  alertLowBatt: boolean;
}

export const DEFAULT_SETTINGS: DroneSettings = {
  maxAltM: 120,
  maxRangeM: 500,
  minBattPct: 25,
  operatorId: null,
  reportEmail: null,
  reportHour: 7,
  alertFailsafe: true,
  alertFence: true,
  alertLowBatt: true,
};

interface SettingsRow {
  max_alt_m: number;
  max_range_m: number;
  min_batt_pct: number;
  operator_id: string | null;
  report_email: string | null;
  report_hour: number;
  alert_failsafe: boolean;
  alert_fence: boolean;
  alert_low_batt: boolean;
}

function fromRow(r: SettingsRow): DroneSettings {
  return {
    maxAltM: Number(r.max_alt_m),
    maxRangeM: Number(r.max_range_m),
    minBattPct: Number(r.min_batt_pct),
    operatorId: r.operator_id,
    reportEmail: r.report_email,
    reportHour: Number(r.report_hour),
    alertFailsafe: r.alert_failsafe,
    alertFence: r.alert_fence,
    alertLowBatt: r.alert_low_batt,
  };
}

export async function getSettings(ownerId: number): Promise<DroneSettings> {
  const { rows } = await pool.query<SettingsRow>(
    `SELECT * FROM drone_settings WHERE owner_id = $1`,
    [ownerId]
  );
  return rows[0] ? fromRow(rows[0]) : { ...DEFAULT_SETTINGS };
}

export async function saveSettings(
  ownerId: number,
  patch: Partial<DroneSettings>
): Promise<DroneSettings> {
  const cur = await getSettings(ownerId);
  const next: DroneSettings = { ...cur, ...patch };

  // Clamps, not rejections: a settings form that silently keeps an out-of-range
  // value is worse than one that visibly pins it to the edge.
  next.maxAltM = Math.min(Math.max(Math.round(next.maxAltM), 5), 500);
  next.maxRangeM = Math.min(Math.max(Math.round(next.maxRangeM), 10), 20000);
  next.minBattPct = Math.min(Math.max(Math.round(next.minBattPct), 0), 90);
  next.reportHour = Math.min(Math.max(Math.round(next.reportHour), 0), 23);

  const { rows } = await pool.query<SettingsRow>(
    `INSERT INTO drone_settings
       (owner_id, max_alt_m, max_range_m, min_batt_pct, operator_id,
        report_email, report_hour, alert_failsafe, alert_fence, alert_low_batt, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     ON CONFLICT (owner_id) DO UPDATE SET
       max_alt_m = EXCLUDED.max_alt_m,
       max_range_m = EXCLUDED.max_range_m,
       min_batt_pct = EXCLUDED.min_batt_pct,
       operator_id = EXCLUDED.operator_id,
       report_email = EXCLUDED.report_email,
       report_hour = EXCLUDED.report_hour,
       alert_failsafe = EXCLUDED.alert_failsafe,
       alert_fence = EXCLUDED.alert_fence,
       alert_low_batt = EXCLUDED.alert_low_batt,
       updated_at = now()
     RETURNING *`,
    [
      ownerId,
      next.maxAltM,
      next.maxRangeM,
      next.minBattPct,
      next.operatorId,
      next.reportEmail,
      next.reportHour,
      next.alertFailsafe,
      next.alertFence,
      next.alertLowBatt,
    ]
  );
  return rows[0] ? fromRow(rows[0]) : next;
}

// ---------------------------------------------------------------------------
// Batteries
// ---------------------------------------------------------------------------

export interface Battery {
  id: string;
  label: string;
  cells: number;
  capacityMah: number;
  cycles: number;
  retireAt: number;
  firstUsed: string | null;
  lastUsed: string | null;
  retired: boolean;
  notes: string | null;
  /** Fraction of rated life used, 0..1+. */
  wear: number;
  health: "good" | "ageing" | "retire";
}

/**
 * Health bands.
 *
 * 80% of rated cycles is "ageing" rather than "retire" because the useful
 * response to it is to stop putting that pack on the long jobs — not to bin
 * it. A binary good/bad flag gives an operator nothing to do until the day it
 * flips, which in practice means the pack flies until it fails.
 */
function bandFor(cycles: number, retireAt: number): { wear: number; health: Battery["health"] } {
  const limit = retireAt > 0 ? retireAt : 200;
  const wear = cycles / limit;
  if (wear >= 1) return { wear, health: "retire" };
  if (wear >= 0.8) return { wear, health: "ageing" };
  return { wear, health: "good" };
}

interface BatteryRow {
  id: string;
  label: string;
  cells: number;
  capacity_mah: number;
  cycles: number;
  retire_at: number;
  first_used: string | null;
  last_used: string | null;
  retired: boolean;
  notes: string | null;
}

function toBattery(r: BatteryRow): Battery {
  const cycles = Number(r.cycles) || 0;
  const retireAt = Number(r.retire_at) || 200;
  const { wear, health } = bandFor(cycles, retireAt);
  return {
    id: String(r.id),
    label: r.label,
    cells: Number(r.cells),
    capacityMah: Number(r.capacity_mah),
    cycles,
    retireAt,
    firstUsed: r.first_used,
    lastUsed: r.last_used,
    retired: r.retired,
    notes: r.notes,
    wear,
    health,
  };
}

export async function listBatteries(ownerId: number): Promise<Battery[]> {
  const { rows } = await pool.query<BatteryRow>(
    `SELECT * FROM drone_batteries WHERE owner_id = $1 ORDER BY retired, label`,
    [ownerId]
  );
  return rows.map(toBattery);
}

export async function addBattery(
  ownerId: number,
  b: { label: string; cells?: number; capacityMah?: number; retireAt?: number; notes?: string }
): Promise<Battery | null> {
  const label = b.label.trim();
  if (!label) return null;
  const { rows } = await pool.query<BatteryRow>(
    `INSERT INTO drone_batteries (owner_id, label, cells, capacity_mah, retire_at, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      ownerId,
      label.slice(0, 60),
      Math.min(Math.max(b.cells ?? 4, 1), 14),
      Math.min(Math.max(b.capacityMah ?? 5000, 100), 100000),
      Math.min(Math.max(b.retireAt ?? 200, 10), 5000),
      b.notes?.slice(0, 500) ?? null,
    ]
  );
  return rows[0] ? toBattery(rows[0]) : null;
}

export async function updateBattery(
  ownerId: number,
  id: string,
  patch: { label?: string; retireAt?: number; retired?: boolean; notes?: string; cycles?: number }
): Promise<Battery | null> {
  const { rows } = await pool.query<BatteryRow>(
    `UPDATE drone_batteries
        SET label     = COALESCE($3, label),
            retire_at = COALESCE($4, retire_at),
            retired   = COALESCE($5, retired),
            notes     = COALESCE($6, notes),
            cycles    = COALESCE($7, cycles)
      WHERE id = $1 AND owner_id = $2 RETURNING *`,
    [
      id,
      ownerId,
      patch.label?.slice(0, 60) ?? null,
      patch.retireAt === undefined ? null : Math.min(Math.max(patch.retireAt, 10), 5000),
      patch.retired === undefined ? null : patch.retired,
      patch.notes?.slice(0, 500) ?? null,
      // Editable because a pack bought second-hand, or one flown before this
      // system existed, has a history the log cannot reconstruct. Refusing to
      // let it be set would mean the count is wrong forever and everyone learns
      // to ignore it.
      patch.cycles === undefined ? null : Math.min(Math.max(patch.cycles, 0), 10000),
    ]
  );
  return rows[0] ? toBattery(rows[0]) : null;
}

export async function deleteBattery(ownerId: number, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM drone_batteries WHERE id = $1 AND owner_id = $2`,
    [id, ownerId]
  );
  return (rowCount ?? 0) > 0;
}

/** Assign a pack to a flight, so landing credits a cycle to it. */
export async function assignBattery(
  ownerId: number,
  flightId: string,
  batteryId: string | null
): Promise<boolean> {
  try {
    const { rowCount } = await pool.query(
      `UPDATE flights SET battery_id = $3, updated_at = now()
        WHERE id = $1 AND owner_id = $2`,
      [flightId, ownerId, batteryId]
    );
    return (rowCount ?? 0) > 0;
  } catch (err) {
    logger.error({ err, flightId }, "battery assign failed");
    return false;
  }
}
