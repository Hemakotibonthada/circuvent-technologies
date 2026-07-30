import {
  analyseFleet, findSiteOutages, findConcentratedFailures, findStaleSessions,
  findNeverSeen, findFaultedDevices, findFleetDegradation, findFirmwareFragmentation,
  fleetToPromptContext, STALE_MINUTES,
} from "./fleet";
import type { AdminDevice } from "../control-plane";

// Fleet findings drive operational decisions — rolling back a release, telling a
// customer their internet is down, dispatching an engineer. A false positive
// wastes real money, so the thresholds here are tested as carefully as the maths.

const NOW = Date.parse("2026-01-15T12:00:00Z");
const minsAgo = (m: number) => new Date(NOW - m * 60000).toISOString();

const dev = (over: Partial<AdminDevice> = {}): AdminDevice => ({
  id: "d1", name: "Device", type: "smart-plug", room: "Hall",
  online: true, last_seen: minsAgo(1), fw_version: "1.0.0",
  state: {}, owner_email: "a@x.com", owner_id: 1, ...over,
});

/** n devices sharing overrides, with unique ids. */
const many = (n: number, over: Partial<AdminDevice> = {}, prefix = "d"): AdminDevice[] =>
  Array.from({ length: n }, (_, i) => dev({ id: `${prefix}${i}`, ...over }));

describe("findSiteOutages", () => {
  it("flags an owner whose every device is offline", () => {
    const f = findSiteOutages(many(3, { online: false, owner_email: "bob@x.com", owner_id: 2 }));
    expect(f).toHaveLength(1);
    expect(f[0].title).toContain("All 3 devices offline for bob@x.com");
    expect(f[0].deviceIds).toHaveLength(3);
  });

  it("stays quiet when even one device at the site is up", () => {
    const rows = [...many(3, { online: false }), dev({ id: "up", online: true })];
    expect(findSiteOutages(rows)).toHaveLength(0);
  });

  it("ignores single-device owners — one offline device is not a pattern", () => {
    expect(findSiteOutages([dev({ online: false })])).toHaveLength(0);
  });

  it("escalates to critical only for larger estates", () => {
    expect(findSiteOutages(many(2, { online: false }))[0].severity).toBe("warning");
    expect(findSiteOutages(many(4, { online: false }))[0].severity).toBe("critical");
  });

  it("skips unclaimed devices, which share no site", () => {
    expect(findSiteOutages(many(5, { online: false, owner_id: null, owner_email: null }))).toHaveLength(0);
  });

  it("separates owners rather than pooling them", () => {
    const rows = [
      ...many(2, { online: false, owner_email: "a@x.com", owner_id: 1 }, "a"),
      ...many(2, { online: false, owner_email: "b@x.com", owner_id: 2 }, "b"),
    ];
    expect(findSiteOutages(rows)).toHaveLength(2);
  });
});

