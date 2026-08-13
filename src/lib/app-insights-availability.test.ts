/**
 * Availability, derived from health checks.
 *
 * The number this produces is the kind people quote in a meeting, so the ways
 * it can be quietly wrong matter more than usual: a check counted twice, a
 * failure counted as a success, or an empty window reported as 100%.
 */

import {
  availability,
  availabilityTimeline,
  availabilityResults,
  type TelemetryEvent,
} from "./app-insights";

const ev = (p: Partial<TelemetryEvent>): TelemetryEvent => ({
  id: Math.random().toString(36).slice(2),
  kind: "dependency",
  at: "2026-08-12T12:00:00.000Z",
  path: "/health",
  session: "s1",
  durationMs: 40,
  status: 200,
  ok: true,
  /* Availability counts only what the scheduled prober produced. */
  source: "probe",
  target: "control-plane",
  ...p,
});

describe("availability", () => {
  it("reports nothing when nothing was checked, rather than 100%", () => {
    // An empty window is "no data", and rendering it as perfect uptime is how
    // a dashboard reassures somebody about a service it never contacted.
    expect(availability([])).toEqual([]);
  });

  it("computes uptime from successes over checks", () => {
    const rows = availability([
      ev({ ok: true }),
      ev({ ok: true }),
      ev({ ok: true }),
      ev({ ok: false, status: 503 }),
    ]);
    expect(rows[0].checks).toBe(4);
    expect(rows[0].failed).toBe(1);
    expect(rows[0].uptime).toBe(0.75);
  });

  it("counts an unreachable host as down, not as missing data", () => {
    const rows = availability([ev({ ok: false, status: 0 })]);
    expect(rows[0].uptime).toBe(0);
    expect(rows[0].failed).toBe(1);
  });

  it("counts every endpoint the prober checks, not only /health", () => {
    /*
     * This used to filter on path === "/health". The prober checks seven
     * endpoints across the suite — the Office API at /office-api/api/health,
     * its socket at /office-api/socket.io/, a bare page at / — so all but the
     * control plane were silently missing from the blade built to show them.
     */
    const rows = availability([
      ev({ target: "office-api", path: "/office-api/api/health" }),
      ev({ target: "office-socket", path: "/office-api/socket.io/" }),
      ev({ target: "office-web", path: "/" }),
    ]);
    expect(rows.map((r) => r.target).sort()).toEqual(["office-api", "office-socket", "office-web"]);
  });

  it("ignores checks a browser made, which are not availability", () => {
    /*
     * A health check fired because somebody opened a page answers "was it
     * reachable when we looked", and the gap between that and "is it up" is
     * exactly the window an outage lives in. Counting them would let a quiet
     * night read as perfect uptime.
     */
    expect(availability([ev({ source: "web" })])).toEqual([]);
  });

  it("still narrows to one path when asked", () => {
    const rows = availability(
      [ev({ path: "/health" }), ev({ target: "other", path: "/elsewhere" })],
      "/health"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].target).toBe("control-plane");
  });

  it("ignores requests, which are inbound and prove nothing about a dependency", () => {
    expect(availability([ev({ kind: "request" })])).toEqual([]);
  });

  it("reports the most recent failure, whatever order events arrive in", () => {
    const rows = availability([
      ev({ ok: false, at: "2026-08-12T09:00:00.000Z" }),
      ev({ ok: false, at: "2026-08-12T11:00:00.000Z" }),
      ev({ ok: true, at: "2026-08-12T12:00:00.000Z" }),
    ]);
    expect(rows[0].lastFailureAt).toBe("2026-08-12T11:00:00.000Z");
    expect(rows[0].lastCheckAt).toBe("2026-08-12T12:00:00.000Z");
  });

  it("leaves lastFailureAt unset when nothing has failed", () => {
    const rows = availability([ev({ ok: true })]);
    expect(rows[0].lastFailureAt).toBeUndefined();
  });

  it("keeps services separate and puts the worst first", () => {
    const rows = availability([
      ev({ target: "control-plane", ok: true }),
      ev({ target: "payments", ok: false }),
    ]);
    expect(rows[0].target).toBe("payments");
    expect(rows[0].uptime).toBe(0);
    expect(rows[1].uptime).toBe(1);
  });
});

