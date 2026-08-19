/**
 * The Sentinel's gas interlock.
 *
 * This is the device's whole reason to exist: "detection without action is just
 * a noise-maker", as its own header says. The action it takes — cutting the
 * appliances and starting the extractor — is also the thing that has to be
 * undone, and nothing undid it.
 *
 * The failure was quiet in the way that matters. The alarm cleared itself the
 * moment the air improved, so the panel looked perfectly healthy; meanwhile a
 * fan ran indefinitely and a boiler stayed off for a reason that was no longer
 * displayed anywhere. Whoever eventually found the boiler off would switch it
 * back on, never knowing there had been a leak.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..");
const sketch = fs.readFileSync(
  path.join(root, "firmware", "sentinel", "sentinel.ino"),
  "utf8",
);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}
const code = stripComments(sketch);

describe("the interlock can be stood down", () => {
  it("has a counterpart to engageSafety", () => {
    // There was none. engageSafety() was called on the alarm edge and nothing
    // anywhere in the file reversed it.
    expect(code).toMatch(/void engageSafety\(\)/);
    expect(code).toMatch(/void releaseSafety\(\)/);
  });

  it("stops the exhaust when the alarm is cleared", () => {
    /*
     * The concrete symptom: after any gas event the extractor ran until a
     * person noticed and switched it off by hand.
     */
    const fn = code.slice(code.indexOf("void releaseSafety()"));
    expect(fn.slice(0, 400)).toMatch(/setRelay\(exhaustRelay, false/);
    expect(code).toMatch(/if \(safetyEngaged\) releaseSafety\(\);/);
  });

  it("does not switch gas appliances back on by itself", () => {
    /*
     * Deliberate. Re-lighting a gas appliance seconds after a leak is not a
     * decision a wall panel should take on somebody's behalf — it reports
     * which ones it cut and leaves the choice to a person.
     */
    const fn = code.slice(
      code.indexOf("void releaseSafety()"),
      code.indexOf("void sampleGas()"),
    );
    expect(fn).not.toMatch(/setRelay\(i, true/);
    expect(code).toMatch(/cv\.set\("safetyCut"/);
  });

  it("records which appliances were actually cut, not merely which could be", () => {
    // safetyCutMask is configuration; safetyCut is what really happened, and
    // it is the one the apps need to name them.
    expect(code).toMatch(/if \(relayOn\[i\]\) safetyCut \|= \(1ul << i\)/);
  });

  it("publishes that the interlock is holding", () => {
    expect(code).toMatch(/cv\.set\("safetyEngaged", true\)/);
    expect(code).toMatch(/cv\.set\("safetyEngaged", false\)/);
  });
});

describe("the alarm latches, as the header always claimed", () => {
  it("separates the live reading from the raised alarm", () => {
    /*
     * They were one flag, so the alarm cancelled itself when the air improved
     * — taking the explanation for the altered relays with it.
     */
    expect(code).toMatch(/bool gasPresent = false;/);
    expect(code).toMatch(/cv\.set\("gasPresent", gasPresent\)/);
  });

  it("does not clear the alarm on its own", () => {
    // The clean-air branch stops the siren and leaves the alarm standing.
    const block = code.slice(code.indexOf("if (!gasAlarm) {"), code.indexOf("gasAccum += gasRaw"));
    expect(block).toMatch(/gasRaw < clearAt && !moduleTrip/);
    expect(block).not.toMatch(/gasAlarm = false/);
  });

  it("silences the siren once the air is clear", () => {
    // Latched is not the same as screaming for hours.
    const block = code.slice(code.indexOf("if (!gasAlarm) {"), code.indexOf("gasAccum += gasRaw"));
    expect(block).toMatch(/buzzerOff\(\)/);
  });

  it("refuses to clear while gas is still present", () => {
    /*
     * Clearing mid-leak switches the extractor off and the alarm re-raises
     * seconds later. Somebody jabbing at the button because the siren is loud
     * wants Mute, which exists.
     */
    const fn = code.slice(code.indexOf('action == "clearAlarm"'));
    expect(fn.slice(0, 500)).toMatch(/if \(gasPresent\)/);
    expect(fn.slice(0, 500)).toMatch(/clearRefused/);
  });
});

describe("the raw reading is not published twice a second", () => {
  it("gates live state behind a cadence", () => {
    /*
     * gasRaw is an averaged ADC value that moves on every sample however clean
     * the air is, and sampling runs at 2Hz — so state was dirty continuously,
     * about 172,000 messages a day per panel, each an INSERT, for a figure the
     * app already charts from telemetry.
     */
    expect(code).toMatch(/GAS_PUBLISH_MS/);
    expect(code).toMatch(/watching \|\| now - lastGasPub >= GAS_PUBLISH_MS/);
  });

  it("still publishes promptly while something is happening", () => {
    // The one time somebody is watching the number change.
    expect(code).toMatch(/const bool watching = gasAlarm \|\| gasPresent;/);
  });

  it("keeps both figures in telemetry", () => {
    // The history the app charts is unaffected by the live-state gate.
    expect(code).toMatch(/t\["gasRaw"\] = gasRaw;/);
    expect(code).toMatch(/t\["gasPct"\] = gasPercent\(\);/);
  });
});

describe("what was already right stays right", () => {
  it("still distinguishes a faulted sensor from clean air", () => {
    // Two units in the field once latched a permanent false alarm because an
    // unplugged detector floats low on an input-only pin.
    expect(code).toMatch(/gasBaseline > 0 && gasRaw <= GAS_FAULT_RAW/);
    expect(code).toMatch(/&& !gasFault/);
  });

  it("still requires a sustained reading, not a spike", () => {
    expect(code).toMatch(/now - gasAboveSince >= GAS_ALARM_MIN_MS/);
  });

  it("still refuses to track the baseline during an alarm or a fault", () => {
    expect(code).toMatch(/gasReady && !gasAlarm && !gasFault && gasRaw < clearAt/);
  });

  it("still publishes no ppm figure", () => {
    /*
     * An MQ-2 cannot produce a calibrated concentration without a per-gas
     * curve, a known load resistance and temperature compensation. "420 ppm"
     * would be a fabricated number that looks authoritative.
     */
    expect(code).not.toMatch(/"ppm"/);
  });
});
