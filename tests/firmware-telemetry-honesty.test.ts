/**
 * Three devices, and the failures that were invisible from the app.
 *
 * None of these announced itself. A camera streamed pictures perfectly while
 * writing a database row twelve times a second; a switchboard reported a tidy
 * 230 V from a sensor that had failed; a motion sensor showed "disarmed" and
 * went on triggering every automation keyed to it. In each case the device
 * looked healthy, which is what made them expensive to find.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..");
const read = (name: string) =>
  fs.readFileSync(path.join(root, "firmware", name, `${name}.ino`), "utf8");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("camera: a streaming device is not a telemetry firehose", () => {
  const code = stripComments(read("camera"));

  it("does not publish the frame counter on every pass", () => {
    /*
     * `frames` increments once per delivered frame. Published from the bottom
     * of loop(), a 15fps stream dirtied the state fifteen times a second, and
     * the library republishes whenever state is dirty and _minGap (80 ms) has
     * elapsed — about twelve messages a second, over a million a day, each an
     * INSERT. The pictures arrived and the device was healthy throughout.
     */
    expect(code).toMatch(/lastCounters/);
    expect(code).toMatch(/now - lastCounters >= 10000UL/);
  });

  it("keeps the counters together behind that gate", () => {
    const at = code.indexOf("lastCounters = now;");
    expect(at).toBeGreaterThan(-1);
    const block = code.slice(at, at + 220);
    expect(block).toMatch(/cv\.set\("frames", frameCount\)/);
    expect(block).toMatch(/cv\.set\("dropped", dropCount\)/);
    expect(block).toMatch(/cv\.set\("lanViewers", lanViewers\)/);
  });

  it("still publishes movement the moment it happens", () => {
    // The gate is for diagnostics. Motion is the thing people act on.
    expect(code).toMatch(/cv\.set\("motionActive", false\);\s*\n\s*cv\.publishStateNow\(\);/);
  });
});

describe("touchboard-8: it no longer invents a mains voltage", () => {
  const code = stripComments(read("touchboard-8"));

  it("has dropped the fabricated 230 V", () => {
    /*
     * `if (volts < 1) volts = 230.0;` was described as "nominal until the
     * first V sample". That was true for a few seconds and false forever
     * after: a board whose voltage sense had failed reported exactly 230.0 for
     * the rest of its life.
     */
    expect(code).not.toMatch(/volts = 230\.0/);
  });

  it("says whether the voltage was measured", () => {
    expect(code).toMatch(/bool voltsMeasured/);
    expect(code).toMatch(/voltsMeasured = \(volts > 1\.0\)/);
    expect(code).toMatch(/cv\.set\("voltsMeasured", voltsMeasured\)/);
  });

  it("publishes a voltage only when there is one", () => {
    expect(code).toMatch(/if \(voltsMeasured\) cv\.set\("volts", \(float\)volts\)/);
  });

  it("does not compute a power factor from a number it does not have", () => {
    // pf = watts / (volts x amps), so a fabricated voltage silently corrupts
    // the one figure that says whether the reading can be trusted.
    expect(code).toMatch(/const double vForPf = voltsMeasured \? volts : 0\.0/);
  });

  it("clears the power factor rather than leaving it stale", () => {
    // A 0.98 held from an hour ago is indistinguishable from a healthy board.
    const fn = code.slice(code.indexOf("void readMeter()"), code.indexOf("void loop()"));
    expect(fn).toMatch(/\} else \{\s*\n?\s*pf = 0;/);
  });

  it("publishes metering on a cadence", () => {
    // Five floats derived from pulse counts, all changing every meter window:
    // a state message and a database row every second of the board's life.
    expect(code).toMatch(/lastMeterPub/);
    expect(code).toMatch(/millis\(\) - lastMeterPub >= 15000UL/);
  });

  it("still publishes a pad press immediately", () => {
    // Somebody standing at a wall waiting for a light is not telemetry.
    const fn = code.slice(code.indexOf("void pressGang("), code.indexOf("void applyAll("));
    expect(fn).toMatch(/cv\.publishStateNow\(\)/);
  });
});

describe("motion-sensor: disarming now disarms", () => {
  const code = stripComments(read("motion-sensor"));

  it("gates the reported state on armed, not just the LED", () => {
    /*
     * `armed` used to suppress the indicator and the instant push and nothing
     * else — cv.set("motion", ...) ran regardless, so the next heartbeat
     * published movement anyway and every automation fired a few seconds
     * late. A disarm that does not disarm is worse than none, because it is
     * trusted.
     */
    expect(code).toMatch(/nowMotion =\s*\n?\s*armed && ready\(\)/);
  });

  it("clears a latched movement when it is disarmed", () => {
    // Otherwise a `true` sits in the retained state for an automation to find.
    const fn = code.slice(code.indexOf("void onCommand("), code.indexOf("void setup()"));
    expect(fn).toMatch(/if \(!armed\) \{[\s\S]{0,120}motion = false;/);
  });

  it("remembers whether it was armed", () => {
    // It was a RAM default, so a deliberate disarm was forgotten at the next
    // power blip and the sensor started alerting again.
    expect(code).toMatch(/store\.getBool\("armed", true\)/);
    expect(code).toMatch(/store\.putBool\("armed", armed\)/);
  });

  it("waits for the PIR to settle before believing it", () => {
    /*
     * A PIR emits spurious HIGH for up to a minute while its reference
     * settles. Without this, every power cut in the device's life was reported
     * as movement — at whatever hour the supply came back, into a house where
     * that may arm a siren.
     */
    expect(code).toMatch(/WARMUP_MS 60000UL/);
    expect(code).toMatch(/bool ready\(\)/);
    expect(code).toMatch(/cv\.set\("warmingUp", !warmedUp\)/);
  });

  it("holds movement instead of reporting every edge", () => {
    // A PIR chatters as its pulse ends; each transition was a publish and a row.
    expect(code).toMatch(/MOTION_HOLD_MS/);
    expect(code).toMatch(/now - lastTrigger < MOTION_HOLD_MS/);
  });

  it("publishes a clear as promptly as a trigger", () => {
    // An automation waiting for movement to stop needs the falling edge too.
    expect(code).toMatch(/if \(nowMotion != motion\)/);
  });

  it("no longer claims a light output it does not have", () => {
    /*
     * There is no light output on this board, only the indicator LED. Checked
     * against the description line rather than the whole file, because the
     * header deliberately explains that the old claim was wrong — a test that
     * cannot tell a claim from a correction would forbid documenting it.
     */
    const firstLines = read("motion-sensor").split("\n").slice(0, 8).join("\n");
    expect(firstLines).not.toMatch(/automate a light output/);
  });
});
