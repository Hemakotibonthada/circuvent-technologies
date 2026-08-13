/**
 * How much to trust a tank level that arrived by radio.
 *
 * The WaterTank Duo's overhead sensor is a separate battery unit on the tank
 * that reports to the starter over LoRa. That link can stop — a flat cell, a
 * failed module, someone parking a van in the line of sight — and when it does
 * the starter is left holding a number that was true an hour ago and looks
 * exactly like a number that is true now.
 *
 * Showing that number plainly is the failure this module exists to prevent. A
 * dashboard reading "12%" gives no hint the figure is from yesterday, and the
 * obvious reaction to 12% is to start the pump.
 *
 * The firmware enforces the same rule for the pump itself (CvTankLink.h), and
 * refuses to run auto-fill on a stale reading. This is the display half of the
 * same idea, kept in one place so the web console and the mobile app cannot
 * reach different conclusions about whether a level is trustworthy — that
 * disagreement is the recurring bug class in this codebase.
 *
 * The thresholds mirror the firmware's deliberately:
 *   report interval  30s   — the sensor's transmit cadence
 *   stale            180s  — six missed reports; one miss is ordinary on radio
 *   abandoned        1800s — old enough that the figure says nothing useful
 */

/** Seconds between sensor reports, unless the app has changed it. */
export const TANK_REPORT_INTERVAL_S = 30;

/**
 * Consecutive missed reports that count as a dead link.
 *
 * A multiplier, not a fixed duration, because the report interval is settable
 * from the app. A hard-coded three minutes silently becomes "permanently
 * stale" the moment somebody picks a five-minute cadence to save battery — the
 * pump would stop running and the app would report a dead sensor that is
 * transmitting perfectly. Mirrors CV_TANK_STALE_MISSES.
 */
export const TANK_STALE_MISSES = 6;

/** The stale window at the default cadence. Mirrors CV_TANK_STALE_MS. */
export const TANK_STALE_S = TANK_REPORT_INTERVAL_S * TANK_STALE_MISSES;

/** Past this the reading is not worth showing. Mirrors CV_TANK_ABANDON_MS. */
export const TANK_ABANDON_S = 30 * 60;

/** The stale window for a given cadence. */
export function tankStaleSeconds(intervalS?: number | null): number {
  const i = typeof intervalS === "number" && intervalS > 0 ? intervalS : TANK_REPORT_INTERVAL_S;
  return i * TANK_STALE_MISSES;
}

/**
 * The abandon window for a given cadence, floored.
 *
 * At a ten-second interval six misses is one minute, and withdrawing the level
 * after a minute would blank the display over ordinary interference.
 */
export function tankAbandonSeconds(intervalS?: number | null): number {
  return Math.max(TANK_ABANDON_S, tankStaleSeconds(intervalS) * 10);
}

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
  /** How often the sensor reports, in seconds. */
  intervalS: number;
  /** An instruction is queued for the sensor's next transmission. */
  downlinkPending: boolean;
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
  sensorIntervalS?: number | null;
  downlinkPending?: boolean;
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
    intervalS: num(s.sensorIntervalS) ?? TANK_REPORT_INTERVAL_S,
    downlinkPending: !!s.downlinkPending,
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
  const staleS = tankStaleSeconds(base.intervalS);
  const abandonS = tankAbandonSeconds(base.intervalS);

  if (ageS === null || ageS < 0) {
    return {
      ...base,
      levelPct: null,
      status: "waiting",
      levelIsCurrent: false,
      label: "Waiting for sensor",
      detail:
        "Paired, but nothing received yet. The sensor reports every " +
        `${base.intervalS} seconds.`,
      tone: "warn",
      blocksAutoFill: true,
    };
  }

  if (ageS >= abandonS) {
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

  if (ageS >= staleS) {
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
