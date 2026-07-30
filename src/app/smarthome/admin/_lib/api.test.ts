import { sumStateMetric, deviceHealth } from "./api";

// The admin overview claims in its own header comment that it never fabricates
// figures. sumStateMetric is where that promise is easiest to break, because
// raw device state is untyped and JavaScript's Number() coerces far too
// eagerly. These tests pin the distinction between "reported zero" and
// "reported nothing".

describe("sumStateMetric", () => {
  it("sums genuine numeric readings", () => {
    const r = sumStateMetric([{ state: { watts: 12 } }, { state: { watts: 8.5 } }], ["watts"]);
    expect(r).toEqual({ total: 20.5, reporting: 2 });
  });

  it("does not turn a boolean switch position into a wattage", () => {
    // On a smart plug `power` is the on/off switch. Number(true) === 1, so the
    // naive version silently invented 1 W for every plug that was switched on.
    const r = sumStateMetric([{ state: { power: true } }], ["watts", "power"]);
    expect(r).toEqual({ total: 0, reporting: 0 });
  });

  it("does not treat a null reading as zero", () => {
    // Number(null) === 0, which would report the device as metered at 0 W
    // rather than as having no meter at all.
    const r = sumStateMetric([{ state: { watts: null } }], ["watts"]);
    expect(r.reporting).toBe(0);
  });

  it("does not treat an empty string as zero", () => {
    expect(sumStateMetric([{ state: { watts: "" } }], ["watts"]).reporting).toBe(0);
  });

  it("still accepts a numeric string, which devices do send", () => {
    const r = sumStateMetric([{ state: { watts: "42.5" } }], ["watts"]);
    expect(r).toEqual({ total: 42.5, reporting: 1 });
  });

  it("keeps a real zero reading", () => {
    const r = sumStateMetric([{ state: { watts: 0 } }], ["watts"]);
    expect(r).toEqual({ total: 0, reporting: 1 });
  });

  it("uses the first key that has a usable value", () => {
    const r = sumStateMetric([{ state: { watts: true, activePower: 30 } }], ["watts", "activePower"]);
    expect(r).toEqual({ total: 30, reporting: 1 });
  });

  it("ignores devices with no state at all", () => {
    expect(sumStateMetric([{}], ["watts"])).toEqual({ total: 0, reporting: 0 });
  });

  it("rejects NaN and Infinity", () => {
    expect(sumStateMetric([{ state: { watts: NaN } }], ["watts"]).reporting).toBe(0);
    expect(sumStateMetric([{ state: { watts: Infinity } }], ["watts"]).reporting).toBe(0);
  });
});

describe("deviceHealth", () => {
  const nowIso = new Date().toISOString();

  it("reports an offline device as offline regardless of state", () => {
    expect(deviceHealth({ online: false, last_seen: nowIso, state: { leak: true } })).toBe("offline");
  });

  it("escalates an active critical flag", () => {
    expect(deviceHealth({ online: true, last_seen: nowIso, state: { leak: true } })).toBe("critical");
  });

  it("warns on a low battery", () => {
    expect(deviceHealth({ online: true, last_seen: nowIso, state: { battery: 15 } })).toBe("warning");
  });

  it("warns on a weak signal", () => {
    expect(deviceHealth({ online: true, last_seen: nowIso, state: { rssi: -85 } })).toBe("warning");
  });

  it("passes a healthy device", () => {
    expect(deviceHealth({ online: true, last_seen: nowIso, state: { battery: 90, rssi: -50 } })).toBe("healthy");
  });
});
