import { SEVERITY_MAP, noteEscalation, planFromAlerts, sourceKeyFor } from "@/lib/icm-bridge";
import { acknowledge, createIncident, resolve, type Incident } from "@/lib/icm";
import type { Alert } from "@/lib/anomaly-monitor";

const T = (mins: number) => new Date(Date.UTC(2026, 0, 3, 9, 0, 0) + mins * 60_000).toISOString();
const NOW = T(0);

function alert(over: Partial<Alert> = {}): Alert {
  return {
    fingerprint: "hub-offline:abc",
    severity: "critical",
    title: "Home Hub has not reported in 45 minutes",
    detail: "Last message at 08:15.",
    deviceIds: ["home-hub-1"],
    evidence: { minutesSilent: 45 },
    state: "open",
    firstSeenAt: T(-45),
    lastSeenAt: T(-1),
    occurrences: 5,
    ...over,
  };
}

/** An incident as the bridge would have filed it. */
function filed(a: Alert, at = T(-40)): Incident {
  const plan = planFromAlerts([a], [], { now: at });
  expect(plan.toFile).toHaveLength(1);
  return createIncident("INC-0001", plan.toFile[0], at);
}

describe("which alerts become incidents", () => {
  /*
   * The queue is the thing being protected. An integration that files one
   * incident per finding produces a list nobody reads by lunchtime, which is
   * worse than having no integration at all.
   */
  it("ignores info", () => {
    expect(planFromAlerts([alert({ severity: "info" })], [], { now: NOW }).toFile).toHaveLength(0);
  });

  it("files critical and warning at different severities", () => {
    const crit = planFromAlerts([alert({ severity: "critical" })], [], { now: NOW }).toFile[0];
    const warn = planFromAlerts([alert({ severity: "warning", fingerprint: "b" })], [], { now: NOW }).toFile[0];
    expect(crit.severity).toBe(1);
    expect(warn.severity).toBe(3);
  });

  /*
   * A monitor cannot file a Sev0. Sev0 means the product is down for everyone,
   * which needs judgement a threshold does not have — and automatic paging at
   * the loudest level is how a team learns to mute the pager.
   */
  it("never files at the level that pages everybody", () => {
    for (const sev of Object.values(SEVERITY_MAP)) {
      expect(sev).toBeGreaterThan(0);
    }
  });

  it("does not file for an alert that is already resolved", () => {
    /* It describes something that is over; filing asks somebody to respond to
       history. */
    expect(planFromAlerts([alert({ state: "resolved" })], [], { now: NOW }).toFile).toHaveLength(0);
  });
});

describe("filing only once", () => {
  /*
   * The sweep runs on a schedule and re-reports anything still wrong. Without a
   * stable key this becomes a firehose on its second run — the single most
   * likely way an auto-filing integration destroys the queue it feeds.
   */
  it("does not file again for an alert that already has an incident", () => {
    const a = alert();
    const inc = filed(a);
    const plan = planFromAlerts([a], [inc], { now: NOW });
    expect(plan.toFile).toHaveLength(0);
  });

  it("still files nothing after many sweeps", () => {
    const a = alert();
    let incidents: Incident[] = [];
    for (let i = 0; i < 20; i++) {
      const plan = planFromAlerts([a], incidents, { now: T(i) });
      incidents = [...incidents, ...plan.toFile.map((n, k) => createIncident(`INC-${i}-${k}`, n, T(i)))];
    }
    expect(incidents).toHaveLength(1);
  });

  it("keys on the finding, so a different problem does file", () => {
    const a = alert();
    const b = alert({ fingerprint: "tank-draining:xyz", title: "Tank draining fast" });
    const inc = filed(a);
    expect(planFromAlerts([a, b], [inc], { now: NOW }).toFile).toHaveLength(1);
  });

  it("does not collide with incidents a human filed", () => {
    /* A human incident has no sourceKey, so it can never be mistaken for the
       monitor's and suppress a real filing. */
    const human = createIncident(
      "INC-0009",
      { title: "Something else", severity: 2, owningTeam: "Web", createdBy: "ada" },
      T(-10)
    );
    expect(human.sourceKey).toBeUndefined();
    expect(planFromAlerts([alert()], [human], { now: NOW }).toFile).toHaveLength(1);
  });
});

