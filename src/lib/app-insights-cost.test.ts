/**
 * Ingestion volume, retention headroom and sampling.
 *
 * The case that matters most is the counter-intuitive one: a *full* buffer is
 * the unhealthy state, not the healthy one, because it means the oldest
 * evidence is being discarded on every new event. Several tests below exist
 * only to keep that reading from being softened later.
 */

import {
  AZURE_FREE_GB_PER_MONTH,
  TARGET_WINDOW_HOURS,
  averageEventBytes,
  estimateUsage,
  formatBytes,
  sampleEvents,
  samplingAdvice,
} from "./app-insights-cost";
import type { TelemetryEvent } from "./app-insights";

const NOW = "2026-03-10T12:00:00.000Z";
const at = (minutesAgo: number) => new Date(Date.parse(NOW) - minutesAgo * 60_000).toISOString();

function ev(id: string, minutesAgo: number, over: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    id,
    kind: "request",
    at: at(minutesAgo),
    path: "/api/devices",
    session: `s${id}`,
    durationMs: 100,
    status: 200,
    ok: true,
    source: "web",
    ...over,
  };
}

/**
 * n events spread evenly across exactly `hours`, oldest first and newest at
 * `now`. The step is hours/(n-1), not hours/n: n points span n-1 gaps, and
 * getting that wrong makes every rate assertion off by one event per window.
 */
function spread(n: number, hours: number, over: Partial<TelemetryEvent> = {}): TelemetryEvent[] {
  const step = n > 1 ? (hours * 60) / (n - 1) : 0;
  return Array.from({ length: n }, (_, i) => ev(`e${i}`, hours * 60 - i * step, over));
}

describe("averageEventBytes", () => {
  it("is zero on an empty buffer rather than NaN", () => {
    expect(averageEventBytes([])).toBe(0);
  });

  it("measures the serialised size", () => {
    const one = ev("a", 1);
    expect(averageEventBytes([one])).toBe(JSON.stringify(one).length);
  });

  it("samples rather than stringifying the whole buffer", () => {
    // 5,000 events with a sample of 10 must not touch all 5,000: the guard is
    // that it returns promptly and still lands near the true size.
    const many = spread(5000, 24);
    const started = Date.now();
    const avg = averageEventBytes(many, 10);
    expect(Date.now() - started).toBeLessThan(200);
    expect(avg).toBeGreaterThan(50);
  });
});

describe("estimateUsage", () => {
  it("reports an empty buffer without dividing by zero", () => {
    const u = estimateUsage([], { received: 0, capacity: 20_000, now: NOW });
    expect(u.retained).toBe(0);
    expect(u.eventsPerHour).toBe(0);
    expect(u.projectedWindowHours).toBe(0);
    expect(u.estimatedMonthlyUsd).toBe(0);
    expect(u.oldestAt).toBeNull();
  });

  it("counts what the cap has dropped", () => {
    const u = estimateUsage(spread(100, 1), { received: 350, capacity: 100, now: NOW });
    expect(u.retained).toBe(100);
    expect(u.dropped).toBe(250);
    expect(u.utilisation).toBe(1);
  });

  it("never reports negative drops when received lags the buffer", () => {
    // `received` is a counter that a restart can reset below the retained count.
    const u = estimateUsage(spread(100, 1), { received: 0, capacity: 100, now: NOW });
    expect(u.dropped).toBe(0);
  });

  it("measures the rate against now, not against the newest event", () => {
    /*
     * A system that stopped reporting six hours ago must not look like it is
     * still running at its old rate — that is the one moment the rate matters.
     */
    const stale = spread(60, 1).map((e) => ({ ...e, at: at(360 + Number(e.id.slice(1))) }));
    const u = estimateUsage(stale, { received: 60, capacity: 20_000, now: NOW });
    expect(u.eventsPerHour).toBeLessThan(15);
  });

  it("projects how far back a full buffer will reach", () => {
    // 120 events across exactly 2 hours = 60/hour; a 600-event buffer holds 10.
    const u = estimateUsage(spread(120, 2), { received: 120, capacity: 600, now: NOW });
    expect(u.eventsPerHour).toBe(60);
    expect(u.projectedWindowHours).toBeCloseTo(10, 0);
  });

  it("breaks volume down by kind, largest first", () => {
    const events = [...spread(30, 1), ...spread(10, 1, { kind: "exception" })];
    const u = estimateUsage(events, { received: 40, capacity: 20_000, now: NOW });
    expect(u.byKind[0].kind).toBe("request");
    expect(u.byKind[0].events).toBe(30);
    expect(u.byKind.reduce((a, k) => a + k.share, 0)).toBeCloseTo(1);
  });

  it("reports the span the buffer covers", () => {
    const u = estimateUsage(spread(100, 6), { received: 100, capacity: 20_000, now: NOW });
    expect(u.windowHours).toBeGreaterThan(5);
    expect(u.windowHours).toBeLessThanOrEqual(6);
    expect(u.oldestAt).not.toBeNull();
    expect(u.newestAt).not.toBeNull();
  });

  it("charges nothing below Azure's free monthly grant", () => {
    const u = estimateUsage(spread(50, 24), { received: 50, capacity: 20_000, now: NOW });
    expect(u.projectedGbPerMonth).toBeLessThan(AZURE_FREE_GB_PER_MONTH);
    expect(u.estimatedMonthlyUsd).toBe(0);
  });

  it("ignores events with an unparseable timestamp instead of poisoning the span", () => {
    const events = [...spread(10, 2), { ...ev("bad", 0), at: "not a date" }];
    const u = estimateUsage(events, { received: 11, capacity: 20_000, now: NOW });
    expect(Number.isFinite(u.eventsPerHour)).toBe(true);
    expect(u.oldestAt).not.toBeNull();
  });
});

