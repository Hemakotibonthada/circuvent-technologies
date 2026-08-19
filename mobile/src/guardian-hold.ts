/**
 * The Guardian's panic gesture — the mobile half of the mirror.
 *
 * `firmware/CircuventDevice/CvHoldButton.h` decides whether a press was a call
 * for help. `src/lib/guardian-hold.ts` is the same rules for the web console.
 * This is the same rules again for the phone, and it is a deliberate duplicate
 * rather than a shared package: the mobile app is a separate build with its
 * own dependency tree, and reaching into the web app's src/ from here has bitten
 * this repo before.
 *
 * The three copies are kept honest by tests/guardian-hold-app-parity.test.ts,
 * which is the same arrangement already used for the water tank in
 * mobile/src/tank-link.ts.
 *
 * What the phone needs it for: explaining the gesture during setup, and
 * refusing a hold length that would make the device dangerous.
 */

/** Default sustained press, in milliseconds. */
export const DEFAULT_HOLD_MS = 30_000;

/** A break shorter than this is contact noise, not a release. */
export const DEFAULT_GLITCH_MS = 120;

/**
 * What a hold length is allowed to be.
 *
 * The floor is not a matter of taste. The button is in a shoe: a footfall
 * holds it for a few hundred milliseconds, and anything under about ten
 * seconds will be performed by ordinary walking. Every false alarm tells a
 * parent their child is in danger and dials a police station, and devices that
 * do that come off the foot and stop protecting anybody.
 *
 * The ceiling is the opposite failure — a gesture long enough to be safe from
 * the pavement is also long enough to be impossible while being attacked.
 */
export const HOLD_BOUNDS = { minMs: 10_000, maxMs: 120_000 } as const;

export function clampHoldMs(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_HOLD_MS;
  return Math.min(HOLD_BOUNDS.maxMs, Math.max(HOLD_BOUNDS.minMs, Math.round(ms)));
}

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

/**
 * Plain-language description of the gesture.
 *
 * The wording matters more than it looks: the most common support question
 * about a device like this is "I pressed it and nothing happened", and the
 * answer is almost always that they tapped it.
 */
export function describeGesture(holdMs: number): string {
  const secs = Math.round(holdMs / 1000);
  return `Press and hold the button for ${secs} seconds without letting go. Tapping it does nothing — that is deliberate, so walking cannot raise a false alarm.`;
}
