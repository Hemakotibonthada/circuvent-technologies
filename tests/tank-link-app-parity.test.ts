/**
 * The console and the phone must agree about whether a tank level is safe to
 * show as current.
 *
 * `src/lib/tank-link.ts` and `mobile/src/tank-link.ts` are deliberate
 * duplicates — the app is a separate TypeScript project and cannot import from
 * the web app. Duplication is fine here; drifting is not.
 *
 * If the phone's stale threshold were longer than the console's, the same tank
 * would read "42%" on a phone and "42% (last known)" in a browser at the same
 * moment. Whoever is holding the phone starts the pump. Nothing in either
 * project would fail, because each copy is perfectly consistent with itself.
 *
 * Same reasoning as tests/tile-visual-parity.test.ts, which caught a real bug
 * the day it was written.
 */

import * as web from "@/lib/tank-link";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import * as app from "../mobile/src/tank-link";

/** Every interesting shape a starter can publish, including the nasty ones. */
const CASES: Array<[string, web.TankDeviceState]> = [
  ["wired / legacy firmware", { ohPct: 55 }],
  ["empty state", {}],
  ["never paired", { sensorPaired: false }],
  ["pairing open", { sensorPaired: false, pairing: true }],
  ["paired, nothing yet", { sensorPaired: true, rfAgeS: -1 }],
  ["healthy", { sensorPaired: true, rfAgeS: 10, ohPct: 42, tankBattPct: 90, rfRssi: -80 }],
  ["one missed report", { sensorPaired: true, rfAgeS: 35, ohPct: 42 }],
  ["just before stale", { sensorPaired: true, rfAgeS: web.TANK_STALE_S - 1, ohPct: 42 }],
  ["exactly stale", { sensorPaired: true, rfAgeS: web.TANK_STALE_S, ohPct: 42 }],
  ["well stale", { sensorPaired: true, rfAgeS: web.TANK_STALE_S + 120, ohPct: 42 }],
  ["just before abandon", { sensorPaired: true, rfAgeS: web.TANK_ABANDON_S - 1, ohPct: 12 }],
  ["abandoned", { sensorPaired: true, rfAgeS: web.TANK_ABANDON_S, ohPct: 12 }],
  ["very old", { sensorPaired: true, rfAgeS: 86400, ohPct: 12 }],
  ["sentinel level", { sensorPaired: true, rfAgeS: 10, ohPct: -1 }],
  ["sentinel battery", { sensorPaired: true, rfAgeS: 10, ohPct: 40, tankBattPct: -1 }],
  ["sensor fault", { sensorPaired: true, rfAgeS: 5, ohPct: 40, ohFault: true }],
  ["low battery", { sensorPaired: true, rfAgeS: 5, ohPct: 40, tankBattPct: 6, tankBattLow: true }],
  ["zero rssi means unknown", { sensorPaired: true, rfAgeS: 5, ohPct: 40, rfRssi: 0 }],
  ["full tank", { sensorPaired: true, rfAgeS: 5, ohPct: 100 }],
  ["empty tank", { sensorPaired: true, rfAgeS: 5, ohPct: 0 }],

  /*
   * The pump-hold cases. From watertank 2.2.0 a sump that cannot be read holds
   * the pump, and both surfaces have to say the same thing about it — a
   * console reading "sump sensor failed" beside a phone showing a working
   * pump switch is how somebody concludes the app is broken and goes to the
   * panel instead.
   */
  ["sump unreadable", { sensorPaired: true, rfAgeS: 5, ohPct: 40, sumpPct: -1, sumpFault: true }],
  ["sump unreadable, no flag", { sensorPaired: true, rfAgeS: 5, ohPct: 40, sumpPct: -1 }],
  ["sump low", { sensorPaired: true, rfAgeS: 5, ohPct: 40, sumpPct: 10, sumpMinPct: 15 }],
  ["sump exactly at the floor", { sensorPaired: true, rfAgeS: 5, ohPct: 40, sumpPct: 15, sumpMinPct: 15 }],
  ["sump just above the floor", { sensorPaired: true, rfAgeS: 5, ohPct: 40, sumpPct: 16, sumpMinPct: 15 }],
  ["dry-run latched", { sensorPaired: true, rfAgeS: 5, ohPct: 40, sumpPct: 80, dryRun: true }],
  ["overflow float", { sensorPaired: true, rfAgeS: 5, ohPct: 99, sumpPct: 80, overflow: true }],
  ["dry-run outranks a low sump", { sensorPaired: true, rfAgeS: 5, ohPct: 40, sumpPct: 2, dryRun: true }],
  ["stale link holds the pump", { sensorPaired: true, rfAgeS: web.TANK_STALE_S + 60, ohPct: 40, sumpPct: 80 }],
  ["nothing wrong", { sensorPaired: true, rfAgeS: 5, ohPct: 40, sumpPct: 80, sumpMinPct: 15 }],
];

describe("tank link thresholds", () => {
  it("are identical in both projects", () => {
    expect(app.TANK_REPORT_INTERVAL_S).toBe(web.TANK_REPORT_INTERVAL_S);
    expect(app.TANK_STALE_S).toBe(web.TANK_STALE_S);
    expect(app.TANK_ABANDON_S).toBe(web.TANK_ABANDON_S);
  });
});

