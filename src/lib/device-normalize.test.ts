import { deviceFirmware, isDeviceLive, normalizeDevice, normalizeDevices, DEVICE_STALE_SECONDS } from "./device-normalize";
import type { Device } from "./control-plane";

const dev = (o: Partial<Device>): Device => ({
  id: "d1", type: "home-hub", name: "Hub", online: false, state: {}, ...o,
} as Device);

const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();

describe("device liveness", () => {
  it("accepts a device heard from moments ago", () => {
    expect(isDeviceLive(dev({ online: true, last_seen: ago(5) }))).toBe(true);
  });

  it("rejects the fleet's real stale-online devices", () => {
    // smart-plug-sec1784923561, ztp-dev-… and e2e-dev-… all report online:true
    // with last_seen two weeks old. The flag's only clearing path is the MQTT
    // last will, so without one it stays true forever.
    expect(isDeviceLive(dev({ online: true, last_seen: ago(14 * 86400) }))).toBe(false);
  });

  it("holds the boundary where the broker's own keepalive has expired", () => {
    expect(isDeviceLive(dev({ online: true, last_seen: ago(DEVICE_STALE_SECONDS - 1) }))).toBe(true);
    expect(isDeviceLive(dev({ online: true, last_seen: ago(DEVICE_STALE_SECONDS + 1) }))).toBe(false);
  });

  it("never promotes a device the server calls offline", () => {
    // Derivation may only take liveness away. A server that says offline knows
    // something we do not — a delivered last will.
    expect(isDeviceLive(dev({ online: false, last_seen: ago(1) }))).toBe(false);
  });

  it("treats missing or unparseable last_seen as not live", () => {
    expect(isDeviceLive(dev({ online: true, last_seen: null }))).toBe(false);
    expect(isDeviceLive(dev({ online: true }))).toBe(false);
    expect(isDeviceLive(dev({ online: true, last_seen: "nonsense" }))).toBe(false);
  });
});

describe("firmware version", () => {
  it("falls back to the version the firmware publishes in state", () => {
    // The column is only written by the newer control plane, so it is empty for
    // every device on this build — while state.fw has been correct all along.
    expect(deviceFirmware(dev({ state: { fw: "2.3.0" } }))).toBe("2.3.0");
  });

  it("prefers the column once the server actually populates it", () => {
    expect(deviceFirmware(dev({ fw_version: "2.4.0", state: { fw: "2.3.0" } }))).toBe("2.4.0");
  });

  it("reports nothing rather than guessing", () => {
    expect(deviceFirmware(dev({ state: {} }))).toBeUndefined();
    expect(deviceFirmware(dev({ state: { fw: "" } }))).toBeUndefined();
    expect(deviceFirmware(dev({ state: { fw: 230 } }))).toBeUndefined();
  });
});

describe("normalisation at the boundary", () => {
  it("corrects both fields together", () => {
    const out = normalizeDevice(dev({ online: true, last_seen: ago(86400), state: { fw: "1.1.0" } }));
    expect(out.online).toBe(false);
    expect(out.fw_version).toBe("1.1.0");
  });

  it("returns the same object when nothing needs changing", () => {
    // Identity matters: React memoisation downstream compares by reference, and
    // a fresh object every poll would re-render the whole console every 15s.
    const d = dev({ online: true, last_seen: ago(2), fw_version: "2.3.0", state: { fw: "2.3.0" } });
    expect(normalizeDevice(d)).toBe(d);
  });

  it("survives a missing or malformed list", () => {
    expect(normalizeDevices(undefined)).toEqual([]);
    expect(normalizeDevices(null)).toEqual([]);
    expect(normalizeDevices([])).toEqual([]);
  });

  it("becomes a no-op once the control plane is updated", () => {
    // A server that already derives liveness and populates fw_version must not
    // have its answers second-guessed.
    const d = dev({ online: true, last_seen: ago(3), fw_version: "9.9.9", state: { fw: "1.0.0" } });
    const out = normalizeDevice(d);
    expect(out.online).toBe(true);
    expect(out.fw_version).toBe("9.9.9");
  });
});
