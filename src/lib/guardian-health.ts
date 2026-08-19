/**
 * Whether a Guardian could actually call for help right now.
 *
 * THE FAILURE THIS EXISTS FOR
 *
 * A safety beacon that cannot raise an alarm looks exactly like one that can.
 * It is online, the battery reads something, the map shows a position — and the
 * button does nothing, or the SMS goes nowhere, and nobody finds out until the
 * day it matters. There is no error, because nothing has gone wrong yet.
 *
 * Every check below is a way that happens:
 *
 *   - nobody was ever added to the contact list;
 *   - the cell went flat, quietly, over a fortnight;
 *   - the SIM has no signal where the wearer actually spends their time;
 *   - there is no SIM in it at all, or it is unregistered — which is what an
 *     expired prepaid account looks like;
 *   - the beacon has been switched off, or has stopped reporting;
 *   - somebody disarmed it and forgot.
 *
 * The device reports what it knows about itself; this turns that into things
 * worth telling a person, in the order a person should care about them. It is
 * the same shape as tank-health.ts and exists for the same reason: the system
 * already knows, and nothing was telling anybody.
 */

import type { Device } from "@/lib/control-plane";
import type { Finding } from "@/lib/ai/analysis";

/**
 * Warn about the cell at this remaining percentage.
 *
 * Higher than the tank sensor's 20%, deliberately. A tank sensor going quiet
 * means somebody eventually notices the water; a beacon going quiet means
 * somebody is on their own. The extra fortnight of warning is worth the
 * occasional early nag.
 */
export const GUARDIAN_BATTERY_WARN_PCT = 35;

/** Below this it is a matter of days, and is reported as critical. */
export const GUARDIAN_BATTERY_CRITICAL_PCT = 15;

/**
 * Signal quality, as the modem reports it.
 *
 * SIM800L returns 0..31 for AT+CSQ, plus 99 meaning "not known or not
 * detectable" — which is not a low signal, it is no answer, and must not be
 * rendered as 99/31 bars.
 */
export const CSQ_UNKNOWN = 99;

/**
 * Under this, an SMS is unlikely to leave the device.
 *
 * 10 is roughly -93 dBm. Below that a text may still get out eventually, but
 * "eventually" is the wrong word for the traffic this device sends, and a
 * wearer whose home or school reads 5 needs to know before an emergency
 * rather than during one.
 */
export const CSQ_POOR = 10;