describe("what gets filed", () => {
  it("carries the finding's detail and suggestion", () => {
    const n = planFromAlerts([alert({ suggestion: "Power-cycle the hub." })], [], { now: NOW }).toFile[0];
    expect(n.description).toContain("Last message at 08:15.");
    expect(n.description).toContain("Power-cycle the hub.");
  });

  /*
   * Impact began when the problem was first seen, not when the sweep got round
   * to filing — otherwise a monitor that runs every ten minutes flatters every
   * mitigation time by up to ten minutes.
   */
  it("dates the impact from when the problem started", () => {
    const a = alert({ firstSeenAt: T(-45) });
    expect(planFromAlerts([a], [], { now: NOW }).toFile[0].impactStartedAt).toBe(T(-45));
  });

  it("is attributed to the monitor, not to a person", () => {
    const n = planFromAlerts([alert()], [], { now: NOW }).toFile[0];
    expect(n.createdBy).toBe("monitor");
    expect(n.source).toBe("monitor");
    expect(n.tags).toContain("auto");
  });

  it("routes to a team the caller chooses", () => {
    const n = planFromAlerts([alert()], [], { now: NOW, owningTeam: "Control Plane" }).toFile[0];
    expect(n.owningTeam).toBe("Control Plane");
  });

  it("does not list an unbounded number of devices", () => {
    const many = Array.from({ length: 50 }, (_, i) => `dev-${i}`);
    const n = planFromAlerts([alert({ deviceIds: many })], [], { now: NOW }).toFile[0];
    expect(n.affectedServices!.length).toBeLessThanOrEqual(8);
  });
});

describe("closing incidents when the alert clears", () => {
  it("resolves an untouched incident once its alert stops being reported", () => {
    const a = alert();
    const inc = filed(a);
    const plan = planFromAlerts([], [inc], { now: NOW });
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0].status).toBe("resolved");
    expect(plan.toUpdate[0].rootCause).toContain("stopped being reported");
  });

  /*
   * The important restraint. If a person has acknowledged it, the monitor no
   * longer owns this incident — and the alert clearing may be the *result* of
   * their work, so closing it out from under them loses the root cause they
   * were about to write down.
   */
  it("leaves an incident somebody has picked up alone", () => {
    const a = alert();
    const inc = acknowledge(filed(a), "grace", T(-30)).incident;
    expect(planFromAlerts([], [inc], { now: NOW }).toUpdate).toHaveLength(0);
  });

  it("does not touch incidents a human filed", () => {
    const human = createIncident(
      "INC-0002",
      { title: "Manual", severity: 2, owningTeam: "Web", createdBy: "ada" },
      T(-60)
    );
    expect(planFromAlerts([], [human], { now: NOW }).toUpdate).toHaveLength(0);
  });

  it("does not resolve twice", () => {
    const a = alert();
    const inc = resolve(filed(a), "monitor", "gone", T(-5)).incident;
    expect(planFromAlerts([], [inc], { now: NOW }).toUpdate).toHaveLength(0);
  });

  it("can be switched off", () => {
    const inc = filed(alert());
    expect(planFromAlerts([], [inc], { now: NOW, autoResolve: false }).toUpdate).toHaveLength(0);
  });

  it("leaves it open while the alert is still firing", () => {
    const a = alert();
    const inc = filed(a);
    expect(planFromAlerts([a], [inc], { now: NOW }).toUpdate).toHaveLength(0);
  });
});

describe("escalation notes", () => {
  it("adds a comment rather than changing status", () => {
    const inc = filed(alert());
    const before = inc.status;
    const after = noteEscalation(inc, alert({ severity: "critical", occurrences: 9 }), NOW);
    expect(after.status).toBe(before);
    expect(after.timeline.at(-1)!.kind).toBe("comment");
    expect(after.timeline.at(-1)!.body).toContain("9 sightings");
  });
});

describe("the source key", () => {
  it("is stable for the same finding and different for another", () => {
    expect(sourceKeyFor(alert())).toBe(sourceKeyFor(alert()));
    expect(sourceKeyFor(alert())).not.toBe(sourceKeyFor(alert({ fingerprint: "other" })));
  });

  it("is namespaced, so nothing else can look like a monitor incident", () => {
    expect(sourceKeyFor(alert())).toMatch(/^monitor:/);
  });
});
