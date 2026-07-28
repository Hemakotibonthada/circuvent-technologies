import {
  HUB_CHANNEL_FIELDS,
  HUB_SCENE_EFFECTS,
  TOUCHBOARD_GANG_FIELDS,
  masterPower,
  patchSatisfied,
  projectCommand,
  projectedFields,
  sameValue,
} from "@/lib/smarthome-command-map";

// These assertions mirror firmware/<type>/<type>.ino. If a sketch changes its
// published field names, these tests are the first thing that should fail.

describe("projectCommand — home-hub", () => {
  it("maps channel index to the published relay field", () => {
    expect(projectCommand("home-hub", { ch: 0, on: true })).toEqual({ power: true });
    expect(projectCommand("home-hub", { ch: 1, on: true })).toEqual({ power2: true });
    expect(projectCommand("home-hub", { ch: 2, on: false })).toEqual({ power3: false });
    expect(projectCommand("home-hub", { ch: 3, on: true })).toEqual({ power4: true });
  });

  it("ignores out-of-range channels", () => {
    expect(projectCommand("home-hub", { ch: 9, on: true })).toEqual({});
    expect(projectCommand("home-hub", { ch: -1, on: true })).toEqual({});
  });

  it("treats a bare power command as relay 0", () => {
    expect(projectCommand("home-hub", { power: true })).toEqual({ power: true });
  });

  it("expands a relays array across all four channels", () => {
    expect(projectCommand("home-hub", { relays: [true, false, true, false] })).toEqual({
      power: true,
      power2: false,
      power3: true,
      power4: false,
    });
  });

  it("projects the deterministic relay outcome of each scene", () => {
    expect(projectCommand("home-hub", { scene: "away" })).toEqual({
      scene: "away",
      ...HUB_SCENE_EFFECTS.away,
    });
    expect(projectCommand("home-hub", { scene: "movie" })).toEqual({
      scene: "movie",
      power: false,
      power3: true,
    });
  });

  it("does not predict state the firmware never echoes", () => {
    expect(projectCommand("home-hub", { restore: true })).toEqual({});
    expect(projectCommand("home-hub", { rule: { ch: 0, onAt: "18:00" } })).toEqual({});
  });
});

describe("projectCommand — touchboard", () => {
  it("maps individual gangs", () => {
    expect(projectCommand("touchboard", { g2: true })).toEqual({ g2: true });
  });

  it("expands `all` across every gang", () => {
    expect(projectCommand("touchboard", { all: false })).toEqual({ g1: false, g2: false, g3: false });
    expect(TOUCHBOARD_GANG_FIELDS).toEqual(["g1", "g2", "g3"]);
  });

  it("passes backlight through", () => {
    expect(projectCommand("touchboard", { backlight: 40 })).toEqual({ backlight: 40 });
  });
});

describe("projectCommand — actions that rename the field", () => {
  it("maps gate actions to the barrier field", () => {
    expect(projectCommand("rfid-gate", { action: "open" })).toEqual({ barrier: "open" });
    expect(projectCommand("rfid-gate", { action: "close" })).toEqual({ barrier: "closed" });
  });

  it("maps lock actions to the locked field", () => {
    expect(projectCommand("facedoor", { action: "unlock", method: "app" })).toEqual({ locked: false });
    expect(projectCommand("smart-lock", { action: "lock" })).toEqual({ locked: true });
  });

  it("maps curtain actions to a position", () => {
    expect(projectCommand("curtain", { action: "open" })).toEqual({ position: 100 });
    expect(projectCommand("curtain", { action: "close" })).toEqual({ position: 0 });
  });
});

describe("projectCommand — coupled fields", () => {
  it("clears auto mode when the pump is driven manually", () => {
    expect(projectCommand("watertank", { pump: true })).toEqual({ pump: true, auto: false });
    expect(projectCommand("aquaguard", { pump: true })).toEqual({ pump: true, auto: false });
  });

  it("couples fan speed and power", () => {
    expect(projectCommand("smart-fan", { speed: 0 })).toEqual({ speed: 0, power: false });
    expect(projectCommand("smart-fan", { speed: 2 })).toEqual({ speed: 2, power: true });
  });

  it("resets the dry-run trip", () => {
    expect(projectCommand("watertank", { action: "resetDryRun" })).toEqual({ dryRun: false });
  });
});

