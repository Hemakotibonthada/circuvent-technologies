import { findTankSensorProblems, TANK_BATTERY_WARN_PCT } from "./tank-health";
import { TANK_STALE_S, TANK_ABANDON_S } from "./tank-link";
import type { Device } from "@/lib/control-plane";

const tank = (state: Record<string, unknown>, over: Partial<Device> = {}): Device =>
  ({
    id: "wt1",
    name: "Terrace tank",
    type: "watertank",
    online: true,
    state,
    ...over,
  }) as Device;

const healthy = {
  sensorPaired: true,
  rfAgeS: 15,
  ohPct: 60,
  tankBattPct: 80,
  rfRssi: -85,
  auto: true,
};

const ids = (fs: { id: string }[]) => fs.map((f) => f.id.split(":")[0]).sort();

describe("a healthy tank", () => {
  it("produces nothing", () => {
    expect(findTankSensorProblems([tank(healthy)])).toEqual([]);
  });

  it("ignores devices that are not tanks", () => {
    const plug = { id: "p1", type: "smart-plug", online: true, state: {} } as Device;
    expect(findTankSensorProblems([plug])).toEqual([]);
  });

  it("says nothing about a wired tank, which has no radio to lose", () => {
    expect(findTankSensorProblems([tank({ ohPct: 60, auto: true })])).toEqual([]);
  });
});

describe("the case this detector exists for", () => {
  it("reports a lost sensor even though the controller is perfectly online", () => {
    /*
     * The whole point. The starter is mains powered and on Wi-Fi, so every
     * other detector looks at it and sees a healthy device — while the thing
     * that fills the tank has stopped.
     */
    const f = findTankSensorProblems([
      tank({ ...healthy, rfAgeS: TANK_ABANDON_S + 60, ohPct: -1 }),
    ]);
    expect(ids(f)).toContain("tank-sensor-lost");
    expect(f[0].severity).toBe("critical");
    expect(f[0].detail).toMatch(/no longer being topped up/i);
  });

  it("does not double-report when the controller itself is offline", () => {
    // findOfflineDevices already covers that, and two findings for one outage
    // buries the one worth acting on.
    const f = findTankSensorProblems([
      tank({ ...healthy, rfAgeS: TANK_ABANDON_S + 60 }, { online: false }),
    ]);
    expect(f).toEqual([]);
  });

  it("blames the battery when the battery was the likely cause", () => {
    const f = findTankSensorProblems([
      tank({ ...healthy, rfAgeS: TANK_ABANDON_S + 60, tankBattPct: 4 }),
    ]);
    expect(f[0].suggestion).toMatch(/battery/i);
  });

  it("sends someone to the antenna when the battery was fine", () => {
    const f = findTankSensorProblems([
      tank({ ...healthy, rfAgeS: TANK_ABANDON_S + 60, tankBattPct: 95 }),
    ]);
    expect(f[0].suggestion).toMatch(/antenna|in range|check the sensor/i);
  });
});

describe("degrees of trouble", () => {
  it("treats a stale link as a warning, not a crisis", () => {
    const f = findTankSensorProblems([tank({ ...healthy, rfAgeS: TANK_STALE_S + 30 })]);
    expect(ids(f)).toContain("tank-sensor-stale");
    expect(f[0].severity).toBe("warning");
  });

  it("does not fire for a single missed report", () => {
    // One loss is ordinary on radio. Alerting on it would train people to
    // ignore the alert.
    expect(findTankSensorProblems([tank({ ...healthy, rfAgeS: 35 })])).toEqual([]);
  });

  it("reports a sensor that is paired but has never spoken", () => {
    const f = findTankSensorProblems([tank({ sensorPaired: true, rfAgeS: -1, auto: true })]);
    expect(ids(f)).toContain("tank-sensor-silent");
  });

  it("raises only one link finding at a time", () => {
    // Lost, stale and silent are the same problem at different ages. Emitting
    // several would triple the noise for one fault.
    const f = findTankSensorProblems([tank({ ...healthy, rfAgeS: TANK_ABANDON_S * 2 })]);
    expect(f.filter((x) => x.id.startsWith("tank-sensor-")).length).toBe(1);
  });
});

