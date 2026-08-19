/**
 * The metering firmware must honour the commands the console actually sends.
 *
 * THE BUG THIS EXISTS FOR
 *
 * `smarthome-command-map.ts` translates a console or automation field into the
 * MQTT payload a device receives. For every meter it builds
 * `{ action: "calibrate", watts | volts | amps }`. The energy-monitor sketch's
 * handler read only `ctCal` — a raw internal multiplier that nothing in the
 * product ever sends. So calibration from the app was accepted, acknowledged,
 * and did nothing at all. There is no error path for this: the command is
 * well-formed, the device is online, the request succeeds, and the reading is
 * exactly as wrong afterwards as it was before.
 *
 * That is not a firmware bug or a console bug — it is the seam between them,
 * which is why neither side's tests caught it. These assertions read both
 * sides and check they still agree.
 *
 * The rest of the file pins the measurement fixes that shipped alongside, all
 * of which shared a property: the device stayed online and confident while
 * reporting a number that was not true.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..");
const fw = (name: string) =>
  fs.readFileSync(path.join(root, "firmware", name, `${name}.ino`), "utf8");

const meter = fw("meter");
const energy = fw("energy-monitor");
const commandMap = fs.readFileSync(
  path.join(root, "src", "lib", "smarthome-command-map.ts"),
  "utf8",
);

/** The payload keys the command map emits for `action: "calibrate"`. */
function calibrateKeys(): string[] {
  const keys = new Set<string>();
  for (const m of commandMap.matchAll(/field === "calibrate([A-Z]\w*)"/g)) {
    keys.add(m[1].toLowerCase());
  }
  return [...keys].sort();
}

describe("metering firmware honours the console's command contract", () => {
  it("the command map still emits the calibrate keys we think it does", () => {
    // If this fails the contract moved; the two assertions below are only
    // meaningful because this one pins what they are checking against.
    expect(calibrateKeys()).toEqual(["amps", "volts", "watts"]);
  });

  for (const [name, src] of [
    ["meter", meter],
    ["energy-monitor", energy],
  ] as const) {
    it(`${name} reads every calibrate key the console can send`, () => {
      for (const key of calibrateKeys()) {
        expect(src).toContain(`p["${key}"]`);
      }
    });

    it(`${name} handles the calibrate and reset actions`, () => {
      expect(src).toMatch(/action == "calibrate"/);
      expect(src).toMatch(/action == "reset"/);
    });

    it(`${name} samples on a cadence instead of publishing every loop`, () => {
      /*
       * CircuventDevice republishes whenever state is dirty and _minGap (80 ms)
       * has passed. Both sketches derive their readings from pulse periods,
       * which change on every single loop under load — so without a gate they
       * emit about twelve state messages a second, forever, and every one is a
       * database write. Nothing looks broken; the bill and the table just grow.
       */
      expect(src).toMatch(/SAMPLE_MS/);
      expect(src).toMatch(/(now|millis\(\))\s*-\s*last\w*\s*<\s*SAMPLE_MS/);
    });
  }
});

describe("meter: the SEL line cannot be silently inverted", () => {
  /*
   * BL0937 and HLW8012 drive SEL in opposite senses. Get it backwards and the
   * meter reports the mains voltage where the current should be — a number
   * that is plausible, stable, and completely wrong.
   */
  it("defines SEL_LEVEL_FOR_CURRENT exactly once", () => {
    const defs = meter.match(/^#define\s+SEL_LEVEL_FOR_CURRENT\b/gm) ?? [];
    expect(defs).toHaveLength(1);
  });

  it("refuses to build for an unrecognised part rather than defaulting", () => {
    // The old #if/#else gave any unknown METER_PART the HLW8012 polarity.
    expect(meter).toMatch(/#error\s+"CV_METER_PART/);
  });
});

describe("meter: a reading is never carried across a change in meaning", () => {
  it("clears the CF1 capture whenever SEL is switched", () => {
    /*
     * The settle window is shorter than the staleness timeout, so a period
     * captured before the switch was still live afterwards and was read as the
     * newly selected quantity. In current mode an unloaded channel produces no
     * CF1 edges at all, so it reported the voltage pulse rate as roughly 0.9 A
     * of current on a channel with nothing plugged into it.
     */
    expect(meter).toMatch(/static void resetCf1Capture\(\)/);
    const at = meter.indexOf("digitalWrite(PIN_SEL, selCurrent");
    expect(at).toBeGreaterThan(-1);
    expect(meter.slice(at, at + 400)).toContain("resetCf1Capture()");
  });

  it("zeroes volts outside the branch that only runs when pulses arrive", () => {
    // `volts = v` sits after the loop, not inside `if (hz > 0)`.
    expect(meter).toMatch(/\n\s*volts = v;/);
  });
});

describe("energy-monitor: the assumed supply is a setting, not a constant", () => {
  it("persists the mains voltage and power factor it assumes", () => {
    /*
     * A CT clamp measures current only; watts is current x assumed volts x
     * assumed PF. Those two assumptions were compile-time constants, so a
     * 110 V installation read every load as roughly twice its real power and
     * the only fix was a recompile.
     */
    expect(energy).toMatch(/float mainsVolts/);
    expect(energy).toMatch(/float powerFactor/);
    expect(energy).not.toMatch(/const float MAINS_VOLTAGE/);
    expect(energy).toContain('store.putFloat("volts", mainsVolts)');
    expect(energy).toContain('store.getFloat("volts", mainsVolts)');
  });

  it("publishes the assumptions so the reading can be judged", () => {
    expect(energy).toContain('cv.set("volts", mainsVolts)');
    expect(energy).toContain('cv.set("pf", powerFactor)');
  });
});
