import {
  icmTrend,
  byTeam,
  byService,
  bySource,
  timeToAcknowledge,
  timeToMitigate,
  timeToResolve,
  customerImpactMinutes,
  formatMinutes,
} from "./icm-metrics";
import type { Incident, Severity } from "./icm";

/** Only the fields these metrics read; the real Incident is much wider. */
function inc(over: Partial<Incident> = {}): Incident {
  return {
    id: "inc-1",
    title: "t",
    description: "",
    severity: 2 as Severity,
    status: "resolved",
    source: "monitor",
    owningTeam: "platform",
    assignedTo: "sam",
    createdBy: "monitor",
    createdAt: "2026-03-02T10:00:00.000Z",
    acknowledgedAt: null,
    mitigatedAt: null,
    resolvedAt: null,
    impactStartedAt: "2026-03-02T10:00:00.000Z",
    affectedServices: [],
    customersImpacted: 0,
    ...over,
  } as Incident;
}

describe("durations", () => {
  it("measures acknowledge, mitigate and resolve from the incident opening", () => {
    const i = inc({
      createdAt: "2026-03-02T10:00:00.000Z",
      acknowledgedAt: "2026-03-02T10:05:00.000Z",
      mitigatedAt: "2026-03-02T10:40:00.000Z",
      resolvedAt: "2026-03-02T12:00:00.000Z",
    });
    expect(timeToAcknowledge(i)).toBe(5);
    expect(timeToMitigate(i)).toBe(40);
    expect(timeToResolve(i)).toBe(120);
  });

  it("returns null for a milestone that has not happened", () => {
    // Not zero. Zero is a real, excellent value and would pull a median down;
    // "has not been acknowledged yet" must not count as "acknowledged instantly".
    const i = inc({ acknowledgedAt: null, resolvedAt: null });
    expect(timeToAcknowledge(i)).toBeNull();
    expect(timeToResolve(i)).toBeNull();
  });

  it("drops a negative duration rather than clamping it to zero", () => {
    /*
     * A resolution stamped before its own incident is a data problem — clock
     * skew, or a back-dated impact time. Clamping to zero folds it into the
     * median as a perfect response and makes the process look better than it is.
     */
    const i = inc({ createdAt: "2026-03-02T10:00:00.000Z", resolvedAt: "2026-03-02T09:00:00.000Z" });
    expect(timeToResolve(i)).toBeNull();
  });

  it("measures customer impact from when impact began, not when we noticed", () => {
    // These are different questions and the gap between them is often the
    // interesting part of a review.
    const i = inc({
      impactStartedAt: "2026-03-02T09:00:00.000Z",
      createdAt: "2026-03-02T10:00:00.000Z",
      mitigatedAt: "2026-03-02T10:30:00.000Z",
    });
    expect(timeToMitigate(i)).toBe(30);
    expect(customerImpactMinutes(i)).toBe(90);
  });
});

