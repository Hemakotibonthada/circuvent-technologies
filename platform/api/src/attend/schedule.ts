/**
 * When people are expected, and what a day's scans add up to.
 *
 * Pure arithmetic. Nothing here touches the database, the clock or the
 * network, which is what lets a school's entire register be tested — night
 * shifts, half days, the morning the clocks changed — without a single row
 * existing anywhere.
 *
 * WHY EVERYTHING IS MINUTES SINCE LOCAL MIDNIGHT
 *
 * Attendance is a wall-clock question. "Late" means after 08:45 in the
 * building, and it stays 08:45 through a daylight-saving change that moves the
 * building an hour relative to UTC. Doing the comparison in UTC and
 * subtracting a stored offset is right for half the year in most of the world,
 * and the day it breaks is a Monday morning in spring with every arrival
 * marked late.
 *
 * So there is exactly one timezone-aware step — turning an instant into the
 * local date and the minute of that local day — and it is done by Intl, which
 * knows the rules and is updated with them. Everything after it is integer
 * arithmetic on minutes, where there is nothing left to get wrong.
 */

/** A working window, in minutes from local midnight. `end` may exceed 1440. */
export interface Window {
  start: number;
  end: number;
}

/**
 * A schedule as it is stored: one entry per weekday, 0 = Sunday.
 *
 *   { "1": [{ "in": "08:30", "out": "15:30" }], "6": [] }
 *
 * A weekday that is absent, or present and empty, is a non-working day for
 * whoever follows this schedule. That is how a four-day week, a Saturday
 * school and a rotating shift are one feature rather than three.
 */
export type ScheduleWindows = Record<string, Array<{ in: string; out: string }>>;

export interface Schedule {
  kind: "fixed" | "flexible";
  windows: ScheduleWindows;
  /** Minutes after a window opens that still count as on time. Null = site default. */
  graceMinutes: number | null;
  /** For flexible schedules: the minutes that make a full day. */
  minMinutes: number;
}

export const MINUTES_PER_DAY = 1440;

