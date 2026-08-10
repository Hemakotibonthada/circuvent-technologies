/**
 * The energy advisor.
 *
 * Half of these assert that it stays quiet. Telling somebody to run their
 * fridge overnight, or to unplug a 2 W doorbell to save ₹4 a year, is how an
 * energy panel loses its reader — and once it has, the one recommendation that
 * would have saved real money goes unread with the rest.
 */
import {
  energyAdvice,
  standbyDrainSavings,
  peakShiftSavings,
  slabWarning,
  isShiftable,
  cheapestBand,
  MIN_MONTHLY_SAVING,
  type EnergyDevice,
  type Slab,
} from "./energy-advisor";
import type { Tariff } from "@/app/smarthome/energy/tariff";

const FLAT: Tariff = {
  model: "flat",
  currency: "INR",
  symbol: "₹",
  flatRate: 7,
  standingCharge: 5,
  bands: [],
};

const TOU: Tariff = {
  ...FLAT,
  model: "tou",
  bands: [
    { label: "Peak", fromHour: 18, toHour: 22, rate: 11 },
    { label: "Day", fromHour: 6, toHour: 18, rate: 7 },
    { label: "Night", fromHour: 22, toHour: 6, rate: 4 },
  ],
};

const dev = (over: Partial<EnergyDevice> = {}): EnergyDevice => ({
  id: "plug-1",
  name: "Geyser",
  type: "smart-plug",
  watts: 2000,
  on: true,
  ...over,
});

describe("isShiftable", () => {
  it("moves loads that can wait", () => {
    expect(isShiftable("watertank")).toBe(true);
    expect(isShiftable("aquaguard")).toBe(true);
    expect(isShiftable("smart-plug")).toBe(true);
  });

  it("never proposes moving refrigeration, safety or lighting", () => {
    // Advice to shift these is advice to ignore the whole panel.
    for (const t of ["camera", "guardian", "smart-lock", "fridge", "light", "smart-light", "sentinel"]) {
      expect(isShiftable(t)).toBe(false);
    }
  });

  it("does not guess about a device it has no opinion on", () => {
    expect(isShiftable("thermostat")).toBe(false);
    expect(isShiftable("")).toBe(false);
  });
});

describe("standby drain, priced", () => {
  it("reports a device drawing real power while off", () => {
    // 20 W standby is 14.6 kWh a month — about ₹102 at ₹7.
    const s = standbyDrainSavings([dev({ watts: 20, on: false })], FLAT);
    expect(s).toHaveLength(1);
    expect(s[0].monthlySaving).toBeGreaterThan(90);
    expect(s[0].action).toMatch(/₹/);
  });

  it("says nothing about a trickle that costs almost nothing", () => {
    // 2 W is about ₹10 a month. Reporting it spends the reader's attention on
    // the wrong thing.
    expect(standbyDrainSavings([dev({ watts: 2, on: false })], FLAT)).toHaveLength(0);
  });

  it("ignores a device that is legitimately on", () => {
    expect(standbyDrainSavings([dev({ watts: 200, on: true })], FLAT)).toHaveLength(0);
  });

  it("ignores a device that does not meter", () => {
    expect(standbyDrainSavings([dev({ watts: null, on: false })], FLAT)).toHaveLength(0);
  });

  it("prices standby at the round-the-clock average, not the current band", () => {
    // Standby runs at every hour, so charging it the 18:00 peak rate would
    // overstate the saving by more than half.
    const [s] = standbyDrainSavings([dev({ watts: 30, on: false })], TOU);
    const rate = Number(s.evidence.ratePerKwh);
    expect(rate).toBeGreaterThan(4);
    expect(rate).toBeLessThan(11);
  });
});

describe("peak shifting", () => {
  it("proposes moving a shiftable load out of the peak band", () => {
    const s = peakShiftSavings([dev({ watts: 2000 })], TOU, { hour: 19 });
    expect(s).toHaveLength(1);
    expect(s[0].action).toMatch(/night/i);
    expect(s[0].monthlySaving).toBeGreaterThan(MIN_MONTHLY_SAVING);
  });

  it("computes the saving as the same energy at the cheaper rate", () => {
    // 2 kW × 2 h/day × 30 days = 120 kWh; (11 − 4) × 120 = ₹840.
    const [s] = peakShiftSavings([dev({ watts: 2000 })], TOU, { hour: 19 });
    expect(s.monthlySaving).toBeCloseTo(840, 0);
  });

  it("says nothing when already in the cheapest band", () => {
    expect(peakShiftSavings([dev({ watts: 2000 })], TOU, { hour: 23 })).toHaveLength(0);
  });

  it("says nothing on a flat tariff, where there is no cheaper hour", () => {
    expect(peakShiftSavings([dev({ watts: 2000 })], FLAT, { hour: 19 })).toHaveLength(0);
  });

  it("never proposes shifting a fridge or a camera", () => {
    const fixed = [dev({ id: "cam", type: "camera", watts: 3000 }), dev({ id: "f", type: "fridge", watts: 3000 })];
    expect(peakShiftSavings(fixed, TOU, { hour: 19 })).toHaveLength(0);
  });

  it("ignores a shiftable load that is not currently running", () => {
    expect(peakShiftSavings([dev({ on: false })], TOU, { hour: 19 })).toHaveLength(0);
  });

  it("stays quiet when the rate difference is too small to be worth the bother", () => {
    const narrow: Tariff = { ...TOU, bands: [{ label: "Peak", fromHour: 18, toHour: 22, rate: 7.05 }, { label: "Night", fromHour: 22, toHour: 18, rate: 7 }] };
    expect(peakShiftSavings([dev({ watts: 100 })], narrow, { hour: 19 })).toHaveLength(0);
  });
});

