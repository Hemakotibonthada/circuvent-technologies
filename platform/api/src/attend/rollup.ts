/**
 * The register: one row per person per day, derived from their scans.
 *
 * WHY IT IS STORED AND NOT COMPUTED ON READ
 *
 * Recomputing on read is tempting — the punches are the truth, and a derived
 * table can drift. Two things make it wrong here.
 *
 * The first is arithmetic: a monthly report for eight hundred people would
 * scan several million punch rows and re-derive the same answer every time
 * somebody refreshed a page.
 *
 * The second matters more. A register is a document. Somebody prints it,
 * signs it, and files it; a payroll run pays against it. A register that
 * silently changes when a schedule is edited three weeks later is not a
 * register, it is a query. So this is the record, the punches are the evidence
 * for it, and the recompute is a deliberate act with a visible result.
 *
 * MANUAL ROWS ARE NEVER OVERWRITTEN
 *
 * A head of year marking somebody present because the reader was broken is
 * making a judgement the data cannot make. If the next recompute reverted it,
 * the override would last exactly until the next scan arrived, and the person
 * who made it would have no way to know it had gone.
 */
import { pool } from "../db";
import { logger } from "../logger";
import {
  addDays,
  classifyDay,
  dayForPunch,
  eachDay,
  localMoment,
  minutesWithin,
  windowsFor,
  type DayPunch,
  type DayResult,
  type Schedule,
} from "./schedule";

export interface SiteSettings {
  id: number;
  ownerId: number;
  name: string;
  kind: string;
  timeZone: string;
  graceMinutes: number;
  halfDayAfterMinutes: number;
  absentAfterMinutes: number;
  autoOut: boolean;
  dedupeSeconds: number;
  notifyGuardians: boolean;
  notifyAbsence: boolean;
  /** When true, a card only opens a door if an approved access request covers today. */
  requireAccessRequest: boolean;
}

