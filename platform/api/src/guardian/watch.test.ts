/**
 * Safe zones and journey timers, tested where they actually break.
 *
 * Neither of these fails on the obvious path. They fail at a boundary — a
 * wearer standing at a school gate while the GPS wanders, a bus five minutes
 * late — and both failure modes end the same way: somebody turns the feature
 * off, and it stops protecting anybody.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ZONE_HYSTERESIS_M,
  describeTransition,
  evaluateZones,
  presenceFor,
  type Zone,
  type ZoneState,
} from "./geofence";
import {
  ESCALATE_AFTER_MS,
  ESCALATE_AGAIN_MS,
  JOURNEY_GRACE_MS,
  JOURNEY_NUDGE_MS,
  clampJourneyMinutes,
  escalationFor,
  journeyAction,
  shouldEscalate,
  type Journey,
} from "./watch";

/* A school in Hyderabad, 200m radius. */
const SCHOOL: Zone = {
  id: 1,
  name: "School",
  lat: 17.385,
  lng: 78.4867,
  radiusM: 200,
  notifyOnEnter: true,
  notifyOnExit: true,
};

/** Moves north by a number of metres. 1 degree of latitude is ~111.32 km. */
function north(lat: number, metres: number): number {
  return lat + metres / 111_320;
}

describe("zone presence uses a hysteresis band", () => {
  test("well inside is inside", () => {
    assert.equal(presenceFor(SCHOOL, 50, undefined), "inside");
  });

  test("well outside is outside", () => {
    assert.equal(presenceFor(SCHOOL, 400, "inside"), "outside");
  });

  test("inside the band, the previous answer stands", () => {
    /*
     * This is the whole point. A wearer sitting still at the edge, with a fix
     * wandering by thirty metres, would otherwise cross the line every ninety
     * seconds — and send "left school" and "arrived at school" until somebody
     * mutes the feature.
     */
    const justOutside = SCHOOL.radiusM + ZONE_HYSTERESIS_M / 2;
    assert.equal(presenceFor(SCHOOL, justOutside, "inside"), "inside");
    assert.equal(presenceFor(SCHOOL, justOutside, "outside"), "outside");
  });

  test("an unknown previous state at the edge is treated as outside", () => {
    const justOutside = SCHOOL.radiusM + ZONE_HYSTERESIS_M / 2;
    assert.equal(presenceFor(SCHOOL, justOutside, undefined), "outside");
  });
});

describe("evaluateZones", () => {
  test("says nothing the first time it sees a wearer", () => {
    /*
     * Creating a zone must not announce "arrived at school" at whatever hour
     * it happened to be created. The wearer did not arrive; we started looking.
     */
    const state: ZoneState = {};
    const out = evaluateZones(SCHOOL.lat, SCHOOL.lng, [SCHOOL], state);
    assert.equal(out.length, 0);
    assert.equal(state[SCHOOL.id], "inside");
  });

  test("reports leaving, once", () => {
    const state: ZoneState = {};
    evaluateZones(SCHOOL.lat, SCHOOL.lng, [SCHOOL], state); // prime: inside

    const away = north(SCHOOL.lat, 400);
    const first = evaluateZones(away, SCHOOL.lng, [SCHOOL], state);
    assert.equal(first.length, 1);
    assert.equal(first[0].kind, "left");

    // Still away. Must not keep announcing it for the rest of the day.
    const second = evaluateZones(away, SCHOOL.lng, [SCHOOL], state);
    assert.equal(second.length, 0);
  });

  test("reports arriving after having left", () => {
    const state: ZoneState = {};
    evaluateZones(north(SCHOOL.lat, 400), SCHOOL.lng, [SCHOOL], state); // prime: outside
    const out = evaluateZones(SCHOOL.lat, SCHOOL.lng, [SCHOOL], state);
    assert.equal(out.length, 1);
    assert.equal(out[0].kind, "entered");
  });

  test("does not flap across the boundary", () => {
    const state: ZoneState = {};
    evaluateZones(SCHOOL.lat, SCHOOL.lng, [SCHOOL], state); // inside

    /*
     * A wearer standing at the gate, GPS wandering ±30m across the radius.
     * Twenty samples must produce no alerts at all.
     */
    let alerts = 0;
    for (let i = 0; i < 20; i++) {
      const jitter = SCHOOL.radiusM + (i % 2 === 0 ? -30 : 30);
      alerts += evaluateZones(north(SCHOOL.lat, jitter), SCHOOL.lng, [SCHOOL], state).length;
    }
    assert.equal(alerts, 0);
  });

  test("says nothing at all without a usable fix", () => {
    /*
     * A device that goes indoors and loses GPS has not gone anywhere. Telling
     * a parent their child left school because the sky went away is the
     * fastest way to make this untrustworthy.
     */
    const state: ZoneState = {};
    evaluateZones(SCHOOL.lat, SCHOOL.lng, [SCHOOL], state);
    assert.equal(evaluateZones(0, 0, [SCHOOL], state).length, 0);
    // And the recorded presence is untouched, not flipped to outside.
    assert.equal(state[SCHOOL.id], "inside");
  });

  test("honours the per-zone notification switches", () => {
    const exitOnly: Zone = { ...SCHOOL, notifyOnEnter: false };
    const state: ZoneState = {};
    evaluateZones(north(SCHOOL.lat, 400), SCHOOL.lng, [exitOnly], state); // outside
    assert.equal(evaluateZones(SCHOOL.lat, SCHOOL.lng, [exitOnly], state).length, 0);
  });

  test("ignores a zone with a broken position", () => {
    const broken: Zone = { ...SCHOOL, id: 2, lat: 0, lng: 0 };
    const state: ZoneState = {};
    assert.equal(evaluateZones(SCHOOL.lat, SCHOOL.lng, [broken], state).length, 0);
  });

  test("wording is a sentence a person can read", () => {
    const state: ZoneState = {};
    evaluateZones(SCHOOL.lat, SCHOOL.lng, [SCHOOL], state);
    const [t] = evaluateZones(north(SCHOOL.lat, 400), SCHOOL.lng, [SCHOOL], state);
    assert.equal(describeTransition(t, "Asha"), "Asha left School.");
  });
});

