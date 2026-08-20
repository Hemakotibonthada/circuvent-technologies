/**
 * The Witness disagreement engine.
 *
 * WHAT THIS IS FOR
 *
 * Every device in this fleet reports its own state, and nothing can contradict
 * it. That is not a hypothetical weakness — it is the shape of almost every
 * firmware bug found in this codebase:
 *
 *   - a gate whose relays were energised from power-up reported them closed;
 *   - a smart plug published a hard-coded 42.5 W and the app drew a graph;
 *   - a touchboard invented a 230 V mains reading and derived a power factor
 *     from it;
 *   - a curtain held both motor relays on while reporting "stopped";
 *   - a camera reported a frame count that only counted its own optimism.
 *
 * In each case the device was the only witness to its own behaviour, and it
 * was wrong. A Witness is a second opinion: a clip-on sensor that measures the
 * current actually flowing to an appliance and has no idea what the appliance
 * claims. This module compares the two.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not act. It raises a disagreement and stops. A component that
 * decided on its own that a relay was stuck and cut power to it would be a
 * second thing that can be wrong, with an actuator — and the whole argument
 * here is that a measurement with no authority is more trustworthy than one
 * with.
 */

/** What a witness measured. Amps, and when. */
export interface WitnessReading {
  /** Milliamps through the clamped conductor. */
  milliamps: number;
  /** Epoch ms of the measurement. */
  at: number;
  /**
   * Millivolts left in the storage capacitor.
   *
   * Carried because it is the difference between "the appliance is off" and
   * "this sensor is running out of energy", which look identical from outside.
   */
  reserveMv: number;
}

/** What the device under observation says about itself. */
export interface DeviceClaim {
  /** True when the device says it is passing current. */
  on: boolean;
  /** Watts, when the device claims to measure them. */
  watts?: number;
  at: number;
}

export type Verdict =
  | "agree"
  | "claims-off-but-drawing"
  | "claims-on-but-idle"
  | "watts-disagree"
  | "unknown-stale"
  | "unknown-no-reserve";

export interface Disagreement {
  verdict: Verdict;
  /** Written for a person, not a log parser. */
  detail: string;
  /** Only set when both sides offered a number. */
  claimedWatts?: number;
  measuredWatts?: number;
}

/*
 * Below this, a reading is indistinguishable from the sensor's own noise floor
 * and from the leakage of a switched-mode supply that is genuinely off. A
 * 230 V appliance drawing 20 mA is under 5 W, which is standby, not running.
 */
const IDLE_MA = 20;

/*
 * A load drawing this much is unambiguously running, whatever anything says.
 * Between IDLE_MA and here is the band where a device might reasonably be
 * called either — a standby light, a charger — and no verdict is issued.
 */
const RUNNING_MA = 60;

/** Readings older than this describe a different moment. */
const STALE_MS = 5 * 60_000;

/*
 * Below this the capacitor is nearly empty, so the sensor is about to stop
 * reporting. Its silence must not be read as "no current" — which is exactly
 * the failure this whole device exists to catch, and it would be humiliating
 * to reproduce it here.
 */
const RESERVE_FLOOR_MV = 1800;

/** Mains voltage assumed when converting a current to a power, for comparison only. */
const ASSUMED_MAINS_V = 230;

/**
 * Compares one witness reading with one device claim.
 *
 * `now` is passed in rather than read, so staleness is testable without
 * waiting five minutes.
 */
