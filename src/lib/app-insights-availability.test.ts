/**
 * Availability, derived from health checks.
 *
 * The number this produces is the kind people quote in a meeting, so the ways
 * it can be quietly wrong matter more than usual: a check counted twice, a
 * failure counted as a success, or an empty window reported as 100%.
 */

import { availability, type TelemetryEvent } from "./app-insights";

const ev = (p: Partial<TelemetryEvent>): TelemetryEvent => ({
  id: Math.random().toString(36).slice(2),
  kind: "dependency",
  at: "2026-08-12T12:00:00.000Z",
  path: "/health",
  session: "s1",
  durationMs: 40,
  status: 200,
  ok: true,
  source: "web",
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

  it("ignores calls that are not the health check", () => {
    const rows = availability([ev({ path: "/devices", ok: false })]);
    expect(rows).toEqual([]);
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
