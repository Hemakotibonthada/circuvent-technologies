import "../test-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  classifyDay,
  dayForPunch,
  eachDay,
  formatHHMM,
  isWorkingDay,
  localMoment,
  minutesWithin,
  MINUTES_PER_DAY,
  pairUp,
  parseHHMM,
  weekdayOf,
  windowsFor,
  type ClassifyOptions,
  type Schedule,
} from "./schedule";

/**
 * The register, in arithmetic.
 *
 * These are the numbers a school prints and signs and a payroll run pays
 * against, so the cases here are the ones that are actually argued about:
 * arriving inside the grace period, the clocks changing, a night shift ending
 * on the wrong calendar date, and somebody who forgot to scan out.
 *
 * The "not here yet" versus "absent" distinction gets the most attention
 * because it is the one with a consequence outside the system: an absence
 * notification is a message to a parent, and sending it a minute after the
 * bell is worse than not having the feature.
 */

const schoolDay: Schedule = {
  kind: "fixed",
  // Monday to Friday, 08:30 to 15:30.
  windows: {
    "1": [{ in: "08:30", out: "15:30" }],
    "2": [{ in: "08:30", out: "15:30" }],
    "3": [{ in: "08:30", out: "15:30" }],
    "4": [{ in: "08:30", out: "15:30" }],
    "5": [{ in: "08:30", out: "15:30" }],
  },
  graceMinutes: null,
  minMinutes: 0,
};

const nightShift: Schedule = {
  kind: "fixed",
  windows: { "1": [{ in: "22:00", out: "06:00" }] },
  graceMinutes: null,
  minMinutes: 0,
};

const flexi: Schedule = {
  kind: "flexible",
  windows: {
    "1": [{ in: "07:00", out: "20:00" }],
    "2": [{ in: "07:00", out: "20:00" }],
  },
  graceMinutes: null,
  minMinutes: 450, // seven and a half hours
};

/** A Monday. */
const MONDAY = "2026-08-17";
const TUESDAY = "2026-08-18";
const SATURDAY = "2026-08-22";

function options(over: Partial<ClassifyOptions> = {}): ClassifyOptions {
  return {
    schedule: schoolDay,
    windows: windowsFor(schoolDay, MONDAY),
    punches: [],
    graceMinutes: 10,
    halfDayAfterMinutes: 180,
    absentAfterMinutes: 120,
    nowMinutes: null,
    autoOut: true,
    leave: null,
    ...over,
  };
}

const at = (hhmm: string, direction: "in" | "out" = "in") => ({
  minutes: parseHHMM(hhmm)!,
  direction,
});

describe("time parsing", () => {
  it("reads and writes wall-clock times", () => {
    assert.equal(parseHHMM("08:30"), 510);
    assert.equal(parseHHMM("00:00"), 0);
    assert.equal(parseHHMM("23:59"), 1439);
    assert.equal(formatHHMM(510), "08:30");
    assert.equal(formatHHMM(0), "00:00");
  });

  it("refuses anything that is not a time", () => {
    for (const bad of ["", "8:3", "24:00", "08:60", "eight", null, undefined, 510]) {
      assert.equal(parseHHMM(bad), null, `${String(bad)} should not parse`);
    }
  });

  it("wraps a time past midnight when formatting", () => {
    // 26:00 on the night-shift number line is 02:00 the next morning.
    assert.equal(formatHHMM(MINUTES_PER_DAY + 120), "02:00");
  });
});

describe("calendar arithmetic", () => {
  it("knows its weekdays", () => {
    assert.equal(weekdayOf(MONDAY), 1);
    assert.equal(weekdayOf(SATURDAY), 6);
  });

  it("crosses month and year boundaries", () => {
    assert.equal(addDays("2026-08-31", 1), "2026-09-01");
    assert.equal(addDays("2027-01-01", -1), "2026-12-31");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29", "2028 is a leap year");
  });

  it("enumerates a range inclusively and refuses to run away", () => {
    assert.deepEqual(eachDay("2026-08-17", "2026-08-19"), ["2026-08-17", "2026-08-18", "2026-08-19"]);
    assert.equal(eachDay("2026-01-01", "2099-01-01").length, 400, "bounded");
  });
});

describe("local time", () => {
  it("reports the building's wall clock, not the server's", () => {
    // 03:00 UTC is 08:30 in Kolkata — the same instant, a different day part.
    const m = localMoment("2026-08-17T03:00:00Z", "Asia/Kolkata");
    assert.equal(m.day, "2026-08-17");
    assert.equal(m.minutes, 8 * 60 + 30);
    assert.equal(m.weekday, 1);
  });

  it("puts a late-evening UTC instant on the next local day", () => {
    const m = localMoment("2026-08-17T20:00:00Z", "Asia/Kolkata");
    assert.equal(m.day, "2026-08-18", "01:30 the following morning in Kolkata");
    assert.equal(m.minutes, 90);
  });

  it("follows a daylight-saving change instead of a fixed offset", () => {
    /*
     * The case that motivates the whole minutes-since-local-midnight design.
     * London is UTC+0 in January and UTC+1 in July; a school starting at 08:30
     * starts at 08:30 in both, and a system storing an offset would mark an
     * entire summer term late.
     */
    const winter = localMoment("2026-01-19T08:30:00Z", "Europe/London");
    const summer = localMoment("2026-07-20T07:30:00Z", "Europe/London");
    assert.equal(winter.minutes, 510);
    assert.equal(summer.minutes, 510, "same wall clock, different UTC instant");
  });

  it("falls back to UTC for a zone nobody can resolve", () => {
    // A typo in a site row must not take the register down.
    const m = localMoment("2026-08-17T03:00:00Z", "Not/AZone");
    assert.equal(m.day, "2026-08-17");
    assert.equal(m.minutes, 180);
  });
});

