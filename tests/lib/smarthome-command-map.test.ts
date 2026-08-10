import {
  HUB_CHANNEL_FIELDS,
  HUB_SCENE_EFFECTS,
  TOUCHBOARD_GANG_FIELDS,
  buildFieldCommand,
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

// The Sentinel's relay count differs by board (the camera build gives two
// relays up to the sensor bus), so bulk commands must be driven by the
// `relays` count the firmware publishes rather than a constant.
describe("projectCommand — sentinel", () => {
  const four = { relays: 4 };
  const two = { relays: 2 };

  it("maps individual relays", () => {
    expect(projectCommand("sentinel", { r3: true }, four)).toEqual({ r3: true });
  });

  it("expands `all` across exactly the relays the board reports", () => {
    expect(projectCommand("sentinel", { all: true }, four)).toEqual({
      r1: true, r2: true, r3: true, r4: true,
    });
    expect(projectCommand("sentinel", { all: true }, two)).toEqual({ r1: true, r2: true });
  });

  it("projects nothing for `all` when the relay count is unknown", () => {
    // Better a late switch than a pin that waits forever for a relay that
    // does not exist on this board.
    expect(projectCommand("sentinel", { all: true })).toEqual({});
  });

  it("switches everything off when away mode is armed", () => {
    expect(projectCommand("sentinel", { away: true }, two)).toEqual({
      away: true, r1: false, r2: false,
    });
    expect(projectCommand("sentinel", { away: false }, two)).toEqual({ away: false });
  });

  it("clamps the safety-cut mask to the relays that exist", () => {
    expect(projectCommand("sentinel", { safetyCutMask: 0b1111 }, two)).toEqual({ safetyCutMask: 0b11 });
  });

  it("rejects an out-of-range exhaust relay rather than storing it", () => {
    expect(projectCommand("sentinel", { exhaustRelay: 1 }, four)).toEqual({ exhaustRelay: 1 });
    expect(projectCommand("sentinel", { exhaustRelay: 7 }, four)).toEqual({ exhaustRelay: -1 });
  });

  it("clears the alarm optimistically but never predicts a calibration", () => {
    expect(projectCommand("sentinel", { action: "clearAlarm" }, four)).toEqual({ gasAlarm: false });
    // A new baseline and a test timestamp are values only the device knows.
    expect(projectCommand("sentinel", { action: "calibrateGas" }, four)).toEqual({});
    expect(projectCommand("sentinel", { action: "test" }, four)).toEqual({});
    expect(projectCommand("sentinel", { action: "recalibrateTouch" }, four)).toEqual({});
  });

  it("offers a master power only once the board has reported its relays", () => {
    expect(masterPower({ type: "sentinel", state: {} })).toBeNull();
    const mp = masterPower({ type: "sentinel", state: { relays: 2, r1: true, r2: false } });
    expect(mp?.on).toBe(true);
    expect(mp?.cmd(false)).toEqual({ all: false });
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

/*
 * ANPR camera.
 *
 * These pin the two failure modes Docs/07-adding-a-new-device.md calls silent:
 * a command the firmware discards (the rule saves, fires and does nothing), and
 * an optimistic patch the firmware never echoes (the field pins forever waiting
 * for a confirmation that cannot arrive).
 *
 * Assertions mirror firmware/anpr-cam/anpr-cam.ino onCommand().
 */
describe("anpr-cam", () => {
  const dev = (type: string, state: Record<string, unknown> = {}) => ({ type, state });

  it("projects the settings the sketch actually reads", () => {
    expect(projectCommand("anpr-cam", { action: "set", armed: false })).toEqual({ armed: false });
    expect(projectCommand("anpr-cam", { action: "set", burst: 5 })).toEqual({ burst: 5 });
    expect(projectCommand("anpr-cam", { action: "set", sensitivity: 70 })).toEqual({ sensitivity: 70 });
    expect(projectCommand("anpr-cam", { action: "set", cooldownMs: 8000 })).toEqual({ cooldownMs: 8000 });
  });

  it("clamps to the ranges the firmware enforces", () => {
    expect(projectCommand("anpr-cam", { action: "set", burst: 99 })).toEqual({ burst: 8 });
    expect(projectCommand("anpr-cam", { action: "set", quality: 1 })).toEqual({ quality: 4 });
    expect(projectCommand("anpr-cam", { action: "set", sensitivity: 0 })).toEqual({ sensitivity: 1 });
    expect(projectCommand("anpr-cam", { action: "set", rotation: 90 })).toEqual({ rotation: 0 });
  });

  it("maps the stream lease to the streaming state key", () => {
    // The command key and the state key differ ({action:"stream", on} ->
    // state.streaming), which is exactly what a default echo gets wrong.
    expect(projectCommand("anpr-cam", { action: "stream", on: true })).toEqual({ streaming: true });
    expect(projectCommand("anpr-cam", { action: "stream", on: false })).toEqual({ streaming: false });
  });

  it("projects nothing for actions whose result the device cannot predict", () => {
    // A capture's outcome is a plate read on the server minutes later. Pinning
    // a field here would wait for a confirmation with a different value.
    expect(projectCommand("anpr-cam", { action: "capture" })).toEqual({});
    expect(projectCommand("anpr-cam", { action: "open" })).toEqual({});
    expect(projectCommand("anpr-cam", { action: "reboot" })).toEqual({});
    expect(projectCommand("anpr-cam", { action: "result", plate: "KA01AB1234" })).toEqual({});
  });

  it("flattens the ROI object into the four published keys", () => {
    expect(projectCommand("anpr-cam", { action: "set", roi: { x: 10, y: 20, w: 60, h: 50 } })).toEqual({
      roiX: 10, roiY: 20, roiW: 60, roiH: 50,
    });
  });

  it("clamps ROI width against the NEW origin when one is sent", () => {
    expect(projectCommand("anpr-cam", { action: "set", roi: { x: 60, w: 90 } })).toEqual({
      roiX: 60, roiW: 40,
    });
  });

  it("clamps ROI width against the STORED origin when none is sent", () => {
    // The firmware clamps against its own roiX. Assuming 0 here would pin roiW
    // at a value the device never reports.
    expect(projectCommand("anpr-cam", { action: "set", roi: { w: 90 } }, { roiX: 30 })).toEqual({
      roiW: 70,
    });
  });

  it("does not offer a one-tap master toggle", () => {
    // `armed` is a mode, not a load. A dashboard power button that silently
    // stops the gate camera watching is not a power button.
    expect(masterPower(dev("anpr-cam", { armed: true }))).toBeNull();
  });

  it("builds commands the sketch reads, and refuses fields it does not", () => {
    expect(buildFieldCommand("anpr-cam", "armed", true)).toEqual({ action: "set", armed: true });
    expect(buildFieldCommand("anpr-cam", "burst", 4)).toEqual({ action: "set", burst: 4 });
    expect(buildFieldCommand("anpr-cam", "streaming", true)).toEqual({ action: "stream", on: true });
    expect(buildFieldCommand("anpr-cam", "rotation", "180")).toEqual({ action: "set", rotation: 180 });
    // The ANPR sketch reads neither of these; inheriting the camera case would
    // have produced commands that are accepted, acknowledged and discarded.
    expect(buildFieldCommand("anpr-cam", "motion", true)).toBeNull();
    expect(buildFieldCommand("anpr-cam", "flash", 50)).toBeNull();
  });
});

describe("anpr-cam direction", () => {
  it("projects the three lane settings the firmware accepts", () => {
    expect(projectCommand("anpr-cam", { action: "set", direction: "in" })).toEqual({ direction: "in" });
    expect(projectCommand("anpr-cam", { action: "set", direction: "OUT" })).toEqual({ direction: "out" });
    expect(projectCommand("anpr-cam", { action: "set", direction: "both" })).toEqual({ direction: "both" });
  });

  it("refuses a lane the firmware would validate away", () => {
    // The sketch ignores anything outside in/out/both. Echoing it would pin the
    // field on a value the device never publishes, so the control hangs.
    expect(projectCommand("anpr-cam", { action: "set", direction: "sideways" })).toEqual({});
    expect(buildFieldCommand("anpr-cam", "direction", "sideways")).toBeNull();
  });

  it("builds the command the sketch reads", () => {
    expect(buildFieldCommand("anpr-cam", "direction", "in")).toEqual({ action: "set", direction: "in" });
  });
});
