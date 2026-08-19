
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
  /** Set when the wired sump sensor cannot be read. Holds the pump from 2.2.0. */
  sumpFault?: boolean;
  /** -1 means no reading, exactly as ohPct does. */
  sumpPct?: number | null;
  sumpMinPct?: number | null;
  dryRun?: boolean;
  overflow?: boolean;
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

/* ------------------------------------------------------------------ */
/* Why the pump is not running                                         */
/* ------------------------------------------------------------------ */

/**
 * The reasons a starter refuses to run its pump, in the order it applies them.
 *
 * Mirrors `setPump()` in firmware/watertank/watertank.ino. That function is the
 * single funnel every start goes through, and this is the single funnel every
 * explanation goes through, so a new interlock added there has exactly one
 * place to be explained here.
 */
export type PumpHoldReason =
  /** The dry-run trip has latched and needs clearing by hand. */
  | "dry-run"
  /** The overflow float is closed. */
  | "overflow"
  /** The wired sump sensor is not reading at all. */
  | "sump-fault"
  /** The sump is genuinely too low to pump from. Not a fault. */
  | "sump-low"
  /** No current overhead level, so there is nothing to fill towards. */
  | "no-level";

export interface PumpHold {
  held: boolean;
  reason: PumpHoldReason | null;
  /** One line, suitable for a banner. */
  label: string;
  /** What to do about it. */
  detail: string;
  /** Whether this is a fault or an ordinary condition to wait out. */
  tone: "bad" | "warn" | "idle";
}

const NOT_HELD: PumpHold = { held: false, reason: null, label: "", detail: "", tone: "idle" };

/**
 * Why the pump will not start, or null-ish when nothing is holding it.
 *
 * WHY THIS EXISTS
 *
 * "The pump will not turn on" is the single most common thing anybody asks
 * about this product, and until 2.2.0 the answer was visible for two of the
 * five reasons. The overhead-link reasons were explained well; a dry-run trip
 * and an overflow float had banners; a sump that was simply too low said
 * nothing at all, and a sump sensor that had failed did not even hold the pump
 * — it reported 50% and let it run dry.
 *
 * Now that a failed sump correctly refuses to pump, saying so becomes the
 * difference between a safe interlock and a lock nobody can explain. A control
 * that silently does nothing is indistinguishable from a broken one.
 */
export function readPumpHold(
  state: TankDeviceState | null | undefined,
  link: TankLinkState
): PumpHold {
  const s = state ?? {};

  /*
   * Order follows the firmware. Dry-run first because it is latched — it stays
   * until somebody clears it, so it outranks conditions that may clear
   * themselves while the person is still reading the screen.
   */
  if (s.dryRun === true) {
    return {
      held: true,
      reason: "dry-run",
      label: "Dry-run trip — pump cut",
      detail:
        "The motor drew current without the overhead level rising, so it was stopped to " +
        "protect it. Check the sump has water and the foot valve is primed, then reset the trip.",
      tone: "bad",
    };
  }

  if (s.overflow === true) {
    return {
      held: true,
      reason: "overflow",
      label: "Overflow float tripped — pump stopped",
      detail:
        "The float at the top of the overhead tank is closed. This is the hardware backstop " +
        "underneath the level sensor, so it usually means the tank is genuinely full.",
      tone: "bad",
    };
  }

  /*
   * A sump that cannot be read. Before 2.2.0 this substituted 50% and the pump
   * ran on it — see Docs/28. It now refuses, and this is what says so.
   */
  if (s.sumpFault === true || num(s.sumpPct) === -1) {
    return {
      held: true,
      reason: "sump-fault",
      label: "Sump level cannot be read — pump held",
      detail:
        "The wired sensor in the sump is not returning a usable reading, so there is no way " +
        "to know whether there is water to pump. Check the sensor and its cable; the pump " +
        "stays off until it reads again.",
      tone: "bad",
    };
  }

  // No current overhead level. The link card already explains the radio in
  // detail, so this stays short and defers to it.
  if (link.blocksAutoFill) {
    return {
      held: true,
      reason: "no-level",
      label: "No current tank level — pump held",
      detail:
        "The controller will not fill towards a level it is not being told. See the sensor " +
        "status above.",
      tone: link.tone === "bad" ? "bad" : "warn",
    };
  }

  /*
   * Ordinary, and last: the sump is low. Nothing is broken and nothing needs
   * doing except waiting for it to refill, which is why it is toned as idle
   * rather than dressed up as a fault.
   */
  const sump = num(s.sumpPct);
  const sumpMin = num(s.sumpMinPct) ?? 15;
  if (sump !== null && sump >= 0 && sump <= sumpMin) {
    return {
      held: true,
      reason: "sump-low",
      label: `Sump too low to pump (${sump}%)`,
      detail:
        `The pump is held off below ${sumpMin}% to keep it from running dry. It will start ` +
        "on its own once the sump refills.",
      tone: "idle",
    };
  }

  return NOT_HELD;
}