describe("cheapestBand", () => {
  it("finds the lowest rate", () => {
    expect(cheapestBand(TOU)?.rate).toBe(4);
  });

  it("has no answer on a flat tariff", () => {
    expect(cheapestBand(FLAT)).toBeNull();
  });
});

describe("slab warnings", () => {
  const SLABS: Slab[] = [
    { uptoKwh: 100, ratePerKwh: 5 },
    { uptoKwh: 200, ratePerKwh: 7 },
    { uptoKwh: 400, ratePerKwh: 9 },
  ];

  it("warns when the month is heading over a boundary", () => {
    const w = slabWarning(180, 260, SLABS, FLAT);
    expect(w).not.toBeNull();
    // 60 kWh over the 200 boundary at a ₹2 step = ₹120.
    expect(w!.monthlySaving).toBeCloseTo(120, 0);
    expect(w!.action).toMatch(/29% more|%/);
  });

  it("says nothing when the month will stay inside the current slab", () => {
    expect(slabWarning(120, 180, SLABS, FLAT)).toBeNull();
  });

  it("says nothing in the top slab, where there is nothing above to warn about", () => {
    expect(slabWarning(500, 700, SLABS, FLAT)).toBeNull();
  });

  it("needs at least two slabs to have a boundary at all", () => {
    expect(slabWarning(50, 300, [{ uptoKwh: 100, ratePerKwh: 5 }], FLAT)).toBeNull();
  });

  it("survives nonsense input rather than reporting a negative bill", () => {
    expect(slabWarning(Number.NaN, 300, SLABS, FLAT)).toBeNull();
    expect(slabWarning(180, Number.NaN, SLABS, FLAT)).toBeNull();
  });
});

describe("energyAdvice", () => {
  it("leads with the most expensive problem", () => {
    // A reader gives an energy panel about one recommendation's attention.
    const devices = [
      dev({ id: "a", name: "TV", type: "smart-plug", watts: 25, on: false }),
      dev({ id: "b", name: "Geyser", type: "watertank", watts: 2000, on: true }),
    ];
    const a = energyAdvice({ devices, tariff: TOU, hour: 19 });
    expect(a.savings.length).toBeGreaterThanOrEqual(2);
    expect(a.savings[0].monthlySaving).toBeGreaterThanOrEqual(a.savings[1].monthlySaving);
  });

  it("totals what is at stake", () => {
    const a = energyAdvice({ devices: [dev({ watts: 2000 })], tariff: TOU, hour: 19 });
    expect(a.totalMonthlySaving).toBeCloseTo(a.savings.reduce((s, x) => s + x.monthlySaving, 0), 2);
  });

  it("says nothing is wrong when nothing is", () => {
    const a = energyAdvice({ devices: [dev({ watts: 5, on: true, type: "light" })], tariff: FLAT, hour: 12 });
    expect(a.savings).toHaveLength(0);
    expect(a.note).toMatch(/nothing is costing you money/i);
  });

  it("distinguishes 'nothing wrong' from 'nothing measured'", () => {
    // These look identical on screen and mean opposite things: one is a healthy
    // home, the other is a home with no metering.
    const a = energyAdvice({ devices: [dev({ watts: null })], tariff: FLAT, hour: 12 });
    expect(a.note).toMatch(/no device is reporting power/i);
  });

  it("does not throw on an empty fleet", () => {
    expect(() => energyAdvice({ devices: [], tariff: FLAT, hour: 12 })).not.toThrow();
  });

  it("includes the slab warning when the caller supplies month figures", () => {
    const a = energyAdvice({
      devices: [],
      tariff: FLAT,
      hour: 12,
      monthToDateKwh: 180,
      projectedMonthKwh: 260,
      slabs: [
        { uptoKwh: 100, ratePerKwh: 5 },
        { uptoKwh: 200, ratePerKwh: 7 },
        { uptoKwh: 400, ratePerKwh: 9 },
      ],
    });
    expect(a.savings.some((s) => s.kind === "slab-warning")).toBe(true);
  });

  it("every recommendation says what to do, not just what is wrong", () => {
    const a = energyAdvice({ devices: [dev({ watts: 2000 }), dev({ id: "x", watts: 40, on: false })], tariff: TOU, hour: 19 });
    for (const s of a.savings) {
      expect(s.action.length).toBeGreaterThan(20);
      expect(s.monthlySaving).toBeGreaterThan(0);
      expect(Object.keys(s.evidence).length).toBeGreaterThan(0);
    }
  });
});