export function compare(
  reading: WitnessReading | null,
  claim: DeviceClaim | null,
  now: number,
): Disagreement {
  if (!reading || !claim) {
    return {
      verdict: "unknown-stale",
      detail: "Nothing to compare yet.",
    };
  }

  /*
   * Reserve is checked before staleness, because it explains it. A sensor that
   * ran out of energy and a sensor that fell off the wall both go quiet, and
   * only one of them said why on the way down.
   */
  if (reading.reserveMv > 0 && reading.reserveMv < RESERVE_FLOOR_MV) {
    return {
      verdict: "unknown-no-reserve",
      detail:
        "The sensor is running out of stored energy, so its silence cannot be read as "
        + "\u201cno current\u201d. It recharges from the appliance's own field, which means a "
        + "load that has been off for a long time eventually stops being watched.",
    };
  }

  if (now - reading.at > STALE_MS || now - claim.at > STALE_MS) {
    return {
      verdict: "unknown-stale",
      detail: "One side of this comparison is more than five minutes old.",
    };
  }

  const measuredWatts = Math.round((reading.milliamps / 1000) * ASSUMED_MAINS_V);

  /*
   * The two verdicts that matter, and they are not symmetric.
   *
   * "Claims off but drawing" is the dangerous one: a relay welded closed, a
   * channel wired to the wrong pin, an inverted output. Something is powered
   * that everybody believes is not, which is how people get hurt working on
   * it.
   *
   * "Claims on but idle" is the annoying one: a lamp that did not come on, a
   * pump that is not pumping. Nobody is endangered, but the thing somebody
   * asked for did not happen and no screen said so.
   */
  if (!claim.on && reading.milliamps >= RUNNING_MA) {
    return {
      verdict: "claims-off-but-drawing",
      detail: `The device reports off, but ${measuredWatts} W is flowing through it.`,
      measuredWatts,
      claimedWatts: claim.watts,
    };
  }

  if (claim.on && reading.milliamps <= IDLE_MA) {
    return {
      verdict: "claims-on-but-idle",
      detail: "The device reports on, but almost no current is flowing.",
      measuredWatts,
      claimedWatts: claim.watts,
    };
  }

  /*
   * Where the device claims to measure power, the numbers are compared too.
   *
   * The tolerance is wide on purpose. A clamp reads apparent power and a plug
   * usually reports real power, so a motor with a poor power factor makes them
   * differ legitimately by a third. What this catches is not calibration
   * error, it is fiction — the plug that published a fixed 42.5 W whatever was
   * plugged into it, which no tolerance can excuse.
   */
  if (typeof claim.watts === "number" && claim.on && measuredWatts > 0) {
    const ratio = claim.watts / measuredWatts;
    if (ratio > 2.5 || ratio < 0.4) {
      return {
        verdict: "watts-disagree",
        detail: `The device reports ${Math.round(claim.watts)} W; the clamp measures about ${measuredWatts} W.`,
        measuredWatts,
        claimedWatts: claim.watts,
      };
    }
  }

  return { verdict: "agree", detail: "The device and the clamp agree.", measuredWatts };
}

/** Whether a verdict should reach a person rather than only a log. */
export function isActionable(v: Verdict): boolean {
  return v === "claims-off-but-drawing" || v === "claims-on-but-idle" || v === "watts-disagree";
}

/**
 * How urgent a disagreement is.
 *
 * Only one of these is a safety matter. Something energised that everybody
 * believes is dead is the case where somebody opens an enclosure; the rest are
 * things that did not work.
 */
export function severity(v: Verdict): "danger" | "warn" | "info" {
  if (v === "claims-off-but-drawing") return "danger";
  if (v === "claims-on-but-idle" || v === "watts-disagree") return "warn";
  return "info";
}

/* ------------------------------------------------------------------ power --*/

/**
 * The slowest the sensor may report, and the fastest it bothers to.
 *
 * Both bounds exist for the same reason. Faster than 10 s spends energy on
 * resolution nobody uses — a relay that is stuck was stuck ten seconds ago
 * too. Slower than 15 minutes and the reading is no longer describing the
 * present, so it is better to say nothing and let the staleness rule fire.
 */
const MIN_PERIOD_SEC = 10;
const MAX_PERIOD_SEC = 900;

