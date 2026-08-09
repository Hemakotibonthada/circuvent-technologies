import "./test-env";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normaliseCommand, needsRepair } from "./device-commands";

/**
 * Repairing the commands that never reached a relay.
 *
 * Switch timers saved, displayed a correct next-run time, counted down, and
 * did nothing. The scheduler fired, MQTT delivered, and the device threw the
 * payload away on its first line because it carried no action:
 *
 *     String action = doc["action"] | "";
 *     if (!action.length()) return;          // CircuventDevice::_dispatch
 *
 * Every schedule anyone has ever created is stored in that shape. These tests
 * pin the repair that makes those rows work on their next run, and — just as
 * importantly — pin what it must NOT touch, because the rule editor can author
 * actions this module knows nothing about and rewriting those would break
 * working automations in order to fix broken ones.
 */

describe("commands stored by the switch timers", () => {
  test("a Home Hub channel becomes a positional set", () => {
    // The exact payload SwitchSchedulesPanel used to write. The sketch reads
    // { ch, on } and has no idea what power2 means — it is what writeRelay()
    // publishes back, not something onCommand() accepts.
    assert.deepEqual(normaliseCommand("home-hub", { power2: true }), { action: "set", ch: 1, on: true });
    assert.deepEqual(normaliseCommand("home-hub", { power: false }), { action: "set", ch: 0, on: false });
    assert.deepEqual(normaliseCommand("home-hub", { power4: true }), { action: "set", ch: 3, on: true });
  });

  test("a Home Hub channel is repaired even when an action was already present", () => {
    // The admin panel sent { action:"set", power3:true }. Actioned, so it got
    // past _dispatch, and then ignored by onCommand — the harder half to spot,
    // because the message genuinely arrives.
    assert.deepEqual(normaliseCommand("home-hub", { action: "set", power3: true }), {
      action: "set",
      ch: 2,
      on: true,
    });
  });

  test("other devices only needed the action adding", () => {
    // For these sketches the field name really is the command key. Rewriting
    // the key too would break them, so the repair has to be narrow.
    assert.deepEqual(normaliseCommand("touchboard", { g2: true }), { action: "set", g2: true });
    assert.deepEqual(normaliseCommand("smart-switch", { power2: true }), { action: "set", power2: true });
    assert.deepEqual(normaliseCommand("smart-plug", { power: false }), { action: "set", power: false });
    assert.deepEqual(normaliseCommand("sentinel", { r7: true }), { action: "set", r7: true });
    assert.deepEqual(normaliseCommand("aquaguard", { pump: true }), { action: "set", pump: true });
  });

  test("a lock becomes a verb", () => {
    assert.deepEqual(normaliseCommand("smart-lock", { locked: true }), { action: "lock" });
    assert.deepEqual(normaliseCommand("facedoor", { locked: false }), { action: "unlock" });
  });

  test("a gate barrier becomes a verb", () => {
    assert.deepEqual(normaliseCommand("rfid-gate", { barrier: "open" }), { action: "open" });
    assert.deepEqual(normaliseCommand("rfid-gate", { barrier: "close" }), { action: "close" });
  });
});

describe("what the repair must leave alone", () => {
  test("a hand-written action passes through untouched", () => {
    // The rule editor can target actions this module has never heard of.
    const custom = { action: "clearAlarm" };
    assert.deepEqual(normaliseCommand("sentinel", custom), custom);
    const say = { action: "say", text: "Welcome home" };
    assert.deepEqual(normaliseCommand("home-hub", say), say);
  });

  test("a Home Hub scene is not mistaken for a channel", () => {
    const scene = { action: "set", scene: "away" };
    assert.deepEqual(normaliseCommand("home-hub", scene), scene);
  });

  test("a bulk relay payload keeps its shape", () => {
    assert.deepEqual(normaliseCommand("home-hub", { action: "set", relays: [true, false, true, false] }), {
      action: "set",
      relays: [true, false, true, false],
    });
  });

  test("an unknown device type still gets an action", () => {
    // Better to send a plausible set than to send something guaranteed to be
    // dropped. A device that does not understand the key ignores that key;
    // one that gets no action ignores the whole message.
    assert.deepEqual(normaliseCommand("some-future-device", { brightness: 40 }), {
      action: "set",
      brightness: 40,
    });
  });

  test("nothing to repair returns null", () => {
    assert.equal(normaliseCommand("home-hub", null), null);
    assert.equal(normaliseCommand("home-hub", undefined), null);
    assert.equal(normaliseCommand("home-hub", {}), null);
  });
});

describe("the repair is safe to run on every publish", () => {
  test("it is idempotent", () => {
    // It runs on the way out of every automation, and a rule can fire twice a
    // day for years. A second pass must be a no-op.
    for (const [type, cmd] of [
      ["home-hub", { power2: true }],
      ["touchboard", { g1: false }],
      ["smart-lock", { locked: true }],
      ["rfid-gate", { barrier: "open" }],
      ["sentinel", { r3: true }],
    ] as const) {
      const once = normaliseCommand(type, cmd)!;
      const twice = normaliseCommand(type, once)!;
      assert.deepEqual(twice, once, `${type} was not idempotent`);
    }
  });

  test("every repaired command carries a usable action", () => {
    // The single property that decides whether a device sees the message at
    // all. Asserted across the shapes actually found in the database.
    const cases: [string, Record<string, unknown>][] = [
      ["home-hub", { power2: true }],
      ["home-hub", { power: false }],
      ["touchboard", { g3: true }],
      ["smart-switch", { power2: false }],
      ["smart-plug", { power: true }],
      ["sentinel", { r1: true }],
      ["aquaguard", { pump: false }],
      ["smart-lock", { locked: true }],
      ["rfid-gate", { barrier: "open" }],
      ["watertank", { auto: true }],
    ];
    for (const [type, cmd] of cases) {
      const fixed = normaliseCommand(type, cmd)!;
      assert.equal(typeof fixed.action, "string", `${type} ${JSON.stringify(cmd)} lost its action`);
      assert.ok((fixed.action as string).length > 0, `${type} ${JSON.stringify(cmd)} has an empty action`);
    }
  });

  test("needsRepair reports only real changes", () => {
    // Drives a log line, so a false positive would make every healthy rule
    // claim it was repaired and bury the ones that were.
    assert.equal(needsRepair("home-hub", { power2: true }), true);
    assert.equal(needsRepair("touchboard", { g1: true }), true);
    assert.equal(needsRepair("touchboard", { action: "set", g1: true }), false);
    assert.equal(needsRepair("sentinel", { action: "clearAlarm" }), false);
    assert.equal(needsRepair("home-hub", { action: "set", ch: 1, on: true }), false);
  });
});
