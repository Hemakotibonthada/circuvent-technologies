import "./test-env";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normaliseCommand } from "./device-commands";

/**
 * A scene has to repair its stored commands the same way a schedule does.
 *
 * device-commands.ts was written because rules and schedules in the database
 * carry state-shaped payloads — `{ "power2": true }` with no action — that
 * CircuventDevice::_dispatch() discards before any handler runs. It was wired
 * into automations.ts and not into the scene route, so the identical broken
 * payload was repaired when a timer fired it and published raw when a scene
 * did. The same automation worked or did nothing depending on what triggered
 * it, which is close to impossible to diagnose from the outside.
 *
 * These assert the repair itself for the shapes a scene stores. The route now
 * calls it; scenes-activate-repair keeps the reasoning next to the evidence.
 */
describe("scene actions are repaired before publishing", () => {
  test("a Home Hub channel key becomes a positional set", () => {
    // The sketch reads { ch, on }. power2 is an output of writeRelay(), never
    // an input, so a scene storing it switched nothing.
    const repaired = normaliseCommand("home-hub", { power2: true });
    assert.equal(repaired?.action, "set");
    assert.equal(repaired?.ch, 1);
    assert.equal(repaired?.on, true);
  });

  test("a plain state key gains the action the firmware requires", () => {
    const repaired = normaliseCommand("smart-plug", { power: true });
    assert.equal(repaired?.action, "set");
    assert.equal(repaired?.power, true);
  });

  test("a command that already names an action is left alone", () => {
    // The scene editor can author actions this module knows nothing about;
    // rewriting those to fix the broken ones would break working scenes.
    const authored = { action: "set", level: 48, speed: 1 };
    assert.deepEqual(normaliseCommand("smart-fan", authored), authored);
  });

  test("an empty or malformed action yields nothing to publish", () => {
    // The route skips these rather than sending a payload the device drops and
    // then counting it as sent — a scene must not report doing what it did not.
    assert.equal(normaliseCommand("smart-plug", {}), null);
    assert.equal(normaliseCommand("smart-plug", null), null);
    assert.equal(normaliseCommand("smart-plug", undefined), null);
  });
});