/**
 * The fastest cadence this much current can actually sustain.
 *
 * This function exists because the tests refused to let the design stand
 * without it. A fixed 30-second cadence closes comfortably on a 230 W load and
 * falls three microwatts short on a 23 W one — and "three microwatts short"
 * does not mean it nearly works, it means the capacitor drains slowly until
 * the sensor dies, hours after installation, looking fine the whole way down.
 *
 * So the cadence is not a constant. The sensor reports as often as the load it
 * is watching lets it, which is also the behaviour somebody would want if they
 * thought about it: a big load is worth watching closely and provides the
 * energy to do so.
 */
export function sustainablePeriodSec(primaryMilliamps: number): number {
  const secondaryMa = primaryMilliamps / 1000;
  const harvestedMw = secondaryMa * 3.0 * 0.8;
  const sleepMw = 0.000007 * 3.3 * 1000;
  const perReportMj = 0.100 * 0.020 * 3.3 * 1000;

  const forReportsMw = harvestedMw - sleepMw;
  if (forReportsMw <= 0) return MAX_PERIOD_SEC;

  const period = perReportMj / forReportsMw;
  return Math.min(MAX_PERIOD_SEC, Math.max(MIN_PERIOD_SEC, Math.ceil(period)));
}

/**
 * Whether the device can actually run on what it harvests.
 *
 * This is here, in shipped code with tests around it, rather than in a design
 * note, because it is the calculation the product depends on. If it does not
 * close, there is no device — and a spreadsheet nobody re-runs is how a
 * hardware assumption survives past the point where it stopped being true.
 *
 * @param primaryMilliamps current in the clamped conductor
 * @param reportPeriodSec  how often the sensor wants to transmit
 */
export function powerBudget(primaryMilliamps: number, reportPeriodSec: number) {
  /* 1000:1 core, so the secondary carries a thousandth of the primary. */
  const secondaryMa = primaryMilliamps / 1000;

  /*
   * Usable harvested power. The boost converter presents roughly 3 V of
   * compliance to the rectifier and is about 80% efficient at these levels;
   * the bridge costs two Schottky drops, which at these currents is most of
   * the loss and is why the rectifier is Schottky rather than silicon.
   */
  const harvestedMw = secondaryMa * 3.0 * 0.8;

  /*
   * One report: wake, settle the bias network, take a cycle of samples, and
   * send one 802.15.4 frame. ~100 mA for ~20 ms at 3.3 V.
   *
   * 802.15.4 rather than Wi-Fi is what makes this possible at all — a Wi-Fi
   * association costs hundreds of milliseconds of radio, which is an order of
   * magnitude more energy than the entire budget below.
   */
  const perReportMj = 0.100 * 0.020 * 3.3 * 1000;

  /* Deep sleep between reports: 7 µA at 3.3 V. */
  const sleepMw = 0.000007 * 3.3 * 1000;

  const reportMw = perReportMj / reportPeriodSec;
  const neededMw = reportMw + sleepMw;

  return {
    harvestedMw,
    neededMw,
    /** Positive means the capacitor is charging while reporting at this rate. */
    marginMw: harvestedMw - neededMw,
    sustainable: harvestedMw >= neededMw,
  };
}

/**
 * How long the sensor keeps reporting after the load it watches goes off.
 *
 * This is the interesting number, and the one that decides whether the product
 * works: the moment worth verifying is precisely the moment there is nothing
 * to harvest from. The capacitor charges while the appliance runs and spends
 * that charge reporting the silence afterwards.
 *
 * @param capF        storage capacitance
 * @param fromV       volts at the moment the load stopped
 * @param toV         volts at which the sensor gives up
 */
export function silenceHours(capF: number, fromV: number, toV: number, reportPeriodSec: number) {
  const joules = 0.5 * capF * (fromV * fromV - toV * toV);
  const perReportJ = (0.100 * 0.020 * 3.3);
  const sleepW = 0.000007 * 3.3;
  const perSecondJ = perReportJ / reportPeriodSec + sleepW;
  return joules / perSecondJ / 3600;
}