describe("readTankLink agrees across web and app", () => {
  it.each(CASES)("%s", (_name, state) => {
    const w = web.readTankLink(state);
    const a = app.readTankLink(state);

    // The safety-critical fields, compared as one object so a failure shows
    // every difference at once rather than the first.
    expect({
      status: a.status,
      levelPct: a.levelPct,
      levelIsCurrent: a.levelIsCurrent,
      blocksAutoFill: a.blocksAutoFill,
      tone: a.tone,
      batteryPct: a.batteryPct,
      batteryLow: a.batteryLow,
      rssi: a.rssi,
      ageS: a.ageS,
    }).toEqual({
      status: w.status,
      levelPct: w.levelPct,
      levelIsCurrent: w.levelIsCurrent,
      blocksAutoFill: w.blocksAutoFill,
      tone: w.tone,
      batteryPct: w.batteryPct,
      batteryLow: w.batteryLow,
      rssi: w.rssi,
      ageS: w.ageS,
    });
  });

  it("renders the level the same way", () => {
    for (const [, state] of CASES) {
      expect(app.tankLevelText(app.readTankLink(state)))
        .toBe(web.tankLevelText(web.readTankLink(state)));
    }
  });

  it("words the explanation the same way", () => {
    // Wording drift is not dangerous, but it is how two products stop feeling
    // like one, and it usually means the logic drifted first.
    for (const [, state] of CASES) {
      expect(app.readTankLink(state).label).toBe(web.readTankLink(state).label);
      expect(app.readTankLink(state).detail).toBe(web.readTankLink(state).detail);
    }
  });
});

describe("formatAge agrees", () => {
  it.each([0, 1, 45, 89, 90, 300, 3600, 7200, 86400, 86400 * 3])("%i seconds", (s) => {
    expect(app.formatAge(s)).toBe(web.formatAge(s));
  });
});

describe("the invariant that matters", () => {
  it("never lets either surface show a bare percentage for a stale level", () => {
    // Stated once, directly, so the intent survives even if the cases above
    // are edited: a level that must not be acted on must not look like one
    // that may be.
    for (const [, state] of CASES) {
      for (const link of [web.readTankLink(state), app.readTankLink(state)]) {
        if (link.levelIsCurrent) continue;
        const text = web.tankLevelText(link);
        expect(text === "—" || text.includes("last known")).toBe(true);
      }
    }
  });
});

describe("readPumpHold agrees across web and app", () => {
  it.each(CASES)("%s", (_name, state) => {
    const w = web.readPumpHold(state, web.readTankLink(state));
    const a = app.readPumpHold(state, app.readTankLink(state));
    expect({ held: a.held, reason: a.reason, tone: a.tone, label: a.label, detail: a.detail })
      .toEqual({ held: w.held, reason: w.reason, tone: w.tone, label: w.label, detail: w.detail });
  });
});

describe("what holds the pump", () => {
  const hold = (s: web.TankDeviceState) => web.readPumpHold(s, web.readTankLink(s));
  const healthy = { sensorPaired: true, rfAgeS: 5, ohPct: 40, sumpPct: 80, sumpMinPct: 15 };

  it("says nothing when nothing is wrong", () => {
    expect(hold(healthy).held).toBe(false);
  });

  it("reports a sump that cannot be read", () => {
    /*
     * The case that motivated all of this. Before watertank 2.2.0 a failed
     * sump published 50%, which is above every possible sumpMin, so the pump's
     * primary dry-run interlock was satisfied by a sensor that was not
     * answering.
     */
    expect(hold({ ...healthy, sumpPct: -1, sumpFault: true }).reason).toBe("sump-fault");
  });

  it("reports it from the sentinel alone, without the flag", () => {
    // Older firmware, or a state message that lost a field: -1 is the
    // published contract and is enough on its own.
    expect(hold({ ...healthy, sumpPct: -1 }).reason).toBe("sump-fault");
  });

  it("distinguishes a low sump from a broken one", () => {
    const low = hold({ ...healthy, sumpPct: 10 });
    expect(low.reason).toBe("sump-low");
    // Nothing is broken and nothing needs doing, so it must not be dressed up
    // as a fault — an alarm that fires while the system is behaving correctly
    // is an alarm people learn to ignore.
    expect(low.tone).toBe("idle");
  });

  it("holds at the floor and releases just above it", () => {
    // Mirrors the firmware's `sumpPct <= sumpMin`.
    expect(hold({ ...healthy, sumpPct: 15 }).reason).toBe("sump-low");
    expect(hold({ ...healthy, sumpPct: 16 }).held).toBe(false);
  });

  it("puts the latched trip ahead of conditions that clear themselves", () => {
    // A dry-run trip stays until somebody resets it, so it outranks a low sump
    // that may well have refilled by the time the screen is read.
    expect(hold({ ...healthy, sumpPct: 2, dryRun: true }).reason).toBe("dry-run");
  });

  it("reports the overflow float", () => {
    expect(hold({ ...healthy, overflow: true }).reason).toBe("overflow");
  });

  it("reports a missing level", () => {
    expect(hold({ ...healthy, rfAgeS: web.TANK_STALE_S + 60 }).reason).toBe("no-level");
  });

  it("always gives something to do about it", () => {
    // A banner that names a problem without a next step is the state somebody
    // screenshots and sends to support.
    for (const [, state] of CASES) {
      const h = hold(state);
      if (!h.held) continue;
      expect(h.label.length).toBeGreaterThan(8);
      expect(h.detail.length).toBeGreaterThan(30);
    }
  });
});