describe("unpaired", () => {
  it("is only worth saying when auto-fill is expecting a sensor", () => {
    // An installer part way through a job does not need telling that the thing
    // they have not done yet is not done.
    expect(findTankSensorProblems([tank({ sensorPaired: false, auto: false })])).toEqual([]);
  });

  it("is worth saying when auto-fill is on and cannot work", () => {
    const f = findTankSensorProblems([tank({ sensorPaired: false, auto: true })]);
    expect(ids(f)).toContain("tank-sensor-unpaired");
    expect(f[0].suggestion).toMatch(/pair the sensor|switch auto-fill off/i);
  });
});

describe("battery, the one warning that arrives in time", () => {
  it("warns before the sensor dies rather than after", () => {
    const f = findTankSensorProblems([tank({ ...healthy, tankBattPct: TANK_BATTERY_WARN_PCT })]);
    expect(ids(f)).toContain("tank-battery");
    expect(f[0].detail).toMatch(/auto-fill stops/i);
  });

  it("gets more urgent as the cell empties", () => {
    const mild = findTankSensorProblems([tank({ ...healthy, tankBattPct: 18 })])[0];
    const bad = findTankSensorProblems([tank({ ...healthy, tankBattPct: 6 })])[0];
    expect(mild.severity).toBe("info");
    expect(bad.severity).toBe("warning");
  });

  it("stays quiet on a healthy cell", () => {
    expect(findTankSensorProblems([tank({ ...healthy, tankBattPct: 55 })])).toEqual([]);
  });

  it("does not repeat itself once the link is already lost", () => {
    // The lost finding already tells them to check the battery.
    const f = findTankSensorProblems([
      tank({ ...healthy, rfAgeS: TANK_ABANDON_S + 10, tankBattPct: 3 }),
    ]);
    expect(ids(f)).not.toContain("tank-battery");
  });

  it("ignores the unknown-battery sentinel", () => {
    expect(findTankSensorProblems([tank({ ...healthy, tankBattPct: -1 })])).toEqual([]);
  });
});

describe("rejected packets", () => {
  it("stays quiet about the occasional stray", () => {
    // 433 MHz is shared. A few rejects is the MAC check doing its job.
    expect(findTankSensorProblems([tank({ ...healthy, rfRejected: 4 })])).toEqual([]);
  });

  it("mentions it once it is persistent, without alarming anyone", () => {
    const f = findTankSensorProblems([tank({ ...healthy, rfRejected: 500 })]);
    expect(ids(f)).toContain("tank-rf-rejected");
    expect(f[0].severity).toBe("info");
    expect(f[0].detail).toMatch(/ignored them/i);
  });
});

describe("a sensor that reports nonsense", () => {
  it("is distinguished from a sensor that has gone quiet", () => {
    // The radio is fine here. Signal advice would send someone up a ladder
    // with entirely the wrong tool.
    const f = findTankSensorProblems([
      tank({ ...healthy, rfAgeS: 5, ohPct: -1, ohFault: true }),
    ]);
    expect(ids(f)).toContain("tank-sensor-fault");
    expect(f[0].suggestion).toMatch(/inlet|empty and full distances/i);
  });
});

describe("findings are shaped for the alert monitor", () => {
  it("carry a device id, so the monitor can fingerprint the problem", () => {
    const f = findTankSensorProblems([tank({ ...healthy, rfAgeS: TANK_ABANDON_S + 1 })]);
    expect(f[0].deviceIds).toEqual(["wt1"]);
  });

  it("give every finding an actionable suggestion", () => {
    const cases = [
      { ...healthy, rfAgeS: TANK_ABANDON_S + 1 },
      { ...healthy, rfAgeS: TANK_STALE_S + 1 },
      { sensorPaired: true, rfAgeS: -1, auto: true },
      { sensorPaired: false, auto: true },
      { ...healthy, tankBattPct: 5 },
      { ...healthy, rfRejected: 900 },
      { ...healthy, ohPct: -1, ohFault: true },
    ];
    for (const state of cases) {
      for (const f of findTankSensorProblems([tank(state)])) {
        expect({ id: f.id, hasSuggestion: !!f.suggestion?.trim() })
          .toEqual({ id: f.id, hasSuggestion: true });
      }
    }
  });

  it("keeps ids stable per device, so an ongoing fault is one alert", () => {
    const a = findTankSensorProblems([tank({ ...healthy, rfAgeS: TANK_ABANDON_S + 1 })]);
    const b = findTankSensorProblems([tank({ ...healthy, rfAgeS: TANK_ABANDON_S + 500 })]);
    expect(a[0].id).toBe(b[0].id);
  });
});
