/**
 * OTA rollout decisions.
 *
 * These two functions decide what happens to physical hardware: how many
 * devices a bad build reaches before anyone notices, and whether an operator
 * who thinks they have undone a release actually has.
 */

import { canarySize, classifyRollback } from "@/lib/ota-rollout";

describe("canarySize", () => {
  it("is a tenth of the fleet in the ordinary case", () => {
    expect(canarySize(30)).toBe(3);
    expect(canarySize(40)).toBe(4);
  });

  /*
   * The cap is the point of the feature. Without it, a canary on a fleet of
   * ten thousand is a thousand bricked devices — which is not a canary, it is
   * a bad release with extra steps.
   */
  it("never exceeds five, however large the fleet", () => {
    expect(canarySize(500)).toBe(5);
    expect(canarySize(10_000)).toBe(5);
  });

  it("always reaches at least one device when there is one to reach", () => {
    expect(canarySize(1)).toBe(1);
    expect(canarySize(4)).toBe(1); // 0.4 would round to 0
  });

  it("is zero when there is nothing to send to", () => {
    expect(canarySize(0)).toBe(0);
    expect(canarySize(-3)).toBe(0);
  });
});

describe("classifyRollback", () => {
  const catalogue = [
    { deviceType: "lock", version: "1.0.0", url: "https://cdn/lock-1.0.0.bin" },
    { deviceType: "lock", version: "1.1.0", url: "https://cdn/lock-1.1.0.bin" },
    { deviceType: "gate", version: "1.0.0", url: "https://cdn/gate-1.0.0.bin" },
  ];

  it("sends each device back to the build it came from", () => {
    const plan = classifyRollback(
      [{ id: "d1", name: "Front door", priorVersion: "1.0.0" }],
      "lock",
      catalogue
    );
    expect(plan.can).toEqual([
      { id: "d1", name: "Front door", to: "1.0.0", url: "https://cdn/lock-1.0.0.bin" },
    ]);
    expect(plan.cannot).toHaveLength(0);
  });

  /*
   * The case that made this worth extracting. An old build can be deleted from
   * the catalogue, leaving nothing to send. Dropping those devices silently
   * would leave an operator believing a bad release was undone while some
   * units still run it.
   */
  it("names devices whose previous build is gone from the catalogue", () => {
    const plan = classifyRollback(
      [{ id: "d1", name: "Side gate", priorVersion: "0.9.0" }],
      "lock",
      catalogue
    );
    expect(plan.can).toHaveLength(0);
    expect(plan.cannot[0].name).toBe("Side gate");
    expect(plan.cannot[0].why).toContain("0.9.0");
  });

  it("names devices that were not reporting a version at push time", () => {
    const plan = classifyRollback([{ id: "d1", name: "New unit" }], "lock", catalogue);
    expect(plan.can).toHaveLength(0);
    expect(plan.cannot[0].why).toMatch(/not reporting a version/);
  });

  /*
   * A build of the same version for a different device type is not a
   * substitute. Sending it is the brick-a-device case this whole page has to
   * avoid.
   */
  it("will not substitute a same-version build from another device type", () => {
    const plan = classifyRollback(
      [{ id: "d1", name: "Gate A", priorVersion: "1.1.0" }],
      "gate",
      catalogue
    );
    expect(plan.can).toHaveLength(0);
    expect(plan.cannot).toHaveLength(1);
  });

  it("treats a catalogue entry with no artefact url as unusable", () => {
    const plan = classifyRollback(
      [{ id: "d1", name: "Front door", priorVersion: "2.0.0" }],
      "lock",
      [...catalogue, { deviceType: "lock", version: "2.0.0" }]
    );
    expect(plan.can).toHaveLength(0);
    expect(plan.cannot).toHaveLength(1);
  });

  /*
   * A partial rollback is correct: refusing to recover the recoverable
   * devices because one is stuck would be worse than doing what can be done
   * and saying what cannot.
   */
  it("rolls back what it can and reports the rest", () => {
    const plan = classifyRollback(
      [
        { id: "d1", name: "A", priorVersion: "1.0.0" },
        { id: "d2", name: "B", priorVersion: "0.1.0" },
        { id: "d3", name: "C" },
      ],
      "lock",
      catalogue
    );
    expect(plan.can.map((c) => c.name)).toEqual(["A"]);
    expect(plan.cannot.map((c) => c.name).sort()).toEqual(["B", "C"]);
  });

  it("falls back to the id when a device has no name", () => {
    const plan = classifyRollback([{ id: "cv-77", name: "", priorVersion: "1.0.0" }], "lock", catalogue);
    expect(plan.can[0].name).toBe("cv-77");
  });
});
