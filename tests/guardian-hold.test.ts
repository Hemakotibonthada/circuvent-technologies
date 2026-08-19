/**
 * The panic gesture, tested against the thing that will actually happen to it.
 *
 * The button is in a shoe. It will be stood on, walked on, knocked and flexed
 * every day for years, and the cost of getting this wrong is not a bad user
 * experience — it is a parent receiving a message that their child is in
 * danger, and a police station being dialled, because somebody walked to the
 * shops. Devices that do that come off the foot, and then they protect nobody.
 *
 * The opposite failure is worse and quieter: a gesture so strict that a real
 * press never registers, discovered once.
 *
 * So the cases below are walking, standing, stumbling and being attacked,
 * rather than a state machine's happy path.
 */
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_GLITCH_MS,
  DEFAULT_HOLD_MS,
  HOLD_BOUNDS,
  clampHoldMs,
  checkHoldMs,
  describeGesture,
  heldMs,
  holdProgressPct,
  newHoldState,
  stepHold,
  type HoldConfig,
} from "@/lib/guardian-hold";

const CFG: HoldConfig = { holdMs: DEFAULT_HOLD_MS, glitchMs: DEFAULT_GLITCH_MS };

/**
 * Runs a sequence of (down, durationMs) segments through the machine at 10 ms
 * resolution and reports how many times it fired.
 */
function run(
  segments: Array<[down: boolean, ms: number]>,
  cfg: HoldConfig = CFG,
  startArmed = true,
): { fires: number; at: number[] } {
  const s = newHoldState();
  let now = 1000; // never start at 0; millis() does not either after boot
  if (startArmed) {
    // One released pass is what arms it.
    stepHold(s, false, now, cfg);
  }
  const at: number[] = [];
  for (const [down, ms] of segments) {
    const until = now + ms;
    while (now < until) {
      if (stepHold(s, down, now, cfg)) at.push(now);
      now += 10;
    }
  }
  return { fires: at.length, at };
}

describe("a shoe cannot raise an alarm on its own", () => {
  it("ignores a single footfall", () => {
    expect(run([[true, 400], [false, 500]]).fires).toBe(0);
  });

  it("ignores twenty minutes of walking", () => {
    /*
     * A footfall presses for roughly 400 ms and releases for roughly 500 ms.
     * Twenty minutes of that is about 1300 steps — more than enough to reach
     * thirty seconds of accumulated pressure, which is exactly why accumulated
     * pressure must not be what counts.
     */
    const segments: Array<[boolean, number]> = [];
    for (let i = 0; i < 1300; i++) {
      segments.push([true, 400], [false, 500]);
    }
    expect(run(segments).fires).toBe(0);
  });

  it("ignores standing still for five minutes", () => {
    /*
     * Standing puts continuous pressure on the sole. This is the case that
     * makes a naive "held for 30 s" implementation useless in a shoe — and it
     * is why the button is a discrete switch under the insole rather than a
     * pressure pad, and why the wearer must arm it by releasing first.
     *
     * With the button genuinely closed for five minutes it *does* fire, once,
     * and that is correct: a switch held closed for five minutes is not
     * standing, it is a fault or a deliberate press. What must not happen is
     * repeat firing, which would re-alert every thirty seconds forever.
     */
    expect(run([[true, 300_000]]).fires).toBe(1);
  });

  it("does not fire at boot on a button that is already pressed", () => {
    // Powering on with the shoe on, or with something resting on it.
    const s = newHoldState();
    let now = 1000;
    let fires = 0;
    for (let i = 0; i < 6000; i++) {
      if (stepHold(s, true, now, CFG)) fires++;
      now += 10;
    }
    expect(fires).toBe(0);
  });
});

describe("a deliberate press does raise one", () => {
  it("fires once after a continuous thirty seconds", () => {
    const r = run([[true, 31_000]]);
    expect(r.fires).toBe(1);
  });

  it("fires at thirty seconds, not before", () => {
    const r = run([[true, 31_000]]);
    // Started at 1000, armed on that pass, press begins at 1000.
    expect(r.at[0] - 1000).toBeGreaterThanOrEqual(DEFAULT_HOLD_MS);
    expect(r.at[0] - 1000).toBeLessThan(DEFAULT_HOLD_MS + 100);
  });

  it("does not fire at twenty-nine seconds", () => {
    expect(run([[true, 29_000], [false, 1000]]).fires).toBe(0);
  });

  it("survives a stumble at second twenty-nine", () => {
    /*
     * The reason `glitchMs` exists. A break of a few tens of milliseconds
     * while somebody is very deliberately pressing the button — a jolt, the
     * flex of the sole, contact bounce — must not send them back to zero. They
     * would have no way of knowing it had, and would let go believing help was
     * coming.
     */
    expect(run([[true, 29_000], [false, 50], [true, 2000]]).fires).toBe(1);
  });

  it("is sent back to zero by a real release", () => {
    expect(run([[true, 29_000], [false, 500], [true, 2000]]).fires).toBe(0);
  });

  it("only fires once per press, however long it is held", () => {
    // Somebody in trouble will not let go. That must not re-alert repeatedly.
    expect(run([[true, 200_000]]).fires).toBe(1);
  });

  it("can be used again after letting go", () => {
    const r = run([
      [true, 31_000],
      [false, 2000],
      [true, 31_000],
    ]);
    expect(r.fires).toBe(2);
  });
});

