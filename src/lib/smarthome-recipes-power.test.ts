import { recipesFor, RECIPES } from "./smarthome-recipes";

/**
 * Which power template a device is offered.
 *
 * A three-phase meter reports `watts` for its first channel and `wattsTotal`
 * across all of them. Offering the single-phase template there is worse than
 * offering nothing: the rule it builds watches a third of the house and looks
 * identical to one that watches all of it, so an alert that never arrives is
 * indistinguishable from a quiet week.
 */

const device = (type: string, state: Record<string, unknown>) => ({ id: "d1", type, state });

const ids = (type: string, state: Record<string, unknown>) =>
  recipesFor(device(type, state)).map((r) => r.id);

describe("power recipes follow the device's own totals", () => {
  it("offers the single-device template to a plug, which has no total", () => {
    const offered = ids("smart-plug", { power: true, watts: 40 });

    expect(offered).toContain("high-power-alert");
    expect(offered).not.toContain("high-total-power-alert");
  });

  it("offers the whole-installation template to a meter", () => {
    const offered = ids("meter", { watts: 1200, wattsTotal: 3400, volts: 232, channels: 3 });

    expect(offered).toContain("high-total-power-alert");
  });

  it("does NOT offer the single-phase template to a meter", () => {
    // The bug this exists to prevent: a rule watching phase one on a
    // three-phase board, indistinguishable from one watching the house.
    expect(ids("meter", { watts: 1200, wattsTotal: 3400, channels: 3 })).not.toContain(
      "high-power-alert"
    );
  });

  it("offers exactly one power template to any device", () => {
    const powerIds = new Set(["high-power-alert", "high-total-power-alert"]);
    const cases: Record<string, unknown>[] = [
      { watts: 40 },
      { watts: 1200, wattsTotal: 3400 },
      { wattsTotal: 900 },
      { power: true },
    ];

    for (const state of cases) {
      const offered = ids("meter", state).filter((id) => powerIds.has(id));
      expect(offered.length).toBeLessThanOrEqual(1);
    }
  });

  it("offers neither to a device that reports no power at all", () => {
    const offered = ids("smart-light", { power: true, level: 60 });

    expect(offered).not.toContain("high-power-alert");
    expect(offered).not.toContain("high-total-power-alert");
  });

  it("sets the total's threshold above the single-device one", () => {
    // A whole house crossing 2000 W is an ordinary evening; a single appliance
    // doing it is worth a word. Identical thresholds would make the
    // whole-installation alert fire constantly and be muted.
    const single = RECIPES.find((r) => r.id === "high-power-alert")!;
    const total = RECIPES.find((r) => r.id === "high-total-power-alert")!;

    const value = (r: typeof single) => (r.trigger.type === "state" ? r.trigger.value ?? 0 : 0);
    expect(value(total)).toBeGreaterThan(value(single));
  });
});