describe("icmTrend", () => {
  const range = { from: "2026-03-01T00:00:00.000Z", to: "2026-03-05T23:59:59.000Z", grain: "day" as const };

  it("emits every bucket in the range, including the quiet ones", () => {
    /*
     * A chart built only from buckets that had incidents draws a straight line
     * across a quiet fortnight and puts the points either side next to each
     * other — which reads as continuous activity, the opposite of the truth.
     */
    const t = icmTrend([inc({ createdAt: "2026-03-03T10:00:00.000Z" })], range);
    expect(t.buckets).toHaveLength(5);
    expect(t.buckets.filter((b) => b.opened === 0)).toHaveLength(4);
  });

  it("buckets by when the incident started, not when it ended", () => {
    /*
     * The important one. Bucketing by resolution moves a week-long incident
     * into the week it ended — the week that then looks bad — and hides the
     * week it began, which is the week something actually went wrong.
     */
    const t = icmTrend(
      [inc({ createdAt: "2026-03-01T10:00:00.000Z", resolvedAt: "2026-03-04T10:00:00.000Z" })],
      range,
    );
    expect(t.buckets[0].opened).toBe(1);
    expect(t.buckets[0].resolved).toBe(0);
    expect(t.buckets[3].opened).toBe(0);
    expect(t.buckets[3].resolved).toBe(1);
  });

  it("counts severity per bucket", () => {
    const t = icmTrend(
      [
        inc({ createdAt: "2026-03-02T01:00:00.000Z", severity: 1 as Severity }),
        inc({ createdAt: "2026-03-02T02:00:00.000Z", severity: 1 as Severity }),
        inc({ createdAt: "2026-03-02T03:00:00.000Z", severity: 3 as Severity }),
      ],
      range,
    );
    const day = t.buckets.find((b) => b.at.startsWith("2026-03-02"))!;
    expect(day.bySeverity[1]).toBe(2);
    expect(day.bySeverity[3]).toBe(1);
    expect(day.bySeverity[0]).toBe(0);
  });

  it("ignores incidents outside the range", () => {
    const t = icmTrend([inc({ createdAt: "2026-02-01T10:00:00.000Z" })], range);
    expect(t.totals.opened).toBe(0);
  });

  it("takes medians only over incidents that reached the milestone", () => {
    const t = icmTrend(
      [
        inc({ createdAt: "2026-03-02T10:00:00.000Z", resolvedAt: "2026-03-02T10:10:00.000Z" }),
        inc({ createdAt: "2026-03-02T10:00:00.000Z", resolvedAt: "2026-03-02T10:30:00.000Z" }),
        inc({ createdAt: "2026-03-02T10:00:00.000Z", resolvedAt: null }), // still open
      ],
      range,
    );
    // The open one must not count as zero, which would make the median 10.
    expect(t.totals.medianTtr).toBe(20);
  });

  it("reports the worst incident as well as the median", () => {
    // A median hides the outlier, and the outlier is usually the one worth
    // talking about in a review.
    const t = icmTrend(
      [
        inc({ createdAt: "2026-03-02T10:00:00.000Z", resolvedAt: "2026-03-02T10:05:00.000Z" }),
        inc({ createdAt: "2026-03-03T10:00:00.000Z", resolvedAt: "2026-03-04T10:00:00.000Z" }),
      ],
      range,
    );
    // Two values, so the median is their midpoint: (5 + 1440) / 2 = 722.5.
    expect(t.totals.medianTtr).toBe(723);
    expect(t.totals.worstTtr).toBe(1440);
  });

  it("sums people affected per bucket", () => {
    const t = icmTrend(
      [
        inc({ createdAt: "2026-03-02T10:00:00.000Z", customersImpacted: 120 }),
        inc({ createdAt: "2026-03-02T11:00:00.000Z", customersImpacted: 30 }),
      ],
      range,
    );
    expect(t.buckets.find((b) => b.at.startsWith("2026-03-02"))!.customersImpacted).toBe(150);
  });

  it("groups weeks from Monday", () => {
    // A Sunday-start week separates a Friday incident from the Monday
    // follow-up that belongs with it.
    const t = icmTrend([inc({ createdAt: "2026-03-08T10:00:00.000Z" })], {
      from: "2026-03-02T00:00:00.000Z",
      to: "2026-03-15T00:00:00.000Z",
      grain: "week",
    });
    const hit = t.buckets.find((b) => b.opened === 1)!;
    // 8 March 2026 is a Sunday, so it belongs to the week beginning Monday 2nd.
    expect(hit.at.startsWith("2026-03-02")).toBe(true);
  });

  it("survives an empty set and a reversed range without throwing", () => {
    expect(icmTrend([], range).buckets).toHaveLength(5);
    expect(icmTrend([], { from: range.to, to: range.from }).buckets).toEqual([]);
  });
});

describe("breakdowns", () => {
  const set = [
    inc({ owningTeam: "platform", source: "monitor", affectedServices: ["api", "web"], customersImpacted: 10 }),
    inc({ owningTeam: "platform", source: "customer", affectedServices: ["api"], customersImpacted: 5 }),
    inc({ owningTeam: "", source: "manual", affectedServices: [] }),
  ];

  it("ranks teams by volume and names the gap honestly", () => {
    const rows = byTeam(set);
    expect(rows[0]).toMatchObject({ key: "platform", count: 2, customersImpacted: 15 });
    // An incident with no team is a real and interesting category, not
    // something to drop from the chart.
    expect(rows.map((r) => r.key)).toContain("unassigned");
  });

  it("counts a multi-service incident under each service", () => {
    /*
     * The counts deliberately sum to more than the incident count. Forcing a
     * primary service would mean picking one arbitrarily and under-reporting
     * every other one it touched.
     */
    const rows = byService(set);
    expect(rows.find((r) => r.key === "api")!.count).toBe(2);
    expect(rows.find((r) => r.key === "web")!.count).toBe(1);
    expect(rows.reduce((s, r) => s + r.count, 0)).toBeGreaterThan(set.length);
  });

  it("splits by how the incident was found", () => {
    // Monitor versus customer is the detection-gap question: incidents a
    // customer told us about are the ones monitoring missed.
    const rows = bySource(set);
    expect(rows.find((r) => r.key === "customer")!.count).toBe(1);
    expect(rows.find((r) => r.key === "monitor")!.count).toBe(1);
  });
});

describe("formatMinutes", () => {
  it("does not claim precision it does not have", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(80)).toBe("1h 20m");
    expect(formatMinutes(1440)).toBe("1d");
    expect(formatMinutes(1620)).toBe("1d 3h");
  });

  it("renders a missing value as a dash rather than zero", () => {
    // "0m" would mean an instant response; there simply is no measurement.
    expect(formatMinutes(null)).toBe("—");
    expect(formatMinutes(undefined)).toBe("—");
    expect(formatMinutes(NaN)).toBe("—");
  });
});
