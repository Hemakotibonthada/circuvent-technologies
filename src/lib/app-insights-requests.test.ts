// Requests aggregation — the percentile and the grouping.
//
// Both are places an off-by-one hides comfortably: a p95 that is quietly the
// max, or a table that merges a GET with the DELETE beside it, still looks
// like a plausible number on a dashboard.

import {
  percentile,
  requestStats,
  statusBreakdown,
  normaliseEvent,
  type TelemetryEvent,
} from "./app-insights";

const ev = (p: Partial<TelemetryEvent>): TelemetryEvent => ({
  id: Math.random().toString(36).slice(2),
  kind: "request",
  at: "2026-08-12T00:00:00.000Z",
  path: "/api/devices",
  session: "s1",
  durationMs: 100,
  status: 200,
  ok: true,
  source: "web",
  ...p,
});

describe("percentile", () => {
  it("returns 0 for no samples rather than NaN", () => {
    expect(percentile([], 95)).toBe(0);
  });

  it("is the only value when there is one", () => {
    expect(percentile([42], 95)).toBe(42);
  });

  it("uses nearest rank, so p95 of 100 samples is the 95th", () => {
    const s = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(s, 95)).toBe(95);
    expect(percentile(s, 50)).toBe(50);
  });

  it("does not run off the end at p100", () => {
    expect(percentile([1, 2, 3], 100)).toBe(3);
  });

  it("reports the slow tail once the tail is big enough to be a tail", () => {
    // 100 samples, the slowest 10 of them slow: p95 lands in the slow group.
    const s = [
      ...Array.from({ length: 90 }, () => 50),
      ...Array.from({ length: 10 }, () => 5000),
    ].sort((a, b) => a - b);
    expect(percentile(s, 95)).toBe(5000);
  });

  it("does not mistake a single outlier for the 95th percentile", () => {
    /*
     * I asserted the opposite of this first, and the implementation was right.
     * With 20 samples the nearest rank for p95 is ceil(0.95 * 20) = 19, so the
     * 19th value wins and the single 5000 at position 20 is not it. One slow
     * call in twenty is p100, not p95 — which is why RequestStat carries maxMs
     * as well: the percentile is deliberately not the place an outlier shows up.
     */
    const s = [...Array.from({ length: 19 }, () => 50), 5000].sort((a, b) => a - b);
    expect(percentile(s, 95)).toBe(50);
    expect(percentile(s, 100)).toBe(5000);
  });
});

describe("requestStats", () => {
  it("ignores anything that is not a request", () => {
    expect(requestStats([ev({ kind: "pageview" }), ev({ kind: "exception" })])).toEqual([]);
  });

  it("keeps verbs apart on the same route", () => {
    const rows = requestStats([
      ev({ method: "GET", path: "/api/devices" }),
      ev({ method: "DELETE", path: "/api/devices" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name).sort()).toEqual([
      "DELETE /api/devices",
      "GET /api/devices",
    ]);
  });

  it("counts failures and computes a rate", () => {
    const rows = requestStats([
      ev({ method: "GET", status: 200, ok: true }),
      ev({ method: "GET", status: 500, ok: false }),
      ev({ method: "GET", status: 500, ok: false }),
      ev({ method: "GET", status: 200, ok: true }),
    ]);
    expect(rows[0].count).toBe(4);
    expect(rows[0].failed).toBe(2);
    expect(rows[0].failureRate).toBe(0.5);
  });

  it("treats a dropped connection as a failure, not a fast success", () => {
    // status 0 is what the client records when the request never got one.
    const rows = requestStats([ev({ method: "GET", status: 0, ok: false, durationMs: 30 })]);
    expect(rows[0].failed).toBe(1);
    expect(rows[0].failureRate).toBe(1);
  });

  it("puts failing operations above merely slow ones", () => {
    const rows = requestStats([
      ev({ method: "GET", path: "/slow", durationMs: 9000 }),
      ev({ method: "GET", path: "/broken", status: 500, ok: false }),
    ]);
    expect(rows[0].path).toBe("/broken");
  });

  it("keeps the latest timestamp, whatever order events arrive in", () => {
    const rows = requestStats([
      ev({ at: "2026-08-12T10:00:00.000Z" }),
      ev({ at: "2026-08-12T09:00:00.000Z" }),
    ]);
    expect(rows[0].lastAt).toBe("2026-08-12T10:00:00.000Z");
  });

  it("defaults a missing verb to GET rather than dropping the row", () => {
    const rows = requestStats([ev({ method: undefined })]);
    expect(rows[0].name).toBe("GET /api/devices");
  });
});

describe("statusBreakdown", () => {
  it("counts by status, busiest first", () => {
    const out = statusBreakdown([
      ev({ status: 200 }),
      ev({ status: 200 }),
      ev({ status: 404, ok: false }),
    ]);
    expect(out[0]).toEqual({ status: 200, count: 2 });
    expect(out[1]).toEqual({ status: 404, count: 1 });
  });
});

describe("normaliseEvent — method", () => {
  const ctx = { now: "2026-08-12T00:00:00.000Z", session: "s", source: "web" };

  it("accepts a real verb and upper-cases it", () => {
    const e = normaliseEvent({ kind: "request", path: "/api/x", method: "post" }, ctx);
    expect(e?.method).toBe("POST");
  });

  it("drops anything that is not a verb, because it becomes a row label", () => {
    const e = normaliseEvent(
      { kind: "request", path: "/api/x", method: "<script>alert(1)</script>" },
      ctx
    );
    expect(e?.method).toBeUndefined();
  });
});
