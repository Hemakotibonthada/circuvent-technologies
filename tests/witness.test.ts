import { compare, isActionable, severity, powerBudget, silenceHours, sustainablePeriodSec } from "@/lib/witness";

/**
 * The Witness.
 *
 * A clip-on current sensor whose only job is to disagree with what a device
 * says about itself. Every case below is drawn from a real bug in this
 * codebase — each one shipped, and each one was invisible because the device
 * was the only witness to its own behaviour.
 */

const NOW = 1_700_000_000_000;
const fresh = (over: Record<string, unknown> = {}) => ({
  milliamps: 0,
  at: NOW - 1000,
  reserveMv: 4000,
  ...over,
});
const claim = (over: Record<string, unknown> = {}) => ({ on: false, at: NOW - 1000, ...over });

describe("the case that matters", () => {
  it("catches a device reporting off while current flows", () => {
    /*
     * firmware/rfid-gate shipped with both relays energised from power-up,
     * because a bare pinMode leaves an active-low latch low. The console
     * showed the gate closed. A witness on that circuit would have said so on
     * the first reading.
     */
    const d = compare(fresh({ milliamps: 400 }), claim({ on: false }), NOW);
    expect(d.verdict).toBe("claims-off-but-drawing");
    expect(d.measuredWatts).toBe(92);
  });

  it("treats that as a danger rather than a warning", () => {
    // Something is energised that everybody believes is dead, which is the
    // state in which somebody opens an enclosure.
    expect(severity("claims-off-but-drawing")).toBe("danger");
    expect(severity("claims-on-but-idle")).toBe("warn");
  });

  it("catches a device reporting on while nothing flows", () => {
    // The smart light that confirmed a brightness change on a lamp that was
    // off: the command succeeded, the state updated, and the room stayed dark.
    const d = compare(fresh({ milliamps: 3 }), claim({ on: true }), NOW);
    expect(d.verdict).toBe("claims-on-but-idle");
  });

  it("catches a fabricated power reading", () => {
    /*
     * firmware/smart-plug published a hard-coded 42.5 W and the app drew a
     * graph of it under "Live power draw". No tolerance excuses a number that
     * was never measured, and comparing it to a clamp is how that surfaces.
     */
    const d = compare(fresh({ milliamps: 30 }), claim({ on: true, watts: 42.5 }), NOW);
    expect(d.verdict).toBe("watts-disagree");
    expect(d.claimedWatts).toBe(42.5);
    expect(d.measuredWatts).toBe(7);
  });
});

describe("what it refuses to call", () => {
  it("says nothing about the band where either answer is defensible", () => {
    /*
     * Between standby and running there is a real grey area — a charger, a
     * standby lamp, a controller board. A sensor that cried wolf there would
     * be muted within a week, and then it would be no use for the case above.
     */
    const d = compare(fresh({ milliamps: 40 }), claim({ on: false }), NOW);
    expect(d.verdict).toBe("agree");
  });

  it("allows a motor's power factor to differ from apparent power", () => {
    // A clamp reads apparent power; a plug usually reports real power. A third
    // of a difference on an inductive load is physics, not a fault.
    const d = compare(fresh({ milliamps: 500 }), claim({ on: true, watts: 80 }), NOW);
    expect(d.verdict).toBe("agree");
  });

  it("will not compare a reading with a claim from a different moment", () => {
    const d = compare(fresh({ at: NOW - 10 * 60_000, milliamps: 400 }), claim({ on: false }), NOW);
    expect(d.verdict).toBe("unknown-stale");
    expect(isActionable(d.verdict)).toBe(false);
  });
});

describe("the sensor does not lie by omission", () => {
  it("says when it is running out of energy rather than reporting zero", () => {
    /*
     * This is the failure the whole device exists to catch, so reproducing it
     * here would be indefensible. The sensor harvests from the field of the
     * appliance it watches, so a load that has been off for a long time
     * eventually starves it — and a starved sensor reporting "no current"
     * would be indistinguishable from a working one, while being worthless.
     */
    const d = compare(fresh({ milliamps: 0, reserveMv: 1500 }), claim({ on: true }), NOW);
    expect(d.verdict).toBe("unknown-no-reserve");
    expect(isActionable(d.verdict)).toBe(false);
    expect(d.detail).toMatch(/stored energy/i);
  });

  it("checks the reserve before it checks staleness, because it explains it", () => {
    // A flat sensor and a sensor that fell off the wall both go quiet. Only
    // one of them said why on the way down.
    const d = compare(
      fresh({ at: NOW - 10 * 60_000, reserveMv: 1200 }),
      claim({ at: NOW - 10 * 60_000 }),
      NOW,
    );
    expect(d.verdict).toBe("unknown-no-reserve");
  });
});

