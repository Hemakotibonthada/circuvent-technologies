import "../test-env";
import test from "node:test";
import assert from "node:assert/strict";
import { checkCommand, warningsFor, DEFAULT_LIMITS, type AircraftState } from "./safety";

const limits = { ...DEFAULT_LIMITS };

const flying: AircraftState = {
  armed: true, inAir: true, link: true, ready: true, battPct: 70, alt: 40,
  fix: "3d", sats: 14, homeSet: true, failsafe: false, mode: "loiter", missionCount: 0,
};
const parked: AircraftState = {
  armed: false, inAir: false, link: true, ready: true, battPct: 95, alt: 0,
  fix: "3d", sats: 15, homeSet: true, failsafe: false, mode: "loiter", missionCount: 0,
};

test("an unknown action is refused", () => {
  const v = checkCommand("selfdestruct", {}, parked, limits);
  assert.equal(v.ok, false);
  assert.equal(v.code, "unknown_action");
});

/* -------------------------------------------------------------------- */
/* Disarm — the one that drops an aircraft out of the sky                */
/* -------------------------------------------------------------------- */

test("disarm in flight is refused without force", () => {
  const v = checkCommand("disarm", {}, flying, limits);
  assert.equal(v.ok, false);
  assert.equal(v.code, "airborne");
  assert.match(v.reason!, /cuts the motors/i);
});

test("disarm in flight is allowed with force, because it is a real last resort", () => {
  assert.equal(checkCommand("disarm", { force: true }, flying, limits).ok, true);
});

test("disarm on the ground needs no force", () => {
  assert.equal(checkCommand("disarm", {}, parked, limits).ok, true);
});

/*
 * The failure this guards. A device that has never published state, or whose
 * state is stale, has `inAir === undefined`. Treating unknown as "on the
 * ground" would let a single dropped state message turn a routine disarm into
 * a motor cut on a flying aircraft.
 */
test("unknown airborne state fails closed, not open", () => {
  const v = checkCommand("disarm", {}, { armed: true, link: true }, limits);
  assert.equal(v.ok, false);
  assert.equal(v.code, "airborne");
  assert.match(v.reason!, /cannot confirm/i);
});

test("no state at all also fails closed", () => {
  assert.equal(checkCommand("disarm", {}, null, limits).ok, false);
});

/* -------------------------------------------------------------------- */
/* Arming and takeoff                                                    */
/* -------------------------------------------------------------------- */

test("arming is refused when the aircraft is not ready, and says why", () => {
  const v = checkCommand(
    "arm", {},
    { ...parked, ready: false, readyReason: "too few satellites" },
    limits
  );
  assert.equal(v.ok, false);
  assert.equal(v.code, "not_ready");
  // The firmware's reason is passed through rather than replaced with a
  // generic one: "not ready" sends a pilot looking, "too few satellites" sends
  // them to the right place.
  assert.equal(v.reason, "too few satellites");
});

test("arming is refused below the battery floor", () => {
  const v = checkCommand("arm", {}, { ...parked, battPct: 10 }, limits);
  assert.equal(v.ok, false);
  assert.equal(v.code, "low_battery");
});

test("arming is refused with no telemetry", () => {
  assert.equal(checkCommand("arm", {}, { ...parked, link: false }, limits).code, "no_link");
});

test("takeoff above the account ceiling is refused", () => {
  const v = checkCommand("takeoff", { alt: 300 }, parked, limits);
  assert.equal(v.ok, false);
  assert.equal(v.code, "above_ceiling");
  assert.match(v.reason!, /120 m/);
});

test("takeoff at the ceiling exactly is allowed", () => {
  assert.equal(checkCommand("takeoff", { alt: 120 }, parked, limits).ok, true);
});

test("takeoff with a zero or negative altitude is refused", () => {
  assert.equal(checkCommand("takeoff", { alt: 0 }, parked, limits).code, "bad_altitude");
  assert.equal(checkCommand("takeoff", { alt: -5 }, parked, limits).code, "bad_altitude");
});