describe("the boundary between noise and a release", () => {
  it("treats a break shorter than the tolerance as noise", () => {
    expect(run([[true, 29_000], [false, DEFAULT_GLITCH_MS - 30], [true, 2000]]).fires).toBe(1);
  });

  it("treats a break at the tolerance as a release", () => {
    expect(run([[true, 29_000], [false, DEFAULT_GLITCH_MS + 30], [true, 2000]]).fires).toBe(0);
  });

  it("keeps a footfall comfortably on the release side", () => {
    // The shortest plausible footfall release is several times the tolerance.
    expect(DEFAULT_GLITCH_MS * 2).toBeLessThan(300);
  });
});

describe("hold length is bounded, because both ends are dangerous", () => {
  it("refuses a length walking would perform", () => {
    const r = checkHoldMs(3000);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/walking/i);
  });

  it("refuses a length nobody under attack could complete", () => {
    expect(checkHoldMs(5 * 60_000).ok).toBe(false);
  });

  it("accepts the default", () => {
    expect(checkHoldMs(DEFAULT_HOLD_MS).ok).toBe(true);
  });

  it("clamps rather than failing open", () => {
    expect(clampHoldMs(0)).toBe(HOLD_BOUNDS.minMs);
    expect(clampHoldMs(9_999_999)).toBe(HOLD_BOUNDS.maxMs);
    expect(clampHoldMs(Number.NaN)).toBe(DEFAULT_HOLD_MS);
  });

  it("honours a shorter hold when one is configured", () => {
    const cfg = { holdMs: 10_000, glitchMs: DEFAULT_GLITCH_MS };
    expect(run([[true, 11_000]], cfg).fires).toBe(1);
    expect(run([[true, 9_000], [false, 500]], cfg).fires).toBe(0);
  });
});

describe("progress is reported honestly", () => {
  it("is zero when nothing is pressed", () => {
    const s = newHoldState();
    expect(holdProgressPct(s, 5000)).toBe(0);
    expect(heldMs(s, 5000)).toBe(0);
  });

  it("tracks a press", () => {
    const s = newHoldState();
    stepHold(s, false, 1000, CFG);
    stepHold(s, true, 1000, CFG);
    expect(holdProgressPct(s, 1000 + 15_000)).toBe(50);
    expect(heldMs(s, 1000 + 15_000)).toBe(15_000);
  });

  it("saturates rather than exceeding 100", () => {
    const s = newHoldState();
    stepHold(s, false, 1000, CFG);
    stepHold(s, true, 1000, CFG);
    expect(holdProgressPct(s, 1000 + 90_000)).toBe(100);
  });
});

describe("the gesture is explained where people ask about it", () => {
  it("says how long, and that tapping does nothing", () => {
    const text = describeGesture(DEFAULT_HOLD_MS);
    expect(text).toContain("30 seconds");
    expect(text).toMatch(/tap/i);
  });
});

describe("the firmware still implements these rules", () => {
  const header = fs.readFileSync(
    path.join(__dirname, "..", "firmware", "CircuventDevice", "CvHoldButton.h"),
    "utf8",
  );

  it("has the same step() the mirror was written from", () => {
    expect(header).toMatch(/bool step\(bool down, uint32_t now\)/);
  });

  it("arms only after a release", () => {
    expect(header).toMatch(/if\s*\(!_armed\)/);
    expect(header).toMatch(/if\s*\(!down\)\s*_armed = true;/);
  });

  it("treats a short break as noise and a long one as a release", () => {
    expect(header).toMatch(/now - _releasedAt < _glitchMs/);
    expect(header).toMatch(/now - _releasedAt\)\s*>= _glitchMs/);
  });

  it("clears progress on a real release", () => {
    expect(header).toMatch(/_pressedAt = 0;/);
  });

  it("fires once per press", () => {
    expect(header).toMatch(/if\s*\(!_fired[\s\S]{0,120}_fired = true;\s*\n\s*return true;/);
  });

  it("defaults to the same thirty seconds and tolerance", () => {
    expect(header).toMatch(/uint32_t _holdMs = 30000;/);
    expect(header).toMatch(/uint16_t _glitchMs = 120;/);
    expect(DEFAULT_HOLD_MS).toBe(30_000);
    expect(DEFAULT_GLITCH_MS).toBe(120);
  });
});