const NOW = "2026-08-12T12:00:00.000Z";
const ago = (mins: number) => new Date(Date.parse(NOW) - mins * 60_000).toISOString();

describe("availabilityTimeline", () => {
  it("leaves a gap where nothing was checked, rather than inventing a number", () => {
    /*
     * Zero would draw an outage nobody observed; 100% would claim a successful
     * check that never ran. A gap is the only honest shape for "we did not
     * look" — and with a daily prober most buckets are exactly that.
     */
    const points = availabilityTimeline([ev({ at: ago(10) })], {
      hours: 6,
      bucketMinutes: 60,
      now: NOW,
    });

    expect(points).toHaveLength(6);
    expect(points.filter((p) => p.uptime === null)).toHaveLength(5);
    expect(points.at(-1)!.uptime).toBe(1);
  });

  it("reports partial uptime within a bucket", () => {
    const points = availabilityTimeline(
      [
        ev({ at: ago(5) }),
        ev({ at: ago(6) }),
        ev({ at: ago(7), ok: false, status: 503 }),
        ev({ at: ago(8) }),
      ],
      { hours: 1, bucketMinutes: 60, now: NOW }
    );
    const last = points.at(-1)!;

    expect(last.checks).toBe(4);
    expect(last.failed).toBe(1);
    expect(last.uptime).toBe(0.75);
  });

  it("narrows to one target when asked", () => {
    const points = availabilityTimeline(
      [ev({ at: ago(5), target: "a" }), ev({ at: ago(5), target: "b", ok: false })],
      { target: "a", hours: 1, bucketMinutes: 60, now: NOW }
    );
    expect(points.at(-1)!.uptime).toBe(1);
  });

  it("excludes browser telemetry, like the summary does", () => {
    const points = availabilityTimeline([ev({ at: ago(5), source: "web" })], {
      hours: 1,
      bucketMinutes: 60,
      now: NOW,
    });
    expect(points.at(-1)!.uptime).toBeNull();
  });

  it("ignores events outside the window", () => {
    const points = availabilityTimeline([ev({ at: ago(6000) })], {
      hours: 1,
      bucketMinutes: 60,
      now: NOW,
    });
    expect(points.every((p) => p.uptime === null)).toBe(true);
  });
});

describe("availabilityResults", () => {
  it("returns individual checks newest first", () => {
    const rows = availabilityResults([
      ev({ at: ago(30) }),
      ev({ at: ago(5) }),
      ev({ at: ago(60) }),
    ]);
    expect(rows.map((r) => r.at)).toEqual([ago(5), ago(30), ago(60)]);
  });

  it("filters to failures, which is the drill-in that matters", () => {
    const rows = availabilityResults(
      [ev({ at: ago(5) }), ev({ at: ago(6), ok: false, status: 503 })],
      { outcome: "failed" }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe(503);
  });

  it("carries a readable reason for a failure", () => {
    const rows = availabilityResults(
      [ev({ at: ago(5), ok: false, status: 503, errorType: "HTTP 503", errorMessage: "answered 503; expected 200" })],
      { outcome: "failed" }
    );
    expect(rows[0].detail).toBe("answered 503; expected 200");
  });

  it("falls back to the status when there is no message", () => {
    const rows = availabilityResults([ev({ at: ago(5), ok: false, status: 502 })], { outcome: "failed" });
    expect(rows[0].detail).toBe("HTTP 502");
  });

  it("caps how many it returns", () => {
    const many = Array.from({ length: 200 }, (_, i) => ev({ at: ago(i) }));
    expect(availabilityResults(many, { limit: 25 })).toHaveLength(25);
  });
});