test("takeoff is refused when already flying", () => {
  assert.equal(checkCommand("takeoff", { alt: 20 }, flying, limits).code, "already_airborne");
});

/* -------------------------------------------------------------------- */
/* Goto                                                                  */
/* -------------------------------------------------------------------- */

test("goto needs a valid coordinate", () => {
  assert.equal(checkCommand("goto", {}, flying, limits).code, "bad_coordinate");
  assert.equal(checkCommand("goto", { lat: 91, lon: 0 }, flying, limits).code, "bad_coordinate");
  assert.equal(checkCommand("goto", { lat: 0, lon: 181 }, flying, limits).code, "bad_coordinate");
  assert.equal(
    checkCommand("goto", { lat: "seventeen", lon: 78 }, flying, limits).code,
    "bad_coordinate"
  );
});

test("goto is refused when the aircraft is on the ground", () => {
  const v = checkCommand("goto", { lat: 17.4, lon: 78.5 }, parked, limits);
  assert.equal(v.ok, false);
  assert.equal(v.code, "not_airborne");
});

test("goto above the ceiling is refused", () => {
  assert.equal(
    checkCommand("goto", { lat: 17.4, lon: 78.5, alt: 400 }, flying, limits).code,
    "above_ceiling"
  );
});

test("goto with a valid coordinate in flight is allowed", () => {
  assert.equal(checkCommand("goto", { lat: 17.4, lon: 78.5, alt: 50 }, flying, limits).ok, true);
});

/* -------------------------------------------------------------------- */
/* Modes                                                                 */
/* -------------------------------------------------------------------- */

/*
 * ACRO and FLIP are manual stick modes. Selecting one from a web page hands an
 * airborne aircraft to a pilot who is not holding a transmitter, so there is
 * no safe remote meaning for them and they are not offered.
 */
test("manual stick modes cannot be selected remotely", () => {
  for (const mode of ["acro", "flip", "stabilize", "drift", "sport"]) {
    const v = checkCommand("mode", { mode }, flying, limits);
    assert.equal(v.ok, false, `${mode} should be refused`);
    assert.equal(v.code, "mode_not_permitted");
  }
});

test("assisted modes are allowed", () => {
  for (const mode of ["loiter", "althold", "poshold", "guided", "auto", "rtl", "smartrtl", "land", "brake"]) {
    assert.equal(checkCommand("mode", { mode }, flying, limits).ok, true, `${mode} should be allowed`);
  }
});

/* -------------------------------------------------------------------- */
/* The commands that must never be refused                               */
/* -------------------------------------------------------------------- */

/*
 * Land, RTL, loiter and brake all reduce energy or end the flight. Refusing
 * one because a precondition looked wrong would mean refusing exactly the
 * commands an operator reaches for when something is already wrong.
 */
test("recovery commands are allowed even when everything else is failing", () => {
  const bad: AircraftState = {
    armed: true, inAir: true, link: false, ready: false, readyReason: "no autopilot",
    battPct: 3, failsafe: true,
  };
  for (const action of ["land", "rtl", "loiter", "brake", "state"]) {
    assert.equal(checkCommand(action, {}, bad, limits).ok, true, `${action} must not be refused`);
  }
});

/* -------------------------------------------------------------------- */
/* Missions and settings                                                 */
/* -------------------------------------------------------------------- */

test("starting a mission with none loaded is refused", () => {
  const v = checkCommand("mission", { op: "start" }, { ...parked, missionCount: 0 }, limits);
  assert.equal(v.code, "no_mission");
});

test("pausing a mission is always allowed", () => {
  assert.equal(checkCommand("mission", { op: "pause" }, flying, limits).ok, true);
});

test("an unknown mission operation is refused", () => {
  assert.equal(checkCommand("mission", { op: "abort" }, flying, limits).code, "bad_mission_op");
});

