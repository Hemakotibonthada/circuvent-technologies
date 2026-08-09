import { RECIPES, recipesFor, buildAutomation, type RecipeDevice } from "./smarthome-recipes";
import { projectCommand } from "./smarthome-command-map";

/*
 * This module was dead code -- 94 lines, six templates, imported by nothing.
 * Wiring it up as written would have shipped a bug: every command template
 * carried a raw `{ action: "set", power: true }`, and a home-hub does not read
 * `power`. It is addressed positionally, `{ ch, on }`. So "switch on every
 * morning" applied to the hub would have created a rule that ran on time,
 * every day, forever, and moved nothing.
 *
 * The property worth holding: a recipe may only produce a command the device's
 * firmware actually acts on. projectCommand is derived from the sketches, so a
 * command that changes no state is a command the device ignores.
 */

const hub: RecipeDevice = {
  id: "home-hub-1",
  type: "home-hub",
  name: "Switch Board",
  state: { power: false, power2: false, power3: false, power4: false },
};
const camera: RecipeDevice = {
  id: "cam-1",
  type: "camera",
  name: "Cctv1",
  state: { streaming: true, motion: false, fps: 8 },
};
const plug: RecipeDevice = { id: "plug-1", type: "smart-plug", name: "Lamp", state: { power: false, watts: 12 } };
const tank: RecipeDevice = { id: "tank-1", type: "aquaguard", name: "Tank", state: { level: 60, pump: false } };

describe("quick automations", () => {
  it("offers something for a plug", () => {
    expect(recipesFor(plug).length).toBeGreaterThan(0);
  });

  it("does not offer a tank alert for a device with no level reading", () => {
    expect(recipesFor(plug).map((r) => r.id)).not.toContain("low-tank-alert");
    expect(recipesFor(tank).map((r) => r.id)).toContain("low-tank-alert");
  });

  it("does not offer a power schedule for a camera, which has no power", () => {
    const ids = recipesFor(camera).map((r) => r.id);
    expect(ids).not.toContain("morning-on");
    expect(ids).not.toContain("midnight-off");
  });

  it("offers the camera the commands it does have", () => {
    const ids = recipesFor(camera).map((r) => r.id);
    expect(ids).toContain("night-camera-arm");
  });

  it("offers nothing at all when there is no device", () => {
    expect(recipesFor(null)).toEqual([]);
  });

  /*
   * The heart of it. Build every offered command recipe for every device and
   * check the firmware would act on the result.
   */
  it.each([
    ["home-hub", hub],
    ["camera", camera],
    ["smart-plug", plug],
    ["aquaguard", tank],
  ] as const)("builds commands %s actually acts on", (_label, device) => {
    const offered = recipesFor(device).filter((r) => r.action.kind === "command");
    for (const recipe of offered) {
      const built = buildAutomation(recipe, device);
      expect(built).not.toBeNull();

      const command = (built!.action as { command: Record<string, unknown> }).command;
      const patch = projectCommand(device.type, command);

      // An ignored command projects to an empty patch: nothing about the
      // device's reported state would change. That is the silent failure.
      expect(Object.keys(patch).length).toBeGreaterThan(0);
    }
  });

  it("addresses a hub channel positionally, not by its state key", () => {
    const morning = RECIPES.find((r) => r.id === "morning-on")!;
    const built = buildAutomation(morning, hub)!;
    const command = (built.action as { command: Record<string, unknown> }).command;

    // The bug this test exists for: { action: "set", power: true }.
    expect(command).toEqual({ action: "set", ch: 0, on: true });
    expect(command.power).toBeUndefined();
  });

  it("names the rule after the device, so a list of them can be told apart", () => {
    const built = buildAutomation(RECIPES.find((r) => r.id === "morning-on")!, hub)!;
    expect(built.name).toContain("Switch Board");
    expect(built.name.length).toBeLessThanOrEqual(120);
  });

  it("puts the trigger device on state triggers and leaves it off time triggers", () => {
    const timed = buildAutomation(RECIPES.find((r) => r.id === "morning-on")!, hub)!;
    expect(timed.trigger).toEqual({ type: "time", at: "07:00" });

    const stateful = buildAutomation(RECIPES.find((r) => r.id === "low-tank-alert")!, tank)!;
    expect(stateful.trigger).toMatchObject({ type: "state", deviceId: tank.id, field: "level", op: "<", value: 20 });
  });

  it("produces notify actions without a device id", () => {
    const built = buildAutomation(RECIPES.find((r) => r.id === "low-tank-alert")!, tank)!;
    expect(built.action).toEqual({
      type: "notify",
      title: "Tank running low",
      body: "Water level has dropped below 20%.",
    });
  });

  it("refuses rather than inventing a command it cannot express", () => {
    const odd: RecipeDevice = { id: "x", type: "home-hub", state: {} };
    const bogus = { ...RECIPES[1], action: { kind: "command", field: "nonsense", value: true } } as never;
    expect(buildAutomation(bogus, odd)).toBeNull();
  });
});