describe("findConcentratedFailures", () => {
  const byFw = (rows: AdminDevice[]) =>
    findConcentratedFailures(rows, (d) => d.fw_version, "Firmware", "fleet-bad-firmware");

  it("flags a version failing far more than the rest of the fleet", () => {
    const rows = [
      ...many(6, { fw_version: "1.2.0", online: false }, "bad"),
      ...many(20, { fw_version: "1.1.0", online: true }, "good"),
    ];
    const f = byFw(rows);
    expect(f).toHaveLength(1);
    expect(f[0].evidence.groupOfflinePct).toBe(100);
    expect(f[0].evidence.fleetOfflinePct).toBe(0);
  });

  it("ignores groups smaller than the minimum sample", () => {
    const rows = [
      ...many(3, { fw_version: "1.2.0", online: false }, "bad"),
      ...many(20, { fw_version: "1.1.0", online: true }, "good"),
    ];
    expect(byFw(rows)).toHaveLength(0);
  });

  it("ignores a group that is bad but not much worse than the fleet", () => {
    // 50% in-group vs 40% elsewhere: real but not concentrated enough to blame
    // the group itself.
    const rows = [
      ...many(5, { fw_version: "1.2.0", online: false }, "b"),
      ...many(5, { fw_version: "1.2.0", online: true }, "c"),
      ...many(4, { fw_version: "1.1.0", online: false }, "d"),
      ...many(6, { fw_version: "1.1.0", online: true }, "e"),
    ];
    expect(byFw(rows)).toHaveLength(0);
  });

  it("does not blame one group when the whole fleet is down", () => {
    // Everything offline: no group stands out, so this must fall to the
    // fleet-wide finding instead of accusing an innocent firmware.
    const rows = [
      ...many(6, { fw_version: "1.2.0", online: false }, "a"),
      ...many(6, { fw_version: "1.1.0", online: false }, "b"),
    ];
    expect(byFw(rows)).toHaveLength(0);
  });

  it("compares against the rest of the fleet, not a baseline diluted by the group", () => {
    // The suspect group is most of the fleet. Including it in its own baseline
    // would hide the very signal being tested for.
    const rows = [
      ...many(15, { fw_version: "1.2.0", online: false }, "bad"),
      ...many(5, { fw_version: "1.1.0", online: true }, "good"),
    ];
    const f = byFw(rows);
    expect(f).toHaveLength(1);
    expect(f[0].evidence.fleetOfflinePct).toBe(0);
  });

  it("returns nothing for a single-group fleet, which has no comparison", () => {
    expect(byFw(many(10, { fw_version: "1.0.0", online: false }))).toHaveLength(0);
  });

  it("works the same way when grouping by device type", () => {
    const rows = [
      ...many(6, { type: "camera", online: false }, "cam"),
      ...many(20, { type: "smart-plug", online: true }, "plug"),
    ];
    const f = findConcentratedFailures(rows, (d) => d.type, "Device type", "fleet-bad-type");
    expect(f).toHaveLength(1);
    expect(f[0].title).toContain("camera");
  });
});

describe("findStaleSessions", () => {
  it("flags devices that claim to be online but stopped reporting", () => {
    const rows = [dev({ id: "s1", online: true, last_seen: minsAgo(STALE_MINUTES + 15) })];
    const f = findStaleSessions(rows, NOW);
    expect(f).toHaveLength(1);
    expect(f[0].evidence.worstMinutes).toBe(STALE_MINUTES + 15);
  });

  it("does not count devices that are honestly offline", () => {
    expect(findStaleSessions([dev({ online: false, last_seen: minsAgo(600) })], NOW)).toHaveLength(0);
  });

  it("tolerates an unparseable timestamp instead of treating NaN as stale", () => {
    expect(findStaleSessions([dev({ online: true, last_seen: "not-a-date" })], NOW)).toHaveLength(0);
  });

  it("treats a device that has never reported as never-seen, not stale", () => {
    expect(findStaleSessions([dev({ online: true, last_seen: null })], NOW)).toHaveLength(0);
  });
});

describe("findNeverSeen", () => {
  it("flags registered devices with no telemetry ever", () => {
    const f = findNeverSeen([dev({ last_seen: null }), dev({ id: "d2" })]);
    expect(f).toHaveLength(1);
    expect(f[0].evidence.devices).toBe(1);
  });

  it("says nothing when every device has reported", () => {
    expect(findNeverSeen([dev()])).toHaveLength(0);
  });
});

describe("findFaultedDevices", () => {
  it("collects active fault flags", () => {
    const f = findFaultedDevices([
      dev({ id: "a", state: { leak: true } }),
      dev({ id: "b", state: { tamper: true } }),
      dev({ id: "c", state: { leak: false } }),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0].deviceIds).toEqual(["a", "b"]);
    expect(f[0].evidence.flags).toBe("leak,tamper");
  });

  it("ignores a falsy flag rather than treating presence as a fault", () => {
    expect(findFaultedDevices([dev({ state: { fault: false } })])).toHaveLength(0);
  });
});

