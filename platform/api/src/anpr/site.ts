import { pool, recordEvent } from "../db";
import { logger } from "../logger";
import { sendPushToHome } from "../push";
import { prettyPlate } from "./plate";

/**
 * Site policy: how many vehicles are here, is the site full, and has anyone
 * outstayed their welcome.
 *
 * This is the layer above a single read. `visits.ts` answers "when did this
 * vehicle arrive and leave"; this answers "what is the state of the site right
 * now", which is the question a gate operator, a parking manager or a security
 * desk actually opens the console to ask.
 *
 * EVERYTHING HERE IS OFF BY DEFAULT
 *
 * Capacity, overstay and unknown-vehicle alerts are all opt-in and nullable.
 * A customer who bought a camera to see who came to their house must not
 * discover capacity management by having their gate start behaving differently,
 * and an alert nobody asked for is indistinguishable from a bug.
 */

export interface AnprSettings {
  capacity: number | null;
  overstayHours: number | null;
  alertUnknown: boolean;
  alertFull: boolean;
  /** Where the daily report goes. Null means no report is sent at all. */
  reportEmail: string | null;
  /** Hour of day in IST, matching the automation scheduler's zone. */
  reportHour: number;
}

export const DEFAULT_SETTINGS: AnprSettings = {
  capacity: null,
  overstayHours: null,
  alertUnknown: false,
  alertFull: true,
  reportEmail: null,
  reportHour: 7,
};

interface SettingsRow {
  capacity: number | null;
  overstay_hours: number | null;
  alert_unknown: boolean;
  alert_full: boolean;
  report_email: string | null;
  report_hour: number;
}

export async function getSettings(ownerId: number): Promise<AnprSettings> {
  const { rows } = await pool.query<SettingsRow>(
    `SELECT capacity, overstay_hours, alert_unknown, alert_full, report_email, report_hour
       FROM anpr_settings WHERE owner_id = $1`,
    [ownerId]
  );
  const r = rows[0];
  if (!r) return { ...DEFAULT_SETTINGS };
  return {
    capacity: r.capacity,
    overstayHours: r.overstay_hours,
    alertUnknown: r.alert_unknown,
    alertFull: r.alert_full,
    reportEmail: r.report_email,
    // A row written before this column existed reads null; fall back rather
    // than letting an undefined hour match every sweep or none.
    reportHour: r.report_hour ?? DEFAULT_SETTINGS.reportHour,
  };
}

export async function saveSettings(ownerId: number, s: Partial<AnprSettings>): Promise<AnprSettings> {
  const current = await getSettings(ownerId);
  const next: AnprSettings = { ...current, ...s };
  await pool.query(
    `INSERT INTO anpr_settings (owner_id, capacity, overstay_hours, alert_unknown, alert_full,
                                report_email, report_hour, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (owner_id) DO UPDATE
        SET capacity = EXCLUDED.capacity,
            overstay_hours = EXCLUDED.overstay_hours,
            alert_unknown = EXCLUDED.alert_unknown,
            alert_full = EXCLUDED.alert_full,
            report_email = EXCLUDED.report_email,
            report_hour = EXCLUDED.report_hour,
            updated_at = now()`,
    [ownerId, next.capacity, next.overstayHours, next.alertUnknown, next.alertFull, next.reportEmail, next.reportHour]
  );
  return next;
}

export interface Occupancy {
  inside: number;
  capacity: number | null;
  /** Free spaces, or null when capacity is not managed. */
  free: number | null;
  full: boolean;
  /** 0-100, or null without a capacity. */
  percent: number | null;
}

/**
 * How many vehicles are on the site.
 *
 * Counted from open visits rather than kept as a running total. A counter
 * would need incrementing on entry and decrementing on exit, and a single
 * missed read — which is routine here — would bias it permanently, with no way
 * to tell a real occupancy of 12 from a drifted one. Counting open visits is
 * self-correcting: the retention sweep closes out stale visits, so the number
 * heals instead of accumulating error.
 */
