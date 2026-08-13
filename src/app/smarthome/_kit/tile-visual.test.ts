import { tileVisual, ringDash } from "@/app/smarthome/_kit/tile-visual";
import type { Device } from "@/lib/control-plane";

const device = (type: string, state: Record<string, unknown> = {}): Device =>
  ({ id: "d1", name: "Test", type, online: true, state }) as unknown as Device;

const live = { on: true, online: true };

describe("tileVisual", () => {
  describe("fans", () => {
    it("spins, and faster at a higher speed", () => {
      const slow = tileVisual(device("smart-fan", { level: 20 }), live);
      const fast = tileVisual(device("smart-fan", { level: 100 }), live);
      expect(slow.motion).toBe("spin");
      // A fixed rotation would look the same at both, which throws away the
      // only thing the animation could say.
      expect(fast.spinSeconds!).toBeLessThan(slow.spinSeconds!);
    });

    it("does not spin when the fan is off", () => {
      expect(tileVisual(device("smart-fan", { level: 0 }), live).spinSeconds).toBeNull();
    });

    it("does not spin when the device is unreachable", () => {
      // An animated tile on a device that is not answering is a lie.
      const v = tileVisual(device("smart-fan", { level: 80 }), { on: true, online: false });
      expect(v.spinSeconds).toBeNull();
    });

    it("reads a legacy fan reporting only speed", () => {
      expect(tileVisual(device("smart-fan", { speed: 2 }), live).level).toBe(66);
    });
  });

  describe("lights", () => {
    it("glows, and brighter at a higher brightness", () => {
      const dim = tileVisual(device("smart-light", { brightness: 10 }), live);
      const full = tileVisual(device("smart-light", { brightness: 100 }), live);
      expect(dim.motion).toBe("glow");
      expect(full.glow).toBeGreaterThan(dim.glow);
    });

    it("still glows at the lowest brightness, because the lamp is still on", () => {
      // Rendering 5% identically to off is wrong about the one thing being asked.
      expect(tileVisual(device("smart-light", { brightness: 5 }), live).glow).toBeGreaterThan(0.3);
    });

    it("renders in the bulb's own colour", () => {
      // The per-type accent is right for a plug and wrong for an RGB lamp set
      // to red.
      expect(tileVisual(device("smart-light", { brightness: 80, color: "#FF0000" }), live).tint).toBe("#FF0000");
    });

    it("ignores a malformed colour rather than emitting it as CSS", () => {
      expect(tileVisual(device("smart-light", { color: "red; background:url(x)" }), live).tint).toBe("");
    });

    it("drops the colour when the light is off", () => {
      const v = tileVisual(device("smart-light", { brightness: 80, color: "#FF0000" }), { on: false, online: true });
      expect(v.tint).toBe("");
      expect(v.glow).toBe(0);
    });
  });

  describe("devices with no level", () => {
    it("gives a plug a full glow when on, none when off", () => {
      expect(tileVisual(device("smart-plug", { power: true }), live).glow).toBe(1);
      expect(tileVisual(device("smart-plug", {}), { on: false, online: true }).glow).toBe(0);
      expect(tileVisual(device("smart-plug", { power: true }), live).level).toBeNull();
    });

    it("leaves a sensor alone", () => {
      const v = tileVisual(device("motion-sensor", { motion: true }), live);
      expect(v.motion).toBe("none");
      expect(v.spinSeconds).toBeNull();
      expect(v.glow).toBe(0);
    });

    it.each(["energy-monitor", "camera", "rfid-gate", "guardian"])(
      "does not make %s glow as though it were switched on",
      (type) => {
        // These have no switch. Keying the glow off the capability table's
        // default power field lit all of them up.
        expect(tileVisual(device(type, {}), live).motion).toBe("none");
      }
    );
  });

  it("survives a device with no state", () => {
    const d = { id: "d", name: "n", type: "smart-light", online: true } as unknown as Device;
    expect(() => tileVisual(d, live)).not.toThrow();
  });
});

describe("ringDash", () => {
  it("fills nothing at 0 and everything at 100", () => {
    const r = 20;
    const c = 2 * Math.PI * r;
    expect(ringDash(0, r).dash).toBeCloseTo(0);
    expect(ringDash(100, r).dash).toBeCloseTo(c);
    expect(ringDash(100, r).gap).toBeCloseTo(0);
  });

  it("fills half the circumference at 50", () => {
    const r = 20;
    expect(ringDash(50, r).dash).toBeCloseTo(Math.PI * r);
  });

  it("clamps rather than drawing past the circle", () => {
    const r = 20;
    const c = 2 * Math.PI * r;
    expect(ringDash(140, r).dash).toBeCloseTo(c);
    expect(ringDash(-10, r).dash).toBeCloseTo(0);
  });
});
