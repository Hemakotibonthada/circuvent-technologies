import {
  analyseHome, findOfflineDevices, findStaleDevices, findStandbyDrain,
  findAnomalies, findScheduleConflicts, findRecurringEvents,
  energyInsight, deviceWatts, deviceIsOn, mad, median, series,
  analysisToPromptContext,
} from "./analysis";
import type { Device, AppEvent } from "../control-plane";

// This engine is what stops the assistant hallucinating. Everything it reports
// is arithmetic on real readings, so it has to be right — a wrong "your door is
// unlocked" is worse than no answer at all.

const dev = (over: Partial<Device> = {}): Device => ({
  id: "d1", type: "smart-plug", name: "Plug", online: true,
  last_seen: new Date().toISOString(), state: {}, ...over,
});

const NOW = Date.parse("2026-01-15T12:00:00Z");
const minsAgo = (m: number) => new Date(NOW - m * 60000).toISOString();

describe("deviceWatts", () => {
  it("reads the common power fields", () => {
    expect(deviceWatts(dev({ state: { power_w: 42.5 } }))).toBe(42.5);
    expect(deviceWatts(dev({ state: { watts: 10 } }))).toBe(10);
  });

  it("does not mistake a boolean `power` for a wattage", () => {
    // On a plug, `power` is the on/off switch. Treating true as a number would
    // invent a reading out of a switch position.
    expect(deviceWatts(dev({ state: { power: true } }))).toBeNull();
    expect(deviceWatts(dev({ state: { power: false } }))).toBeNull();
  });

  it("returns null when nothing is metered", () => {
    expect(deviceWatts(dev({ state: { on: true } }))).toBeNull();
  });
});

describe("deviceIsOn", () => {
  it("reads a boolean switch", () => {
    expect(deviceIsOn(dev({ state: { on: true } }))).toBe(true);
    expect(deviceIsOn(dev({ state: { pump: false } }))).toBe(false);
  });

  it("treats a relay array as on when any channel is on", () => {
    expect(deviceIsOn(dev({ state: { relays: [false, true, false] } }))).toBe(true);
    expect(deviceIsOn(dev({ state: { relays: [false, false] } }))).toBe(false);
  });

  it("returns null when the device has no switch", () => {
    expect(deviceIsOn(dev({ state: { level: 70 } }))).toBeNull();
  });
});

describe("findOfflineDevices", () => {
  it("says nothing when everything is online", () => {
    expect(findOfflineDevices([dev(), dev({ id: "d2" })])).toEqual([]);
  });

  it("escalates when most of the fleet is down, pointing at the router", () => {
    const ds = [dev({ id: "a", online: false }), dev({ id: "b", online: false }), dev({ id: "c", online: false })];
    const [f] = findOfflineDevices(ds);
    expect(f.severity).toBe("critical");
    expect(f.detail).toMatch(/router/i);
    expect(f.deviceIds).toEqual(["a", "b", "c"]);
  });

  it("stays a warning for a single device", () => {
    const [f] = findOfflineDevices([dev({ id: "a", online: false }), dev({ id: "b" }), dev({ id: "c" })]);
    expect(f.severity).toBe("warning");
  });
});

describe("findStaleDevices", () => {
  it("flags a device that claims online but stopped reporting", () => {
    const [f] = findStaleDevices([dev({ last_seen: minsAgo(90) })], NOW);
    expect(f.severity).toBe("warning");
    expect(f.evidence.minutesSinceLastReport).toBe(90);
  });

  it("escalates after a day", () => {
    const [f] = findStaleDevices([dev({ last_seen: minsAgo(60 * 30) })], NOW);
    expect(f.severity).toBe("critical");
  });

  it("ignores recent reports and offline devices", () => {
    expect(findStaleDevices([dev({ last_seen: minsAgo(5) })], NOW)).toEqual([]);
    expect(findStaleDevices([dev({ online: false, last_seen: minsAgo(999) })], NOW)).toEqual([]);
  });

  it("ignores a device that has never reported rather than inventing an age", () => {
    expect(findStaleDevices([dev({ last_seen: null })], NOW)).toEqual([]);
  });
});

