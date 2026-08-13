import { metricSeries, applyMetric, type TelemetryEvent } from "./app-insights";

const NOW = "2026-06-01T12:00:00.000Z";

const ev = (over: Partial<TelemetryEvent> = {}): TelemetryEvent => ({
  id: Math.random().toString(36).slice(2),
  kind: "request",
  at: NOW,
  path: "/api/a",
  session: "s1",
  durationMs: 100,
  status: 200,
  ok: true,
  source: "web",
  ...over,
});

const minsAgo = (n: number) => new Date(new Date(NOW).getTime() - n * 60_000).toISOString();

describe("applyMetric", () => {
  it("returns zero for an empty bag rather than NaN", () => {
    for (const m of ["count", "failures", "failureRate", "p50", "p95", "p99", "avgDuration", "sessions"] as const) {
      expect(applyMetric([], m)).toBe(0);
    }
  });

  it("counts distinct sessions, not events", () => {
    const events = [ev({ session: "a" }), ev({ session: "a" }), ev({ session: "b" })];
    expect(applyMetric(events, "count")).toBe(3);
    expect(applyMetric(events, "sessions")).toBe(2);
  });

  it("reports failure rate as a percentage with one decimal", () => {
    const events = [...Array(7).fill(0).map(() => ev()), ...Array(3).fill(0).map(() => ev({ ok: false, status: 500 }))];
    expect(applyMetric(events, "failureRate")).toBe(30);
    expect(applyMetric(events, "failures")).toBe(3);
  });

  it("does not let one slow call drag the median", () => {
    const events = [...Array(9).fill(0).map(() => ev({ durationMs: 10 })), ev({ durationMs: 5000 })];
    expect(applyMetric(events, "p50")).toBe(10);
    expect(applyMetric(events, "avgDuration")).toBe(509);
  });
});

describe("metricSeries", () => {
  it("emits empty buckets as zero so an outage is visible as a trough", () => {
    // Traffic only in the most recent bucket; everything before it is silence.
    const events = Array.from({ length: 5 }, () => ev({ at: minsAgo(2) }));
    const { series } = metricSeries(events, { metric: "count", hours: 1, bucketMinutes: 10, now: NOW });

    expect(series).toHaveLength(1);
    expect(series[0].points).toHaveLength(6);
    expect(series[0].points.filter((p) => p.value === 0)).toHaveLength(5);
    expect(series[0].points.at(-1)!.value).toBe(5);
  });

  it("splits by a dimension and totals each series over the whole window", () => {
    const events = [
      ...Array(4).fill(0).map(() => ev({ path: "/api/a", at: minsAgo(50) })),
      ...Array(2).fill(0).map(() => ev({ path: "/api/b", at: minsAgo(5) })),
    ];
    const { series } = metricSeries(events, { metric: "count", splitBy: "path", hours: 2, now: NOW });

    expect(series.map((s) => s.key)).toEqual(["/api/a", "/api/b"]);
    expect(series.map((s) => s.total)).toEqual([4, 2]);
  });

  it("drops events with no value for the split rather than bucketing them as empty", () => {
    const events = [ev({ method: "GET" }), ev({ method: undefined }), ev({ kind: "pageview", status: 0 })];
    const { series } = metricSeries(events, { metric: "count", splitBy: "method", hours: 1, now: NOW });

    expect(series).toHaveLength(1);
    expect(series[0].key).toBe("GET");
    expect(series[0].total).toBe(1);
  });

  it("classes status codes by hundreds and ignores those that have none", () => {
    const events = [ev({ status: 200 }), ev({ status: 204 }), ev({ status: 503, ok: false }), ev({ kind: "pageview", status: 0 })];
    const { series } = metricSeries(events, { metric: "count", splitBy: "statusClass", hours: 1, now: NOW });

    expect(series.map((s) => `${s.key}=${s.total}`).sort()).toEqual(["2xx=2", "5xx=1"]);
  });

  it("ranks kept series by volume, not by the metric being charted", () => {
    // /slow is called twice and is slow; /fast is called 100 times. A p95
    // leaderboard would put /slow first, which is the wrong chart.
    const events = [
      ...Array(100).fill(0).map(() => ev({ path: "/fast", durationMs: 10 })),
      ...Array(2).fill(0).map(() => ev({ path: "/slow", durationMs: 9000 })),
    ];
    const { series, truncated } = metricSeries(events, {
      metric: "p95",
      splitBy: "path",
      hours: 1,
      now: NOW,
      topN: 1,
    });

    expect(series).toHaveLength(1);
    expect(series[0].key).toBe("/fast");
    expect(truncated).toBe(1);
  });

  it("excludes events outside the window", () => {
    const events = [ev({ at: minsAgo(10) }), ev({ at: minsAgo(600) })];
    const { series } = metricSeries(events, { metric: "count", hours: 1, now: NOW });
    expect(series[0].total).toBe(1);
  });

  it("ignores events with an unparseable timestamp instead of throwing", () => {
    const events = [ev(), ev({ at: "not a date" })];
    const { series } = metricSeries(events, { metric: "count", hours: 1, now: NOW });
    expect(series[0].total).toBe(1);
  });

  it("picks a coarser bucket for a longer window", () => {
    expect(metricSeries([], { metric: "count", hours: 1, now: NOW }).bucketMinutes).toBe(1);
    expect(metricSeries([], { metric: "count", hours: 24, now: NOW }).bucketMinutes).toBe(15);
    expect(metricSeries([], { metric: "count", hours: 72, now: NOW }).bucketMinutes).toBe(60);
  });

  it("records how many samples fed each point so a thin percentile is spottable", () => {
    const events = [ev({ at: minsAgo(2), durationMs: 900 })];
    const { series } = metricSeries(events, { metric: "p99", hours: 1, bucketMinutes: 10, now: NOW });
    const last = series[0].points.at(-1)!;
    expect(last.value).toBe(900);
    expect(last.samples).toBe(1);
  });
});