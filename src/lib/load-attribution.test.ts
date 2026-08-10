/**
 * Per-load attribution.
 *
 * The tests that matter here are the ones proving it does not guess. A
 * breakdown that assigns every watt to something looks authoritative and is
 * how a fridge ends up billed to the porch light.
 */
import {
  soleTransition,
  learnLoadProfiles,
  attributeConsumption,
  currentBreakdown,
  MIN_STEP_WATTS,
  type PowerSample,
} from "./load-attribution";

const T0 = Date.UTC(2026, 0, 1);
const MIN = 60_000;

const sample = (i: number, totalWatts: number, on: Record<string, boolean>): PowerSample => ({
  at: T0 + i * MIN,
  totalWatts,
  on,
});

describe("soleTransition", () => {
  it("finds the one load that changed", () => {
    const t = soleTransition(sample(0, 100, { fan: false, light: true }), sample(1, 175, { fan: true, light: true }));
    expect(t).toEqual({ key: "fan", turnedOn: true });
  });

  it("returns nothing when two loads changed together", () => {
    // The step covers both, so attributing it to either is worse than
    // attributing it to neither.
    const t = soleTransition(sample(0, 100, { fan: false, pump: false }), sample(1, 900, { fan: true, pump: true }));
    expect(t).toBeNull();
  });

  it("returns nothing when nothing changed", () => {
    expect(soleTransition(sample(0, 100, { fan: true }), sample(1, 130, { fan: true }))).toBeNull();
  });

  it("notices a load that appears for the first time", () => {
    expect(soleTransition(sample(0, 100, {}), sample(1, 160, { fan: true }))?.key).toBe("fan");
  });
});

describe("learning a load's draw from clean steps", () => {
  it("learns from switching on", () => {
    const s = [
      sample(0, 100, { fan: false }),
      sample(1, 175, { fan: true }),
      sample(2, 100, { fan: false }),
      sample(3, 172, { fan: true }),
      sample(4, 100, { fan: false }),
      sample(5, 178, { fan: true }),
    ];
    const p = learnLoadProfiles(s);
    expect(p.fan.watts).toBeGreaterThan(70);
    expect(p.fan.watts).toBeLessThan(80);
    expect(p.fan.confidence).toBe("high");
  });

  it("learns from switching off too, which is half the evidence", () => {
    // In a house things are often turned off more deliberately than on.
    const s = [
      sample(0, 300, { geyser: true }),
      sample(1, 100, { geyser: false }),
      sample(2, 300, { geyser: true }),
      sample(3, 105, { geyser: false }),
      sample(4, 300, { geyser: true }),
      sample(5, 98, { geyser: false }),
    ];
    const p = learnLoadProfiles(s);
    expect(p.geyser.observations).toBeGreaterThanOrEqual(3);
    expect(p.geyser.watts).toBeGreaterThan(180);
  });

  it("ignores a step where two things moved", () => {
    const s = [sample(0, 100, { fan: false, pump: false }), sample(1, 900, { fan: true, pump: true })];
    expect(Object.keys(learnLoadProfiles(s))).toHaveLength(0);
  });

  it("ignores a step too small to distinguish from something else cycling", () => {
    const s = [sample(0, 100, { led: false }), sample(1, 100 + MIN_STEP_WATTS - 1, { led: true })];
    expect(Object.keys(learnLoadProfiles(s))).toHaveLength(0);
  });

  it("ignores a step in the wrong direction", () => {
    // Total fell when a load switched on: something else moved in the same
    // window, so this says nothing about this load.
    const s = [sample(0, 500, { fan: false }), sample(1, 300, { fan: true })];
    expect(Object.keys(learnLoadProfiles(s))).toHaveLength(0);
  });

  it("is not dragged around by one strange observation", () => {
    const s = [
      sample(0, 100, { fan: false }), sample(1, 175, { fan: true }),
      sample(2, 100, { fan: false }), sample(3, 174, { fan: true }),
      sample(4, 100, { fan: false }), sample(5, 900, { fan: true }),
      sample(6, 100, { fan: false }), sample(7, 176, { fan: true }),
    ];
    // The median holds; a mean would report roughly 260 W for a 75 W fan.
    expect(learnLoadProfiles(s).fan.watts).toBeLessThan(100);
  });

  it("marks a single observation as low confidence", () => {
    const s = [sample(0, 100, { fan: false }), sample(1, 175, { fan: true })];
    expect(learnLoadProfiles(s).fan.confidence).toBe("low");
  });

  it("reports spread, so a variable load is not mistaken for a wrong answer", () => {
    const s = [
      sample(0, 100, { ac: false }), sample(1, 900, { ac: true }),
      sample(2, 100, { ac: false }), sample(3, 400, { ac: true }),
      sample(4, 100, { ac: false }), sample(5, 1300, { ac: true }),
    ];
    expect(learnLoadProfiles(s).ac.spreadWatts).toBeGreaterThan(0);
  });

  it("survives an empty or malformed series", () => {
    expect(() => learnLoadProfiles([])).not.toThrow();
    expect(() => learnLoadProfiles([{ at: Number.NaN, totalWatts: 1, on: {} }])).not.toThrow();
  });
});

