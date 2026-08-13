/**
 * Detection to incident, through the existing bridge.
 *
 * Both halves were tested alone, which is exactly the condition under which a
 * pipeline still fails to join up. This asserts that a telemetry finding
 * becomes an incident and, more importantly, that it inherits the bridge's
 * rules rather than getting a new path around them.
 */

import { detectAnomalies } from "./insights-anomalies";
import { planFromAlerts } from "./icm-bridge";
import type { TelemetryEvent } from "./app-insights";
import type { Incident } from "./icm";

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

const many = (n: number, p: Partial<TelemetryEvent> = {}) =>
  Array.from({ length: n }, () => ev(p));

/** A window where /api/devices is badly broken. */
const brokenEvents = () => [
  ...many(200, { at: minsAgo(300), ok: true }),
  ...many(10, { at: minsAgo(10), ok: true }),
  ...many(40, { at: minsAgo(10), ok: false, status: 500 }),
];

describe("telemetry findings reaching ICM", () => {
  it("files an incident for a real failure spike", () => {
    const alerts = detectAnomalies(brokenEvents(), NOW);
    expect(alerts.length).toBeGreaterThan(0);

    const plan = planFromAlerts(alerts, [], { now: NOW });
    expect(plan.toFile.length).toBeGreaterThan(0);
    expect(plan.toFile[0].title).toContain("/api/devices");
  });

  it("does not file a second incident for the same problem", () => {
    // The detector runs on a schedule and will report the same spike again.
    // The bridge keys on the fingerprint, and that is what stops a queue full
    // of one outage.
    const alerts = detectAnomalies(brokenEvents(), NOW);
    const plan1 = planFromAlerts(alerts, [], { now: NOW });

    const existing: Incident[] = plan1.toFile.map((c, i) => ({
      ...c,
      id: `INC-${i}`,
      status: "active",
      timeline: [],
      createdAt: NOW,
      acknowledgedAt: null,
      mitigatedAt: null,
      resolvedAt: null,
      assignee: null,
      team: null,
      rootCause: null,
    })) as unknown as Incident[];

    const plan2 = planFromAlerts(alerts, existing, { now: NOW });
    expect(plan2.toFile).toHaveLength(0);
  });

  it("never opens a Sev0 from telemetry, however bad the numbers", () => {
    /*
     * Sev0 means the product is gone for everybody, and that is a judgement a
     * person makes. A detector that could reach it would page the company for
     * one broken route.
     */
    const alerts = detectAnomalies(brokenEvents(), NOW);
    const plan = planFromAlerts(alerts, [], { now: NOW });
    for (const inc of plan.toFile) {
      expect(inc.severity).toBeGreaterThan(0);
    }
  });

  it("files nothing when the system is healthy", () => {
    const healthy = [...many(200, { at: minsAgo(300) }), ...many(200, { at: minsAgo(10) })];
    const alerts = detectAnomalies(healthy, NOW);
    expect(alerts).toEqual([]);
    expect(planFromAlerts(alerts, [], { now: NOW }).toFile).toHaveLength(0);
  });

  it("carries the evidence into the incident, so the responder is not starting cold", () => {
    const alerts = detectAnomalies(brokenEvents(), NOW);
    const plan = planFromAlerts(alerts, [], { now: NOW });
    const body = JSON.stringify(plan.toFile[0]);
    // The numbers that justified filing must survive the trip.
    expect(body).toMatch(/failed|%/);
  });
});
