/**
 * Fan speed, in the two forms the fleet understands.
 *
 * firmware/smart-fan drives an 8-bit PWM and, until recently, used four of its
 * 256 duty values. `speed` is that four-position table; `level` is the
 * continuous 0..100 the hardware could always do.
 *
 * This duplicates src/lib/smarthome-command-map.ts in the web app on purpose —
 * the mobile app is a separate TypeScript project and does not compile against
 * it. The values must match the firmware, which is the actual authority; the
 * step table here, the one in the web command map and STEP_LEVEL in
 * smart-fan.ino are the same three places and have to agree, or a speed set on
 * the phone will read back differently in the browser.
 *
 * Level 1 is not one percent of duty. Below roughly a third, a fan motor
 * stalls rather than turning slowly — it hums and draws locked-rotor current
 * through a winding its own airflow is no longer cooling — so the firmware
 * maps 1..100 onto the usable band above that floor.
 */

export const FAN_STEP_LEVEL = [0, 33, 66, 100] as const;

export const FAN_PRESETS = [
  { label: "Off", level: 0 },
  { label: "Low", level: 33 },
  { label: "Med", level: 66 },
  { label: "High", level: 100 },
] as const;

/** Nearest named step for a continuous level. Matches levelToSpeed() in the firmware. */
export function levelToSpeed(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0;
  let best = 1;
  let bestDiff = Infinity;
  for (let s = 1; s <= 3; s++) {
    const d = Math.abs(level - FAN_STEP_LEVEL[s]);
    if (d < bestDiff) {
      bestDiff = d;
      best = s;
    }
  }
  return best;
}

interface FanCap {
  field: string;
  legacyField?: string;
}

interface StateLike {
  state: Record<string, unknown>;
}

/**
 * Where the slider sits.
 *
 * A fan on current firmware reports `level`. One that has not been updated
 * reports only `speed`, so the level is reconstructed from the step table —
 * otherwise the slider would sit at zero on a fan that is visibly running, and
 * the first touch would appear to jump it.
 */
export function fanLevel(d: StateLike, cap: FanCap): number {
  const raw = d.state[cap.field];
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.min(100, raw));
  const legacy = cap.legacyField ? d.state[cap.legacyField] : undefined;
  if (typeof legacy === "number" && Number.isFinite(legacy)) {
    return FAN_STEP_LEVEL[Math.max(0, Math.min(3, Math.round(legacy)))] ?? 0;
  }
  return 0;
}

const NAMES = ["Off", "Low", "Medium", "High"];

/** "Off", or a percentage with the nearest named step — e.g. "48% · Low". */
export function fanHint(d: StateLike, cap: FanCap): string {
  const level = fanLevel(d, cap);
  if (level <= 0) return "Off";
  return `${Math.round(level)}% · ${NAMES[levelToSpeed(level)]}`;
}

/**
 * The command to send for a requested level.
 *
 * Both forms, always. A fan already installed runs firmware that reads `speed`
 * and silently ignores anything it does not recognise, so sending only `level`
 * would give a slider that moves, reports success and changes nothing — the
 * exact failure the camera automations had. Newer firmware prefers `level`
 * because it says the same thing more precisely.
 */
export function fanCommand(level: number): Record<string, number> {
  const l = Math.max(0, Math.min(100, Math.round(level)));
  return { level: l, speed: levelToSpeed(l) };
}