describe("windows", () => {
  it("reads the weekday's windows", () => {
    assert.deepEqual(windowsFor(schoolDay, MONDAY), [{ start: 510, end: 930 }]);
  });

  it("has none at the weekend", () => {
    assert.deepEqual(windowsFor(schoolDay, SATURDAY), []);
    assert.equal(isWorkingDay(schoolDay, SATURDAY), false);
    assert.equal(isWorkingDay(schoolDay, MONDAY), true);
  });

  it("carries a night shift past midnight on one number line", () => {
    assert.deepEqual(windowsFor(nightShift, MONDAY), [
      { start: 22 * 60, end: MINUTES_PER_DAY + 6 * 60 },
    ]);
  });

  it("ignores a malformed entry rather than throwing", () => {
    const broken: Schedule = {
      ...schoolDay,
      windows: { "1": [{ in: "nope", out: "15:30" }, { in: "09:00", out: "12:00" }] },
    };
    assert.deepEqual(windowsFor(broken, MONDAY), [{ start: 540, end: 720 }]);
  });
});

describe("which day a scan belongs to", () => {
  it("uses the calendar date for an ordinary shift", () => {
    const m = { day: TUESDAY, weekday: 2, minutes: 540 };
    assert.equal(dayForPunch(m, schoolDay), TUESDAY);
  });

  it("files the end of a night shift under the day it started", () => {
    // Clocking off at 02:00 on Tuesday finished Monday's shift.
    const m = { day: TUESDAY, weekday: 2, minutes: 120 };
    assert.equal(dayForPunch(m, nightShift), MONDAY);
    assert.equal(minutesWithin(m, MONDAY), MINUTES_PER_DAY + 120);
  });

  it("does not reach back once the night shift has ended", () => {
    // 07:00 Tuesday is after Monday's 06:00 finish, so it is Tuesday's.
    const m = { day: TUESDAY, weekday: 2, minutes: 420 };
    assert.equal(dayForPunch(m, nightShift), TUESDAY);
  });
});

describe("classifying a day", () => {
  it("is present when somebody arrives before the bell", () => {
    const r = classifyDay(options({ punches: [at("08:20"), at("15:35", "out")] }));
    assert.equal(r.status, "present");
    assert.equal(r.lateMinutes, 0);
    assert.equal(r.workedMinutes, 435);
  });

  it("is still present inside the grace period", () => {
    const r = classifyDay(options({ punches: [at("08:39")] }));
    assert.equal(r.status, "present", "nine minutes with ten minutes of grace");
    assert.equal(r.lateMinutes, 0);
  });

  it("counts lateness from the end of the grace period, not the bell", () => {
    const r = classifyDay(options({ punches: [at("08:55")] }));
    assert.equal(r.status, "late");
    assert.equal(r.lateMinutes, 15, "08:55 is 15 minutes past 08:40");
  });

  it("honours a schedule that overrides the site's grace", () => {
    const strict: Schedule = { ...schoolDay, graceMinutes: 0 };
    const r = classifyDay(options({ schedule: strict, punches: [at("08:31")] }));
    assert.equal(r.status, "late");
    assert.equal(r.lateMinutes, 1);
  });

  it("is a half day when somebody arrives after lunch", () => {
    const r = classifyDay(options({ punches: [at("11:40")] }));
    assert.equal(r.status, "half", "three hours after the bell");
  });

  it("records leaving early", () => {
    const r = classifyDay(options({ punches: [at("08:30"), at("13:00", "out")] }));
    assert.equal(r.earlyMinutes, 150);
  });

  it("does not call somebody absent while the morning is still running", () => {
    const r = classifyDay(options({ nowMinutes: 9 * 60 }));
    assert.equal(r.status, "unknown", "09:00 is inside the two-hour settling period");
  });

  it("calls them absent once the day has run far enough", () => {
    const r = classifyDay(options({ nowMinutes: 11 * 60 }));
    assert.equal(r.status, "absent");
  });

  it("calls them absent for a day that is over", () => {
    const r = classifyDay(options({ nowMinutes: null }));
    assert.equal(r.status, "absent");
  });

  it("is a weekend when nobody was expected and nobody came", () => {
    const r = classifyDay(options({ windows: windowsFor(schoolDay, SATURDAY) }));
    assert.equal(r.status, "weekend");
  });

  it("still counts hours for somebody who came in at the weekend", () => {
    const r = classifyDay(
      options({
        windows: windowsFor(schoolDay, SATURDAY),
        punches: [at("09:00"), at("12:00", "out")],
      })
    );
    assert.equal(r.status, "present");
    assert.equal(r.workedMinutes, 180);
  });
});

