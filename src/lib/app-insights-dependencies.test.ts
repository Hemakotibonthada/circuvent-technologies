/**
 * Dependencies and the application map.
 *
 * The property that matters most here is separation: a dependency must never
 * be counted as a request. If it is, the console reports that our own API is
 * slow when the truth is that something it waits on is, and the wrong team
 * spends the afternoon on it.
 */

import {
  dependencyStats,
  applicationMap,
  requestStats,
  normaliseEvent,
  type TelemetryEvent,
} from "./app-insights";

const ev = (p: Partial<TelemetryEvent>): TelemetryEvent => ({
  id: Math.random().toString(36).slice(2),
  kind: "dependency",
  at: "2026-08-12T12:00:00.000Z",
  path: "/devices",
  session: "s1",
  durationMs: 100,
  status: 200,
  ok: true,
  source: "web",
  target: "control-plane",
  ...p,
});

describe("dependencyStats", () => {
  it("does not count requests as dependencies", () => {
    expect(dependencyStats([ev({ kind: "request" })])).toEqual([]);
  });

  it("does not count dependencies as requests", () => {
    // The mirror of the above, and the more damaging direction: an outbound
    // call counted as inbound blames our own API for someone else's latency.
    expect(requestStats([ev({ kind: "dependency" })])).toEqual([]);
  });

  it("names an operation by service, verb and path", () => {
    const rows = dependencyStats([ev({ method: "POST", path: "/devices/[id]/command" })]);
    expect(rows[0].name).toBe("control-plane POST /devices/[id]/command");
  });

  it("keeps two services apart even on the same path", () => {
    const rows = dependencyStats([
      ev({ target: "control-plane", path: "/health" }),
      ev({ target: "payments", path: "/health" }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it("counts an unreachable service as a failure", () => {
    const rows = dependencyStats([ev({ status: 0, ok: false, durationMs: 5000 })]);
    expect(rows[0].failed).toBe(1);
    expect(rows[0].failureRate).toBe(1);
  });

  it("puts a failing dependency above a merely slow one", () => {
    const rows = dependencyStats([
      ev({ path: "/slow", durationMs: 9000 }),
      ev({ path: "/broken", status: 500, ok: false }),
    ]);
    expect(rows[0].path).toBe("/broken");
  });
});

describe("applicationMap", () => {
  it("shows nothing it has not observed", () => {
    expect(applicationMap([])).toEqual([]);
  });

  it("builds browser, app and one node per dependency", () => {
    const nodes = applicationMap([
      ev({ kind: "pageview", target: undefined }),
      ev({ kind: "request", target: undefined }),
      ev({ kind: "dependency", target: "control-plane" }),
      ev({ kind: "dependency", target: "payments" }),
    ]);
    expect(nodes.map((n) => n.id)).toEqual([
      "Browser",
      "circuvent.com",
      "control-plane",
      "payments",
    ]);
  });

  it("attributes failure to the node that actually failed", () => {
    const nodes = applicationMap([
      ev({ kind: "request", target: undefined, ok: true, status: 200 }),
      ev({ kind: "dependency", target: "control-plane", ok: false, status: 500 }),
    ]);
    const app = nodes.find((n) => n.id === "circuvent.com")!;
    const dep = nodes.find((n) => n.id === "control-plane")!;
    expect(app.failureRate).toBe(0);
    expect(dep.failureRate).toBe(1);
  });
});

describe("normaliseEvent — dependency target", () => {
  const ctx = { now: "2026-08-12T12:00:00.000Z", session: "s", source: "web" };

  it("accepts a plain service name", () => {
    const e = normaliseEvent(
      { kind: "dependency", path: "/x", target: "control-plane" },
      ctx
    );
    expect(e?.target).toBe("control-plane");
  });

  it("strips anything that is not slug-safe, because it becomes a row label", () => {
    const e = normaliseEvent(
      { kind: "dependency", path: "/x", target: "<img onerror=alert(1)>" },
      ctx
    );
    expect(e?.target).not.toContain("<");
    expect(e?.target).not.toContain(">");
  });

  it("ignores a target on a non-dependency event", () => {
    const e = normaliseEvent({ kind: "request", path: "/x", target: "control-plane" }, ctx);
    expect(e?.target).toBeUndefined();
  });
});
