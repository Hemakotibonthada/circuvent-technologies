import {
  evaluateRule,
  evaluateRules,
  validateRule,
  describeRule,
  ruleFingerprint,
  defaultRules,
  type AlertRule,
} from "./insights-alert-rules";
import type { TelemetryEvent } from "./app-insights";

const NOW = "2026-06-01T12:00:00.000Z";
const minsAgo = (n: number) => new Date(Date.parse(NOW) - n * 60_000).toISOString();

const ev = (over: Partial<TelemetryEvent> = {}): TelemetryEvent => ({
  id: Math.random().toString(36).slice(2),
  kind: "request",
  at: minsAgo(5),
  path: "/api/checkout",
  session: "s1",
  durationMs: 100,
  status: 200,
  ok: true,
  source: "web",
  ...over,
});

const rule = (over: Partial<AlertRule> = {}): AlertRule => ({
  id: "r1",
  name: "Test rule",
  enabled: true,
  metric: "failureRate",
  splitBy: "none",
  comparison: "above",
  threshold: 10,
  windowMins: 60,
  minSamples: 10,
  severity: "warning",
  createdBy: "ops",
  createdAt: NOW,
  ...over,
});

describe("evaluateRule", () => {
  it("fires when the metric crosses the threshold", () => {
    const events = [
      ...Array(80).fill(0).map(() => ev()),
      ...Array(20).fill(0).map(() => ev({ ok: false, status: 500 })),
    ];
    const [r] = evaluateRule(rule(), events, NOW);

    expect(r.value).toBe(20);
    expect(r.breached).toBe(true);
    expect(r.reason).toContain("above");
  });

  it("does not fire when the metric is within the threshold", () => {
    const events = [
      ...Array(95).fill(0).map(() => ev()),
      ...Array(5).fill(0).map(() => ev({ ok: false, status: 500 })),
    ];
    const [r] = evaluateRule(rule(), events, NOW);

    expect(r.breached).toBe(false);
    expect(r.reason).toContain("within");
  });

  it("refuses to fire on too few samples, and says so", () => {
    // 100% failure rate — but from two calls, which is not evidence.
    const events = Array(2).fill(0).map(() => ev({ ok: false, status: 500 }));
    const [r] = evaluateRule(rule({ minSamples: 10 }), events, NOW);

    expect(r.value).toBe(100);
    expect(r.breached).toBe(false);
    expect(r.reason).toBe("2 of 10 samples needed");
  });

  it("supports a below comparison for metrics that should not fall", () => {
    const events = Array(50).fill(0).map(() => ev());
    const [r] = evaluateRule(
      rule({ metric: "count", comparison: "below", threshold: 100, minSamples: 1 }),
      events,
      NOW
    );

    expect(r.value).toBe(50);
    expect(r.breached).toBe(true);
  });

  it("evaluates a split rule once per dimension value", () => {
    const events = [
      ...Array(20).fill(0).map(() => ev({ path: "/api/a", ok: false, status: 500 })),
      ...Array(20).fill(0).map(() => ev({ path: "/api/b" })),
    ];
    const rs = evaluateRule(rule({ splitBy: "path", minSamples: 10 }), events, NOW);

    expect(rs).toHaveLength(2);
    expect(rs.find((r) => r.key === "/api/a")!.breached).toBe(true);
    expect(rs.find((r) => r.key === "/api/b")!.breached).toBe(false);
  });

  it("honours a scope, ignoring every other dimension value", () => {
    const events = [
      ...Array(20).fill(0).map(() => ev({ path: "/api/a", ok: false, status: 500 })),
      ...Array(20).fill(0).map(() => ev({ path: "/api/b" })),
    ];
    const rs = evaluateRule(rule({ splitBy: "path", scope: "/api/b", minSamples: 10 }), events, NOW);

    expect(rs).toHaveLength(1);
    expect(rs[0].key).toBe("/api/b");
    expect(rs[0].breached).toBe(false);
  });

  it("reports no telemetry rather than treating silence as zero", () => {
    // A "failure rate below 1%" rule must not fire just because nothing ran.
    const [r] = evaluateRule(rule({ comparison: "below", threshold: 1 }), [], NOW);

    expect(r.breached).toBe(false);
    expect(r.reason).toBe("no telemetry in the window");
  });

  it("ignores events outside the rule's own window", () => {
    const events = [
      ...Array(50).fill(0).map(() => ev({ at: minsAgo(5) })),
      ...Array(50).fill(0).map(() => ev({ at: minsAgo(600), ok: false, status: 500 })),
    ];
    const [r] = evaluateRule(rule({ windowMins: 60, minSamples: 10 }), events, NOW);

    expect(r.samples).toBe(50);
    expect(r.value).toBe(0);
    expect(r.breached).toBe(false);
  });
});