/*
 * Without this, the account ceiling is trivially bypassed: raise the device's
 * own limit through `set`, then take off to the new one.
 */
test("a device limit cannot be raised above the account ceiling", () => {
  assert.equal(checkCommand("set", { maxAlt: 400 }, parked, limits).code, "above_ceiling");
  assert.equal(checkCommand("set", { maxRange: 9000 }, parked, limits).code, "above_range");
  assert.equal(checkCommand("set", { maxAlt: 80 }, parked, limits).ok, true);
});

/* -------------------------------------------------------------------- */
/* Warnings                                                              */
/* -------------------------------------------------------------------- */

test("warnings agree with the refusals", () => {
  assert.deepEqual(warningsFor(null, limits), []);
  assert.deepEqual(warningsFor(parked, limits), []);

  const w = warningsFor({ ...flying, battPct: 10, failsafe: true, link: false }, limits);
  assert.ok(w.some((x) => /telemetry/i.test(x)));
  assert.ok(w.some((x) => /failsafe/i.test(x)));
  assert.ok(w.some((x) => /10%/.test(x)));
});

test("altitude is only warned about while airborne", () => {
  // A device sitting on a hill can report a stale relative altitude; warning
  // about a ceiling breach on a parked aircraft trains people to ignore it.
  assert.deepEqual(warningsFor({ ...parked, alt: 500 }, limits), []);
  assert.ok(warningsFor({ ...flying, alt: 500 }, limits).some((x) => /ceiling/i.test(x)));
});

/*
 * Bench tools, added with drone-fc 2.0.0.
 *
 * They spin a motor on an aircraft nobody is flying. The firmware refuses them
 * too, on the core that knows the arm state — these assertions cover the outer
 * interlock, which is the one that stops the command ever being published.
 */
test("a motor test is refused on an aircraft that is flying", () => {
  const v = checkCommand("motorTest", { motor: 0, throttle: 0.1 }, flying, limits);
  assert.equal(v.ok, false);
  assert.equal(v.code, "airborne");
});

test("a motor test is refused when the state is unknown", () => {
  // Unknown counts as airborne: an aircraft that is not reporting is not one
  // to start a motor on.
  const v = checkCommand("motorTest", { motor: 0, throttle: 0.1 }, null, limits);
  assert.equal(v.ok, false);
});

test("a motor test is refused while armed, even on the ground", () => {
  const v = checkCommand("motorTest", { motor: 0, throttle: 0.1 }, { ...parked, armed: true }, limits);
  assert.equal(v.ok, false);
  assert.equal(v.code, "armed");
});

test("a motor test needs a motor and a sane throttle", () => {
  assert.equal(checkCommand("motorTest", {}, parked, limits).ok, false);
  assert.equal(checkCommand("motorTest", { motor: 99 }, parked, limits).ok, false);
  // A "test" at full throttle on an unbolted bench is not a test.
  assert.equal(checkCommand("motorTest", { motor: 0, throttle: 0.9 }, parked, limits).ok, false);
  assert.equal(checkCommand("motorTest", { motor: 0, throttle: 0.1 }, parked, limits).ok, true);
});

test("turtle mode is refused on anything that might be airborne", () => {
  assert.equal(checkCommand("turtle", { on: true }, flying, limits).ok, false);
  assert.equal(checkCommand("turtle", { on: true }, null, limits).ok, false);
  assert.equal(checkCommand("turtle", { on: true }, parked, limits).ok, true);
});

test("the locator beep is allowed on the ground but not while armed", () => {
  assert.equal(checkCommand("beep", {}, parked, limits).ok, true);
  assert.equal(checkCommand("beep", {}, { ...parked, armed: true }, limits).ok, false);
});

test("stopping the bench is always allowed", () => {
  // Same reason land and brake are: it is what somebody reaches for when
  // something is already wrong.
  assert.equal(checkCommand("benchStop", {}, flying, limits).ok, true);
  assert.equal(checkCommand("benchStop", {}, null, limits).ok, true);
});