const SITE_COLUMNS = `id, owner_id, name, kind, timezone, grace_minutes,
                      half_day_after_minutes, absent_after_minutes, auto_out,
                      dedupe_seconds, notify_guardians, notify_absence, require_access_request`;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function siteShape(r: any): SiteSettings {
  return {
    id: Number(r.id),
    ownerId: Number(r.owner_id),
    name: r.name,
    kind: r.kind,
    timeZone: r.timezone,
    graceMinutes: r.grace_minutes,
    halfDayAfterMinutes: r.half_day_after_minutes,
    absentAfterMinutes: r.absent_after_minutes,
    autoOut: r.auto_out,
    dedupeSeconds: r.dedupe_seconds,
    notifyGuardians: r.notify_guardians,
    notifyAbsence: r.notify_absence,
    // Coerced rather than passed through: a site row read before the column
    // existed returns undefined, and undefined here would make the ingest ask
    // for an approval nobody could have granted.
    requireAccessRequest: r.require_access_request === true,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getSite(siteId: number): Promise<SiteSettings | null> {
  const { rows } = await pool.query(`SELECT ${SITE_COLUMNS} FROM attend_sites WHERE id = $1`, [
    siteId,
  ]);
  return rows[0] ? siteShape(rows[0]) : null;
}

/**
 * The schedule a person actually follows.
 *
 * Their own overrides their group's, which overrides nothing at all. The
 * fallback is a schedule with no windows — a person nobody has given a
 * timetable is not late, ever, because there is nothing to be late for. The
 * alternative, inventing a nine-to-five, would mark every visitor and
 * contractor late from the day they were added.
 */
export const NO_SCHEDULE: Schedule = {
  kind: "fixed",
  windows: {},
  graceMinutes: null,
  minMinutes: 0,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function scheduleShape(r: any): Schedule {
  return {
    kind: r.kind === "flexible" ? "flexible" : "fixed",
    windows: r.windows ?? {},
    graceMinutes: r.grace_minutes === null || r.grace_minutes === undefined ? null : Number(r.grace_minutes),
    minMinutes: Number(r.min_minutes ?? 0),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Every schedule on a site, by id. Loaded once per recompute rather than per person. */
export async function loadSchedules(siteId: number): Promise<Map<number, Schedule>> {
  const { rows } = await pool.query(
    `SELECT id, kind, windows, grace_minutes, min_minutes FROM attend_schedules WHERE site_id = $1`,
    [siteId]
  );
  const out = new Map<number, Schedule>();
  for (const r of rows) out.set(Number(r.id), scheduleShape(r));
  return out;
}

export interface RosterPerson {
  id: number;
  name: string;
  code: string;
  groupId: number | null;
  scheduleId: number | null;
  groupScheduleId: number | null;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
}

const PERSON_COLUMNS = `p.id, p.name, p.code, p.group_id, p.schedule_id, p.active,
                        to_char(p.valid_from, 'YYYY-MM-DD') AS valid_from,
                        to_char(p.valid_to, 'YYYY-MM-DD')   AS valid_to,
                        g.schedule_id AS group_schedule_id`;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function personShape(r: any): RosterPerson {
  return {
    id: Number(r.id),
    name: r.name,
    code: r.code,
    groupId: r.group_id === null ? null : Number(r.group_id),
    scheduleId: r.schedule_id === null ? null : Number(r.schedule_id),
    groupScheduleId: r.group_schedule_id === null || r.group_schedule_id === undefined ? null : Number(r.group_schedule_id),
    active: r.active,
    validFrom: r.valid_from,
    validTo: r.valid_to,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function scheduleForPerson(
  person: RosterPerson,
  schedules: Map<number, Schedule>
): Schedule {
  if (person.scheduleId && schedules.has(person.scheduleId)) return schedules.get(person.scheduleId)!;
  if (person.groupScheduleId && schedules.has(person.groupScheduleId)) {
    return schedules.get(person.groupScheduleId)!;
  }
  return NO_SCHEDULE;
}

/** People on the roll on a given day, with their group's schedule joined in. */
export async function loadRoster(siteId: number, day: string): Promise<RosterPerson[]> {
  const { rows } = await pool.query(
    `SELECT ${PERSON_COLUMNS}
       FROM attend_people p
       LEFT JOIN attend_groups g ON g.id = p.group_id
      WHERE p.site_id = $1
        AND p.active
        AND (p.valid_from IS NULL OR p.valid_from <= $2::date)
        AND (p.valid_to   IS NULL OR p.valid_to   >= $2::date)
      ORDER BY p.name`,
    [siteId, day]
  );
  return rows.map(personShape);
}

export interface LeaveCover {
  kind: string;
  countsAsPresent: boolean;
}

/**
 * Leave and closures covering a day, indexed by person.
 *
 * A row with neither a person nor a group is the whole site; one with a group
 * covers everybody in it. Resolved into a per-person map here so the classifier
 * — which is pure and knows nothing about groups — can be handed a single
 * answer.
 */
export async function loadLeave(
  siteId: number,
  day: string,
  roster: RosterPerson[]
): Promise<Map<number, LeaveCover>> {
  const { rows } = await pool.query(
    `SELECT person_id, group_id, kind, counts_as_present
       FROM attend_leaves
      WHERE site_id = $1 AND from_day <= $2::date AND to_day >= $2::date`,
    [siteId, day]
  );
  const out = new Map<number, LeaveCover>();
  const siteWide: LeaveCover[] = [];
  const byGroup = new Map<number, LeaveCover>();
  const byPerson = new Map<number, LeaveCover>();

  for (const r of rows) {
    const cover: LeaveCover = { kind: r.kind, countsAsPresent: r.counts_as_present };
    if (r.person_id !== null) byPerson.set(Number(r.person_id), cover);
    else if (r.group_id !== null) byGroup.set(Number(r.group_id), cover);
    else siteWide.push(cover);
  }

  for (const p of roster) {
    /*
     * Most specific wins. A person booked on leave during a site holiday is
     * on leave, not on holiday — which matters because one is deducted from
     * an allowance and the other is not.
     */
    const cover =
      byPerson.get(p.id) ??
      (p.groupId !== null ? byGroup.get(p.groupId) : undefined) ??
      siteWide[0];
    if (cover) out.set(p.id, cover);
  }
  return out;
}

/**
 * Recomputes the register for one day.
 *
 * Everybody on the roll, not only the people who scanned: an absence is
 * exactly the case where there is no punch to drive the work, and a recompute
 * that iterated over punches would never produce a single absent row.
 */
export async function recomputeDay(siteId: number, day: string, now = new Date()): Promise<number> {
  const site = await getSite(siteId);
  if (!site) return 0;

  const [schedules, roster] = await Promise.all([loadSchedules(siteId), loadRoster(siteId, day)]);
  if (!roster.length) return 0;
  const leave = await loadLeave(siteId, day, roster);

  /*
   * A window either side of the day, because a night shift's scans land on the
   * next calendar date and dayForPunch has to be able to pull them back.
   */
  const { rows: punchRows } = await pool.query(
    `SELECT p.person_id, p.direction, COALESCE(p.device_at, p.at) AS at
       FROM attend_punches p
       LEFT JOIN attend_zones z ON z.id = p.zone_id
      WHERE p.site_id = $1
        AND p.person_id IS NOT NULL
        AND p.granted
        AND COALESCE(z.counts_for_attendance, true)
        AND COALESCE(p.device_at, p.at) >= ($2::date - INTERVAL '1 day')
        AND COALESCE(p.device_at, p.at) <  ($2::date + INTERVAL '2 days')
      ORDER BY at ASC`,
    [siteId, day]
  );

  const byPerson = new Map<number, Array<{ at: Date; direction: "in" | "out" }>>();
  for (const r of punchRows) {
    const id = Number(r.person_id);
    if (!byPerson.has(id)) byPerson.set(id, []);
    byPerson.get(id)!.push({ at: new Date(r.at), direction: r.direction === "out" ? "out" : "in" });
  }

  const nowLocal = localMoment(now, site.timeZone);
  // Null tells the classifier the day is finished, which is what turns "not
  // here yet" into "absent".
  const nowMinutes = nowLocal.day === day ? nowLocal.minutes : nowLocal.day > day ? null : -1;

  let written = 0;
  for (const person of roster) {
    const schedule = scheduleForPerson(person, schedules);
    const windows = windowsFor(schedule, day);

    const dayPunches: DayPunch[] = [];
    for (const p of byPerson.get(person.id) ?? []) {
      const m = localMoment(p.at, site.timeZone);
      if (dayForPunch(m, schedule) !== day) continue;
      dayPunches.push({ minutes: minutesWithin(m, day), direction: p.direction });
    }

    /*
     * A day that has not started yet is left alone entirely.
     *
     * Writing "absent" rows for tomorrow would fill the register with
     * absences that have not happened, and any count of them would be wrong
     * until the day arrived.
     */
    if (nowMinutes === -1) continue;

    const result = classifyDay({
      schedule,
      windows,
      punches: dayPunches,
      graceMinutes: site.graceMinutes,
      halfDayAfterMinutes: site.halfDayAfterMinutes,
      absentAfterMinutes: site.absentAfterMinutes,
      nowMinutes,
      autoOut: site.autoOut,
      leave: leave.get(person.id) ?? null,
    });

    await writeDay(siteId, person.id, day, result, site.timeZone);
    written++;
  }
  return written;
}

/** Minutes-since-local-midnight back to an instant, for storage. */
function instantFor(day: string, minutes: number | null, timeZone: string): Date | null {
  if (minutes === null) return null;
  /*
   * Found by search rather than by offset arithmetic.
   *
   * Converting a wall-clock time in a named zone to an instant has no closed
   * form — the offset depends on the instant being solved for. Guessing UTC,
   * measuring how far off the guess lands in local terms and correcting
   * converges in one step everywhere except the hour a clock jumps, where a
   * second pass settles it.
   */
  const [y, mo, d] = day.split("-").map(Number);
  let guess = Date.UTC(y, mo - 1, d) + minutes * 60_000;
  for (let i = 0; i < 2; i++) {
    const got = localMoment(new Date(guess), timeZone);
    const gotMinutes =
      got.day === day
        ? got.minutes
        : got.day > day
          ? got.minutes + 1440
          : got.minutes - 1440;
    const drift = minutes - gotMinutes;
    if (drift === 0) break;
    guess += drift * 60_000;
  }
  return new Date(guess);
}

async function writeDay(
  siteId: number,
  personId: number,
  day: string,
  r: DayResult,
  timeZone: string
): Promise<void> {
  await pool.query(
    `INSERT INTO attend_days (site_id, person_id, day, status, first_in, last_out,
                              worked_minutes, late_minutes, early_minutes, punches,
                              assumed_out, source, updated_at)
     VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, 'auto', now())
     ON CONFLICT (person_id, day) DO UPDATE SET
       status = EXCLUDED.status,
       first_in = EXCLUDED.first_in,
       last_out = EXCLUDED.last_out,
       worked_minutes = EXCLUDED.worked_minutes,
       late_minutes = EXCLUDED.late_minutes,
       early_minutes = EXCLUDED.early_minutes,
       punches = EXCLUDED.punches,
       assumed_out = EXCLUDED.assumed_out,
       updated_at = now()
     WHERE attend_days.source <> 'manual'`,
    [
      siteId,
      personId,
      day,
      r.status,
      instantFor(day, r.firstIn, timeZone),
      instantFor(day, r.lastOut, timeZone),
      r.workedMinutes,
      r.lateMinutes,
      r.earlyMinutes,
      r.punches,
      r.assumedOut,
    ]
  );
}

/** Recomputes one person's day. Used after a single punch lands. */
export async function recomputePerson(
  siteId: number,
  personId: number,
  day: string,
  now = new Date()
): Promise<void> {
  const site = await getSite(siteId);
  if (!site) return;
  const schedules = await loadSchedules(siteId);
  const { rows } = await pool.query(
    `SELECT ${PERSON_COLUMNS}
       FROM attend_people p
       LEFT JOIN attend_groups g ON g.id = p.group_id
      WHERE p.id = $1 AND p.site_id = $2`,
    [personId, siteId]
  );
  if (!rows[0]) return;
  const person = personShape(rows[0]);
  const leave = await loadLeave(siteId, day, [person]);
  const schedule = scheduleForPerson(person, schedules);

  const { rows: punchRows } = await pool.query(
    `SELECT p.direction, COALESCE(p.device_at, p.at) AS at
       FROM attend_punches p
       LEFT JOIN attend_zones z ON z.id = p.zone_id
      WHERE p.person_id = $1
        AND p.granted
        AND COALESCE(z.counts_for_attendance, true)
        AND COALESCE(p.device_at, p.at) >= ($2::date - INTERVAL '1 day')
        AND COALESCE(p.device_at, p.at) <  ($2::date + INTERVAL '2 days')
      ORDER BY at ASC`,
    [personId, day]
  );

  const dayPunches: DayPunch[] = [];
  for (const r of punchRows) {
    const m = localMoment(new Date(r.at), site.timeZone);
    if (dayForPunch(m, schedule) !== day) continue;
    dayPunches.push({
      minutes: minutesWithin(m, day),
      direction: r.direction === "out" ? "out" : "in",
    });
  }

  const nowLocal = localMoment(now, site.timeZone);
  const nowMinutes = nowLocal.day === day ? nowLocal.minutes : nowLocal.day > day ? null : -1;
  if (nowMinutes === -1) return;

  const result = classifyDay({
    schedule,
    windows: windowsFor(schedule, day),
    punches: dayPunches,
    graceMinutes: site.graceMinutes,
    halfDayAfterMinutes: site.halfDayAfterMinutes,
    absentAfterMinutes: site.absentAfterMinutes,
    nowMinutes,
    autoOut: site.autoOut,
    leave: leave.get(person.id) ?? null,
  });
  await writeDay(siteId, person.id, day, result, site.timeZone);
}

/** Recomputes a span. Bounded by eachDay so a typo cannot start a year of work. */
export async function recomputeRange(siteId: number, from: string, to: string): Promise<number> {
  let total = 0;
  for (const day of eachDay(from, to)) {
    total += await recomputeDay(siteId, day);
  }
  return total;
}

/**
 * The day it is, in a site's own terms.
 *
 * Every report defaults to "today", and today at 00:30 in Kolkata is still
 * yesterday on a server in UTC. Asking the site rather than the server is the
 * difference between a register that opens on the right page and one that is
 * wrong for five and a half hours a day.
 */
export function siteToday(site: SiteSettings, now = new Date()): string {
  return localMoment(now, site.timeZone).day;
}

/** Yesterday, for the overnight sweep. */
export function sitePreviousDay(site: SiteSettings, now = new Date()): string {
  return addDays(siteToday(site, now), -1);
}

/**
 * Rolls every site's register forward.
 *
 * Runs on a timer because most of what a register says is not caused by an
 * event: nobody scans to become absent, and a day does not close itself. Two
 * days are recomputed rather than one so a late replay from a terminal that
 * was offline overnight lands in the right place.
 */
export async function sweepRegisters(now = new Date()): Promise<void> {
  try {
    const { rows } = await pool.query(`SELECT ${SITE_COLUMNS} FROM attend_sites`);
    for (const row of rows) {
      const site = siteShape(row);
      const today = siteToday(site, now);
      try {
        await recomputeDay(site.id, today, now);
        await recomputeDay(site.id, addDays(today, -1), now);
      } catch (err) {
        logger.error({ err, siteId: site.id }, "attendance sweep failed for site");
      }
    }
  } catch (err) {
    logger.error({ err }, "attendance sweep failed");
  }
}
