/**
 * The time window the incident queue is read through.
 *
 * A queue with no date control answers "what is broken now" and quietly
 * refuses "what happened on the 12th". These assertions are mostly about the
 * boundaries, because every bug this feature can have looks identical to a
 * quiet week: the wrong answer is an empty table, not an error.
 */

import { queue, stats, withinRange, type Incident } from "@/lib/icm";
import { createIncident } from "@/lib/icm";
import { dayToInstant, rangeFromPreset, rangeLabel, DEFAULT_RANGE } from "@/app/admin/IcmRangePicker";

const at = (iso: string) => iso;
const mk = (id: string, createdAt: string): Incident =>
  createIncident(id, { title: `t-${id}`, severity: 1, owningTeam: "Platform", createdBy: "ada" }, createdAt);

const JAN10 = at("2026-01-10T12:00:00.000Z");
const JAN12 = at("2026-01-12T12:00:00.000Z");
const JAN15 = at("2026-01-15T12:00:00.000Z");
const NOW = at("2026-01-20T00:00:00.000Z");

describe("withinRange", () => {
  const inc = mk("INC-1", JAN12);

  it("keeps everything when no window is set", () => {
    expect(withinRange(inc, undefined, undefined)).toBe(true);
    expect(withinRange(inc, "", "")).toBe(true);
  });

  it("includes the boundaries themselves", () => {
    expect(withinRange(inc, JAN12, JAN12)).toBe(true);
  });

  it("excludes what falls outside", () => {
    expect(withinRange(inc, JAN15, undefined)).toBe(false);
    expect(withinRange(inc, undefined, JAN10)).toBe(false);
  });

  it("accepts an open-ended window on either side", () => {
    expect(withinRange(inc, JAN10, undefined)).toBe(true);
    expect(withinRange(inc, undefined, JAN15)).toBe(true);
  });

  /*
   * An unparseable bound must not silently empty the queue. Showing everything
   * is the safe direction to fail: the operator can see the filter did nothing,
   * whereas an empty table reads as "no incidents".
   */
  it("ignores a bound it cannot parse rather than hiding everything", () => {
    expect(withinRange(inc, "not-a-date", undefined)).toBe(true);
    expect(withinRange(inc, undefined, "also-not-a-date")).toBe(true);
  });
});

describe("queue filtered by window", () => {
  const all = [mk("INC-1", JAN10), mk("INC-2", JAN12), mk("INC-3", JAN15)];

  it("returns only incidents filed inside it", () => {
    const got = queue(all, { status: "all", from: JAN12, to: JAN15 }, NOW).map((i) => i.id);
    expect(got.sort()).toEqual(["INC-2", "INC-3"]);
  });

  it("combines with the other filters rather than replacing them", () => {
    const got = queue(all, { status: "all", from: JAN12, to: JAN15, search: "t-INC-3" }, NOW);
    expect(got.map((i) => i.id)).toEqual(["INC-3"]);
  });

  it("leaves the queue untouched when no window is set", () => {
    expect(queue(all, { status: "all" }, NOW)).toHaveLength(3);
  });
});

/*
 * The header tiles and the table are computed separately, so they can disagree.
 * A header reading "3 open" above a table showing one is the operator doing
 * arithmetic during an incident to work out which number is lying.
 */
describe("stats respect the same window as the queue", () => {
  const all = [mk("INC-1", JAN10), mk("INC-2", JAN12), mk("INC-3", JAN15)];

  const counted = (s: ReturnType<typeof stats>) =>
    s.active + s.acknowledged + s.mitigated + s.resolved;

  it("counts only what the queue would show", () => {
    const scoped = stats(all, NOW, { from: JAN12, to: JAN15 });
    const listed = queue(all, { status: "all", from: JAN12, to: JAN15 }, NOW);
    expect(counted(scoped)).toBe(listed.length);
    expect(scoped.open).toBe(listed.length);
  });

  it("counts everything when no window is set", () => {
    expect(counted(stats(all, NOW))).toBe(3);
    expect(counted(stats(all, NOW, {}))).toBe(3);
  });
});

/*
 * The off-by-one this feature is most likely to ship with. A date input hands
 * back a calendar day; comparing "2026-01-12" directly excludes everything
 * that happened during the 12th, so choosing today as the end reliably returns
 * nothing and reads as "no incidents".
 */
describe("dayToInstant", () => {
  it("ends on the last millisecond of the chosen day, not its midnight", () => {
    const end = dayToInstant("2026-01-12", "end");
    expect(new Date(end).getHours()).toBe(23);
    expect(new Date(end).getMinutes()).toBe(59);
  });

  it("starts at the first millisecond of the chosen day", () => {
    const start = dayToInstant("2026-01-12", "start");
    expect(new Date(start).getHours()).toBe(0);
    expect(new Date(start).getMinutes()).toBe(0);
  });

  it("includes an incident filed late on the end day", () => {
    const lateThatNight = mk("INC-9", new Date("2026-01-12T22:30:00").toISOString());
    expect(
      withinRange(lateThatNight, dayToInstant("2026-01-12", "start"), dayToInstant("2026-01-12", "end"))
    ).toBe(true);
  });

  it("returns empty for a blank or unparseable day", () => {
    expect(dayToInstant("", "start")).toBe("");
    expect(dayToInstant("nonsense", "end")).toBe("");
  });
});

describe("presets", () => {
  const now = Date.parse("2026-01-20T00:00:00.000Z");

  it("looks back the advertised distance", () => {
    const r = rangeFromPreset("7d", now);
    expect(Date.parse(r.from)).toBe(now - 7 * 86_400_000);
    expect(r.to).toBe("");
  });

  it("treats all-time as no bounds at all", () => {
    expect(rangeFromPreset("all", now)).toEqual(DEFAULT_RANGE);
  });

  it("labels itself in words a person can read back", () => {
    expect(rangeLabel(rangeFromPreset("24h", now))).toBe("Last 24 hours");
    expect(rangeLabel(DEFAULT_RANGE)).toBe("All time");
    expect(
      rangeLabel({ from: dayToInstant("2026-01-12", "start"), to: dayToInstant("2026-01-12", "end"), preset: "custom" })
    ).toBe("2026-01-12");
  });
});
