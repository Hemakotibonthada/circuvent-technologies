/**
 * The gate firmware, pinned against the four ways it was wrong.
 *
 * This device drives a motorised barrier across a driveway from a card reader
 * on the end of a long cable run. Every assertion below is a failure that
 * reached hardware, not a unit-test shape.
 */
import fs from "node:fs";
import path from "node:path";
import { projectCommand } from "@/lib/smarthome-command-map";

const root = path.join(__dirname, "..");
const sketch = fs.readFileSync(
  path.join(root, "firmware", "rfid-gate", "rfid-gate.ino"),
  "utf8",
);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}
const code = stripComments(sketch);

describe("both relays were energised from power-up", () => {
  it("claims the relay pins through the library, not bare pinMode", () => {
    /*
     * The relay boards are opto-isolated and negative-trigger: pulling the GPIO
     * low energises the coil. Bare pinMode(OUTPUT) leaves the latch low, so the
     * gate controller was handed a continuous OPEN *and* CLOSE from the instant
     * the device powered on — and every "pulse" released the relay for 600 ms
     * instead of closing it. cvRelayInit writes the safe level before the pin
     * becomes an output, which is the whole reason it exists.
     */
    expect(code).toMatch(/cvRelayInit\(OPEN_RELAY\)/);
    expect(code).toMatch(/cvRelayInit\(CLOSE_RELAY\)/);
    expect(code).not.toMatch(/pinMode\(OPEN_RELAY, OUTPUT\)/);
    expect(code).not.toMatch(/pinMode\(CLOSE_RELAY, OUTPUT\)/);
  });

  it("drives them through the polarity-aware helper", () => {
    expect(code).toMatch(/cvRelayWrite\(relay, true\)/);
    expect(code).toMatch(/cvRelayWrite\(pulsingRelay, false\)/);
    // No raw writes to a relay pin anywhere.
    expect(code).not.toMatch(/digitalWrite\((OPEN_RELAY|CLOSE_RELAY)/);
  });
});

describe("a noisy frame could open the barrier", () => {
  it("checks Wiegand-26 parity", () => {
    /*
     * The format carries two spare bits precisely because it runs tens of
     * metres past a gate motor. Nothing checked them, so a corrupted frame did
     * not fail — it silently became a *different card number*.
     */
    expect(code).toMatch(/bool wiegand26Valid\(uint32_t frame\)/);
    expect(code).toMatch(/evenOnes % 2 == 0/);
    expect(code).toMatch(/oddOnes % 2 == 1/);
  });

  it("uses the same bit ranges the platform proves correct", () => {
    // platform/api/src/gate/access.test.ts checks every single-bit corruption
    // of a known frame against exactly these ranges.
    expect(code).toMatch(/for \(int i = 25; i >= 13; i--\)/);
    expect(code).toMatch(/for \(int i = 12; i >= 0; i--\)/);
  });

  it("refuses a length it does not understand instead of masking it", () => {
    /*
     * The old code accepted anything from 24 to 37 bits and masked it down to
     * its low 24 — turning a partial read into a confident, wrong card number.
     */
    expect(code).not.toMatch(/bits >= 24 && bits <= 37/);
    expect(code).toMatch(/bits == 26/);
    expect(code).toMatch(/bits == 34/);
    expect(code).toMatch(/badFrames\+\+/);
  });

  it("publishes the reject count, so a bad cable is findable", () => {
    expect(code).toMatch(/cv\.set\("badFrames", badFrames\)/);
  });
});

describe("a parked car flooded the platform", () => {
  it("ignores the same tag while it is still in range", () => {
    /*
     * A UHF reader sees a windshield tag continuously — many reads a second for
     * as long as the car is there. Every one published state and wrote a
     * telemetry row.
     */
    expect(code).toMatch(/SAME_TAG_QUIET_MS/);
    expect(code).toMatch(/card == lastTag/);
  });

  it("does not re-arm the auto-close from a tag that is merely present", () => {
    /*
     * openGate() used to reset openedAt on an already-open gate, so a car
     * parked within the reader's field held the barrier open indefinitely. The
     * loop detector is the thing that should hold a gate open, because it is
     * the thing that knows a vehicle is underneath it.
     */
    const fn = code.slice(code.indexOf("void openGate()"), code.indexOf("void closeGate()"));
    expect(fn).toMatch(/if \(barrierOpen\) return;/);
  });

  it("publishes telemetry on a cadence", () => {
    // vehiclePresent and the limit switch both bounce; the library republishes
    // whenever state is dirty and 80 ms have passed.
    expect(code).toMatch(/lastPub/);
    expect(code).toMatch(/millis\(\) - lastPub >= 2000UL/);
  });
});

describe("the barrier's position was a belief", () => {
  it("reads the limit switch", () => {
    // It was wired, configured as an input, and never read.
    expect(code).toMatch(/bool limitSaysOpen\(\)/);
    expect(code).toMatch(/digitalRead\(OPEN_LIMIT\)/);
  });

  it("reports opening and jammed, not just open and closed", () => {
    /*
     * A barrier whose motor has jammed or lost power reported "open" with
     * total confidence, and the app, the automations and the guest-pass flow
     * all believed it.
     */
    expect(code).toMatch(/const char \*barrierState\(\)/);
    expect(code).toMatch(/return "opening"/);
    expect(code).toMatch(/return "jammed"/);
  });

  it("still refuses to close onto a vehicle", () => {
    // The one outcome worse than leaving a barrier open.
    const force = code.slice(code.indexOf("void forceClose()"));
    expect(force.slice(0, 200)).toMatch(/if \(vehiclePresent\(\)\) return;/);
  });
});

describe("the allow-list is replaced, not patched", () => {
  it("accepts a whole list", () => {
    /*
     * A device that missed a single removal — offline for a minute, or a
     * dropped message — would go on admitting a vehicle whose access was
     * revoked, and nothing would notice because the platform believes it sent
     * the removal.
     */
    expect(code).toMatch(/action == "setTags"/);
    expect(code).toMatch(/allow = String\(p\["tags"\]/);
  });

  it("is projected so a revocation visibly takes effect", () => {
    const patch = projectCommand("rfid-gate", { action: "setTags", tags: "100,200,300" });
    expect(patch?.tagCount).toBe(3);
    expect(projectCommand("rfid-gate", { action: "setTags", tags: "" })?.tagCount).toBe(0);
  });

  it("still projects the barrier optimistically", () => {
    // A barrier takes seconds to travel; a control that does nothing for that
    // long feels broken. The device corrects it, and "jammed" is what survives.
    expect(projectCommand("rfid-gate", { action: "open" })?.barrier).toBe("open");
    expect(projectCommand("rfid-gate", { action: "close" })?.barrier).toBe("closed");
  });
});

describe("the dead command that did nothing", () => {
  it("is gone", () => {
    // `autoMode = (action == "open") ? autoMode : autoMode;` assigned the
    // variable to itself either way.
    expect(code).not.toMatch(/\? autoMode : autoMode/);
  });
});