describe("samplingAdvice", () => {
  it("says keep everything when the buffer already reaches far enough", () => {
    const u = estimateUsage(spread(100, 10), { received: 100, capacity: 20_000, now: NOW });
    const a = samplingAdvice(u);
    expect(a.recommendedRate).toBe(1);
    expect(a.severity).toBe("ok");
    expect(a.reason).toMatch(/Keep everything/);
  });

  it("says nothing to do when nothing is arriving", () => {
    const a = samplingAdvice(estimateUsage([], { received: 0, capacity: 20_000, now: NOW }));
    expect(a.recommendedRate).toBe(1);
    expect(a.severity).toBe("ok");
  });

  it("recommends sampling when the window is too short to investigate with", () => {
    // 6,000 events in an hour against a 6,000 buffer = one hour of history.
    const u = estimateUsage(spread(6000, 1), { received: 6000, capacity: 6000, now: NOW });
    const a = samplingAdvice(u);
    expect(u.projectedWindowHours).toBeLessThan(TARGET_WINDOW_HOURS);
    expect(a.recommendedRate).toBeLessThan(1);
    expect(a.resultingWindowHours).toBeGreaterThan(u.projectedWindowHours);
  });

  it("escalates to critical when the window is very short", () => {
    const u = estimateUsage(spread(6000, 1), { received: 6000, capacity: 1000, now: NOW });
    expect(samplingAdvice(u).severity).toBe("critical");
  });

  it("recommends a readable rate, not a raw fraction", () => {
    const u = estimateUsage(spread(6000, 1), { received: 6000, capacity: 5000, now: NOW });
    const a = samplingAdvice(u);
    expect([0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1]).toContain(a.recommendedRate);
  });

  it("names the kind to sample first when one dominates", () => {
    const events = [...spread(5000, 1), ...spread(200, 1, { kind: "exception" })];
    const u = estimateUsage(events, { received: 5200, capacity: 5200, now: NOW });
    const a = samplingAdvice(u);
    expect(a.dominantKind).toBe("request");
    expect(a.reason).toMatch(/request/);
  });
});

describe("sampleEvents", () => {
  const events = Array.from({ length: 600 }, (_, i) =>
    ev(`e${i}`, i / 10, { session: `session-${i % 120}` }),
  );

  it("keeps everything at a rate of one", () => {
    expect(sampleEvents(events, 1)).toHaveLength(events.length);
  });

  it("keeps nothing at a rate of zero", () => {
    expect(sampleEvents(events, 0)).toHaveLength(0);
  });

  it("keeps roughly the requested share", () => {
    const kept = sampleEvents(events, 0.5);
    expect(kept.length).toBeGreaterThan(events.length * 0.25);
    expect(kept.length).toBeLessThan(events.length * 0.75);
  });

  it("keeps whole sessions, never half of one", () => {
    /*
     * The property that matters. Per-event sampling shreds journeys: half a
     * session is not a smaller journey, it is a wrong one, and a funnel over
     * per-event samples reports drop-off that never happened.
     */
    const kept = sampleEvents(events, 0.5);
    const keptSessions = new Set(kept.map((e) => e.session));
    for (const s of keptSessions) {
      const originally = events.filter((e) => e.session === s).length;
      const survived = kept.filter((e) => e.session === s).length;
      expect(survived).toBe(originally);
    }
  });

  it("is deterministic, so two runs agree", () => {
    expect(sampleEvents(events, 0.3).map((e) => e.id)).toEqual(
      sampleEvents(events, 0.3).map((e) => e.id),
    );
  });

  it("is monotonic: a higher rate keeps a superset", () => {
    const low = new Set(sampleEvents(events, 0.25).map((e) => e.id));
    const high = new Set(sampleEvents(events, 0.75).map((e) => e.id));
    for (const id of low) expect(high.has(id)).toBe(true);
  });
});

describe("formatBytes", () => {
  it("scales the unit to the size", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 ** 2)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.00 GB");
  });

  it("handles zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });
});
