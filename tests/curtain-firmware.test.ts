/**
 * The curtain firmware, pinned against what it used to do to the motor.
 *
 * Two of these are the same class of fault the gate had, and they are here for
 * the same reason: a relay board wired the way ours are turns "stopped" into
 * "both directions energised", and nothing about that is visible from the app.
 */
import fs from "node:fs";
import path from "node:path";
import { projectCommand } from "@/lib/smarthome-command-map";

const root = path.join(__dirname, "..");
const sketch = fs.readFileSync(
  path.join(root, "firmware", "curtain", "curtain.ino"),
  "utf8",
);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}
const code = stripComments(sketch);

describe("both motor relays were energised whenever the curtain was stopped", () => {
  it("claims the motor pins through the library", () => {
    /*
     * The boards are negative-trigger: LOW energises the coil. Bare
     * pinMode(OUTPUT) leaves the latch low, so driveMotor(0) — the *stopped*
     * state — wrote LOW to both pins and held both relays closed, from the
     * moment the device powered on, before anything had been commanded.
     */
    expect(code).toMatch(/cvRelayInit\(MOTOR_OPEN_PIN\)/);
    expect(code).toMatch(/cvRelayInit\(MOTOR_CLOSE_PIN\)/);
    expect(code).not.toMatch(/pinMode\(MOTOR_(OPEN|CLOSE)_PIN, OUTPUT\)/);
  });

  it("drives them through the polarity-aware helper only", () => {
    expect(code).toMatch(/cvRelayWrite\(MOTOR_OPEN_PIN, dir > 0\)/);
    expect(code).toMatch(/cvRelayWrite\(MOTOR_CLOSE_PIN, dir < 0\)/);
    expect(code).not.toMatch(/digitalWrite\(MOTOR_(OPEN|CLOSE)_PIN/);
  });

  it("never energises both directions at once", () => {
    // The two writes are complementary on `dir`, so no value of dir can set
    // both. That is the property, not the spelling.
    const fn = code.slice(code.indexOf("void applyMotor("), code.indexOf("void driveMotor("));
    expect(fn).toMatch(/dir > 0/);
    expect(fn).toMatch(/dir < 0/);
  });

  it("waits before reversing", () => {
    /*
     * Switching straight from one direction to the other asks the contacts to
     * break an inductive load and make the opposite one in the same instant,
     * while the motor is still turning and still generating.
     */
    expect(code).toMatch(/REVERSE_DEAD_MS/);
    expect(code).toMatch(/pendingDir/);
  });
});

describe("the stop button shared the reset pin", () => {
  it("uses a tap, not a level test", () => {
    // BTN_STOP is GPIO0, which setResetButton(0) also watches. The old test
    // fired every 300 ms while held — about ten stops, each writing NVS —
    // during a Wi-Fi reset gesture.
    expect(code).toMatch(/CvTapButton stopBtn/);
    expect(code).toMatch(/stopBtn\.tapped\(\)/);
    expect(code).not.toMatch(/digitalRead\(BTN_STOP\)/);
  });

  it("edge-detects the open and close buttons too", () => {
    expect(code).toMatch(/btnOpenWas/);
    expect(code).toMatch(/btnCloseWas/);
  });
});

describe("a timed position has to be re-homed", () => {
  it("runs the full travel for a full open or close", () => {
    /*
     * The estimate drifts — the motor is not identical run to run, the fabric
     * binds, the mains sags. Driving the whole travel means the curtain ends
     * against the mechanical stop, which is the only reference this hardware
     * has, so every full open or close corrects the estimate.
     */
    expect(code).toMatch(/homingTo/);
    const fn = code.slice(code.indexOf("void moveTo("), code.indexOf("void publishState()"));
    expect(fn).toMatch(/target == 0 \|\| target == 100/);
    expect(fn).toMatch(/homingTo = true/);
  });

  it("sets the position exactly at the end of a homing run", () => {
    expect(code).toMatch(/position = homingTo \? homingTarget :/);
  });

  it("caps how long the motor may ever run", () => {
    // Protects a jammed curtain from being driven for however long the
    // estimate happened to ask for.
    expect(code).toMatch(/MAX_TRAVEL_MS/);
    expect(code).toMatch(/moveLimitMs = min\(\(uint32_t\)MAX_TRAVEL_MS/);
  });

  it("stops a learn run that nobody ended", () => {
    expect(code).toMatch(/millis\(\) - learnStart > MAX_TRAVEL_MS/);
  });
});

describe("travel time is a setting, not a constant", () => {
  it("is persisted and bounded", () => {
    // Every curtain is a different width; a 20-second default on a 1.5 m track
    // put every reported position out by half.
    expect(code).not.toMatch(/#define TRAVEL_TIME_MS/);
    expect(code).toMatch(/store\.getUInt\("travel"/);
    expect(code).toMatch(/store\.putUInt\("travel", travelMs\)/);
    expect(code).toMatch(/constrain\(p\["travelSec"\]\.as<int>\(\), 2, 90\)/);
  });

  it("can be measured rather than guessed", () => {
    expect(code).toMatch(/action == "learn"/);
    expect(code).toMatch(/action == "learnDone"/);
  });

  it("refuses a measurement that cannot be real", () => {
    expect(code).toMatch(/measured >= 2000 && measured <= MAX_TRAVEL_MS/);
  });
});

describe("state is published on a cadence", () => {
  it("does not emit on every pass while moving", () => {
    // position changes every loop while the motor runs, and the library
    // republishes whenever state is dirty and 80 ms have elapsed — roughly 250
    // messages, and 250 database rows, per movement.
    expect(code).toMatch(/lastPub/);
    expect(code).toMatch(/moving != 0 \? 1000UL : 5000UL/);
  });
});

describe("the command map matches", () => {
  it("projects the two positions the device is certain to reach", () => {
    expect(projectCommand("curtain", { action: "open" })?.position).toBe(100);
    expect(projectCommand("curtain", { action: "close" })?.position).toBe(0);
  });

  it("projects nothing for a stop", () => {
    /*
     * Where it ends up is whatever the timed estimate says at the instant the
     * motor cut, which is exactly the number the console cannot compute.
     * Guessing would fight the device's own answer a second later, and the
     * visible result is a slider that jumps.
     */
    const patch = projectCommand("curtain", { action: "stop" });
    expect(patch?.position).toBeUndefined();
  });

  it("projects a travel time change", () => {
    expect(projectCommand("curtain", { travelSec: 35 })?.travelSec).toBe(35);
    expect(projectCommand("curtain", { travelSec: 999 })?.travelSec).toBe(90);
  });

  it("never predicts `moving`", () => {
    // Transient, and driven by the motor loop.
    for (const cmd of [{ action: "open" }, { action: "close" }, { position: 40 }]) {
      expect(projectCommand("curtain", cmd)?.moving).toBeUndefined();
    }
  });
});