describe("journey mode", () => {
  const j = (over: Partial<Journey> = {}): Journey => ({
    startedAt: 1_000_000,
    dueAt: 1_000_000 + 20 * 60_000,
    status: "running",
    ...over,
  });

  test("does nothing before the deadline", () => {
    assert.equal(journeyAction(j(), j().dueAt - 60_000, false).kind, "none");
  });

  test("does nothing in the first minute of lateness", () => {
    // People are late. A deadline is a guess made before setting off.
    assert.equal(journeyAction(j(), j().dueAt + 30_000, false).kind, "none");
  });

  test("nudges the wearer before alarming anybody else", () => {
    /*
     * Almost every overdue journey is somebody who forgot to press "I'm home".
     * Nudging turns those into a tap and costs the genuine cases nothing.
     */
    const a = journeyAction(j(), j().dueAt + JOURNEY_NUDGE_MS + 1000, false);
    assert.equal(a.kind, "nudge");
  });

  test("does not nudge twice", () => {
    assert.equal(journeyAction(j(), j().dueAt + JOURNEY_NUDGE_MS + 1000, true).kind, "none");
  });

  test("raises the alarm once the grace is gone", () => {
    const a = journeyAction(j(), j().dueAt + JOURNEY_GRACE_MS + 1, true);
    assert.equal(a.kind, "raise");
  });

  test("raises even if the nudge was never sent", () => {
    // A device that was offline for the nudge must still be alarmed about.
    assert.equal(journeyAction(j(), j().dueAt + JOURNEY_GRACE_MS + 1, false).kind, "raise");
  });

  test("a finished journey is left alone", () => {
    const late = j().dueAt + 60 * 60_000;
    assert.equal(journeyAction(j({ status: "arrived" }), late, false).kind, "none");
    assert.equal(journeyAction(j({ status: "cancelled" }), late, false).kind, "none");
  });

  test("clamps a nonsense duration rather than arming it", () => {
    assert.equal(clampJourneyMinutes(0), 2);
    assert.equal(clampJourneyMinutes(99999), 8 * 60);
    assert.equal(clampJourneyMinutes(Number.NaN), 20);
  });
});

describe("escalation", () => {
  const t0 = 5_000_000;

  test("waits before widening", () => {
    assert.equal(escalationFor(t0, null, t0 + 60_000), "none");
  });

  test("widens once nobody has acknowledged", () => {
    assert.equal(escalationFor(t0, null, t0 + ESCALATE_AFTER_MS), "widen");
  });

  test("goes to the authorities if still nothing", () => {
    assert.equal(escalationFor(t0, null, t0 + ESCALATE_AGAIN_MS), "authorities");
  });

  test("an acknowledgement stops the ladder dead", () => {
    /*
     * Somebody saying "I have this" is the only signal that matters.
     * Continuing past it is how a neighbour ends up with three police cars.
     */
    assert.equal(escalationFor(t0, t0 + 30_000, t0 + ESCALATE_AGAIN_MS + 60_000), "none");
  });

  test("a step is not repeated on every sweep", () => {
    // The sweep runs on a timer; without this an incident ten minutes old
    // re-notifies everybody once a minute.
    assert.equal(shouldEscalate("widen", []), true);
    assert.equal(shouldEscalate("widen", ["widen"]), false);
    assert.equal(shouldEscalate("authorities", ["widen"]), true);
    assert.equal(shouldEscalate("none", []), false);
  });
});
