/**
 * Predictive maintenance.
 *
 * Most of these assert that the module says nothing. That is the feature: a
 * forecast engine that always produces a date will produce a confidently wrong
 * one, somebody will act on it once, and after that nobody reads any of them.
 * The tests that matter are the ones proving it refuses.
 */
import {
  forecastThreshold,
  theilSenSlopePerDay,
  serviceByRuntime,
  historyRequirement,
  mad,
  type Sample,
} from "./predictive-maintenance";

const DAY = 86_400_000;
const T0 = new Date("2026-01-01T00:00:00Z").getTime();

/** A series of daily readings starting `days` ago and ending now. */
const series = (values: number[], startAt = T0, stepDays = 1): Sample[] =>
  values.map((value, i) => ({ at: startAt + i * stepDays * DAY, value }));

describe("theilSenSlopePerDay", () => {
  it("measures a clean decline", () => {
    // 30 dBm lost over 30 days.
    const s = series(Array.from({ length: 31 }, (_, i) => -40 - i));
    expect(theilSenSlopePerDay(s)).toBeCloseTo(-1, 5);
  });

  it("is not dragged around by a single wild reading", () => {
    // Least squares would swing hard on the spike; the median of pairwise
    // slopes barely moves. A microwave cycle should not reschedule an engineer.
    const clean = Array.from({ length: 31 }, (_, i) => -40 - i);
    const spiked = [...clean];
    spiked[15] = -400;
    expect(theilSenSlopePerDay(series(spiked))).toBeCloseTo(-1, 1);
  });

  it("returns zero rather than dividing by a zero time gap", () => {
    expect(theilSenSlopePerDay([{ at: T0, value: 1 }, { at: T0, value: 99 }])).toBe(0);
  });

  it("returns zero for fewer than two points", () => {
    expect(theilSenSlopePerDay([{ at: T0, value: 5 }])).toBe(0);
    expect(theilSenSlopePerDay([])).toBe(0);
  });
});

describe("it refuses to forecast without evidence", () => {
  it("says so when there are too few readings", () => {
    const f = forecastThreshold(series([-50, -52, -54]), { threshold: -80, direction: "below", now: T0 });
    expect(f.state).toBe("insufficient-data");
    expect(f.reason).toMatch(/only 3 readings/i);
    expect(f.projectedAt).toBeNull();
  });

  it("says so when plenty of readings cover only an afternoon", () => {
    // This is the fleet's actual situation: 150 readings from one camera
    // spanning 0.1 days. A trend line over that describes an afternoon.
    const hourly = series(Array.from({ length: 150 }, (_, i) => -50 - i * 0.2), T0, 1 / 24 / 60);
    const f = forecastThreshold(hourly, { threshold: -80, direction: "below", now: T0 });
    expect(f.state).toBe("insufficient-data");
    expect(f.reason).toMatch(/span/i);
  });

  it("says so when the movement is inside the series' own noise", () => {
    // Jitter around a level with no real drift.
    const noisy = series(Array.from({ length: 40 }, (_, i) => -60 + (i % 2 === 0 ? 6 : -6)));
    const f = forecastThreshold(noisy, { threshold: -80, direction: "below", now: T0 });
    expect(f.state).toBe("insufficient-data");
    expect(f.reason).toMatch(/scatter|noise/i);
  });

  it("says so when the trend is moving away from the threshold", () => {
    const improving = series(Array.from({ length: 30 }, (_, i) => -80 + i));
    const f = forecastThreshold(improving, { threshold: -85, direction: "below", now: T0 });
    expect(f.state).toBe("insufficient-data");
    expect(f.reason).toMatch(/away from the threshold/i);
  });

  it("says so when the projection is too far out to act on", () => {
    // Real decline, but arriving in years. Reporting it as maintenance would
    // bury the ones that matter.
    const creeping = series(Array.from({ length: 40 }, (_, i) => -50 - i * 0.01));
    const f = forecastThreshold(creeping, { threshold: -80, direction: "below", now: T0, maxHorizonDays: 180 });
    expect(f.state).toBe("insufficient-data");
    expect(f.reason).toMatch(/beyond the 180-day horizon/i);
  });

  it("never invents a date when it declines", () => {
    const f = forecastThreshold([], { threshold: 10, direction: "above", now: T0 });
    expect(f.projectedAt).toBeNull();
    expect(f.daysToThreshold).toBeNull();
  });

  it("survives nonsense in the series rather than forecasting from it", () => {
    const junk = [
      { at: Number.NaN, value: 5 },
      { at: T0, value: Number.NaN },
      { at: T0 + DAY, value: 3 },
    ] as Sample[];
    expect(() => forecastThreshold(junk, { threshold: 0, direction: "below", now: T0 })).not.toThrow();
    expect(forecastThreshold(junk, { threshold: 0, direction: "below", now: T0 }).state).toBe("insufficient-data");
  });
});

