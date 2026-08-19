/**
 * The Guardian's panic gesture, mirrored from the firmware.
 *
 * WHY THIS EXISTS TWICE
 *
 * `firmware/CircuventDevice/CvHoldButton.h` is what actually decides whether a
 * press was a call for help. This file is the same rules in TypeScript, and it
 * is not test scaffolding — the apps need them:
 *
 *   - the setup screen has to explain the gesture and offer a hold length,
 *     and has to refuse lengths that would make the device dangerous;
 *   - the console shows a live countdown while a wearer is mid-press, which
 *     means turning the device's reported progress into something honest;
 *   - support needs to be able to say why a press did not fire.
 *
 * Two implementations of one rule is a liability, so `tests/guardian-hold.
 * test.ts` exercises this one against the cases that matter and asserts the
 * firmware still has the same shape. This is the arrangement already used for
 * the water tank in `src/lib/tank-link.ts`, for the same reason.
 */

/** Default sustained press, in milliseconds. See `HOLD_BOUNDS` for why. */
export const DEFAULT_HOLD_MS = 30_000;

/** A break shorter than this is contact noise, not a release. */
export const DEFAULT_GLITCH_MS = 120;

/**
 * What a hold length is allowed to be.
 *
 * The floor is not a matter of taste. A shoe-mounted button is stood on: a
 * footfall holds it for a few hundred milliseconds and a wearer standing still
 * holds it indefinitely-looking for several seconds. Anything under about ten
 * seconds will be performed by walking, and every false alarm tells a parent
 * their child is in danger and dials a police station. Devices that cry wolf
 * come off the foot and stop protecting anybody.
 *
 * The ceiling is the other failure: a gesture long enough to be safe from the
 * pavement is also long enough to be impossible to complete while being
 * attacked. Two minutes is past the point where the device is a comfort rather
 * than a help.
 */
export const HOLD_BOUNDS = { minMs: 10_000, maxMs: 120_000 } as const;

export type HoldConfig = {
  holdMs: number;
  glitchMs: number;
};

/** Clamps a requested hold length into the range the device will honour. */
export function clampHoldMs(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_HOLD_MS;
  return Math.min(HOLD_BOUNDS.maxMs, Math.max(HOLD_BOUNDS.minMs, Math.round(ms)));
}

/**
 * Whether a hold length may be used, and why not.
 *
 * Returned rather than thrown: this drives a form, and the reason is the
 * useful part.
 */
export function checkHoldMs(ms: number): { ok: boolean; reason?: string } {
  if (!Number.isFinite(ms)) return { ok: false, reason: "Not a number." };
  if (ms < HOLD_BOUNDS.minMs) {
    return {
      ok: false,
      reason: `Too short. Under ${HOLD_BOUNDS.minMs / 1000}s the wearer's own walking will trigger it.`,
    };
  }
  if (ms > HOLD_BOUNDS.maxMs) {
    return {
      ok: false,
      reason: `Too long. Over ${HOLD_BOUNDS.maxMs / 1000}s is longer than somebody in trouble can hold a button.`,
    };
  }
  return { ok: true };
}

/** The mutable part, kept separate so a caller can own it. */
export type HoldState = {
  armed: boolean;
  down: boolean;
  fired: boolean;
  pressedAt: number;
  releasedAt: number;
};

export function newHoldState(): HoldState {
  return { armed: false, down: false, fired: false, pressedAt: 0, releasedAt: 0 };
}

/**
 * One pass of the state machine — the exact rules in CvHoldButton::step().
 *
 * @returns true on the single pass that completes the hold.
 */
export function stepHold(
  s: HoldState,
  down: boolean,
  now: number,
  cfg: HoldConfig = { holdMs: DEFAULT_HOLD_MS, glitchMs: DEFAULT_GLITCH_MS },
): boolean {
  // A button already held at power-up is not somebody asking for help — it is
  // a shoe with something resting on it. Believe nothing until it lets go.
  if (!s.armed) {
    if (!down) s.armed = true;
    s.down = down;
    return false;
  }

  if (down) {
    if (!s.down) {
      // Only a real release restarts the clock. A bounce at second twenty-nine
      // must not silently send the wearer back to zero.
      const glitch = s.pressedAt !== 0 && now - s.releasedAt < cfg.glitchMs;
      if (!glitch) {
        s.pressedAt = now;
        s.fired = false;
      }
    }
    s.down = true;

    if (!s.fired && s.pressedAt !== 0 && now - s.pressedAt >= cfg.holdMs) {
      s.fired = true;
      return true;
    }
    return false;
  }

  if (s.down) s.releasedAt = now;
  s.down = false;
  if (s.pressedAt !== 0 && now - s.releasedAt >= cfg.glitchMs) {
    s.pressedAt = 0;
    s.fired = false;
  }
  return false;
}

/** How long the press in progress has run. Zero when there is not one. */
export function heldMs(s: HoldState, now: number): number {
  return s.pressedAt === 0 ? 0 : now - s.pressedAt;
}

/** 0..100 for a progress ring, saturating at 100. */
export function holdProgressPct(s: HoldState, now: number, holdMs = DEFAULT_HOLD_MS): number {
  if (s.pressedAt === 0 || holdMs <= 0) return 0;
  return Math.min(100, Math.floor(((now - s.pressedAt) * 100) / holdMs));
}

/**
 * Plain-language description of the gesture, for the setup screen.
 *
 * The wording matters more than it looks: the single most common support
 * question about a device like this is "I pressed it and nothing happened",
 * and the answer is almost always that they tapped it.
 */
export function describeGesture(holdMs: number): string {
  const secs = Math.round(holdMs / 1000);
  return `Press and hold the button for ${secs} seconds without letting go. Tapping it does nothing — that is deliberate, so walking cannot raise a false alarm.`;
}