/** "08:30" → 510. Null for anything that is not a time. */
export function parseHHMM(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 510 → "08:30". Minutes past a day wrap, so 1530 reads as "01:30". */
export function formatHHMM(minutes: number): string {
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/*
 * Formatters are expensive to construct and are asked for the same handful of
 * zones over and over — a register for eight hundred people would otherwise
 * build eight hundred of them.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

const FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
};

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-GB", { ...FORMAT_OPTIONS, timeZone });
    } catch {
      /*
       * An unknown zone falls back to UTC rather than throwing.
       *
       * This is reached with whatever string is in the site row, and a typo
       * there must not be able to take down every register in the system. UTC
       * is visibly wrong in a way somebody notices and fixes; a 500 on the
       * attendance page is not obviously about a timezone at all.
       */
      f = new Intl.DateTimeFormat("en-GB", { ...FORMAT_OPTIONS, timeZone: "UTC" });
    }
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export interface LocalMoment {
  /** "2026-08-18" in the site's zone. */
  day: string;
  /** 0 = Sunday. */
  weekday: number;
  /** Minutes since local midnight. */
  minutes: number;
}

/** An instant, as the building experiences it. The only timezone-aware step. */
export function localMoment(at: Date | string | number, timeZone: string): LocalMoment {
  const d = at instanceof Date ? at : new Date(at);
  const parts = formatterFor(timeZone).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  const minutes = Number(get("hour")) % 24 * 60 + Number(get("minute"));
  return { day, weekday: WEEKDAYS[get("weekday")] ?? 0, minutes };
}

/** "2026-08-18" → 2 (Tuesday). Calendar arithmetic; no zone involved. */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Adds days to an ISO date string. */
export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Every date from `from` to `to` inclusive. Bounded so a typo cannot hang. */
export function eachDay(from: string, to: string, max = 400): string[] {
  const out: string[] = [];
  let d = from;
  while (d <= to && out.length < max) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/**
 * The windows a schedule defines for one calendar day.
 *
 * A window whose end is at or before its start runs through midnight — a night
 * shift clocking on at 22:00 and off at 06:00 — and its end is expressed as
 * minutes past *that day's* midnight, so 06:00 becomes 1800. Keeping it on one
 * number line is what lets every comparison below stay a subtraction.
 */
export function windowsFor(schedule: Schedule, day: string): Window[] {
  const list = schedule.windows?.[String(weekdayOf(day))];
  if (!Array.isArray(list)) return [];
  const out: Window[] = [];
  for (const w of list) {
    const start = parseHHMM(w?.in);
    const end = parseHHMM(w?.out);
    if (start === null || end === null) continue;
    out.push({ start, end: end <= start ? end + MINUTES_PER_DAY : end });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** True when anybody on this schedule is expected on this date at all. */
export function isWorkingDay(schedule: Schedule, day: string): boolean {
  return windowsFor(schedule, day).length > 0;
}

/**
 * Which day's register a scan belongs to.
 *
 * Normally the local date it happened on. The exception is a shift that
 * crosses midnight: somebody clocking off at 02:00 on Tuesday finished
 * Monday's shift, and filing that scan under Tuesday would leave Monday
 * looking like a day nobody went home and Tuesday like a day people left
 * before they arrived.
 */
export function dayForPunch(moment: LocalMoment, schedule: Schedule): string {
  const previous = addDays(moment.day, -1);
  for (const w of windowsFor(schedule, previous)) {
    // The previous day's window only reaches into this one if it wrapped.
    if (w.end > MINUTES_PER_DAY && moment.minutes + MINUTES_PER_DAY <= w.end) return previous;
  }
  return moment.day;
}

/**
 * Minutes since the midnight that starts `day`.
 *
 * For an ordinary scan this is just `moment.minutes`. For the tail of a night
 * shift — a scan on the following calendar date that belongs to this day — it
 * continues past 1440 onto the same number line the windows use.
 */
export function minutesWithin(moment: LocalMoment, day: string): number {
  return moment.day === day ? moment.minutes : moment.minutes + MINUTES_PER_DAY;
}

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

export type DayStatus =
  | "present"
  | "late"
  | "absent"
  | "half"
  | "leave"
  | "holiday"
  | "weekend"
  /** The day is not over and nothing has happened yet. Not the same as absent. */
  | "unknown";

/** One scan, reduced to what classification needs. */
export interface DayPunch {
  /** Minutes since the local midnight that starts the day being classified. */
  minutes: number;
  direction: "in" | "out";
}

export interface ClassifyOptions {
  schedule: Schedule;
  /** The windows that apply to this person on this day. */
  windows: Window[];
  punches: DayPunch[];
  /** Site default, used when the schedule does not override it. */
  graceMinutes: number;
  /** Arriving this long after the window opens is a half day, not lateness. */
  halfDayAfterMinutes: number;
  /** Absent is only asserted once the day is this far past the window opening. */
  absentAfterMinutes: number;
  /** Minutes since local midnight *now*, or null when the day is finished. */
  nowMinutes: number | null;
  /** Close an unfinished day at the window's end rather than leaving it open. */
  autoOut: boolean;
  /** A leave or closure covering this day, if any. */
  leave?: { kind: string; countsAsPresent: boolean } | null;
}

export interface DayResult {
  status: DayStatus;
  firstIn: number | null;
  lastOut: number | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  punches: number;
  assumedOut: boolean;
}

/**
 * What one person's day amounts to.
 *
 * The order of the checks is the policy, and it is deliberate: a closure
 * outranks a personal absence, an authorised absence outranks lateness, and
 * "we do not know yet" outranks "absent" until the day has run far enough that
 * absence is a fact rather than a guess. Getting that last one wrong is how a
 * parent gets a message at 08:31 saying their child did not arrive.
 *
 * Windows are passed in rather than derived here, because the caller has
 * already had to work out which schedule applies — person overrides group
 * overrides site — and doing that twice invites the two answers to differ.
 */
export function classifyDay(opts: ClassifyOptions): DayResult {
  const { punches, windows, nowMinutes, leave } = opts;
  const grace = opts.schedule.graceMinutes ?? opts.graceMinutes;

  const sorted = [...punches].sort((a, b) => a.minutes - b.minutes);
  const ins = sorted.filter((p) => p.direction === "in");
  const outs = sorted.filter((p) => p.direction === "out");
  const firstIn = ins.length ? ins[0].minutes : null;
  const lastOut = outs.length ? outs[outs.length - 1].minutes : null;

  const open = windows.length ? windows[0].start : null;
  const close = windows.length ? windows[windows.length - 1].end : null;

  const result: DayResult = {
    status: "unknown",
    firstIn,
    lastOut,
    workedMinutes: 0,
    lateMinutes: 0,
    earlyMinutes: 0,
    punches: sorted.length,
    assumedOut: false,
  };

  /*
   * Hours are computed whatever the status. Somebody who came in on a holiday
   * still worked, and a timesheet that shows a blank because the day was
   * marked "holiday" is a timesheet somebody has to correct by hand.
   */
  const worked = pairUp(sorted, opts.autoOut ? close : null);
  result.workedMinutes = worked.minutes;
  result.assumedOut = worked.assumed;
  if (worked.assumed && worked.impliedOut !== null) result.lastOut = worked.impliedOut;

  if (leave) {
    if (leave.countsAsPresent) {
      /*
       * Working from home, on a course, on a site visit. Present for the
       * timesheet and absent from the building, which are not the same thing
       * and are reported differently.
       */
      result.status = "present";
      return result;
    }
    if (leave.kind === "holiday" || sorted.length === 0) {
      result.status = leave.kind === "holiday" ? "holiday" : "leave";
      return result;
    }
    // On leave and yet here. The scans are real, so the day is not fabricated
    // as an absence; it falls through and is measured like any other.
  }

  if (!windows.length) {
    // Not a working day for this person. Scans are still recorded and still
    // count towards hours; they are simply not measured against anything.
    result.status = sorted.length ? "present" : "weekend";
    return result;
  }

  if (opts.schedule.kind === "flexible") {
    if (!sorted.length) return absentOrUnknown(result, open!, opts, nowMinutes);
    const need = opts.schedule.minMinutes || 0;
    result.status = need > 0 && result.workedMinutes < need ? "half" : "present";
    if (lastOut !== null && close !== null) result.earlyMinutes = Math.max(0, close - lastOut);
    return result;
  }

  if (firstIn === null) return absentOrUnknown(result, open!, opts, nowMinutes);

  const lateBy = firstIn - (open! + grace);
  result.lateMinutes = Math.max(0, lateBy);
  if (result.lastOut !== null && close !== null) {
    result.earlyMinutes = Math.max(0, close - result.lastOut);
  }

  if (firstIn - open! >= opts.halfDayAfterMinutes) result.status = "half";
  else if (lateBy > 0) result.status = "late";
  else result.status = "present";

  return result;
}

/**
 * Absent, or simply not here yet.
 *
 * The distinction is the whole reason this exists. A register looked at during
 * the morning must not call somebody absent who is walking up the drive, and
 * an absence notification sent a minute after the bell is worse than none.
 */
function absentOrUnknown(
  result: DayResult,
  open: number,
  opts: ClassifyOptions,
  nowMinutes: number | null
): DayResult {
  const settled = nowMinutes === null || nowMinutes >= open + opts.absentAfterMinutes;
  result.status = settled ? "absent" : "unknown";
  return result;
}

/**
 * Minutes actually inside the building, from alternating in/out scans.
 *
 * Real data is not tidy: people scan in twice, forget to scan out, or walk
 * through a door somebody else opened. The rules here are chosen so a messy
 * day produces a defensible number rather than a wrong one —
 *
 *   - a second "in" with no "out" between is ignored, not counted twice
 *   - an "out" with no preceding "in" is ignored rather than measured from
 *     midnight, which would credit somebody with eight hours for leaving
 *   - a trailing "in" is closed at the end of the working day and flagged, so
 *     a timesheet shows which hours were assumed rather than observed
 */
export function pairUp(
  punches: DayPunch[],
  closeAt: number | null
): { minutes: number; assumed: boolean; impliedOut: number | null } {
  let total = 0;
  let openAt: number | null = null;
  for (const p of punches) {
    if (p.direction === "in") {
      if (openAt === null) openAt = p.minutes;
      continue;
    }
    if (openAt !== null) {
      total += Math.max(0, p.minutes - openAt);
      openAt = null;
    }
  }
  if (openAt !== null && closeAt !== null && closeAt > openAt) {
    return { minutes: total + (closeAt - openAt), assumed: true, impliedOut: closeAt };
  }
  return { minutes: total, assumed: false, impliedOut: null };
}