describe("findStandbyDrain", () => {
  it("flags real draw while switched off", () => {
    const [f] = findStandbyDrain([dev({ state: { on: false, power_w: 25 } })]);
    expect(f.severity).toBe("warning");
    expect(f.evidence.watts).toBe(25);
  });

  it("ignores trivial standby, which is normal", () => {
    expect(findStandbyDrain([dev({ state: { on: false, power_w: 1.2 } })])).toEqual([]);
  });

  it("says nothing when the device is on — that draw is expected", () => {
    expect(findStandbyDrain([dev({ state: { on: true, power_w: 900 } })])).toEqual([]);
  });

  it("says nothing when the switch state is unknown", () => {
    expect(findStandbyDrain([dev({ state: { power_w: 40 } })])).toEqual([]);
  });
});

describe("findAnomalies", () => {
  const flat = (n: number, v: number) =>
    Array.from({ length: n }, (_, i) => ({ ts: minsAgo(n - i), payload: { power_w: v + (i % 3) } }));

  it("flags a reading far outside its own history", () => {
    const points = [...flat(30, 100), { ts: minsAgo(0), payload: { power_w: 900 } }];
    const [f] = findAnomalies("d1", "Geyser", points, "power_w");
    expect(f).toBeDefined();
    expect(f.evidence.latest).toBe(900);
    expect(Number(f.evidence.deviations)).toBeGreaterThan(4);
  });

  it("stays quiet for normal variation", () => {
    expect(findAnomalies("d1", "Geyser", flat(30, 100), "power_w")).toEqual([]);
  });

  it("refuses to judge without enough history", () => {
    const points = [...flat(5, 100), { ts: minsAgo(0), payload: { power_w: 5000 } }];
    expect(findAnomalies("d1", "Geyser", points, "power_w")).toEqual([]);
  });

  it("stays quiet on a perfectly flat series instead of dividing by zero", () => {
    const points = Array.from({ length: 30 }, () => ({ ts: minsAgo(1), payload: { power_w: 50 } }));
    expect(findAnomalies("d1", "X", [...points, { ts: minsAgo(0), payload: { power_w: 51 } }], "power_w")).toEqual([]);
  });

  it("is not blinded by the spike it is looking for", () => {
    // A mean+stdDev detector fails here: the outlier inflates the threshold
    // past its own value. MAD is resistant, which is why it is used.
    const points = [...flat(40, 10), { ts: minsAgo(0), payload: { power_w: 10000 } }];
    expect(findAnomalies("d1", "X", points, "power_w").length).toBe(1);
  });
});

describe("findScheduleConflicts", () => {
  const rule = (id: number, name: string, at: string, deviceId: string, days?: number[]) => ({
    id, name, enabled: true,
    trigger: { type: "time", at, ...(days ? { days } : {}) },
    action: { type: "command", deviceId, command: { on: true } },
  });

  it("flags two rules commanding one device at the same minute", () => {
    const [f] = findScheduleConflicts([rule(1, "Morning", "07:00", "d1"), rule(2, "Wake", "07:00", "d1")]);
    expect(f.severity).toBe("warning");
    expect(f.evidence.rules).toBe(2);
  });

  it("does not flag different devices or different times", () => {
    expect(findScheduleConflicts([rule(1, "A", "07:00", "d1"), rule(2, "B", "07:00", "d2")])).toEqual([]);
    expect(findScheduleConflicts([rule(1, "A", "07:00", "d1"), rule(2, "B", "08:00", "d1")])).toEqual([]);
  });

  it("does not flag rules that run on disjoint days", () => {
    expect(findScheduleConflicts([
      rule(1, "Weekday", "07:00", "d1", [1, 2, 3, 4, 5]),
      rule(2, "Weekend", "07:00", "d1", [0, 6]),
    ])).toEqual([]);
  });

  it("ignores disabled rules", () => {
    const rules = [rule(1, "A", "07:00", "d1"), { ...rule(2, "B", "07:00", "d1"), enabled: false }];
    expect(findScheduleConflicts(rules)).toEqual([]);
  });

  it("sees a conflict inside a multi-step sequence", () => {
    const seq = {
      id: 3, name: "Scene", enabled: true,
      trigger: { type: "time", at: "07:00" },
      action: [{ type: "command", deviceId: "zz" }, { type: "command", deviceId: "d1" }],
    };
    expect(findScheduleConflicts([rule(1, "A", "07:00", "d1"), seq]).length).toBe(1);
  });
});

