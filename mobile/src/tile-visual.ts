/**
 * How a device tile should look, in the two numbers that carry the reading.
 *
 * This duplicates the curves in src/app/smarthome/_kit/tile-visual.ts on
 * purpose, for the same reason fan.ts duplicates the fan step table: the app is
 * a separate TypeScript project and does not compile against the web source.
 * The values must agree, because the same fan is drawn on both — one that
 * visibly turns faster in the browser than on the phone makes one of the two
 * look broken, and there is no way to tell which from a screenshot.
 *
 * tests/tile-visual-parity.test.ts imports both and fails if they diverge.
 *
 * The tile already had motion: a fan spun and a lamp breathed. What it did not
 * have was any sense of *how much* — the spin ran at one fixed rate whether the
 * fan was barely turning or at maximum, and a lamp at five percent looked
 * exactly like a lamp at full.
 */

/** A fan at full speed, in seconds per revolution, and at its slowest. */
const SPIN_FASTEST = 0.45;
const SPIN_SLOWEST = 2.6;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Seconds per revolution for a fan at `level`, or null when it should not turn. */
export function spinSecondsFor(level: number | null, live: boolean): number | null {
  if (!live || level === null || level <= 0) return null;
  return SPIN_SLOWEST - (SPIN_SLOWEST - SPIN_FASTEST) * (clamp(level, 0, 100) / 100);
}

/**
 * Glow strength, 0..1.
 *
 * Floored well above zero for anything that is on: a lamp dimmed to 5% is
 * still lit, and rendering it identically to off is wrong about the one thing
 * the tile is being asked.
 */
export function glowFor(level: number | null, live: boolean): number {
  if (!live) return 0;
  if (level === null) return 1;
  return 0.35 + 0.65 * (clamp(level, 0, 100) / 100);
}

/** Stroke lengths for a progress ring of a given radius. */
export function ringDash(level: number, radius: number): { dash: number; gap: number } {
  const circumference = 2 * Math.PI * radius;
  const filled = (clamp(level, 0, 100) / 100) * circumference;
  return { dash: filled, gap: circumference - filled };
}

/**
 * The colour to draw a device in: its own when it reports one, else the
 * per-type accent.
 *
 * A lamp set to red should not appear in the amber we chose for lights. The
 * value is validated rather than trusted — it is rendered into a style, and a
 * device reporting something that is not a colour should be ignored, not
 * passed through.
 */
export function deviceTint(reported: unknown, accent: string, live: boolean): string {
  if (!live) return accent;
  return typeof reported === "string" && /^#[0-9a-f]{6}$/i.test(reported) ? reported : accent;
}
