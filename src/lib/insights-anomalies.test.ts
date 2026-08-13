/**
 * Smart detection.
 *
 * The failure mode of an anomaly detector is not missing an outage — it is
 * crying wolf until people mute it, after which it misses every outage. So
 * most of these tests assert that it stays quiet.
 */

import { detectAnomalies } from "./insights-anomalies";
import type { TelemetryEvent } from "./app-insights";

const NOW = "2026-08-12T12:00:00.000Z";
const minsAgo = (n: number) => new Date(Date.parse(NOW) - n * 60_000).toISOString();

let seq = 0;
const ev = (p: Partial<TelemetryEvent>): TelemetryEvent => ({
  id: `e${seq++}`,
  kind: "request",
  at: minsAgo(10),
  path: "/api/devices",
  method: "GET",
  session: "s1",
  durationMs: 50,
  status: 200,
  ok: true,
  source: "web",
  ...p,
});

/** n events inside the window (last hour). */
const recent = (n: number, p: Partial<TelemetryEvent> = {}) =>
  Array.from({ length: n }, () => ev({ at: minsAgo(10), ...p }));

/** n events in the baseline (before the window). */
const before = (n: number, p: Partial<TelemetryEvent> = {}) =>
  Array.from({ length: n }, () => ev({ at: minsAgo(300), ...p }));

describe("detectAnomalies — staying quiet", () => {
  it("says nothing about nothing", () => {
    expect(detectAnomalies([], NOW)).toEqual([]);
  });

  it("says nothing when everything is healthy", () => {
    expect(detectAnomalies([...before(100), ...recent(100)], NOW)).toEqual([]);
  });

  it("ignores a small sample, however bad it looks", () => {
    // Three calls, all failing, is 100% — and is one person on a train.
    const events = [...before(100), ...recent(3, { ok: false, status: 500 })];
    expect(detectAnomalies(events, NOW)).toEqual([]);
  });

  it("ignores a large relative jump that is still tiny", () => {
    // 1% → 3%: tripled, and nobody can feel it.
    const events = [
      ...before(1000, { ok: true }),
      ...before(10, { ok: false, status: 500 }),
      ...recent(97),
      ...recent(3, { ok: false, status: 500 }),
    ];
    expect(detectAnomalies(events, NOW)).toEqual([]);
  });

  it("ignores a latency change that is proportionally big but absolutely trivial", () => {
    const events = [
      ...before(50, { durationMs: 4 }),
      ...recent(50, { durationMs: 9 }),
    ];
    expect(detectAnomalies(events, NOW)).toEqual([]);
  });

  it("ignores a single novel exception", () => {
    const events = [
      ...before(100),
      ...recent(100),
      ev({ kind: "exception", ok: false, errorType: "WeirdError", at: minsAgo(5) }),
    ];
    expect(detectAnomalies(events, NOW)).toEqual([]);
  });
});

describe("detectAnomalies — speaking up", () => {
  it("reports a real failure spike", () => {
    const events = [
      ...before(200, { ok: true }),
      ...recent(20, { ok: true }),
      ...recent(30, { ok: false, status: 500 }),
    ];
    const found = detectAnomalies(events, NOW);
    const failure = found.find((a) => a.fingerprint.startsWith("telemetry:failures:"));
    expect(failure).toBeDefined();
    expect(failure!.evidence.failed).toBe(30);
  });

  it("calls a majority-failing operation critical", () => {
    const events = [
      ...before(200, { ok: true }),
      ...recent(10, { ok: true }),
      ...recent(40, { ok: false, status: 500 }),
    ];
    const found = detectAnomalies(events, NOW);
    expect(found[0].severity).toBe("critical");
  });

  it("reports a real latency regression", () => {
    const events = [
      ...before(50, { durationMs: 100 }),
      ...recent(50, { durationMs: 2000 }),
    ];
    const found = detectAnomalies(events, NOW);
    expect(found.some((a) => a.fingerprint.startsWith("telemetry:latency:"))).toBe(true);
  });

  it("reports a dependency that answers nothing", () => {
    const events = [
      ...recent(4, { kind: "dependency", path: "/health", target: "control-plane", ok: false, status: 0 }),
    ];
    const found = detectAnomalies(events, NOW);
    const down = found.find((a) => a.fingerprint.startsWith("telemetry:availability:"));
    expect(down).toBeDefined();
    expect(down!.severity).toBe("critical");
  });

  it("does not report a dependency that is merely flaky", () => {
    const events = [
      ...recent(3, { kind: "dependency", path: "/health", target: "control-plane", ok: false, status: 0 }),
      ...recent(1, { kind: "dependency", path: "/health", target: "control-plane", ok: true }),
    ];
    const found = detectAnomalies(events, NOW);
    expect(found.some((a) => a.fingerprint.startsWith("telemetry:availability:"))).toBe(false);
  });

  it("reports an error type that has never been seen", () => {
    const events = [
      ...before(100),
      ...recent(100),
      ...recent(3, { kind: "exception", ok: false, errorType: "TypeError" }),
    ];
    const found = detectAnomalies(events, NOW);
    expect(found.some((a) => a.fingerprint === "telemetry:new-error:TypeError")).toBe(true);
  });

  it("does not call a familiar error new", () => {
    const events = [
      ...before(5, { kind: "exception", ok: false, errorType: "TypeError" }),
      ...recent(5, { kind: "exception", ok: false, errorType: "TypeError" }),
    ];
    expect(
      detectAnomalies(events, NOW).some((a) => a.fingerprint.startsWith("telemetry:new-error:"))
    ).toBe(false);
  });
});

describe("detectAnomalies — shape", () => {
  it("keeps the fingerprint stable for the same problem, so the bridge files once", () => {
    const events = [
      ...before(200, { ok: true }),
      ...recent(20, { ok: true }),
      ...recent(30, { ok: false, status: 500 }),
    ];
    const a = detectAnomalies(events, NOW)[0];
    const b = detectAnomalies(events, "2026-08-12T12:00:30.000Z")[0];
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("puts critical findings before warnings", () => {
    const events = [
      ...before(200, { ok: true }),
      ...recent(10, { ok: true }),
      ...recent(40, { ok: false, status: 500 }),
      ...before(50, { path: "/api/slow", durationMs: 100 }),
      ...recent(50, { path: "/api/slow", durationMs: 3000 }),
    ];
    const found = detectAnomalies(events, NOW);
    expect(found[0].severity).toBe("critical");
  });

  it("does not let the baseline include the window it is judging", () => {
    /*
     * Everything in the last hour failed and there is no earlier data. If the
     * baseline were allowed to include the window, the comparison would be the
     * spike against itself and nothing would ever fire.
     */
    const events = recent(50, { ok: false, status: 500 });
    const found = detectAnomalies(events, NOW);
    expect(found.some((a) => a.fingerprint.startsWith("telemetry:failures:"))).toBe(true);
  });
});
