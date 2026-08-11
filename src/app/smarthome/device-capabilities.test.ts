import { capabilities } from "@/app/smarthome/DeviceControls";
import { buildFieldCommand } from "@/lib/smarthome-command-map";

/**
 * The console's control surface is chosen by device type, and the type a real
 * device carries is the one Add Device registers: "smart-light", "smart-fan".
 * The capability table only listed the bare "light"/"fan" aliases, so every
 * Circuvent smart light and fan in the field fell through to the default and
 * was given a power button and nothing else — no dimmer, no colour, no speed —
 * while the firmware, the command map and the phone all supported them.
 *
 * Every alias the command map accepts is asserted here, because that map is
 * what actually decides whether a command reaches the hardware; a type it
 * understands and this table does not is a control that silently never appears.
 */
describe("capabilities covers the type names devices really use", () => {
  describe.each(["smart-light", "light"])("%s", (type) => {
    it("offers a brightness dimmer", () => {
      const cap = capabilities(type);
      expect(cap.dimmer).toBeDefined();
      expect(cap.dimmer?.field).toBe("brightness");
      expect(cap.dimmer?.min).toBe(0);
      expect(cap.dimmer?.max).toBe(100);
    });

    it("offers colour", () => {
      expect(capabilities(type).color?.field).toBe("color");
    });

    it("still offers power", () => {
      expect(capabilities(type).power?.field).toBe("power");
    });
  });

  describe.each(["smart-fan", "fan", "ceiling-fan"])("%s", (type) => {
    it("offers a continuous speed control", () => {
      const cap = capabilities(type);
      expect(cap.fan).toBeDefined();
      expect(cap.fan?.field).toBe("level");
    });

    it("keeps the legacy speed field so an un-updated fan still reads back", () => {
      // A fan on older firmware reports only `speed`; without this the slider
      // sits at zero on a fan that is visibly running.
      expect(capabilities(type).fan?.legacyField).toBe("speed");
    });

    it("still offers power", () => {
      expect(capabilities(type).power?.field).toBe("power");
    });
  });

  it("gives an unknown type a power button rather than nothing", () => {
    expect(capabilities("something-new").power?.field).toBe("power");
  });

  it("does not hand a plug a dimmer", () => {
    const cap = capabilities("smart-plug");
    expect(cap.dimmer).toBeUndefined();
    expect(cap.fan).toBeUndefined();
  });

  /*
   * The bug this file exists for was a control the hardware supported and the
   * console never offered. This catches the next one: if the command map can
   * build a command for a field, some control has to be able to send it.
   */
  it.each([
    ["smart-light", "brightness", "dimmer"],
    ["light", "brightness", "dimmer"],
    ["smart-fan", "level", "fan"],
    ["fan", "level", "fan"],
    ["ceiling-fan", "level", "fan"],
  ] as const)("%s accepts %s, so it must expose a %s control", (type, field, control) => {
    expect(buildFieldCommand(type, field, 50)).not.toBeNull();
    expect(capabilities(type)[control]).toBeDefined();
  });

  /*
   * The reverse direction, which is the more expensive mistake: a control that
   * builds no command is a slider that moves, reports success and changes
   * nothing at the device.
   */
  it.each(["smart-light", "light", "smart-fan", "fan", "ceiling-fan"])(
    "%s: every control it offers maps to a real command",
    (type) => {
      const cap = capabilities(type);
      for (const field of [cap.dimmer?.field, cap.fan?.field, cap.power?.field]) {
        if (!field) continue;
        const value = field === "power" ? true : 50;
        expect(buildFieldCommand(type, field, value)).not.toBeNull();
      }
      if (cap.color) expect(buildFieldCommand(type, cap.color.field, "#00FF00")).not.toBeNull();
    }
  );

  it("sends a fan both forms of speed, so un-updated firmware still obeys", () => {
    // Older fans read `speed` and drop `level`; sending only `level` would be
    // a slider that succeeds and does nothing.
    const cmd = buildFieldCommand("smart-fan", "level", 48);
    expect(cmd).toMatchObject({ level: 48, speed: expect.any(Number) });
  });
});