describe("findFleetDegradation", () => {
  it("fires when a large share of the fleet is down at once", () => {
    const rows = [...many(7, { online: false }, "a"), ...many(3, { online: true }, "b")];
    const f = findFleetDegradation(rows);
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("critical");
    expect(f[0].evidence.offlinePct).toBe(70);
  });

  it("stays quiet for a healthy fleet", () => {
    const rows = [...many(1, { online: false }, "a"), ...many(19, { online: true }, "b")];
    expect(findFleetDegradation(rows)).toHaveLength(0);
  });

  it("will not judge a fleet too small to draw a conclusion from", () => {
    expect(findFleetDegradation(many(2, { online: false }))).toHaveLength(0);
  });
});

describe("findFirmwareFragmentation", () => {
  it("reports a long tail of versions", () => {
    const rows = ["1.0.0", "1.1.0", "1.2.0", "1.3.0"].flatMap((v, i) =>
      many(i === 0 ? 5 : 1, { fw_version: v }, `v${i}`),
    );
    const f = findFirmwareFragmentation(rows);
    expect(f).toHaveLength(1);
    expect(f[0].evidence.versions).toBe(4);
    expect(f[0].evidence.mostCommon).toBe("1.0.0");
  });

  it("ignores a well-consolidated fleet", () => {
    expect(findFirmwareFragmentation(many(10, { fw_version: "1.0.0" }))).toHaveLength(0);
  });

  it("does not count a blank version as a version", () => {
    const rows = [
      ...many(4, { fw_version: "" }, "blank"),
      ...many(2, { fw_version: "1.0.0" }, "a"),
      ...many(2, { fw_version: "1.1.0" }, "b"),
      ...many(2, { fw_version: "1.2.0" }, "c"),
    ];
    expect(findFirmwareFragmentation(rows)).toHaveLength(0);
  });
});

describe("analyseFleet", () => {
  it("counts a mixed fleet correctly", () => {
    const rows = [
      dev({ id: "a", online: true, last_seen: minsAgo(1) }),
      dev({ id: "b", online: false, last_seen: minsAgo(500) }),
      dev({ id: "c", online: true, last_seen: minsAgo(90) }),
      dev({ id: "d", online: false, last_seen: null }),
    ];
    const a = analyseFleet(rows, NOW);
    expect(a.counts).toMatchObject({
      total: 4, online: 2, offline: 2, stale: 1, neverSeen: 1,
    });
  });

  it("orders findings with the most severe first", () => {
    const rows = [
      ...many(8, { online: false, state: { leak: true }, owner_email: "z@x.com", owner_id: 9 }, "f"),
      ...many(4, { online: true, fw_version: "9.9.9" }, "g"),
    ];
    const a = analyseFleet(rows, NOW);
    expect(a.findings.length).toBeGreaterThan(0);
    expect(a.findings[0].severity).toBe("critical");
  });

  it("survives an empty fleet without dividing by zero", () => {
    const a = analyseFleet([], NOW);
    expect(a.counts.total).toBe(0);
    expect(a.findings).toEqual([]);
  });

  it("tolerates a non-array input rather than throwing", () => {
    const a = analyseFleet(null as unknown as AdminDevice[], NOW);
    expect(a.counts.total).toBe(0);
  });

  it("gives every finding a unique id so React keys stay stable", () => {
    const rows = [
      ...many(6, { online: false, owner_email: "a@x.com", owner_id: 1, fw_version: "1.2.0" }, "a"),
      ...many(20, { online: true, owner_email: "b@x.com", owner_id: 2, fw_version: "1.1.0" }, "b"),
    ];
    const ids = analyseFleet(rows, NOW).findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("fleetToPromptContext", () => {
  it("states the facts without inventing any", () => {
    const rows = [...many(3, { online: false }, "a"), ...many(3, { online: true }, "b")];
    const text = fleetToPromptContext(analyseFleet(rows, NOW));
    expect(text).toContain("6 devices");
    expect(text).toContain("3 online");
  });

  it("says so plainly when there is nothing to report", () => {
    const text = fleetToPromptContext(analyseFleet(many(3, { online: true }), NOW));
    expect(text).toContain("No fleet-level findings.");
  });
});