describe("projectCommand — generic devices", () => {
  it("passes power straight through for simple relays", () => {
    expect(projectCommand("smart-plug", { power: true })).toEqual({ power: true });
    expect(projectCommand("smart-switch", { power2: false })).toEqual({ power2: false });
  });

  it("returns an empty patch for unknown keys", () => {
    expect(projectCommand("smart-plug", { somethingElse: 1 })).toEqual({});
  });
});

describe("projectedFields / patchSatisfied / sameValue", () => {
  it("lists the fields a command will move", () => {
    expect(projectedFields("home-hub", { ch: 1, on: true })).toEqual(["power2"]);
    expect(projectedFields("touchboard", { all: true }).sort()).toEqual(["g1", "g2", "g3"]);
  });

  it("reports satisfaction only once every projected field matches", () => {
    const patch = projectCommand("touchboard", { all: true });
    expect(patchSatisfied(patch, { g1: true, g2: true, g3: true })).toBe(true);
    expect(patchSatisfied(patch, { g1: true, g2: true, g3: false })).toBe(false);
  });

  it("compares loosely enough for firmware numeric/boolean echoes", () => {
    expect(sameValue(true, true)).toBe(true);
    expect(sameValue(1, 1)).toBe(true);
    expect(sameValue("open", "open")).toBe(true);
    expect(sameValue(true, false)).toBe(false);
  });

  it("exposes the hub channel field order used by the firmware", () => {
    expect(HUB_CHANNEL_FIELDS).toEqual(["power", "power2", "power3", "power4"]);
  });
});

describe("masterPower — bulk/quick power must match firmware command shapes", () => {
  const dev = (type: string, state: Record<string, unknown> = {}) => ({ type, state });

  it("switches all four relays on a home-hub, not just relay 1", () => {
    const mp = masterPower(dev("home-hub", { power: false, power2: false }));
    expect(mp).not.toBeNull();
    expect(mp!.cmd(true)).toEqual({ relays: [true, true, true, true] });
    expect(mp!.cmd(false)).toEqual({ relays: [false, false, false, false] });
  });

  it("uses {all} for a touchboard, which ignores a bare {power}", () => {
    const mp = masterPower(dev("touchboard", { g1: true }));
    expect(mp!.cmd(false)).toEqual({ all: false });
    // A bare {power} would project nothing at all for this type.
    expect(projectCommand("touchboard", { power: true })).toEqual({});
  });

  it("drives both gangs of a smart-switch", () => {
    expect(masterPower(dev("smart-switch"))!.cmd(true)).toEqual({ power: true, power2: true });
  });

  it("reports on when ANY output is on", () => {
    expect(masterPower(dev("home-hub", { power: false, power3: true }))!.on).toBe(true);
    expect(masterPower(dev("home-hub", { power: false }))!.on).toBe(false);
    expect(masterPower(dev("touchboard", { g2: true }))!.on).toBe(true);
    expect(masterPower(dev("smart-switch", { power2: true }))!.on).toBe(true);
  });

  it("every emitted command projects real state (no dead commands)", () => {
    for (const type of ["smart-plug", "smart-switch", "home-hub", "touchboard", "smart-light", "smart-fan"]) {
      const mp = masterPower(dev(type));
      expect(mp).not.toBeNull();
      for (const v of [true, false]) {
        expect(Object.keys(projectCommand(type, mp!.cmd(v))).length).toBeGreaterThan(0);
      }
    }
  });

  it("refuses a one-tap toggle for unsafe or read-only devices", () => {
    for (const type of ["smart-lock", "facedoor", "rfid-gate", "guardian", "aquaguard", "watertank", "agri-starter", "curtain", "motion-sensor"]) {
      expect(masterPower(dev(type))).toBeNull();
    }
  });

  it("tolerates a device with no state object", () => {
    expect(masterPower({ type: "smart-plug" })!.on).toBe(false);
  });
});
