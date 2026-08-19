import fs from "node:fs";
import path from "node:path";

/**
 * The drone flight controller's safety logic.
 *
 * THE BUG THIS EXISTS FOR
 *
 * The failsafe had no ending. Losing the radio put the aircraft into a level
 * descent — the correct and hard part — and nothing ever stopped it. `sw()`
 * returns the last decoded SBUS channel values, and those persist after the
 * link drops, so the arm switch still read "on", `armLatch` never cleared, and
 * the state machine had no other exit. The aircraft descended, touched down,
 * and sat there with four props at 35% throttle until the pack went flat or it
 * flipped hard enough to trip the tilt cutoff.
 *
 * It looks like a working failsafe right up to the moment it lands.
 *
 * The state machines below are transcribed from firmware/drone-fc/. They
 * cannot be imported — that is C++ for an ESP32 — so the source assertions at
 * the bottom check that the firmware still contains what is modelled here.
 */

const root = path.join(__dirname, "..");
const read = (f: string) => fs.readFileSync(path.join(root, "firmware", "drone-fc", f), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const safetySrc = read("flight-safety.h");
const sketchSrc = stripComments(read("drone-fc.ino"));
const filtersSrc = read("filters.h");

// Constants, read out of the firmware so the model cannot drift from it.
const num = (src: string, name: string): number => {
  const m = src.match(new RegExp(`#define\\s+${name}\\s+([0-9.]+)f?`));
  if (!m) throw new Error(`${name} not found`);
  return Number(m[1]);
};
const FAILSAFE_HOLD_MS = num(safetySrc, "FAILSAFE_HOLD_MS");
const FAILSAFE_DESCENT_MS = num(safetySrc, "FAILSAFE_DESCENT_MS");
const IMPACT_G = num(safetySrc, "IMPACT_G");
const INVERTED_DEG = num(safetySrc, "INVERTED_DEG");

// --------------------------------------------------------------- failsafe ---
type Phase = "none" | "hold" | "descend" | "done";

class Failsafe {
  phase: Phase = "none";
  private phaseMs = 0;
  private quietMs = 0;
  private settled = false;

  update(linkUp: boolean, accelMag: number, gyroMag: number, dtMs: number): Phase {
    if (linkUp) {
      if (this.phase === "hold" || this.phase === "none") {
        this.phase = "none";
        this.phaseMs = 0;
        this.quietMs = 0;
        this.settled = false;
      }
      if (this.phase === "none") return "none";
    }

    if (this.phase === "none") {
      this.phase = "hold";
      this.phaseMs = 0;
    } else if (this.phase === "hold") {
      this.phaseMs += dtMs;
      if (this.phaseMs >= FAILSAFE_HOLD_MS) {
        this.phase = "descend";
        this.phaseMs = 0;
      }
    } else if (this.phase === "descend") {
      this.phaseMs += dtMs;
      const quiet = accelMag > 0.85 && accelMag < 1.15 && gyroMag < 18;
      if (quiet) {
        this.quietMs += dtMs;
        if (this.quietMs >= 900) this.settled = true;
      } else {
        this.quietMs = 0;
      }
      if (this.phaseMs >= FAILSAFE_DESCENT_MS || this.settled) this.phase = "done";
    }
    return this.phase;
  }
}

/** Runs a failsafe for a wall-clock duration and reports when it finished. */
function runFailsafe(opts: { linkUp: (ms: number) => boolean; accel: number; gyro: number; forMs: number }) {
  const fs_ = new Failsafe();
  for (let t = 0; t < opts.forMs; t += 1) {
    const p = fs_.update(opts.linkUp(t), opts.accel, opts.gyro, 1);
    if (p === "done") return { done: true, atMs: t };
  }
  return { done: false, atMs: -1 };
}

describe("the failsafe ends", () => {
  it("stops the motors even when nothing ever looks like a landing", () => {
    /*
     * The case that was broken. An aircraft descending into trees is never
     * still, so the touchdown heuristic never fires — and before this fix
     * there was nothing else to stop it.
     */
    const r = runFailsafe({
      linkUp: () => false,
      accel: 1.6,   // never settles
      gyro: 90,     // never quiet
      forMs: 40_000,
    });
    expect(r.done).toBe(true);
    expect(r.atMs).toBeLessThanOrEqual(FAILSAFE_HOLD_MS + FAILSAFE_DESCENT_MS + 2);
  });

  it("bounds the whole event to the hold plus the descent budget", () => {
    const r = runFailsafe({ linkUp: () => false, accel: 1.6, gyro: 90, forMs: 40_000 });
    expect(r.atMs).toBeGreaterThanOrEqual(FAILSAFE_HOLD_MS);
  });

  it("ends sooner when the aircraft is clearly down", () => {
    // Still airframe: about 1 g, not rotating.
    const quiet = runFailsafe({ linkUp: () => false, accel: 1.0, gyro: 3, forMs: 40_000 });
    const noisy = runFailsafe({ linkUp: () => false, accel: 1.6, gyro: 90, forMs: 40_000 });
    expect(quiet.done).toBe(true);
    expect(quiet.atMs).toBeLessThan(noisy.atMs);
  });

  it("treats touchdown as an optimisation, never as the guarantee", () => {
    // A detector that never fires must still stop the aircraft — proven above.
    // This pins the ordering: the timer alone is sufficient.
    expect(safetySrc).toMatch(/_phaseMs >= FAILSAFE_DESCENT_MS \|\| _touchdown\.landed\(\)/);
  });
});

describe("a brief dropout is not a landing", () => {
  it("recovers when the link returns during the hold", () => {
    const fs_ = new Failsafe();
    for (let t = 0; t < 300; t++) fs_.update(false, 1.0, 40, 1);
    expect(fs_.phase).toBe("hold");
    fs_.update(true, 1.0, 40, 1);
    expect(fs_.phase).toBe("none");
  });

  it("does not hand a descending aircraft back on a link that already failed", () => {
    /*
     * Once committed, the descent finishes. A link that dropped out at range
     * is not one to give control back to at 3 m with the aircraft already
     * coming down — the pilot can take off again.
     */
    const fs_ = new Failsafe();
    for (let t = 0; t < FAILSAFE_HOLD_MS + 500; t++) fs_.update(false, 1.6, 90, 1);
    expect(fs_.phase).toBe("descend");
    fs_.update(true, 1.6, 90, 1);
    expect(fs_.phase).toBe("descend");
  });
});

describe("the stale arm switch", () => {
  it("is only trusted to disarm while the link is up", () => {
    /*
     * The root cause. sw() reads _ch[], which holds the last decoded frame, so
     * after link loss the switch reports whatever it was when the radio went
     * away. Acting on it either re-arms a landed aircraft or, as here, was the
     * reason the failsafe could never exit.
     */
    expect(sketchSrc).toMatch(/if\s*\(!d\.armSwitch\s*&&\s*d\.present\)/);
  });

  it("makes a failsafe landing and a crash need acknowledging before re-arming", () => {
    expect(sketchSrc).toMatch(/armCleared\s*=\s*true/);
    expect(sketchSrc).toMatch(/if\s*\(!d\.armSwitch\)\s*\{\s*armCleared\s*=\s*false/);
  });
});

// ------------------------------------------------------------------ crash ---
class CrashDetector {
  crashed = false;
  private invertedMs = 0;
  update(tiltDeg: number, accelMag: number, dtMs: number) {
    if (accelMag >= IMPACT_G) { this.crashed = true; return; }
    if (tiltDeg >= INVERTED_DEG) {
      this.invertedMs += dtMs;
      if (this.invertedMs >= 400) this.crashed = true;
    } else {
      this.invertedMs = 0;
    }
  }
}

describe("crash detection", () => {
  it("fires on an impact", () => {
    const c = new CrashDetector();
    c.update(5, IMPACT_G + 0.5, 1);
    expect(c.crashed).toBe(true);
  });

  it("does not fire on an aggressive manoeuvre", () => {
    // A 3 g pull is flying, not crashing.
    const c = new CrashDetector();
    for (let i = 0; i < 2000; i++) c.update(40, 3.0, 1);
    expect(c.crashed).toBe(false);
  });

  it("does not fire on a roll that passes through inverted", () => {
    const c = new CrashDetector();
    for (let i = 0; i < 200; i++) c.update(INVERTED_DEG + 10, 1.0, 1);  // 200 ms
    expect(c.crashed).toBe(false);
  });

  it("fires when the aircraft stays inverted", () => {
    const c = new CrashDetector();
    for (let i = 0; i < 500; i++) c.update(INVERTED_DEG + 10, 1.0, 1);
    expect(c.crashed).toBe(true);
  });
});

// ---------------------------------------------------------------- battery ---
class BatteryMonitor {
  stage: 0 | 1 | 2 = 0;
  private filtered = 0;
  private primed = false;
  private dwellMs = 0;
  update(volts: number, cells: number, dtMs: number) {
    if (volts <= 1 || cells === 0) return;
    if (!this.primed) { this.filtered = volts; this.primed = true; }
    const alpha = dtMs / (1000 + dtMs);
    this.filtered += alpha * (volts - this.filtered);
    const per = this.filtered / cells;
    const want = per < 3.3 ? 2 : per < 3.5 ? 1 : 0;
    if (want > this.stage) {
      this.dwellMs += dtMs;
      if (this.dwellMs >= 1500) { this.stage = want as 0 | 1 | 2; this.dwellMs = 0; }
    } else {
      this.dwellMs = 0;
    }
  }
}

describe("the low-battery response", () => {
  it("ignores the sag of a punch-out", () => {
    /*
     * A 4S pack at 15.2 V resting drops well below 13 V under a hard climb and
     * recovers in under a second. Acting on the instantaneous reading lands an
     * aircraft with half a pack left.
     */
    const b = new BatteryMonitor();
    for (let i = 0; i < 2000; i++) b.update(15.2, 4, 1);
    for (let i = 0; i < 600; i++) b.update(12.6, 4, 1);   // 600 ms punch
    for (let i = 0; i < 2000; i++) b.update(15.2, 4, 1);
    expect(b.stage).toBe(0);
  });

  it("reaches critical on a genuinely empty pack", () => {
    const b = new BatteryMonitor();
    for (let i = 0; i < 20_000; i++) b.update(12.8, 4, 1);  // 3.2 V/cell
    expect(b.stage).toBe(2);
  });

  it("never steps back down in flight", () => {
    /*
     * A pack that has hit the floor once is empty. Letting it recover its way
     * back to OK gives an aircraft that alternates between "land now" and
     * "carry on" all the way down.
     */
    const b = new BatteryMonitor();
    for (let i = 0; i < 20_000; i++) b.update(12.8, 4, 1);
    expect(b.stage).toBe(2);
    for (let i = 0; i < 20_000; i++) b.update(16.0, 4, 1);
    expect(b.stage).toBe(2);
  });
});

// ---------------------------------------------------------------- filters ---
/** The same biquad the firmware configures, so the response can be measured. */
function makeNotch(centreHz: number, q: number, sampleHz: number) {
  const w0 = (2 * Math.PI * centreHz) / sampleHz;
  const cs = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = 1 / a0, b1 = (-2 * cs) / a0, b2 = 1 / a0;
  const a1 = (-2 * cs) / a0, a2 = (1 - alpha) / a0;
  let z1 = 0, z2 = 0;
  return (x: number) => {
    const y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    return y;
  };
}

/** Amplitude of a steady sine after the filter settles. */
function gainAt(freqHz: number, notchHz: number, sampleHz = 1000): number {
  const f = makeNotch(notchHz, 3, sampleHz);
  let peak = 0;
  const n = Math.round(sampleHz * 2);
  for (let i = 0; i < n; i++) {
    const y = f(Math.sin((2 * Math.PI * freqHz * i) / sampleHz));
    if (i > n / 2) peak = Math.max(peak, Math.abs(y));   // after settling
  }
  return peak;
}

describe("the gyro notch", () => {
  it("removes the frequency it is tuned to", () => {
    expect(gainAt(300, 300)).toBeLessThan(0.15);
  });

  it("leaves the frequencies the controller actually flies on alone", () => {
    /*
     * The whole reason for a notch rather than a lowpass: a multirotor's rate
     * loop works below about 80 Hz, and a filter that attenuates there costs
     * phase margin, which is what limits how much P and D the airframe accepts.
     */
    expect(gainAt(20, 300)).toBeGreaterThan(0.9);
    expect(gainAt(50, 300)).toBeGreaterThan(0.85);
  });

  it("is narrow enough to be worth having", () => {
    // An octave away it should be most of the way back to unity.
    expect(gainAt(150, 300)).toBeGreaterThan(0.7);
  });

  it("refuses to place a notch above Nyquist, where it would alias", () => {
    expect(filtersSrc).toMatch(/nyquist\s*\*\s*0\.9f/);
  });
});

describe("the peak tracker", () => {
  it("band-passes with two lowpasses, not one", () => {
    /*
     * A one-pole bandpass is the difference of two lowpasses at the band
     * edges. Configuring only one leaves the other at unity gain, so every
     * probe measures the same highpassed signal, every bucket reports the same
     * energy, and the tracker never moves off its initial guess — while still
     * looking like it is working.
     */
    expect(filtersSrc).toMatch(/_upper\[i\]\.configure/);
    expect(filtersSrc).toMatch(/_lower\[i\]\.configure/);
    expect(filtersSrc).toMatch(/_upper\[i\]\.apply\(gyro\)\s*-\s*_lower\[i\]\.apply\(gyro\)/);
  });
});

// ------------------------------------------------------------ bench tools ---
describe("the bench tools cannot run on a flying aircraft", () => {
  it("grants motor test only when disarmed, linked and at idle throttle", () => {
    expect(sketchSrc).toMatch(
      /req == BR_MOTOR_TEST && d\.present && d\.throttle <= 0\.03f/,
    );
  });

  it("only offers turtle mode to an aircraft that is actually inverted", () => {
    expect(sketchSrc).toMatch(/req == BR_TURTLE && Ahrs::tiltDeg\(att\) > INVERTED_DEG/);
  });

  it("puts the ESC direction back when turtle mode ends", () => {
    expect(sketchSrc).toMatch(/if \(turtleArmed\) \{ esc\.setReversed\(false\)/);
  });

  it("never saves the reversed direction to the ESC", () => {
    /*
     * CMD_SAVE_SETTINGS would make the reversal survive a power cycle, and an
     * aircraft that boots with two motors backwards flips itself into the
     * ground on the next arm.
     */
    const dshot = stripComments(read("dshot.h"));
    expect(dshot).not.toMatch(/setReversed[\s\S]{0,200}CMD_SAVE_SETTINGS/);
  });

  it("still refuses to arm or fly from the cloud", () => {
    // The safety case rests on a pilot with a transmitter in line of sight.
    expect(sketchSrc).not.toMatch(/action == "arm"/);
    expect(sketchSrc).not.toMatch(/action == "takeoff"/);
  });
});
