/**
 * Whether a Guardian could actually call for help — the phone's copy.
 *
 * `src/lib/guardian-health.ts` is the same rules for the web console, and the
 * duplication is deliberate for the same reason as guardian-hold.ts: the mobile
 * app is a separate build with its own dependency tree. Only the parts the
 * phone renders are here; the findings list, which drives the console's health
 * page, is not.
 *
 * tests/guardian-hold-app-parity.test.ts holds the thresholds in step.
 */

export const GUARDIAN_BATTERY_CRITICAL_PCT = 15;

/** SIM800L returns 0..31, plus 99 meaning "not known" — which is not zero bars. */
export const CSQ_UNKNOWN = 99;

/** Under this an SMS is unlikely to leave the device. Roughly -93 dBm. */
export const CSQ_POOR = 10;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function describeRegistration(reg: number | null): string {
  switch (reg) {
    case 0:
      return "not searching";
    case 1:
      return "registered";
    case 2:
      return "searching";
    case 3:
      return "denied";
    case 4:
      return "unknown";
    case 5:
      return "roaming";
    default:
      return "—";
  }
}

export function isRegistered(reg: unknown): boolean {
  const r = num(reg);
  return r === 1 || r === 5;
}

/** Bars out of 5, or null when the modem said it does not know. */
export function signalBars(csq: unknown): number | null {
  const c = num(csq);
  if (c === null || c === CSQ_UNKNOWN || c < 0) return null;
  if (c === 0) return 0;
  return Math.max(1, Math.min(5, Math.round((c / 31) * 5)));
}

export type GuardianState = {
  armed?: unknown;
  contacts?: unknown;
  police?: unknown;
  national?: unknown;
  battery?: unknown;
  csq?: unknown;
  reg?: unknown;
  sim?: unknown;
};

/**
 * The single most important thing wrong, or nothing.
 *
 * Ordered by what stops an alarm hardest: no recipients beats no network beats
 * a weak signal. `offline` is last and is not a fault — a beacon out of Wi-Fi
 * range is the normal case, and it can still raise an alarm over its own SIM.
 */
export function readReadiness(
  state: GuardianState,
  online: boolean,
): { ok: boolean; detail?: string } {
  const contacts = num(state.contacts) ?? 0;
  const hasFallback = num(state.police) === 1 || num(state.national) === 1;
  if (contacts === 0 && !hasFallback) {
    return { ok: false, detail: "Nobody to call. Holding the button would do nothing." };
  }
  if (state.sim === false || num(state.sim) === 0) {
    return { ok: false, detail: "No usable SIM, so it cannot text or call." };
  }
  if (state.reg !== undefined && !isRegistered(state.reg)) {
    return {
      ok: false,
      detail: `Mobile network ${describeRegistration(num(state.reg))} — an SOS would not get out.`,
    };
  }
  const battery = num(state.battery);
  if (battery !== null && battery <= GUARDIAN_BATTERY_CRITICAL_PCT) {
    return { ok: false, detail: `Battery ${battery}%. Charge it — a flat beacon fails silently.` };
  }
  if (state.armed === false) {
    return { ok: false, detail: "Disarmed — the button is ignored." };
  }
  const csq = num(state.csq);
  if (csq !== null && csq !== CSQ_UNKNOWN && csq < CSQ_POOR) {
    return { ok: false, detail: "Barely any mobile signal here. A message may not get out." };
  }
  if (!online) {
    return { ok: true, detail: "Out of Wi-Fi range — it will still raise an alarm over its SIM." };
  }
  return { ok: true };
}