export async function occupancy(ownerId: number): Promise<Occupancy> {
  const [{ rows }, settings] = await Promise.all([
    pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM plate_visits WHERE owner_id = $1 AND status = 'open'`,
      [ownerId]
    ),
    getSettings(ownerId),
  ]);
  const inside = Number(rows[0]?.n ?? 0);
  const capacity = settings.capacity;
  return {
    inside,
    capacity,
    free: capacity == null ? null : Math.max(0, capacity - inside),
    full: capacity != null && inside >= capacity,
    percent: capacity == null || capacity === 0 ? null : Math.min(100, Math.round((inside / capacity) * 100)),
  };
}

/**
 * Has this account ever seen this plate before the read that just landed?
 *
 * `excludeReadId` matters: the read is inserted before this is asked, so
 * without excluding it every vehicle would look like a returning one and the
 * alert would never fire. Uses the (owner_id, plate, ts) index, so it is a
 * lookup rather than a scan.
 */
export async function isFirstSighting(
  ownerId: number,
  plate: string,
  excludeReadId: number | null
): Promise<boolean> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM plate_reads
      WHERE owner_id = $1 AND plate = $2 AND ($3::bigint IS NULL OR id <> $3)`,
    [ownerId, plate, excludeReadId]
  );
  return Number(rows[0]?.n ?? 0) === 0;
}

/**
 * Accounts currently announced as full.
 *
 * The latch that makes the "site is full" alert edge-triggered. In memory
 * rather than in a column because it is a notification-suppression detail, not
 * a fact about the site: a control plane that restarts announcing a full site
 * once more is a far smaller failure than one that reads and writes a row on
 * every arrival to avoid it. Bounded by the number of accounts that have both
 * a capacity set and a full site.
 */
const fullAlerted = new Set<number>();

/**
 * Announces occupancy consequences for a vehicle that has just arrived.
 *
 * Edge-triggered: the "site is full" alert fires on the transition into full,
 * not on every arrival while full. A gate that is full for an afternoon would
 * otherwise send an alert per car, and by the third one nobody is reading them.
 * That is the same rule every state trigger in automations.ts follows.
 */
export async function onVehicleEntered(
  ownerId: number,
  plate: string,
  deviceId: string,
  wasFirstSighting: boolean
): Promise<void> {
  try {
    const settings = await getSettings(ownerId);
    const name = prettyPlate(plate);

    if (settings.alertUnknown && wasFirstSighting) {
      await recordEvent(
        ownerId,
        "security",
        "Unrecognised vehicle",
        `${name} has not been here before.`,
        deviceId
      );
      await sendPushToHome(
        ownerId,
        {
          title: "Unrecognised vehicle",
          body: `${name} has not been here before.`,
        },
        "adults"
      );
    }

    if (settings.capacity == null || !settings.alertFull) return;

    const { inside } = await occupancy(ownerId);
    /*
     * Fires on crossing the line, not on landing exactly on it.
     *
     * This was `inside === capacity`, which reads as an edge trigger and is
     * not one: `inside` is a live COUNT of open visits, not a counter stepped
     * by one. Two arrivals processed concurrently (MAX_INFLIGHT is 2), or a
     * missed exit resolving, move it from capacity-1 to capacity+1 without
     * ever being equal to capacity — and the alert the operator relies on
     * silently never arrived for that fill.
     *
     * Latched instead, in the same way overstay is: announced once when the
     * site becomes full, and re-armed only after occupancy drops back below
     * capacity. An alert that repeats on every arrival while a car park is
     * full gets muted, and a muted channel is where the next real alert dies.
     */
    if (inside < settings.capacity) {
      fullAlerted.delete(ownerId);
      return;
    }
    if (fullAlerted.has(ownerId)) return;
    fullAlerted.add(ownerId);

    {
      await recordEvent(
        ownerId,
        "alert",
        "Site is full",
        `${inside} of ${settings.capacity} spaces are taken.`,
        deviceId
      );
      await sendPushToHome(
        ownerId,
        {
          title: "Site is full",
          body: `${inside} of ${settings.capacity} spaces are taken.`,
        },
        "residents"
      );
    }
  } catch (err) {
    logger.error({ err, plate }, "anpr occupancy notification failed");
  }
}

export interface Overstay {
  visitId: number;
  plate: string;
  entryAt: string;
  hours: number;
  deviceId: string | null;
}

/**
 * Vehicles that have been inside longer than the account allows.
 *
 * Read-only; `sweepOverstays` does the alerting. Split so the console can show
 * the list without the act of looking at it marking anything as alerted.
 */
export async function listOverstays(ownerId: number): Promise<Overstay[]> {
  const settings = await getSettings(ownerId);
  if (settings.overstayHours == null) return [];
  const { rows } = await pool.query<{
    id: string; plate: string; entry_at: Date; entry_device: string | null; hours: string;
  }>(
    `SELECT id, plate, entry_at, entry_device,
            EXTRACT(EPOCH FROM (now() - entry_at)) / 3600 AS hours
       FROM plate_visits
      WHERE owner_id = $1 AND status = 'open' AND entry_at IS NOT NULL
        AND entry_at < now() - ($2 || ' hours')::interval
      ORDER BY entry_at`,
    [ownerId, settings.overstayHours]
  );
  return rows.map((r) => ({
    visitId: Number(r.id),
    plate: r.plate,
    entryAt: r.entry_at.toISOString(),
    hours: Math.floor(Number(r.hours)),
    deviceId: r.entry_device,
  }));
}

/**
 * Alerts on vehicles that have overstayed, once each.
 *
 * Runs across every account that has configured a limit, so it is one query
 * for the whole fleet rather than one per user — this runs on a timer on a VM
 * that may have a single vCPU.
 *
 * `overstay_alerted_at` is stamped in the same statement that selects the rows,
 * so two overlapping sweeps cannot both alert on the same visit.
 */
export async function sweepOverstays(): Promise<number> {
  try {
    const { rows } = await pool.query<{
      id: string; owner_id: string; plate: string; entry_device: string | null; hours: string;
    }>(
      `UPDATE plate_visits v
          SET overstay_alerted_at = now()
         FROM anpr_settings s
        WHERE v.owner_id = s.owner_id
          AND v.status = 'open'
          AND v.overstay_alerted_at IS NULL
          AND s.overstay_hours IS NOT NULL
          AND v.entry_at IS NOT NULL
          AND v.entry_at < now() - (s.overstay_hours || ' hours')::interval
      RETURNING v.id, v.owner_id, v.plate, v.entry_device,
                EXTRACT(EPOCH FROM (now() - v.entry_at)) / 3600 AS hours`
    );

    for (const r of rows) {
      const name = prettyPlate(r.plate);
      const hours = Math.floor(Number(r.hours));
      const body = `${name} has been on site for ${hours} hour${hours === 1 ? "" : "s"}.`;
      await recordEvent(Number(r.owner_id), "alert", "Vehicle overstay", body, r.entry_device);
      await sendPushToHome(Number(r.owner_id), { title: "Vehicle overstay", body }, "adults");
    }
    return rows.length;
  } catch (err) {
    logger.error({ err }, "anpr overstay sweep failed");
    return 0;
  }
}