describe("findRecurringEvents", () => {
  const ev = (over: Partial<AppEvent>): AppEvent => ({
    id: 1, device_id: "d1", kind: "warning", title: "Pump dry-run", body: "", read: false,
    ts: minsAgo(10), ...over,
  });

  it("flags a repeating alert", () => {
    const [f] = findRecurringEvents([ev({}), ev({ id: 2 }), ev({ id: 3 })], NOW);
    expect(f.evidence.occurrences).toBe(3);
  });

  it("ignores one-offs and informational events", () => {
    expect(findRecurringEvents([ev({}), ev({ id: 2 })], NOW)).toEqual([]);
    expect(findRecurringEvents([ev({ kind: "info" }), ev({ id: 2, kind: "info" }), ev({ id: 3, kind: "info" })], NOW)).toEqual([]);
  });

  it("ignores events outside the window", () => {
    const old = minsAgo(60 * 48);
    expect(findRecurringEvents([ev({ ts: old }), ev({ id: 2, ts: old }), ev({ id: 3, ts: old })], NOW)).toEqual([]);
  });
});

describe("energyInsight", () => {
  it("totals only metered devices and ranks them", () => {
    const e = energyInsight([
      dev({ id: "a", name: "AC", state: { on: true, power_w: 1500 } }),
      dev({ id: "b", name: "Fan", state: { on: true, power_w: 500 } }),
      dev({ id: "c", name: "Sensor", state: { motion: true } }),
    ]);
    expect(e.totalWatts).toBe(2000);
    expect(e.meteredDevices).toBe(2);
    expect(e.topConsumers[0].name).toBe("AC");
    expect(e.topConsumers[0].sharePct).toBe(75);
    expect(e.estimatedKWhPerDay).toBe(48);
  });

  it("handles a fleet with no metering without dividing by zero", () => {
    const e = energyInsight([dev({ state: { on: true } })]);
    expect(e.totalWatts).toBe(0);
    expect(e.topConsumers).toEqual([]);
  });
});

describe("statistics helpers", () => {
  it("median handles even and odd lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it("mad is zero for a constant series", () => {
    expect(mad([5, 5, 5, 5])).toBe(0);
  });

  it("series drops non-numeric points instead of coercing them to zero", () => {
    const pts = [
      { ts: "", payload: { v: 1 } },
      { ts: "", payload: { v: "nope" } },
      { ts: "", payload: {} },
      { ts: "", payload: { v: 3 } },
    ];
    expect(series(pts, "v")).toEqual([1, 3]);
  });
});

describe("analyseHome", () => {
  it("works from a device list alone", () => {
    const a = analyseHome({ devices: [dev({ online: false })], now: NOW });
    expect(a.counts).toEqual({ total: 1, online: 0, offline: 1 });
    expect(a.findings.length).toBeGreaterThan(0);
  });

  it("orders critical findings first", () => {
    const a = analyseHome({
      devices: [
        dev({ id: "a", online: false }), dev({ id: "b", online: false }), dev({ id: "c", online: false }),
        dev({ id: "d", state: { on: false, power_w: 8 } }),
      ],
      now: NOW,
    });
    expect(a.findings[0].severity).toBe("critical");
  });

  it("reports no problems for a healthy home, rather than inventing one", () => {
    const a = analyseHome({ devices: [dev({ state: { on: true, power_w: 40 } })], now: NOW });
    expect(a.findings).toEqual([]);
    expect(analysisToPromptContext(a)).toMatch(/No problems detected/);
  });

  it("survives an empty home", () => {
    const a = analyseHome({ devices: [], now: NOW });
    expect(a.counts.total).toBe(0);
    expect(a.findings).toEqual([]);
  });
});

describe("analysisToPromptContext", () => {
  it("states only what was computed", () => {
    const a = analyseHome({
      devices: [dev({ id: "a", name: "AC", state: { on: true, power_w: 1200 } })],
      now: NOW,
    });
    const text = analysisToPromptContext(a);
    expect(text).toContain("1 total");
    expect(text).toContain("1200 W");
    expect(text).toContain("AC");
  });
});
