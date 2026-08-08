import { effectiveDeviceType, isCameraDevice, isMistyped } from "./device-type";

type D = Parameters<typeof effectiveDeviceType>[0];
const dev = (type: string, state: Record<string, unknown>) => ({ type, state }) as unknown as D;

/** The exact payload camera-e8fc-8346 publishes in production. */
const REAL_SENTINEL_STATE = {
  fw: "1.1.0", r1: false, r2: false, r3: true, r4: false, away: false, pads: 4,
  rssi: -63, muted: false, gasPct: 0, gasRaw: 0, hasGas: true, relays: 4,
  uptime: 302269, gasAlarm: false, gasFault: true, gasReady: true,
  hasCamera: false, lastSource: "touch", gasBaseline: 382, exhaustRelay: -1,
  gasWarmingUp: false, safetyCutMask: 0,
};

describe("effectiveDeviceType", () => {
  it("corrects the live mistyped unit", () => {
    const d = dev("camera", REAL_SENTINEL_STATE);
    expect(effectiveDeviceType(d)).toBe("sentinel");
    expect(isMistyped(d)).toBe(true);
    expect(isCameraDevice(d)).toBe(false);
  });

  it("leaves a real camera alone", () => {
    const d = dev("camera", { hasCamera: true, fps: 8, frames: 1200 });
    expect(effectiveDeviceType(d)).toBe("camera");
    expect(isCameraDevice(d)).toBe(true);
    expect(isMistyped(d)).toBe(false);
  });

  it("does not correct on a missing hasCamera", () => {
    // Older camera firmware never reported the capability. Absence is not
    // evidence, and treating it as such would break every camera on an old
    // build — the failure this guards against is worse than the one it fixes.
    expect(effectiveDeviceType(dev("camera", { fps: 8 }))).toBe("camera");
    expect(effectiveDeviceType(dev("camera", {}))).toBe("camera");
    expect(effectiveDeviceType(dev("camera", { hasCamera: undefined }))).toBe("camera");
  });

  it("requires sentinel evidence, not merely the absence of a camera", () => {
    // A genuine camera whose sensor failed to initialise reports hasCamera
    // false. That is a broken camera, not a sentinel, and must keep its camera
    // panel so the fault is visible where the user expects it.
    const d = dev("camera", { hasCamera: false, fps: 0 });
    expect(effectiveDeviceType(d)).toBe("camera");
    expect(isMistyped(d)).toBe(false);
  });

  it("does not treat a falsy-but-not-false hasCamera as proof", () => {
    // `0`, `""` and `null` are all falsy; only an explicit false is a claim.
    for (const v of [0, "", null]) {
      expect(effectiveDeviceType(dev("camera", { ...REAL_SENTINEL_STATE, hasCamera: v }))).toBe("camera");
    }
  });

  it("never rewrites a non-camera type", () => {
    // A real sentinel registered correctly, and a hub, must pass through even
    // though the sentinel matches every capability probe.
    expect(effectiveDeviceType(dev("sentinel", REAL_SENTINEL_STATE))).toBe("sentinel");
    expect(effectiveDeviceType(dev("home-hub", { power: true, channels: 4 }))).toBe("home-hub");
    expect(effectiveDeviceType(dev("smart-plug", { power: true }))).toBe("smart-plug");
  });

  it("covers the cctv and doorbell aliases", () => {
    expect(effectiveDeviceType(dev("cctv", REAL_SENTINEL_STATE))).toBe("sentinel");
    expect(effectiveDeviceType(dev("doorbell", REAL_SENTINEL_STATE))).toBe("sentinel");
  });

  it("survives a null or absent state", () => {
    expect(effectiveDeviceType({ type: "camera", state: null } as unknown as D)).toBe("camera");
    expect(effectiveDeviceType({ type: "camera" } as unknown as D)).toBe("camera");
  });
});