describe("it observes and does not act", () => {
  it("offers no way to switch anything", () => {
    /*
     * A component that decided a relay was stuck and cut power to it would be
     * a second thing that can be wrong, holding an actuator. The argument for
     * trusting this sensor is precisely that it has no authority.
     */
    const api = Object.keys(require("@/lib/witness"));
    expect(api.some((k) => /set|switch|cut|disable|actuate|command/i.test(k))).toBe(false);
  });
});

describe("the power budget", () => {
  it("closes on an ordinary appliance", () => {
    // A 230 W load — a fan, a small pump — reporting every 30 seconds.
    const b = powerBudget(1000, 30);
    expect(b.sustainable).toBe(true);
    expect(b.marginMw).toBeGreaterThan(2);
  });

  it("still closes on a small standby load, once the cadence adapts", () => {
    /*
     * 100 mA is about 23 W, and at a fixed 30-second cadence the budget falls
     * three microwatts short. That does not mean it nearly works: it means the
     * capacitor drains slowly and the sensor dies hours after installation,
     * looking healthy the whole way down — which is the exact failure this
     * product exists to catch.
     *
     * The tests are what forced sustainablePeriodSec() to exist. At the
     * cadence that current can actually support, it closes.
     */
    expect(powerBudget(100, 30).sustainable).toBe(false);
    const period = sustainablePeriodSec(100);
    expect(period).toBeGreaterThan(30);
    expect(powerBudget(100, period).sustainable).toBe(true);
  });

  it("watches a big load more closely, because it can afford to", () => {
    expect(sustainablePeriodSec(2000)).toBeLessThan(sustainablePeriodSec(200));
  });

  it("will not report faster than the information changes", () => {
    // A relay that is stuck was stuck ten seconds ago too.
    expect(sustainablePeriodSec(50_000)).toBeGreaterThanOrEqual(10);
  });

  it("does not close on a load that is barely drawing anything", () => {
    /*
     * 10 mA is 2 W, and the honest answer is that there is not enough field to
     * harvest from. This is not a bug to be tuned away — it is the boundary of
     * what the physics allows, and the capacitor below is the reason the
     * product still works either side of it.
     */
    expect(powerBudget(10, 30).sustainable).toBe(false);
  });

  it("reports the margin rather than only a yes or no", () => {
    const b = powerBudget(1000, 30);
    expect(b.harvestedMw).toBeGreaterThan(b.neededMw);
    expect(Math.round(b.harvestedMw * 100) / 100).toBeCloseTo(2.4, 1);
  });
});

describe("what happens when the load it watches goes off", () => {
  it("keeps reporting for hours on stored charge", () => {
    /*
     * The moment worth verifying is exactly the moment there is nothing to
     * harvest. The capacitor charges while the appliance runs and spends it
     * reporting the silence — which is what makes "it really is off" a
     * measurement rather than an absence.
     *
     * At the normal 30-second cadence that is about five and a half hours.
     */
    expect(silenceHours(0.47, 5.0, 2.0, 30)).toBeGreaterThan(5);
  });

  it("stretches to more than a day by slowing down once it stops charging", () => {
    /*
     * Five and a half hours would not survive a working day. Backing off to
     * one report every five minutes costs nothing that matters — the appliance
     * is off, and there is no news — and turns that into about thirty hours,
     * which covers a night, a working day, or a weekend away.
     *
     * Deliberately not claimed as more. At the slowest cadence the design
     * allows it is under two days, and a load switched off for a season will
     * outlast it — which is what the reserve flag above is for.
     */
    expect(silenceHours(0.47, 5.0, 2.0, 300)).toBeGreaterThan(24);
  });

  it("does not pretend that lasts a week", () => {
    // Even at the slowest cadence the design permits.
    expect(silenceHours(0.47, 5.0, 2.0, 900)).toBeLessThan(24 * 7);
  });

  it("does not pretend that lasts forever", () => {
    // Days, not weeks. A heater watched through a summer will go quiet, and
    // the reserve flag above is how that is reported rather than hidden.
    expect(silenceHours(0.47, 5.0, 2.0, 30)).toBeLessThan(24 * 7);
  });
});
