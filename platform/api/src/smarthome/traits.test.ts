import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  alexaCategoryFor,
  brightness,
  fanSpeed,
  googleState,
  googleSyncEntry,
  googleTraits,
  googleTypeFor,
  isExposed,
  levelToSpeed,
  onOff,
  type DeviceLike,
} from "./traits";

/**
 * What a voice assistant can reach, and what it does when it gets there.
 *
 * Two failures this guards against, both of which have real consequences in a
 * house rather than in a test report:
 *
 *   A device that should not be reachable by voice becoming reachable. Anything
 *   absent from `onOff` does not exist to Google or Alexa, and that is the
 *   security boundary — "unlock the front door" must not work through a window.
 *
 *   A device reachable under the wrong category. Assistants sweep by category,
 *   so a pump typed as a SWITCH joins "turn everything off" and every goodnight
 *   routine: going to bed cuts the water supply.
 */

const device = (type: string, state: Record<string, unknown> = {}): DeviceLike => ({
  id: `${type}-1`,
  name: `A ${type}`,
  type,
  room: "Hall",
  online: true,
  state,
});

/** Everything with firmware in this repo. */
const ALL_TYPES = [
  "smart-plug", "smart-switch", "smart-light", "smart-fan", "home-hub", "touchboard",
  "sentinel", "guardian", "motion-sensor", "curtain", "watertank", "watertank-sensor",
  "aquaguard", "agri-starter", "meter", "energy-monitor", "camera", "anpr-cam",
  "smart-lock", "rfid-gate", "facedoor", "drone-fc", "drone-link", "drone-x1",
];

describe("what voice can reach", () => {
  test("locks, gates, cameras and aircraft are not exposed at all", () => {
    /*
     * The list is spelled out rather than derived, so adding one of these to
     * `onOff` fails here and has to be argued for rather than slipped in.
     */
    for (const t of ["smart-lock", "rfid-gate", "facedoor", "camera", "anpr-cam", "drone-fc", "drone-link", "drone-x1"]) {
      assert.equal(isExposed(t), false, `${t} must not be reachable by voice`);
      assert.equal(onOff(t), null);
    }
  });

  test("the everyday loads are exposed", () => {
    for (const t of ["smart-plug", "smart-switch", "smart-light", "smart-fan", "home-hub", "sentinel", "aquaguard", "agri-starter"]) {
      assert.ok(isExposed(t), `${t} should be controllable by voice`);
    }
  });

  test("an unknown type is not exposed", () => {
    // Fails closed: a device type added later is invisible to voice until
    // somebody decides what it should be, rather than defaulting to a switch.
    assert.equal(isExposed("something-new"), false);
  });
});

describe("categories, which decide what a sweep reaches", () => {
  test("a pump is never a plain switch", () => {
    // "Turn everything off" and every goodnight routine reach switches. A pump
    // caught by that stops an irrigation cycle halfway.
    for (const t of ["aquaguard", "agri-starter"]) {
      assert.equal(googleTypeFor(t), "action.devices.types.VALVE");
      assert.notEqual(alexaCategoryFor(t), "SWITCH");
    }
  });

  test("lights, plugs and fans get their own categories", () => {
    assert.equal(googleTypeFor("smart-light"), "action.devices.types.LIGHT");
    assert.equal(googleTypeFor("smart-plug"), "action.devices.types.OUTLET");
    assert.equal(googleTypeFor("smart-fan"), "action.devices.types.FAN");
    assert.equal(alexaCategoryFor("smart-light"), "LIGHT");
    assert.equal(alexaCategoryFor("smart-plug"), "SMARTPLUG");
    assert.equal(alexaCategoryFor("smart-fan"), "FAN");
  });

  test("every exposed type has both mappings", () => {
    // A type Google knows and Alexa does not is a device that works on one
    // assistant and is a generic switch on the other.
    for (const t of ALL_TYPES.filter(isExposed)) {
      assert.ok(googleTypeFor(t).startsWith("action.devices.types."));
      assert.ok(alexaCategoryFor(t).length > 0);
    }
  });
});

describe("traits are only claimed where the firmware has them", () => {
  test("brightness is a light and nothing else", () => {
    // Advertising a trait a board ignores is worse than not having it: the
    // assistant says "OK, 40 per cent" and the lamp does not move, which reads
    // as broken hardware rather than a lying integration.
    assert.ok(brightness("smart-light"));
    for (const t of ["smart-plug", "smart-switch", "smart-fan", "home-hub", "aquaguard"]) {
      assert.equal(brightness(t), null, `${t} has no dimmer`);
    }
  });

  test("fan speed is a fan and nothing else", () => {
    assert.ok(fanSpeed("smart-fan"));
    for (const t of ["smart-light", "smart-plug", "aquaguard"]) {
      assert.equal(fanSpeed(t), null);
    }
  });

  test("traits list matches what is actually implemented", () => {
    assert.deepEqual(googleTraits("smart-plug"), ["action.devices.traits.OnOff"]);
    assert.deepEqual(googleTraits("smart-light"), [
      "action.devices.traits.OnOff",
      "action.devices.traits.Brightness",
    ]);
    assert.deepEqual(googleTraits("smart-fan"), [
      "action.devices.traits.OnOff",
      "action.devices.traits.FanSpeed",
    ]);
  });
});

