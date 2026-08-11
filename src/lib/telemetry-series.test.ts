import { telemetrySeries, isFlat, type TelemetryRecord } from "@/lib/telemetry-series";

const rec = (at: string, data: Record<string, unknown>): TelemetryRecord => ({ at, data });

const T1 = "2026-03-20T10:00:00.000Z";
const T2 = "2026-03-20T10:01:00.000Z";
const T3 = "2026-03-20T10:02:00.000Z";

describe("telemetrySeries", () => {
  it("builds one series per numeric field", () => {
    const s = telemetrySeries([rec(T1, { watts: 10, level: 90 }), rec(T2, { watts: 20, level: 80 })]);
    expect(s.map((x) => x.field)).toEqual(["watts", "level"]);
    expect(s[0].points.map((p) => p.v)).toEqual([10, 20]);
  });

  it("labels and units known fields", () => {
    const [s] = telemetrySeries([rec(T1, { watts: 1 }), rec(T2, { watts: 2 })]);
    expect(s).toMatchObject({ label: "Power", unit: "W" });
  });

  it("falls back to the raw key for an unknown field rather than dropping it", () => {
    const [s] = telemetrySeries([rec(T1, { flowRate: 1 }), rec(T2, { flowRate: 2 })]);
    expect(s).toMatchObject({ field: "flowRate", label: "flowRate", unit: "" });
  });

  it("sorts by time, because the transport promises no order", () => {
    // A line drawn through unsorted points doubles back on itself.
    const s = telemetrySeries([rec(T3, { watts: 30 }), rec(T1, { watts: 10 }), rec(T2, { watts: 20 })]);
    expect(s[0].points.map((p) => p.v)).toEqual([10, 20, 30]);
  });

  it("excludes booleans", () => {
    // A relay is on or off; a line between samples would claim it was half-on.
    const s = telemetrySeries([rec(T1, { power: true, watts: 5 }), rec(T2, { power: false, watts: 6 })]);
    expect(s.map((x) => x.field)).toEqual(["watts"]);
  });

  it("excludes strings and objects", () => {
    const s = telemetrySeries([
      rec(T1, { color: "#fff", meta: { a: 1 }, watts: 5 }),
      rec(T2, { color: "#000", meta: { a: 2 }, watts: 6 }),
    ]);
    expect(s.map((x) => x.field)).toEqual(["watts"]);
  });

  it("excludes NaN and Infinity, which are typeof number", () => {
    const s = telemetrySeries([
      rec(T1, { watts: Number.NaN, level: 50 }),
      rec(T2, { watts: Number.POSITIVE_INFINITY, level: 60 }),
    ]);
    expect(s.map((x) => x.field)).toEqual(["level"]);
  });

  it("drops a field carried by only one reading", () => {
    // One point is not a trend.
    const s = telemetrySeries([rec(T1, { watts: 5, spike: 99 }), rec(T2, { watts: 6 })]);
    expect(s.map((x) => x.field)).toEqual(["watts"]);
  });

  it("keeps a field that appears late, once it has two readings", () => {
    const s = telemetrySeries([rec(T1, { watts: 5 }), rec(T2, { watts: 6, temp: 20 }), rec(T3, { watts: 7, temp: 21 })]);
    expect(s.map((x) => x.field).sort()).toEqual(["temp", "watts"]);
  });

  it("skips a reading whose timestamp will not parse", () => {
    // Including it as NaN would corrupt the whole axis.
    const s = telemetrySeries([rec(T1, { watts: 5 }), rec("not-a-date", { watts: 500 }), rec(T2, { watts: 6 })]);
    expect(s[0].points.map((p) => p.v)).toEqual([5, 6]);
  });

  it("orders known fields ahead of unknown ones", () => {
    const s = telemetrySeries([rec(T1, { zzz: 1, watts: 5 }), rec(T2, { zzz: 2, watts: 6 })]);
    expect(s.map((x) => x.field)).toEqual(["watts", "zzz"]);
  });

  it("returns nothing for empty, malformed or non-array input", () => {
    expect(telemetrySeries([])).toEqual([]);
    expect(telemetrySeries(undefined as unknown as TelemetryRecord[])).toEqual([]);
    expect(telemetrySeries([{ at: T1 } as TelemetryRecord])).toEqual([]);
    expect(telemetrySeries([null as unknown as TelemetryRecord])).toEqual([]);
  });
});

describe("isFlat", () => {
  it("spots a series that never changes", () => {
    const [s] = telemetrySeries([rec(T1, { watts: 5 }), rec(T2, { watts: 5 })]);
    expect(isFlat(s)).toBe(true);
  });

  it("does not call a changing series flat", () => {
    const [s] = telemetrySeries([rec(T1, { watts: 5 }), rec(T2, { watts: 6 })]);
    expect(isFlat(s)).toBe(false);
  });
});