export type GuardianState = {
  ready?: unknown;
  armed?: unknown;
  sos?: unknown;
  contacts?: unknown;
  police?: unknown;
  national?: unknown;
  battery?: unknown;
  csq?: unknown;
  /** 1 = registered home, 5 = registered roaming; anything else is not usable. */
  reg?: unknown;
  /** Whether the modem reports a SIM it can use. */
  sim?: unknown;
  fix?: unknown;
  holdSec?: unknown;
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isGuardian(d: Device): boolean {
  return d.type === "guardian";
}

/** Human wording for the modem's registration code. */
export function describeRegistration(reg: number | null): string {
  switch (reg) {
    case 0:
      return "not searching for a network";
    case 1:
      return "registered";
    case 2:
      return "searching for a network";
    case 3:
      return "registration denied";
    case 4:
      return "unknown";
    case 5:
      return "registered (roaming)";
    default:
      return "not reported";
  }
}

/** True when the modem is on a network it can send from. */
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

export type ReadinessReason =
  | "no-contacts"
  | "no-sim"
  | "not-registered"
  | "poor-signal"
  | "battery-critical"
  | "disarmed"
  | "offline";

/**
 * The single most important thing wrong, or null when it is fit to use.
 *
 * One reason rather than a list, because this drives a banner and the honest
 * summary of a beacon with four problems is still "it cannot call anybody".
 * Ordered by what stops an alarm hardest: no recipients beats no network beats
 * a weak signal.
 *
 * `offline` is last on purpose. A beacon out of Wi-Fi range is the normal case
 * — it is meant to be out in the world — and it can still raise an alarm over
 * its own SIM, so it must not be reported the way a dead device is.
 */
export function readReadiness(
  state: GuardianState,
  online: boolean,
): { ok: boolean; reason?: ReadinessReason; detail?: string } {
  const contacts = num(state.contacts) ?? 0;
  const hasFallback = num(state.police) === 1 || num(state.national) === 1;
  if (contacts === 0 && !hasFallback) {
    return {
      ok: false,
      reason: "no-contacts",
      detail: "Nobody to call. Holding the button would do nothing.",
    };
  }

  if (state.sim === false || num(state.sim) === 0) {
    return { ok: false, reason: "no-sim", detail: "No usable SIM, so it cannot text or call." };
  }

  if (state.reg !== undefined && !isRegistered(state.reg)) {
    return {
      ok: false,
      reason: "not-registered",
      detail: `Mobile network ${describeRegistration(num(state.reg))} — an SOS would not get out.`,
    };
  }

  const battery = num(state.battery);
  if (battery !== null && battery <= GUARDIAN_BATTERY_CRITICAL_PCT) {
    return {
      ok: false,
      reason: "battery-critical",
      detail: `Battery ${battery}%. It will stop protecting them within a day or so.`,
    };
  }

  if (state.armed === false) {
    return { ok: false, reason: "disarmed", detail: "Disarmed — the button is ignored." };
  }

  const bars = signalBars(state.csq);
  if (bars !== null && num(state.csq)! < CSQ_POOR) {
    return {
      ok: false,
      reason: "poor-signal",
      detail: "Barely any mobile signal here. A message may not get out.",
    };
  }

  if (!online) {
    // Not a fault. Said out loud so nobody reads the beacon's absence from the
    // app as the beacon being broken.
    return { ok: true, reason: "offline", detail: "Out of Wi-Fi range — it will still raise an alarm over its SIM." };
  }

  return { ok: true };
}

/**
 * Everything worth telling somebody about the Guardians on an account.
 *
 * Deliberately quiet about a beacon that is merely away from home: that is what
 * this product is for, and a warning every time somebody leaves the house is a
 * warning that gets muted, taking the real ones with it.
 */
export function findGuardianProblems(devices: Device[]): Finding[] {
  const out: Finding[] = [];

  for (const d of devices.filter(isGuardian)) {
    const state = (d.state ?? {}) as GuardianState;
    const name = d.name || "Guardian";

    /*
     * An SOS in progress is not a "problem" for this list — it is an emergency
     * with its own screen, its own notifications and its own banner. Adding it
     * here would bury it among battery warnings.
     */
    if (state.sos === true) continue;

    const contacts = num(state.contacts) ?? 0;
    const hasFallback = num(state.police) === 1 || num(state.national) === 1;
    if (contacts === 0 && !hasFallback) {
      out.push({
        id: `guardian-no-contacts:${d.id}`,
        severity: "critical",
        title: `${name} has no emergency contacts`,
        detail:
          "It is paired and reporting, but there is nobody for it to call. Holding the button would do nothing at all. Add a contact in the app.",
        deviceIds: [d.id],
        evidence: { contacts },
        suggestion: "Add at least one emergency contact.",
      });
      continue; // Everything below is moot until somebody can be reached.
    }

    if (state.sim === false || num(state.sim) === 0) {
      out.push({
        id: `guardian-no-sim:${d.id}`,
        severity: "critical",
        title: `${name} has no usable SIM`,
        detail:
          "The modem cannot see a SIM it can use, so the beacon cannot text or call anybody. Check the card is seated, and that the account is still active.",
        deviceIds: [d.id],
        evidence: {},
      });
    } else if (state.reg !== undefined && !isRegistered(state.reg)) {
      out.push({
        id: `guardian-not-registered:${d.id}`,
        severity: "critical",
        title: `${name} is not on a mobile network`,
        detail: `The modem reports it is ${describeRegistration(num(state.reg))}. An SOS would not leave the device. A prepaid account that has run out looks exactly like this.`,
        deviceIds: [d.id],
        evidence: { reg: num(state.reg) ?? -1 },
      });
    }

    const battery = num(state.battery);
    if (battery !== null) {
      if (battery <= GUARDIAN_BATTERY_CRITICAL_PCT) {
        out.push({
          id: `guardian-battery-critical:${d.id}`,
          severity: "critical",
          title: `${name} battery is ${battery}%`,
          detail:
            "Charge it now. A flat beacon fails silently — it simply stops being there, and nobody notices until it is needed.",
          deviceIds: [d.id],
          evidence: { battery },
          suggestion: "Charge the beacon.",
        });
      } else if (battery <= GUARDIAN_BATTERY_WARN_PCT) {
        out.push({
          id: `guardian-battery-low:${d.id}`,
          severity: "warning",
          title: `${name} battery is ${battery}%`,
          detail: "Worth charging in the next day or two.",
          deviceIds: [d.id],
          evidence: { battery },
        });
      }
    }

    const csq = num(state.csq);
    if (csq !== null && csq !== CSQ_UNKNOWN && csq < CSQ_POOR && isRegistered(state.reg)) {
      out.push({
        id: `guardian-weak-signal:${d.id}`,
        severity: "warning",
        title: `${name} has a weak mobile signal`,
        detail:
          "A text may not get out from where it is now. If this is where it usually sits — a bedroom, a locker — it is worth knowing before an emergency rather than during one.",
        deviceIds: [d.id],
        evidence: { csq },
      });
    }

    if (state.armed === false) {
      out.push({
        id: `guardian-disarmed:${d.id}`,
        severity: "warning",
        title: `${name} is disarmed`,
        detail: "The panic button is being ignored. This is easy to switch on and forget about.",
        deviceIds: [d.id],
        evidence: {},
        suggestion: "Arm the beacon.",
      });
    }
  }

  return out;
}
