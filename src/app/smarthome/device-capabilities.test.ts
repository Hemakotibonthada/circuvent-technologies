import { capabilities, DEVICE_META } from "@/app/smarthome/DeviceControls";
import { buildFieldCommand, masterPower } from "@/lib/smarthome-command-map";

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

  /*
   * The same invariant across the whole fleet, not just lights and fans.
   *
   * The rich-control panel only renders for a type that reports a dimmer, fan,
   * colour or thermostat — that gate is what keeps a camera from being offered
   * the power toggle its command map deliberately refuses to build. So the rule
   * is not "every declared capability must map to a command", which would fail
   * on the harmless default; it is "every capability that will actually be
   * rendered must". This is the check that would have caught smart-light, and
   * it now covers every type in the console rather than the five spelled out
   * above.
   */
  describe.each(
    Object.keys(DEVICE_META).filter((type) => {
      const c = capabilities(type);
      return Boolean(c.dimmer || c.fan || c.color || c.thermostat || c.lock || c.position);
    })
  )("%s renders rich controls, so", (type) => {
    it("every control it offers builds a real command", () => {
      const cap = capabilities(type);
      const checks: [string, unknown][] = [];
      if (cap.power) checks.push([cap.power.field, true]);
      if (cap.dimmer) checks.push([cap.dimmer.field, 50]);
      if (cap.fan) checks.push([cap.fan.field, 50]);
      if (cap.thermostat) checks.push([cap.thermostat.field, 22]);
      if (cap.color) checks.push([cap.color.field, "#00FF00"]);
      if (cap.lock) checks.push([cap.lock.field, true]);
      if (cap.position) checks.push([cap.position.field, 50]);

      for (const [field, value] of checks) {
        expect(buildFieldCommand(type, field, value as never)).not.toBeNull();
      }
    });
  });

  describe("locks and curtains", () => {
    it("gives a lock a bolt and no power switch", () => {
      const cap = capabilities("smart-lock");
      expect(cap.lock?.field).toBe("locked");
      // The map refuses a power command for a lock; declaring one would render
      // a toggle that changes nothing.
      expect(cap.power).toBeUndefined();
      expect(buildFieldCommand("smart-lock", "power", true)).toBeNull();
    });

    it("locks and unlocks through the actions the firmware understands", () => {
      expect(buildFieldCommand("smart-lock", "locked", true)).toEqual({ action: "lock" });
      expect(buildFieldCommand("smart-lock", "locked", false)).toEqual({ action: "unlock" });
    });

    it("gives a curtain a position and no power switch", () => {
      const cap = capabilities("curtain");
      expect(cap.position).toMatchObject({ field: "position", min: 0, max: 100 });
      expect(cap.power).toBeUndefined();
      expect(buildFieldCommand("curtain", "power", true)).toBeNull();
    });

    it("sends a curtain position the firmware parses", () => {
      expect(buildFieldCommand("curtain", "position", 40)).toEqual({ action: "set", position: 40 });
    });

    it("keeps locks and curtains off the dashboard tile", () => {
      // masterPower withholds one-tap control for exactly these, so an
      // accidental tap in a list cannot open a door or a window.
      expect(masterPower({ type: "smart-lock", state: { locked: true } })).toBeNull();
      expect(masterPower({ type: "curtain", state: { position: 50 } })).toBeNull();
    });
  });
});
