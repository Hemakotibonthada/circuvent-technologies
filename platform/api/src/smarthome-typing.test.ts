import "./test-env";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { googleTypeFor, alexaCategoryFor } from "./routes/smarthome";

/**
 * What a voice assistant is allowed to sweep up.
 *
 * Both assistants group by device type. "Turn off the lights" reaches
 * everything typed as a light, and a goodnight routine reaches everything that
 * will listen. A water pump typed as a plain SWITCH — which is what this did,
 * and is the obvious mapping since electrically that is what it is — means
 * going to bed cuts the water supply, and an irrigation cycle stops halfway.
 *
 * The types below are the ones Google and Alexa keep out of those sweeps. This
 * is a physical-consequence decision rather than a cosmetic one, which is why
 * it is pinned here rather than left to whoever next edits the mapping.
 */
describe("voice device typing keeps pumps out of group commands", () => {
  test("a tank pump is not a switch to Google", () => {
    for (const t of ["aquaguard", "agri-starter"]) {
      const type = googleTypeFor(t);
      assert.equal(type, "action.devices.types.VALVE");
      assert.ok(!type.endsWith("SWITCH"), `${t} must not be a SWITCH`);
      assert.ok(!type.endsWith("LIGHT"), `${t} must not be a LIGHT`);
    }
  });

  test("a tank pump is not a switch to Alexa", () => {
    for (const t of ["aquaguard", "agri-starter"]) {
      const cat = alexaCategoryFor(t);
      assert.equal(cat, "WATER_HEATER");
      assert.notEqual(cat, "SWITCH");
      assert.notEqual(cat, "LIGHT");
    }
  });

  test("ordinary loads still read as what they are", () => {
    assert.equal(googleTypeFor("smart-plug"), "action.devices.types.OUTLET");
    assert.equal(googleTypeFor("smart-light"), "action.devices.types.LIGHT");
    assert.equal(googleTypeFor("smart-fan"), "action.devices.types.FAN");
    assert.equal(alexaCategoryFor("smart-plug"), "SMARTPLUG");
    assert.equal(alexaCategoryFor("smart-light"), "LIGHT");
  });

  /*
   * Anything unrecognised falls back to SWITCH, which is correct: a relay whose
   * load we do not know is a switch. The rule is that the *known* dangerous
   * ones must be lifted out of that default, not that the default is unsafe.
   */
  test("an unknown type is a plain switch", () => {
    assert.equal(googleTypeFor("something-new"), "action.devices.types.SWITCH");
    assert.equal(alexaCategoryFor("something-new"), "SWITCH");
  });
});
