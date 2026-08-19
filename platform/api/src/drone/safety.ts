/**
 * Command safety — what the control plane will and will not relay to an
 * aircraft.
 *
 * WHY THIS EXISTS AT ALL, GIVEN THE FIRMWARE ALREADY CHECKS
 *
 * The firmware's preflight gate is the one that matters, because it is the one
 * that still works when this server is unreachable. This file is not a
 * substitute for it and must never become the only copy.
 *
 * It exists because the two have different information. The firmware knows the
 * aircraft; the control plane knows the account — which packs are retired,
 * what the site's altitude limit is, whether this operator has been grounded,
 * and whether the person holding the API key is allowed to fly at all. A limit
 * that lives only on the airframe cannot be changed for a fleet, and a limit
 * that lives only here cannot be enforced when the link drops. Both copies are
 * deliberate.
 *
 * THE RULE THE WHOLE FILE FOLLOWS
 *
 * Every accepted command is a whole intent that is safe to complete on its own
 * if the link dies the instant after it is sent. There is no command here that
 * means "keep doing this until I say stop", because there is no way to
 * guarantee the "stop" arrives.
 */

import { pool } from "../db";

/** Commands the API will relay, and what each one means. */
export const ACTIONS = [
  "arm",
  "disarm",
  "takeoff",
  "land",
  "rtl",
  "loiter",
  "brake",
  "goto",
  "mission",
  "mode",
  "set",
  "state",
  /*
   * Bench tools, added with drone-fc 2.0.0.
   *
   * These move motors on an aircraft that is not flying, which is why they are
   * commands rather than settings and why checkCommand below refuses every one
   * of them on anything that might be airborne. The firmware refuses them too,
   * on the core that actually knows the arm state — this is the outer of two
   * interlocks, not the only one.
   */
  "beep",
  "motorTest",
  "turtle",
  "benchStop",
] as const;
export type DroneAction = (typeof ACTIONS)[number];

/**
 * Modes an operator may select from the ground.
 *
 * Deliberately a list rather than a passthrough of the autopilot's mode
 * numbers. ArduPilot's copter modes include ACRO and FLIP, which are manual
 * stick modes: selecting one from a web page hands an airborne aircraft to a
 * pilot who is not holding a transmitter. There is no safe remote meaning for
 * them, so they are not offered.
 */
export const REMOTE_MODES = [
  "loiter", "althold", "poshold", "guided", "auto", "rtl", "smartrtl", "land", "brake",
] as const;

export interface SafetyVerdict {
  ok: boolean;
  /** Machine-readable reason, for clients that branch on it. */
  code?: string;
  /** Something to show a person. */
  reason?: string;
}

const OK: SafetyVerdict = { ok: true };

function deny(code: string, reason: string): SafetyVerdict {
  return { ok: false, code, reason };
}

export interface DroneLimits {
  maxAltM: number;
  maxRangeM: number;
  minBattPct: number;
}

export const DEFAULT_LIMITS: DroneLimits = {
  maxAltM: 120,
  maxRangeM: 500,
  minBattPct: 25,
};

/**
 * Per-account limits.
 *
 * 120 m is the default ceiling because it is the legal one in most of the
 * world — 120 m / 400 ft under DGCA, EASA and Part 107 alike. Defaulting to
 * "unlimited" would make the safe configuration the one the customer has to
 * discover.
 */
export async function limitsFor(ownerId: number): Promise<DroneLimits> {
  const { rows } = await pool.query<{
    max_alt_m: number; max_range_m: number; min_batt_pct: number;
  }>(
    `SELECT max_alt_m, max_range_m, min_batt_pct FROM drone_settings WHERE owner_id = $1`,
    [ownerId]
  );
  const r = rows[0];
  if (!r) return DEFAULT_LIMITS;
  return {
    maxAltM: Number(r.max_alt_m) || DEFAULT_LIMITS.maxAltM,
    maxRangeM: Number(r.max_range_m) || DEFAULT_LIMITS.maxRangeM,
    minBattPct: Number(r.min_batt_pct) ?? DEFAULT_LIMITS.minBattPct,
  };
}