describe("fan speed, where voice and the app must agree", () => {
  test("a command carries both level and speed", () => {
    /*
     * Fans already in people's homes run firmware that reads only `speed` and
     * ignores everything else. A command carrying just `level` would have the
     * assistant report success while the fan did not move — the exact failure
     * the site's fan-speed test was written for.
     */
    const cmd = fanSpeed("smart-fan")!.cmd(50);
    assert.equal(cmd.action, "set");
    assert.ok("level" in cmd, "must carry level");
    assert.ok("speed" in cmd, "must carry speed for un-updated firmware");
  });

  test("the derived speed means the same airflow as the level", () => {
    assert.equal(levelToSpeed(0), 0);
    assert.equal(levelToSpeed(33), 1);
    assert.equal(levelToSpeed(66), 2);
    assert.equal(levelToSpeed(100), 3);
  });

  test("zero per cent is off, not the slowest speed", () => {
    const cmd = fanSpeed("smart-fan")!.cmd(0);
    assert.equal(cmd.level, 0);
    assert.equal(cmd.speed, 0);
  });

  test("a fan predating `level` still reports a truthful percentage", () => {
    // Reading only `level` would report a running old fan as 0% — off — and
    // the assistant would say the fan was off while it was turning.
    const f = fanSpeed("smart-fan")!;
    assert.equal(f.toPercent({ speed: 2 }), 66);
    assert.equal(f.toPercent({ speed: 0 }), 0);
    // `level` wins where both are present: it is the more precise statement.
    assert.equal(f.toPercent({ level: 48, speed: 1 }), 48);
  });

  test("percentages are clamped rather than passed through", () => {
    const f = fanSpeed("smart-fan")!;
    assert.equal(f.cmd(150).level, 100);
    assert.equal(f.cmd(-20).level, 0);
  });
});

describe("the state an assistant is told", () => {
  test("a plug reports on/off and nothing it does not have", () => {
    const s = googleState(device("smart-plug", { power: true }));
    assert.equal(s.on, true);
    assert.equal(s.online, true);
    assert.equal(s.status, "SUCCESS");
    assert.ok(!("brightness" in s));
    assert.ok(!("currentFanSpeedPercent" in s));
  });

  test("a light reports its brightness", () => {
    const s = googleState(device("smart-light", { power: true, brightness: 40 }));
    assert.equal(s.on, true);
    assert.equal(s.brightness, 40);
  });

  test("a device voice cannot see reports an error rather than a state", () => {
    const s = googleState(device("smart-lock", { locked: true }));
    assert.equal(s.status, "ERROR");
    assert.equal(s.online, false);
    assert.ok(!("on" in s), "a lock's state must not leak through the voice path");
  });

  test("an offline device is reported offline, not off", () => {
    // "Is the heater on?" answered "no" about an unreachable device is a
    // different statement from "I can't reach it", and only one is true.
    const d = { ...device("smart-plug", { power: true }), online: false };
    const s = googleState(d);
    assert.equal(s.online, false);
    assert.equal(s.on, true, "the last known value is still reported");
  });
});

describe("the SYNC entry", () => {
  test("willReportState is only claimed when the server can push", () => {
    // Claiming it while nothing reports leaves Google waiting for updates that
    // never arrive and showing the device as unresponsive — a fault rather
    // than a limitation, from the customer's point of view.
    assert.equal(googleSyncEntry(device("smart-plug"), false).willReportState, false);
    assert.equal(googleSyncEntry(device("smart-plug"), true).willReportState, true);
  });

  test("a fan advertises named speeds and percentage support", () => {
    const e = googleSyncEntry(device("smart-fan"), false) as Record<string, any>;
    assert.ok(e.attributes?.supportsFanSpeedPercent);
    assert.equal(e.attributes.availableFanSpeeds.speeds.length, 3);
    const synonyms = e.attributes.availableFanSpeeds.speeds.flatMap((s: any) => s.speed_values[0].speed_synonym);
    for (const word of ["low", "medium", "high"]) {
      assert.ok(synonyms.includes(word), `"set the fan to ${word}" should work`);
    }
  });

  test("a plug advertises no attributes it cannot honour", () => {
    const e = googleSyncEntry(device("smart-plug"), false) as Record<string, unknown>;
    assert.ok(!("attributes" in e));
  });

  test("the room is passed through as a hint", () => {
    // Without it every device lands in Google's default room and "turn off the
    // hall light" cannot resolve.
    const e = googleSyncEntry(device("smart-light"), false) as Record<string, unknown>;
    assert.equal(e.roomHint, "Hall");
  });
});
