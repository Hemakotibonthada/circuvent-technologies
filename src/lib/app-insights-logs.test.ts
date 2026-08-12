/**
 * The Logs filter and the latency distribution.
 *
 * Filters are where an inverted condition survives review comfortably: a
 * "failed only" toggle that quietly shows successes still returns rows, and
 * rows look like working software.
 */

import {
  queryEvents,
  operationPerf,
  durationHistogram,
  type TelemetryEvent,
} from "./app-insights";

const NOW = "2026-08-12T12:00:00.000Z";
const hoursAgo = (n: number) => new Date(Date.parse(NOW) - n * 3600_000).toISOString();

const ev = (p: Partial<TelemetryEvent>): TelemetryEvent => ({
  id: Math.random().toString(36).slice(2),
  kind: "request",
  at: NOW,
  path: "/api/devices",
  session: "s1",
  durationMs: 100,
  status: 200,
  ok: true,
  source: "web",
  ...p,
});

describe("queryEvents", () => {
  it("returns newest first", () => {
    const out = queryEvents(
      [ev({ at: hoursAgo(3), path: "/old" }), ev({ at: hoursAgo(1), path: "/new" })],
      {},
      NOW
    );
    expect(out.map((e) => e.path)).toEqual(["/new", "/old"]);
  });

  it("filters to failures only, and does not invert", () => {
    const out = queryEvents(
      [ev({ ok: true, status: 200 }), ev({ ok: false, status: 500 })],
      { outcome: "failed" },
      NOW
    );
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe(500);
  });

  it("filters to successes only", () => {
    const out = queryEvents(
      [ev({ ok: true, status: 200 }), ev({ ok: false, status: 500 })],
      { outcome: "ok" },
      NOW
    );
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe(200);
  });

  it("matches a path case-insensitively, as a substring", () => {
    const out = queryEvents(
      [ev({ path: "/api/Devices" }), ev({ path: "/api/orders" })],
      { pathContains: "devices" },
      NOW
    );
    expect(out).toHaveLength(1);
  });

  it("filters by verb, treating a missing verb as GET", () => {
    const out = queryEvents(
      [ev({ method: "POST" }), ev({ method: undefined })],
      { method: "GET" },
      NOW
    );
    expect(out).toHaveLength(1);
    expect(out[0].method).toBeUndefined();
  });

  it("honours the time window", () => {
    const out = queryEvents(
      [ev({ at: hoursAgo(30) }), ev({ at: hoursAgo(2) })],
      { sinceHours: 24 },
      NOW
    );
    expect(out).toHaveLength(1);
  });

  it("searches error text across type and message", () => {
    const out = queryEvents(
      [
        ev({ kind: "exception", ok: false, errorType: "TypeError", errorMessage: "x is undefined" }),
        ev({ kind: "exception", ok: false, errorType: "RangeError", errorMessage: "too big" }),
      ],
      { errorContains: "undefined" },
      NOW
    );
    expect(out).toHaveLength(1);
    expect(out[0].errorType).toBe("TypeError");
  });

  it("caps the result set even when asked for more", () => {
    const many = Array.from({ length: 5000 }, () => ev({}));
    expect(queryEvents(many, { limit: 99999 }, NOW)).toHaveLength(1000);
  });

  it("combines filters rather than picking one", () => {
    const out = queryEvents(
      [
        ev({ method: "POST", path: "/api/a", ok: false, status: 500 }),
        ev({ method: "POST", path: "/api/b", ok: false, status: 500 }),
        ev({ method: "GET", path: "/api/a", ok: false, status: 500 }),
      ],
      { method: "POST", pathContains: "/api/a", outcome: "failed" },
      NOW
    );
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe("/api/a");
  });
});

describe("operationPerf", () => {
  it("separates a page load from an API call of the same name", () => {
    const rows = operationPerf([
      ev({ kind: "pageview", path: "/shop", durationMs: 900 }),
      ev({ kind: "request", method: "GET", path: "/shop", durationMs: 20 }),
    ]);
    expect(rows.map((r) => r.name).sort()).toEqual(["/shop", "GET /shop"]);
  });

  it("reports the spread, not just the middle", () => {
    // A bimodal route: half fast, half slow. The mean describes neither.
    const d = [...Array.from({ length: 50 }, () => 10), ...Array.from({ length: 50 }, () => 1000)];
    const rows = operationPerf(d.map((ms) => ev({ durationMs: ms })));
    expect(rows[0].p50Ms).toBe(10);
    expect(rows[0].p99Ms).toBe(1000);
    expect(rows[0].minMs).toBe(10);
    expect(rows[0].maxMs).toBe(1000);
  });

  it("puts the slowest operation first", () => {
    const rows = operationPerf([
      ev({ path: "/fast", durationMs: 10 }),
      ev({ path: "/slow", durationMs: 9000 }),
    ]);
    expect(rows[0].name).toBe("GET /slow");
  });

  it("ignores exceptions, which have no meaningful duration", () => {
    expect(operationPerf([ev({ kind: "exception", ok: false })])).toEqual([]);
  });
});

describe("durationHistogram", () => {
  it("puts a value on a bucket boundary in that bucket, not the next", () => {
    const h = durationHistogram([ev({ durationMs: 50 })]);
    expect(h[0].count).toBe(1);
    expect(h[1].count).toBe(0);
  });

  it("collects everything past the last boundary in the overflow bucket", () => {
    const h = durationHistogram([ev({ durationMs: 60_000 })]);
    expect(h[h.length - 1].count).toBe(1);
    expect(h[h.length - 1].label).toMatch(/^> /);
  });

  it("counts only the kind asked for", () => {
    const h = durationHistogram(
      [ev({ kind: "request", durationMs: 30 }), ev({ kind: "pageview", durationMs: 30 })],
      "request"
    );
    expect(h[0].count).toBe(1);
  });
});
