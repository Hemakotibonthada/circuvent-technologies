import { getCommandFields } from "@/app/smarthome/automation/describe";
import { buildFieldCommand } from "@/lib/smarthome-command-map";
import { DEVICE_META } from "@/app/smarthome/DeviceControls";

/**
 * A scene must never offer an action the device will ignore.
 *
 * getCommandFields is what the scene and rule editors list; buildFieldCommand
 * is what actually reaches the hardware. They were separate tables, and they
 * disagreed: a curtain and an energy monitor both fell through to a default
 * that offered a Power toggle, which the command map refuses to build for
 * either — a curtain has a position and a meter has nothing to set.
 *
 * The result was the worst shape a bug can take here. The row saved. The scene
 * listed it. Running the scene sent nothing for that device, silently, so the
 * curtain stayed shut and the fault looked like the motor.
 *
 * This is the same invariant already enforced for the console's own controls,
 * applied to the third table that builds commands.
 */
describe("scene actions reach the hardware", () => {
  const types = Object.keys(DEVICE_META);

  it.each(types)("%s offers only fields that build a real command", (type) => {
    for (const field of getCommandFields(type)) {
      const value =
        field.kind === "bool"
          ? true
          : field.kind === "number"
            ? (field.min ?? 1)
            : (field.choices?.[0]?.value ?? "x");

      expect(
        buildFieldCommand(type, field.key, value as boolean | number | string)
      ).not.toBeNull();
    }
  });

  it("offers a curtain its position rather than a power switch", () => {
    const keys = getCommandFields("curtain").map((f) => f.key);
    expect(keys).toContain("position");
    expect(keys).not.toContain("power");
  });

  it("offers a lock its bolt", () => {
    expect(getCommandFields("smart-lock").map((f) => f.key)).toContain("locked");
  });

  it("offers nothing for a read-only meter", () => {
    // Not an oversight: there is nothing on a meter to set, and a row that
    // cannot do anything is worse than an absent one.
    expect(getCommandFields("energy-monitor")).toEqual([]);
  });

  it("still offers a plug its switch", () => {
    // The guard must not be satisfiable by offering nothing anywhere.
    expect(getCommandFields("smart-plug").map((f) => f.key)).toContain("power");
    expect(getCommandFields("smart-light").length).toBeGreaterThan(0);
    expect(getCommandFields("smart-fan").length).toBeGreaterThan(0);
  });
});
