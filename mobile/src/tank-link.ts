
/**
 * How much to trust a tank level that arrived by radio — phone copy.
 *
 * A deliberate duplicate of `src/lib/tank-link.ts`. The app is a separate
 * TypeScript project with its own node_modules and cannot import from the web
 * app, so the choice is between duplicating this and letting the two surfaces
 * invent their own answers. Duplicated and pinned is much the safer of the two:
 * `tests/tank-link-app-parity.test.ts` runs both copies over the same matrix of
 * states and fails if they ever disagree.
 *
 * What this decides is whether a water level may be shown as current. The
 * overhead sensor is a battery unit on the tank reporting over LoRa; when that
 * link stops, the controller is left holding a number that was true an hour ago
 * and looks exactly like one that is true now. Showing it plainly is what makes
 * someone start a pump into a tank that may already be full.
 *
 * The firmware applies the same rule to the pump itself (CvTankLink.h), and
 * `tests/tank-link-parity.test.ts` keeps those thresholds aligned too.
 */

/** Seconds between sensor reports. Mirrors CV_TANK_REPORT_INTERVAL_MS. */
export const TANK_REPORT_INTERVAL_S = 30;

/** Past this the reading may not drive the pump. Mirrors CV_TANK_STALE_MS. */
export const TANK_STALE_S = TANK_REPORT_INTERVAL_S * 6;

/** Past this the reading is not worth showing. Mirrors CV_TANK_ABANDON_MS. */
export const TANK_ABANDON_S = 30 * 60;

export type TankLinkStatus =
  | "unpaired"    // no sensor has ever been paired to this starter
  | "waiting"     // paired, nothing heard yet
  | "live"        // recent enough to act on
  | "stale"       // late, but the last reading is probably still roughly true
  | "fault"       // arriving fine, but the readings are not usable
  | "lost";       // so old it tells you nothing about the tank now

export interface TankLinkState {
  status: TankLinkStatus;
  /** Fill percentage, or null when there is nothing worth showing. */
  levelPct: number | null;
  /** True only when the level may be presented as the current level. */
  levelIsCurrent: boolean;
  ageS: number | null;
  /** One line explaining the status, written for the person, not the log. */
  label: string;
  detail: string;
  /** How prominently to draw it. */
  tone: "ok" | "warn" | "bad" | "idle";
  /** Sensor battery percentage, when known. */
  batteryPct: number | null;
  batteryLow: boolean;
  /** Radio signal strength in dBm, when known. */
  rssi: number | null;
  /** True when the pump cannot run automatically right now. */
  blocksAutoFill: boolean;
}

/** The device state fields this reads. All optional: firmware may predate them. */
export interface TankDeviceState {
  ohPct?: number | null;
  rfLinkUp?: boolean;
  rfAgeS?: number | null;
  rfRssi?: number | null;
  sensorPaired?: boolean;
  pairing?: boolean;
  radioReady?: boolean;
  tankBattPct?: number | null;
  tankBattLow?: boolean;
  ohFault?: boolean;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Read the link's health out of a device's published state.
 *
 * Deliberately tolerant of missing fields. A starter running firmware older
 * than the radio change publishes none of them, and it still has a working
 * wired sensor — reporting that as a dead radio link would be alarming and
 * wrong. Absence of the radio fields means "not a radio tank", not "broken".
 */
export function readTankLink(state: TankDeviceState | null | undefined): TankLinkState {
  const s = state ?? {};

  const hasRadioFields = s.sensorPaired !== undefined || s.rfAgeS !== undefined;
  const ohPct = num(s.ohPct);
  // The firmware publishes -1 rather than omitting the key, so that a client
  // holding a previous value is actively told to drop it instead of quietly
  // keeping it on screen.
  const level = ohPct !== null && ohPct >= 0 ? ohPct : null;

  const batteryPct = num(s.tankBattPct);
  const battery = batteryPct !== null && batteryPct >= 0 ? batteryPct : null;
  const rssi = num(s.rfRssi);

  const base = {
    levelPct: level,
    ageS: null as number | null,
    batteryPct: battery,
    batteryLow: !!s.tankBattLow,
    rssi: rssi !== null && rssi !== 0 ? rssi : null,
  };

  // Wired tank, or firmware that predates the radio. Nothing to report.
  if (!hasRadioFields) {
    return {
      ...base,
      status: "live",
      levelIsCurrent: true,
      label: "Connected",
      detail: "Level sensor is wired to the controller.",
      tone: "ok",
      blocksAutoFill: false,
    };
  }

  if (!s.sensorPaired) {
    return {
      ...base,
      levelPct: null,
      status: "unpaired",
      levelIsCurrent: false,
      label: s.pairing ? "Pairing…" : "No tank sensor",
      detail: s.pairing
        ? "Listening for a tank sensor. Press the button on the sensor unit."
        : "Pair the sensor on the tank to see the water level and run auto-fill.",
      tone: s.pairing ? "warn" : "idle",
      blocksAutoFill: true,
    };
  }

  const ageS = num(s.rfAgeS);

  if (ageS === null || ageS < 0) {
    return {
      ...base,
      levelPct: null,
      status: "waiting",
      levelIsCurrent: false,
      label: "Waiting for sensor",
      detail:
        "Paired, but nothing received yet. The sensor reports every " +
        `${TANK_REPORT_INTERVAL_S} seconds.`,
      tone: "warn",
      blocksAutoFill: true,
    };
  }

  if (ageS >= TANK_ABANDON_S) {
    return {
      ...base,
      levelPct: null,
      ageS,
      status: "lost",
      levelIsCurrent: false,
      label: "Sensor offline",
      detail:
        `Nothing heard for ${formatAge(ageS)}. The last level is too old to be ` +
        "meaningful, so it is no longer shown. Check the sensor's battery.",
      tone: "bad",
      blocksAutoFill: true,
    };
  }

  if (ageS >= TANK_STALE_S) {
    return {
      ...base,
      ageS,
      status: "stale",
      levelIsCurrent: false,
      label: "Signal lost",
      detail:
        `Last reading ${formatAge(ageS)} ago. Auto-fill is paused until the ` +
        "sensor reports again — the pump will not run on an old level.",
      tone: "warn",
      blocksAutoFill: true,
    };
  }

  if (s.ohFault) {
    /*
     * Arriving on time and unusable is a different problem from not arriving,
     * and it has a different fix. Reporting it as "stale" sends someone to
     * check the antenna and the battery when the radio is working perfectly
     * and the transducer is pointed at the inlet stream.
     */
    return {
      ...base,
      levelPct: null,
      ageS,
      status: "fault",
      levelIsCurrent: false,
      label: "Sensor fault",
      detail:
        "The tank sensor is reporting, but its readings are out of range. " +
        "Check it is mounted clear of the inlet and pointing at the water.",
      tone: "bad",
      blocksAutoFill: true,
    };
  }

  return {
    ...base,
    ageS,
    status: "live",
    levelIsCurrent: true,
    label: "Connected",
    detail: `Tank sensor reporting${rssi !== null && rssi !== 0 ? ` at ${rssi} dBm` : ""}.`,
    tone: "ok",
    blocksAutoFill: false,
  };
}

/** "45 seconds", "6 minutes", "2 hours" — no false precision. */
export function formatAge(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

/**
 * What to show where a level would go.
 *
 * Never returns a bare number for a level that is not current: the whole point
 * is that a stale reading must not look like a live one.
 */
export function tankLevelText(link: TankLinkState): string {
  if (link.levelPct === null) return "—";
  return link.levelIsCurrent ? `${link.levelPct}%` : `${link.levelPct}% (last known)`;
}