describe("evaluateRules", () => {
  it("skips disabled rules entirely", () => {
    const events = Array(50).fill(0).map(() => ev({ ok: false, status: 500 }));
    const { alerts, evaluations } = evaluateRules([rule({ enabled: false })], events, NOW);

    expect(alerts).toHaveLength(0);
    expect(evaluations).toHaveLength(0);
  });

  it("emits an alert the ICM bridge can consume", () => {
    const events = Array(50).fill(0).map(() => ev({ ok: false, status: 500 }));
    const { alerts } = evaluateRules([rule()], events, NOW);

    expect(alerts).toHaveLength(1);
    const a = alerts[0];
    // The bridge keys on fingerprint and refuses anything not "open".
    expect(a.fingerprint).toBe("rule:r1:All");
    expect(a.state).toBe("open");
    expect(a.severity).toBe("warning");
    expect(a.title).toBe("Test rule");
    expect(a.evidence.threshold).toBe(10);
  });

  it("gives each dimension value its own fingerprint", () => {
    const events = [
      ...Array(20).fill(0).map(() => ev({ path: "/api/a", ok: false, status: 500 })),
      ...Array(20).fill(0).map(() => ev({ path: "/api/b", ok: false, status: 500 })),
    ];
    const { alerts } = evaluateRules([rule({ splitBy: "path", minSamples: 10 })], events, NOW);

    expect(alerts.map((a) => a.fingerprint).sort()).toEqual(["rule:r1:/api/a", "rule:r1:/api/b"]);
  });

  it("reports evaluations that did not fire, so a silent rule is visible", () => {
    const events = Array(50).fill(0).map(() => ev());
    const { alerts, evaluations } = evaluateRules([rule()], events, NOW);

    expect(alerts).toHaveLength(0);
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0].reason).toContain("within");
  });

  it("keys the fingerprint on the rule id, not its threshold", () => {
    // Editing a threshold must not orphan the incident the rule already filed.
    const a = ruleFingerprint(rule({ threshold: 10 }), "All");
    const b = ruleFingerprint(rule({ threshold: 90 }), "All");
    expect(a).toBe(b);
  });
});

describe("validateRule", () => {
  const ok = rule();

  it("accepts a well-formed rule", () => {
    expect(validateRule(ok)).toBe("");
  });

  it("rejects a rule with no name", () => {
    expect(validateRule({ ...ok, name: "  " })).toContain("name");
  });

  it("rejects an unknown metric or split", () => {
    expect(validateRule({ ...ok, metric: "profit" as never })).toBe("Unknown metric.");
    expect(validateRule({ ...ok, splitBy: "password" as never })).toBe("Unknown split.");
  });

  it("rejects a non-numeric threshold", () => {
    expect(validateRule({ ...ok, threshold: NaN })).toContain("numeric threshold");
  });

  it("rejects an absurd window", () => {
    expect(validateRule({ ...ok, windowMins: 0 })).toContain("between 1 minute");
    expect(validateRule({ ...ok, windowMins: 99999 })).toContain("between 1 minute");
  });

  it("rejects a critical rule that could page on a handful of samples", () => {
    expect(validateRule({ ...ok, severity: "critical", minSamples: 3 })).toContain("page on noise");
    expect(validateRule({ ...ok, severity: "critical", minSamples: 10 })).toBe("");
  });
});

describe("describeRule", () => {
  it("reads as a sentence, with the metric's unit", () => {
    expect(describeRule(rule({ metric: "p95", threshold: 3000, windowMins: 15 }))).toBe(
      "Duration P95 above 3000 ms over 15m"
    );
    expect(describeRule(rule({ metric: "failureRate", threshold: 5 }))).toBe(
      "Failure rate above 5% over 60m"
    );
  });

  it("names the scope when there is one", () => {
    expect(describeRule(rule({ splitBy: "path", scope: "/api/checkout" }))).toContain("for /api/checkout");
    expect(describeRule(rule({ splitBy: "path" }))).toContain("for any operation");
  });
});

describe("defaultRules", () => {
  it("ships rules that all pass their own validator", () => {
    for (const r of defaultRules(NOW)) expect(validateRule(r)).toBe("");
  });

  it("does not fire on a healthy system", () => {
    const events = Array(200).fill(0).map(() => ev({ durationMs: 80 }));
    const { alerts } = evaluateRules(defaultRules(NOW), events, NOW);
    expect(alerts).toHaveLength(0);
  });

  it("fires when the system is genuinely unhealthy", () => {
    const events = Array(200).fill(0).map(() => ev({ ok: false, status: 500, durationMs: 9000 }));
    const { alerts } = evaluateRules(defaultRules(NOW), events, NOW);

    expect(alerts.map((a) => a.evidence.rule).sort()).toEqual([
      "rule-failure-rate",
      "rule-operation-failures",
      "rule-slow-p95",
    ]);
  });
});