describe("leave and closures", () => {
  it("marks a site holiday rather than an absence", () => {
    const r = classifyDay(options({ leave: { kind: "holiday", countsAsPresent: false } }));
    assert.equal(r.status, "holiday");
  });

  it("marks authorised leave rather than an absence", () => {
    const r = classifyDay(options({ leave: { kind: "sick", countsAsPresent: false } }));
    assert.equal(r.status, "leave");
  });

  it("treats working from home as present without inventing hours", () => {
    const r = classifyDay(options({ leave: { kind: "remote", countsAsPresent: true } }));
    assert.equal(r.status, "present");
    assert.equal(r.workedMinutes, 0, "nobody scanned, so nothing is claimed");
  });

  it("measures somebody who came in anyway on their leave day", () => {
    const r = classifyDay(
      options({
        leave: { kind: "sick", countsAsPresent: false },
        punches: [at("08:55"), at("15:30", "out")],
      })
    );
    assert.equal(r.status, "late", "the scans are real, so the day is measured");
    assert.equal(r.workedMinutes, 395);
  });

  it("does not fabricate hours on a holiday somebody worked", () => {
    const r = classifyDay(
      options({
        leave: { kind: "holiday", countsAsPresent: false },
        punches: [at("10:00"), at("14:00", "out")],
      })
    );
    assert.equal(r.status, "holiday");
    assert.equal(r.workedMinutes, 240, "and the hours are still on the timesheet");
  });
});

describe("hours worked", () => {
  it("adds up several trips in and out", () => {
    const r = pairUp(
      [at("09:00"), at("12:00", "out"), at("13:00"), at("17:00", "out")],
      null
    );
    assert.equal(r.minutes, 420);
    assert.equal(r.assumed, false);
  });

  it("ignores a repeated entry rather than double counting", () => {
    const r = pairUp([at("09:00"), at("09:05"), at("17:00", "out")], null);
    assert.equal(r.minutes, 480, "measured from the first entry");
  });

  it("ignores an exit nobody entered for", () => {
    const r = pairUp([at("09:00", "out"), at("10:00"), at("11:00", "out")], null);
    assert.equal(r.minutes, 60, "not ten hours from midnight");
  });

  it("closes a forgotten exit at the end of the day and says so", () => {
    const r = pairUp([at("08:30")], 930);
    assert.equal(r.minutes, 420);
    assert.equal(r.assumed, true);
    assert.equal(r.impliedOut, 930);
  });

  it("does not close a forgotten exit when auto-out is off", () => {
    const r = classifyDay(options({ punches: [at("08:30")], autoOut: false }));
    assert.equal(r.workedMinutes, 0);
    assert.equal(r.assumedOut, false);
  });

  it("does not invent negative time when the exit precedes the entry", () => {
    const r = pairUp([at("17:00"), at("09:00", "out")], null);
    assert.equal(r.minutes, 0);
  });
});

describe("night shifts", () => {
  it("measures a shift that ends the next morning", () => {
    const r = classifyDay(
      options({
        schedule: nightShift,
        windows: windowsFor(nightShift, MONDAY),
        punches: [
          { minutes: 22 * 60, direction: "in" },
          { minutes: MINUTES_PER_DAY + 6 * 60, direction: "out" },
        ],
      })
    );
    assert.equal(r.status, "present");
    assert.equal(r.workedMinutes, 480, "eight hours across midnight");
    assert.equal(r.lateMinutes, 0);
  });

  it("still catches lateness on a night shift", () => {
    const r = classifyDay(
      options({
        schedule: nightShift,
        windows: windowsFor(nightShift, MONDAY),
        punches: [{ minutes: 22 * 60 + 25, direction: "in" }],
      })
    );
    assert.equal(r.status, "late");
    assert.equal(r.lateMinutes, 15);
  });
});

describe("flexible schedules", () => {
  it("is present on hours rather than on arrival time", () => {
    const r = classifyDay(
      options({
        schedule: flexi,
        windows: windowsFor(flexi, MONDAY),
        punches: [at("10:30"), at("18:30", "out")],
      })
    );
    assert.equal(r.status, "present", "arrived at 10:30 and worked eight hours");
    assert.equal(r.lateMinutes, 0, "there is no bell to be late for");
  });

  it("is a half day when the hours are short", () => {
    const r = classifyDay(
      options({
        schedule: flexi,
        windows: windowsFor(flexi, MONDAY),
        punches: [at("09:00"), at("12:00", "out")],
      })
    );
    assert.equal(r.status, "half");
  });

  it("is absent when nobody came at all", () => {
    const r = classifyDay(
      options({ schedule: flexi, windows: windowsFor(flexi, MONDAY), nowMinutes: null })
    );
    assert.equal(r.status, "absent");
  });
});