describe("it forecasts when the evidence supports one", () => {
  it("projects a signal decaying toward the weak threshold", () => {
    // -50 dBm falling 1 dBm/day for 25 days ends at -75, ten short of -80.
    const s = series(Array.from({ length: 26 }, (_, i) => -50 - i));
    const now = s[s.length - 1].at;
    const f = forecastThreshold(s, { threshold: -80, direction: "below", now });
    expect(f.state).toBe("forecast");
    expect(f.trend).toBe("falling");
    expect(f.daysToThreshold).not.toBeNull();
  });

  it("puts the projected date the right distance ahead", () => {
    // -50 falling 1/day over 20 days ends at -70; -80 is ten days further.
    const s = series(Array.from({ length: 21 }, (_, i) => -50 - i));
    const now = s[s.length - 1].at;
    const f = forecastThreshold(s, { threshold: -80, direction: "below", now });
    expect(f.state).toBe("forecast");
    expect(Math.round(f.daysToThreshold!)).toBe(10);
    expect(f.projectedAt!.slice(0, 10)).toBe(new Date(now + 10 * DAY).toISOString().slice(0, 10));
  });

  it("forecasts a rising value too, like standby power creeping up", () => {
    const s = series(Array.from({ length: 30 }, (_, i) => 2 + i * 0.5));
    const now = s[s.length - 1].at;
    const f = forecastThreshold(s, { threshold: 25, direction: "above", now });
    expect(f.state).toBe("forecast");
    expect(f.trend).toBe("rising");
  });

  it("reports an existing breach as observation, not prediction", () => {
    // Saying a device "will" fail when it already has is how a maintenance
    // report loses its credibility.
    const s = series(Array.from({ length: 30 }, (_, i) => -60 - i));
    const now = s[s.length - 1].at;
    const f = forecastThreshold(s, { threshold: -80, direction: "below", now });
    expect(f.state).toBe("already-breached");
    expect(f.reason).toMatch(/current fault, not a forecast/i);
  });

  it("explains itself whatever it decides", () => {
    // Every branch carries a reason, because "no forecast" needs to be
    // distinguishable from "not looking".
    const cases: Sample[][] = [[], series([1, 2]), series(Array.from({ length: 30 }, (_, i) => -50 - i))];
    for (const s of cases) {
      expect(forecastThreshold(s, { threshold: -80, direction: "below", now: T0 }).reason.length).toBeGreaterThan(10);
    }
  });
});

describe("mad", () => {
  it("is unmoved by a single outlier", () => {
    expect(mad([10, 10, 10, 10, 10])).toBe(0);
    expect(mad([10, 10, 10, 10, 1000])).toBe(0);
  });

  it("grows with real spread", () => {
    expect(mad([1, 5, 9, 13, 17])).toBeGreaterThan(0);
  });
});

describe("serviceByRuntime — the half that works today", () => {
  it("counts down to the next interval", () => {
    const s = serviceByRuntime(1500, 2000);
    expect(s.due).toBe(false);
    expect(s.reason).toMatch(/500 hours/);
  });

  it("warns inside the reminder window", () => {
    expect(serviceByRuntime(1950, 2000).due).toBe(true);
  });

  it("converts to days when the duty cycle is known", () => {
    const s = serviceByRuntime(1900, 2000, { hoursPerDay: 10 });
    expect(s.daysRemaining).toBeCloseTo(10, 5);
  });

  it("handles a device past several intervals", () => {
    // 4500 hours on a 2000-hour interval is 500 into the third.
    expect(serviceByRuntime(4500, 2000).reason).toMatch(/1500 hours/);
  });

  it("does not divide by a zero interval", () => {
    expect(() => serviceByRuntime(100, 0)).not.toThrow();
  });

  it("treats a nonsense runtime as zero rather than reporting a negative", () => {
    expect(serviceByRuntime(Number.NaN, 2000).due).toBe(false);
  });
});

describe("historyRequirement", () => {
  it("reports progress so a panel can say it is collecting, not broken", () => {
    const r = historyRequirement(series([1, 2, 3]));
    expect(r.ready).toBe(false);
    expect(r.haveSamples).toBe(3);
    expect(r.needSamples).toBeGreaterThan(3);
  });

  it("is ready once there are enough readings over enough time", () => {
    const r = historyRequirement(series(Array.from({ length: 20 }, (_, i) => i)));
    expect(r.ready).toBe(true);
  });

  it("is not ready on many readings taken over minutes", () => {
    // The fleet's current state, stated as a requirement rather than a failure.
    const r = historyRequirement(series(Array.from({ length: 150 }, (_, i) => i), T0, 1 / 24 / 60));
    expect(r.ready).toBe(false);
    expect(r.haveSpanDays).toBeLessThan(1);
  });
});
