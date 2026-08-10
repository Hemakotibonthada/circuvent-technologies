/**
 * The behaviours that make monitoring different from detection.
 *
 * Every test here corresponds to a way this goes wrong in production: alerting
 * forever about one dead device, going silent because the problem is not new,
 * reporting a fleet-wide recovery when the evaluation simply failed, or
 * quietly keeping an acknowledged alert quiet after it has become critical.
 */
import {
  sweep,
  fingerprint,
  acknowledge,
  summarise,
  sortAlerts,
  alertAgeMs,
  RENOTIFY_AFTER_MS,
  type Alert,
} from "./anomaly-monitor";
import type { Finding } from "./ai/analysis";

const T0 = new Date("2026-03-01T00:00:00Z").getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: "device-offline",
  severity: "critical",
  title: "Hub is offline",
  detail: "hub-a1b2c3 has not reported in 40 minutes.",
  deviceIds: ["hub-a1b2c3"],
  evidence: { minutesSinceSeen: 40 },
  ...over,
});

describe("fingerprint", () => {
  it("identifies the problem, not the occurrence", () => {
    // Several detectors put a timestamp in the id. Keyed on that, the same
    // dead device would look new on every sweep and alert forever.
    const a = finding({ id: "device-offline-1772323200000" });
    const b = finding({ id: "device-offline-1772326800000" });
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("separates the same problem on different devices", () => {
    expect(fingerprint(finding({ deviceIds: ["hub-1"] }))).not.toBe(fingerprint(finding({ deviceIds: ["hub-2"] })));
  });

  it("does not care about device order", () => {
    expect(fingerprint(finding({ deviceIds: ["b", "a"] }))).toBe(fingerprint(finding({ deviceIds: ["a", "b"] })));
  });

  it("separates different kinds of problem on the same device", () => {
    expect(fingerprint(finding({ id: "device-offline" }))).not.toBe(fingerprint(finding({ id: "standby-drain" })));
  });

  it("does not throw on a finding with no devices", () => {
    expect(() => fingerprint(finding({ deviceIds: [] }))).not.toThrow();
  });
});

describe("sweep — raising and persisting", () => {
  it("opens an alert the first time a finding appears", () => {
    const r = sweep([], [finding()], { now: T0 });
    expect(r.opened).toHaveLength(1);
    expect(r.alerts[0].state).toBe("open");
    expect(r.alerts[0].occurrences).toBe(1);
  });

  it("keeps one alert while the same problem persists, counting it", () => {
    let alerts: Alert[] = [];
    for (let i = 0; i < 5; i++) {
      alerts = sweep(alerts, [finding()], { now: T0 + i * 5 * MIN }).alerts;
    }
    expect(alerts).toHaveLength(1);
    expect(alerts[0].occurrences).toBe(5);
    expect(alerts[0].firstSeenAt).toBe(new Date(T0).toISOString());
    expect(alerts[0].lastSeenAt).toBe(new Date(T0 + 20 * MIN).toISOString());
  });

  it("does not re-open an alert that is already open", () => {
    const first = sweep([], [finding()], { now: T0 });
    const second = sweep(first.alerts, [finding()], { now: T0 + 5 * MIN });
    expect(second.opened).toHaveLength(0);
  });
});

describe("sweep — resolving", () => {
  it("closes an alert by itself when the finding stops appearing", () => {
    // An alert a human has to dismiss becomes an alert everybody ignores.
    const first = sweep([], [finding()], { now: T0 });
    const second = sweep(first.alerts, [finding({ id: "other", deviceIds: ["x"] })], { now: T0 + 5 * MIN });
    const closed = second.alerts.find((a) => a.deviceIds.includes("hub-a1b2c3"));
    expect(closed?.state).toBe("resolved");
    expect(closed?.resolvedAt).toBe(new Date(T0 + 5 * MIN).toISOString());
    expect(second.resolved).toHaveLength(1);
  });

  it("does NOT resolve everything when a sweep produced no findings at all", () => {
    // Zero findings is also what a crashed detector or a timed-out control
    // plane looks like. Closing every alert on that basis would report a
    // fleet-wide recovery that did not happen.
    const first = sweep([], [finding()], { now: T0 });
    const second = sweep(first.alerts, [], { now: T0 + 5 * MIN });
    expect(second.resolved).toHaveLength(0);
    expect(second.alerts[0].state).toBe("open");
  });

  it("does resolve on an empty sweep when the caller confirms the evaluation ran", () => {
    const first = sweep([], [finding()], { now: T0 });
    const second = sweep(first.alerts, [], { now: T0 + 5 * MIN, sweepProducedFindings: true });
    expect(second.resolved).toHaveLength(1);
    expect(second.alerts[0].state).toBe("resolved");
  });

  it("treats a problem that comes back as a new alert, not a continuation", () => {
    const first = sweep([], [finding()], { now: T0 });
    const gone = sweep(first.alerts, [], { now: T0 + HOUR, sweepProducedFindings: true });
    const back = sweep(gone.alerts, [finding()], { now: T0 + 2 * HOUR });
    expect(back.opened).toHaveLength(1);
    expect(back.alerts[0].firstSeenAt).toBe(new Date(T0 + 2 * HOUR).toISOString());
    expect(back.alerts[0].occurrences).toBe(1);
  });

  it("eventually drops resolved alerts so the list does not grow forever", () => {
    const first = sweep([], [finding()], { now: T0 });
    const gone = sweep(first.alerts, [], { now: T0 + HOUR, sweepProducedFindings: true });
    const later = sweep(gone.alerts, [], { now: T0 + 40 * 24 * HOUR, sweepProducedFindings: true });
    expect(later.alerts).toHaveLength(0);
  });
});

describe("sweep — escalation", () => {
  it("flags an alert that has got worse", () => {
    const first = sweep([], [finding({ severity: "warning" })], { now: T0 });
    const second = sweep(first.alerts, [finding({ severity: "critical" })], { now: T0 + 5 * MIN });
    expect(second.escalated).toHaveLength(1);
    expect(second.alerts[0].severity).toBe("critical");
  });

  it("re-opens an acknowledged alert that becomes critical", () => {
    // Somebody accepted the warning. They did not accept the critical.
    const first = sweep([], [finding({ severity: "warning" })], { now: T0 });
    const acked = acknowledge(first.alerts, first.alerts[0].fingerprint, "asha@example.com", T0 + MIN);
    expect(acked[0].state).toBe("acknowledged");

    const second = sweep(acked, [finding({ severity: "critical" })], { now: T0 + 5 * MIN });
    expect(second.alerts[0].state).toBe("open");
    expect(second.alerts[0].acknowledgedBy).toBeUndefined();
  });

  it("does not escalate when severity improves", () => {
    const first = sweep([], [finding({ severity: "critical" })], { now: T0 });
    const second = sweep(first.alerts, [finding({ severity: "warning" })], { now: T0 + 5 * MIN });
    expect(second.escalated).toHaveLength(0);
  });
});

describe("sweep — notification", () => {
  it("notifies once when an alert opens", () => {
    const r = sweep([], [finding()], { now: T0 });
    expect(r.toNotify).toHaveLength(1);
  });

  it("does not notify again on the very next sweep", () => {
    // The whole reason state exists: polling every few minutes must not mean
    // announcing the same dead device every few minutes.
    const first = sweep([], [finding()], { now: T0 });
    const second = sweep(first.alerts, [finding()], { now: T0 + 5 * MIN });
    expect(second.toNotify).toHaveLength(0);
  });

  it("reminds once the renotify window has passed", () => {
    const first = sweep([], [finding()], { now: T0 });
    const later = sweep(first.alerts, [finding()], { now: T0 + RENOTIFY_AFTER_MS + MIN });
    expect(later.toNotify).toHaveLength(1);
  });

  it("notifies immediately on escalation, without waiting for the window", () => {
    const first = sweep([], [finding({ severity: "warning" })], { now: T0 });
    const second = sweep(first.alerts, [finding({ severity: "critical" })], { now: T0 + 5 * MIN });
    expect(second.toNotify).toHaveLength(1);
  });

  it("never pages anybody about an info finding", () => {
    const r = sweep([], [finding({ severity: "info" })], { now: T0 });
    expect(r.toNotify).toHaveLength(0);
    expect(r.alerts[0].state).toBe("open");
  });

  it("stops reminding once an alert is acknowledged", () => {
    const first = sweep([], [finding()], { now: T0 });
    const acked = acknowledge(first.alerts, first.alerts[0].fingerprint, "asha@example.com", T0 + MIN);
    const later = sweep(acked, [finding()], { now: T0 + RENOTIFY_AFTER_MS + MIN });
    expect(later.toNotify).toHaveLength(0);
  });
});

describe("acknowledge", () => {
  it("records who silenced it and when", () => {
    const first = sweep([], [finding()], { now: T0 });
    const acked = acknowledge(first.alerts, first.alerts[0].fingerprint, "asha@example.com", T0 + MIN);
    expect(acked[0].acknowledgedBy).toBe("asha@example.com");
    expect(acked[0].acknowledgedAt).toBe(new Date(T0 + MIN).toISOString());
  });

  it("leaves other alerts alone", () => {
    const r = sweep([], [finding(), finding({ id: "standby-drain", deviceIds: ["plug-9"], severity: "warning" })], { now: T0 });
    const acked = acknowledge(r.alerts, r.alerts[0].fingerprint, "asha@example.com", T0);
    expect(acked.filter((a) => a.state === "acknowledged")).toHaveLength(1);
  });

  it("ignores a fingerprint that does not exist", () => {
    const r = sweep([], [finding()], { now: T0 });
    expect(acknowledge(r.alerts, "nope", "a@b.com", T0)[0].state).toBe("open");
  });
});

describe("summarise and sort", () => {
  it("counts by state and severity and names the worst open severity", () => {
    const r = sweep(
      [],
      [finding(), finding({ id: "standby-drain", deviceIds: ["plug-9"], severity: "warning" }), finding({ id: "tip", deviceIds: ["x"], severity: "info" })],
      { now: T0 }
    );
    const s = summarise(r.alerts);
    expect(s.open).toBe(3);
    expect(s.critical).toBe(1);
    expect(s.warning).toBe(1);
    expect(s.worst).toBe("critical");
  });

  it("reports no worst severity when nothing is open", () => {
    expect(summarise([]).worst).toBeNull();
  });

  it("puts open criticals first, which is the order somebody triaging wants", () => {
    const r = sweep(
      [],
      [finding({ id: "standby-drain", deviceIds: ["plug-9"], severity: "warning" }), finding()],
      { now: T0 }
    );
    expect(sortAlerts(r.alerts)[0].severity).toBe("critical");
  });
});

describe("alertAgeMs", () => {
  it("measures from when the problem started, not when it was last seen", () => {
    const first = sweep([], [finding()], { now: T0 });
    const later = sweep(first.alerts, [finding()], { now: T0 + 3 * HOUR });
    expect(alertAgeMs(later.alerts[0], T0 + 3 * HOUR)).toBe(3 * HOUR);
  });

  it("never reports a negative age", () => {
    const r = sweep([], [finding()], { now: T0 });
    expect(alertAgeMs(r.alerts[0], T0 - HOUR)).toBe(0);
  });
});