/** The subset of live device state this module reasons about. */
export interface AircraftState {
  armed?: boolean;
  inAir?: boolean;
  link?: boolean;
  ready?: boolean;
  readyReason?: string;
  battPct?: number;
  alt?: number;
  fix?: string;
  sats?: number;
  homeSet?: boolean;
  failsafe?: boolean;
  mode?: string;
  missionCount?: number;
}

/**
 * Decides whether a command may be relayed.
 *
 * `state` is the aircraft's last published state and may be stale or absent —
 * a device that has never reported has no state at all. Absent state is
 * treated as unknown rather than as safe: the checks that gate on being
 * airborne fail closed, because the cost of wrongly allowing a disarm on a
 * flying aircraft is not comparable to the cost of wrongly refusing one on a
 * parked one.
 */
export function checkCommand(
  action: string,
  params: Record<string, unknown>,
  state: AircraftState | null,
  limits: DroneLimits
): SafetyVerdict {
  if (!ACTIONS.includes(action as DroneAction)) {
    return deny("unknown_action", `"${action}" is not a drone command`);
  }

  const s = state ?? {};
  const airborne = s.inAir === true;
  // Unknown counts as airborne for the checks that protect a flying aircraft.
  const maybeAirborne = s.inAir !== false;

  switch (action) {
    case "arm": {
      if (s.link === false) return deny("no_link", "The aircraft is not reporting");
      if (s.ready === false) {
        return deny("not_ready", s.readyReason || "Preflight checks have not passed");
      }
      if (typeof s.battPct === "number" && s.battPct >= 0 && s.battPct < limits.minBattPct) {
        return deny("low_battery", `Battery ${s.battPct}% is below the ${limits.minBattPct}% floor`);
      }
      return OK;
    }

    case "disarm": {
      /*
       * Disarming in flight cuts the motors. It is a legitimate last resort —
       * an aircraft heading for a crowd is better dropped where it is than
       * allowed to arrive — but it is never what "disarm" means when a pilot
       * is tidying up after a landing, and in every ground station ever built
       * those two are one tap apart.
       *
       * The firmware refuses this too. Both copies are wanted: this one gives
       * the operator a readable reason and a deliberate second action, and the
       * firmware's still holds when this server is unreachable.
       */
      const force = params.force === true;
      if (maybeAirborne && !force) {
        return deny(
          "airborne",
          s.inAir === true
            ? "The aircraft is airborne — disarming now cuts the motors. Send force to confirm."
            : "Cannot confirm the aircraft is on the ground. Send force to disarm anyway."
        );
      }
      return OK;
    }

    case "takeoff": {
      const alt = Number(params.alt ?? 10);
      if (!Number.isFinite(alt) || alt <= 0) return deny("bad_altitude", "Altitude must be positive");
      if (alt > limits.maxAltM) {
        return deny("above_ceiling", `${alt} m is above the ${limits.maxAltM} m ceiling for this account`);
      }
      if (s.link === false) return deny("no_link", "The aircraft is not reporting");
      if (airborne) return deny("already_airborne", "The aircraft is already flying");
      if (s.ready === false) {
        return deny("not_ready", s.readyReason || "Preflight checks have not passed");
      }
      return OK;
    }

    case "goto": {
      const lat = Number(params.lat);
      const lon = Number(params.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return deny("bad_coordinate", "A latitude and longitude are required");
      }
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return deny("bad_coordinate", "Coordinate is out of range");
      }
      if (params.alt !== undefined) {
        const alt = Number(params.alt);
        if (!Number.isFinite(alt) || alt <= 0) return deny("bad_altitude", "Altitude must be positive");
        if (alt > limits.maxAltM) {
          return deny("above_ceiling", `${alt} m is above the ${limits.maxAltM} m ceiling for this account`);
        }
      }
      if (!airborne) return deny("not_airborne", "The aircraft is not flying");
      return OK;
    }

    case "mission": {
      const op = String(params.op ?? "start");
      if (!["start", "pause", "resume"].includes(op)) {
        return deny("bad_mission_op", `"${op}" is not a mission operation`);
      }
      if (op === "start") {
        if (s.link === false) return deny("no_link", "The aircraft is not reporting");
        if (typeof s.missionCount === "number" && s.missionCount === 0) {
          return deny("no_mission", "No mission is loaded on the aircraft");
        }
        if (!airborne && s.ready === false) {
          return deny("not_ready", s.readyReason || "Preflight checks have not passed");
        }
      }
      return OK;
    }

    case "mode": {
      const want = String(params.mode ?? "");
      if (!REMOTE_MODES.includes(want as (typeof REMOTE_MODES)[number])) {
        return deny(
          "mode_not_permitted",
          `"${want}" cannot be selected remotely. Manual stick modes need a transmitter.`
        );
      }
      return OK;
    }

    case "set": {
      // Raising a limit above the account ceiling from a device-settings call
      // would be a way around the ceiling, so it is refused here as well.
      if (params.maxAlt !== undefined) {
        const v = Number(params.maxAlt);
        if (!Number.isFinite(v) || v <= 0) return deny("bad_limit", "Altitude limit must be positive");
        if (v > limits.maxAltM) {
          return deny("above_ceiling", `The account ceiling is ${limits.maxAltM} m`);
        }
      }
      if (params.maxRange !== undefined) {
        const v = Number(params.maxRange);
        if (!Number.isFinite(v) || v <= 0) return deny("bad_limit", "Range limit must be positive");
        if (v > limits.maxRangeM) {
          return deny("above_range", `The account range limit is ${limits.maxRangeM} m`);
        }
      }
      return OK;
    }

    /*
     * Bench tools.
     *
     * Every one of these spins a motor on an aircraft nobody is flying, so the
     * question is only ever "is it definitely on the ground and definitely not
     * armed". `maybeAirborne` treats unknown as airborne, which is the right
     * default here: an aircraft that is not reporting its state is not one to
     * start a motor on.
     *
     * The beep is the exception and is allowed whenever the aircraft is not
     * armed — it makes the ESCs sing without turning the motors, and it is how
     * somebody finds an aircraft in long grass.
     */
    case "beep": {
      if (s.armed === true) return deny("armed", "The aircraft is armed");
      return OK;
    }

    case "motorTest": {
      if (maybeAirborne) return deny("airborne", "The aircraft is not on the ground");
      if (s.armed === true) return deny("armed", "Disarm before running a motor test");
      if (s.link === false) return deny("no_link", "The aircraft is not reporting");
      const m = Number(params.motor);
      if (!Number.isInteger(m) || m < 0 || m > 7) {
        return deny("bad_motor", "Choose which motor to test");
      }
      const t = params.throttle === undefined ? 0.1 : Number(params.throttle);
      if (!Number.isFinite(t) || t <= 0 || t > 0.25) {
        return deny("bad_throttle", "Motor test throttle must be between 0 and 25%");
      }
      return OK;
    }

    case "turtle": {
      if (maybeAirborne) return deny("airborne", "The aircraft is not on the ground");
      if (s.armed === true) return deny("armed", "Disarm before using turtle mode");
      return OK;
    }

    case "benchStop":
      // Always allowed, for the same reason land and brake are: it is the
      // command somebody reaches for when something is already wrong.
      return OK;

    // land, rtl, loiter, brake and state are always allowed. Every one of them
    // reduces energy or ends the flight; refusing one because some precondition
    // looked wrong would mean refusing the commands an operator reaches for
    // precisely when something already is wrong.
    default:
      return OK;
  }
}

/**
 * Whether an aircraft should be flagged in the console right now.
 *
 * Kept next to the command rules because they read the same fields, and a
 * warning that disagrees with the refusal the operator just got is worse than
 * no warning at all.
 */
export function warningsFor(s: AircraftState | null, limits: DroneLimits): string[] {
  const out: string[] = [];
  if (!s) return out;
  if (s.link === false) out.push("No telemetry from the aircraft");
  if (s.failsafe) out.push("Autopilot failsafe is active");
  if (typeof s.battPct === "number" && s.battPct >= 0 && s.battPct < limits.minBattPct) {
    out.push(`Battery ${s.battPct}%`);
  }
  if (s.inAir && typeof s.alt === "number" && s.alt > limits.maxAltM) {
    out.push(`Above the ${limits.maxAltM} m ceiling`);
  }
  if (!s.inAir && s.ready === false && s.readyReason) out.push(s.readyReason);
  return out;
}
