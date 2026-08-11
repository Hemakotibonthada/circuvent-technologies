import { inlineControl } from "@/app/smarthome/_kit/device";
import type { Device } from "@/lib/control-plane";

const device = (type: string, state: Record<string, unknown> = {}): Device =>
  ({ id: "d1", name: "Test", type, online: true, state }) as unknown as Device;

/**
 * The dashboard tile used to offer power and nothing else, so dimming a light
 * meant opening its page. This picks the one continuous control a tile should
 * carry — and, just as importantly, refuses to invent one for devices that have
 * none.
 */
describe("inlineControl", () => {
  it.each(["smart-light", "light"])("offers brightness for %s", (type) => {
    const c = inlineControl(device(type, { brightness: 40 }));
    expect(c).toMatchObject({ field: "brightness", value: 40, min: 0, max: 100 });
  });

  it.each(["smart-fan", "fan", "ceiling-fan"])("offers speed for %s", (type) => {
    const c = inlineControl(device(type, { level: 66 }));
    expect(c).toMatchObject({ field: "level", value: 66 });
    expect(c?.tickLabels).toMatchObject({ 0: "Off", 100: "High" });
  });

  it("reads a legacy fan's speed so the handle is not stuck at zero", () => {
    // A fan predating `level` reports only `speed`; without the fallback the
    // slider sits at 0 on a fan that is visibly running and the first drag
    // appears to jump it.
    const c = inlineControl(device("smart-fan", { speed: 2 }));
    expect(c?.value).toBe(66);
  });

  it("prefers level over speed when a fan reports both", () => {
    const c = inlineControl(device("smart-fan", { level: 48, speed: 1 }));
    expect(c?.value).toBe(48);
  });

  it("starts at zero rather than NaN when a light has never reported", () => {
    expect(inlineControl(device("smart-light", {}))?.value).toBe(0);
  });

  it("ignores a non-numeric brightness instead of rendering NaN", () => {
    expect(inlineControl(device("smart-light", { brightness: "bright" }))?.value).toBe(0);
  });

  it.each(["smart-plug", "smart-switch", "motion-sensor", "energy-monitor", "camera"])(
    "offers nothing for %s",
    (type) => {
      expect(inlineControl(device(type, { power: true }))).toBeNull();
    }
  );

  it("offers nothing for an unknown type", () => {
    expect(inlineControl(device("something-new"))).toBeNull();
  });

  it("survives a device with no state at all", () => {
    const d = { id: "d", name: "n", type: "smart-light", online: true } as unknown as Device;
    expect(() => inlineControl(d)).not.toThrow();
  });
});