describe("attributeConsumption", () => {
  it("prefers a measured channel over an inferred one", () => {
    // Inference is a way to know something about an unmetered load, not a
    // second opinion about a metered one.
    const inferred = learnLoadProfiles([sample(0, 100, { fan: false }), sample(1, 175, { fan: true })]);
    const out = attributeConsumption([{ key: "fan", watts: 62 }], inferred);
    expect(out.fan.watts).toBe(62);
    expect(out.fan.measured).toBe(true);
    expect(out.fan.confidence).toBe("measured");
  });

  it("names a load it has never observed rather than omitting it", () => {
    // An absent row makes the breakdown look complete. "No idea what this
    // costs" is a reason to fit a meter; a missing line is not.
    const out = attributeConsumption([], {}, ["mystery"]);
    expect(out.mystery.confidence).toBe("unknown");
    expect(out.mystery.watts).toBe(0);
  });

  it("keeps inferred loads alongside measured ones", () => {
    const inferred = learnLoadProfiles([sample(0, 100, { fan: false }), sample(1, 175, { fan: true })]);
    const out = attributeConsumption([{ key: "geyser", watts: 2000 }], inferred);
    expect(Object.keys(out).sort()).toEqual(["fan", "geyser"]);
  });
});

describe("currentBreakdown", () => {
  const profiles = {
    fan: { key: "fan", watts: 75, observations: 4, spreadWatts: 2, measured: false, confidence: "high" as const },
    light: { key: "light", watts: 20, observations: 4, spreadWatts: 1, measured: false, confidence: "high" as const },
  };

  it("lists only what is switched on, biggest first", () => {
    const b = currentBreakdown(profiles, { fan: true, light: true }, 200);
    expect(b.loads.map((l) => l.key)).toEqual(["fan", "light"]);
  });

  it("reports the unexplained remainder as its own figure", () => {
    // The fridge and the router are in the total and not in the system.
    // Distributing them across the known loads would inflate every one.
    const b = currentBreakdown(profiles, { fan: true, light: true }, 300);
    expect(b.accountedWatts).toBe(95);
    expect(b.unaccountedWatts).toBe(205);
    expect(b.hasGap).toBe(true);
    expect(b.note).toMatch(/not explained/i);
  });

  it("does not call a rounding difference a gap", () => {
    const b = currentBreakdown(profiles, { fan: true, light: true }, 97);
    expect(b.hasGap).toBe(false);
  });

  it("never reports a negative remainder", () => {
    // Profiles can over-estimate; the answer is zero, not a negative watt.
    const b = currentBreakdown(profiles, { fan: true, light: true }, 50);
    expect(b.unaccountedWatts).toBe(0);
  });

  it("leads with the unknown loads when there are any", () => {
    const withUnknown = { ...profiles, x: { key: "x", watts: 0, observations: 0, spreadWatts: 0, measured: false, confidence: "unknown" as const } };
    const b = currentBreakdown(withUnknown, { fan: true, x: true }, 300);
    expect(b.note).toMatch(/never been observed/i);
  });

  it("survives no profiles at all", () => {
    const b = currentBreakdown({}, {}, 0);
    expect(b.loads).toEqual([]);
    expect(b.hasGap).toBe(false);
  });
});
