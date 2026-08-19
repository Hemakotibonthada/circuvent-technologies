import "../test-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decideAccess,
  isDuplicate,
  resolveDirection,
  specificity,
  withinDates,
  type AccessRule,
  type Credential,
  type DecideInput,
  type Person,
} from "./decide";
import type { Schedule } from "./schedule";

/**
 * Who gets through which door.
 *
 * The cases below are the ones somebody is asked to justify afterwards: a
 * leaver whose card still works because a terminal has a stale list, two rules
 * that contradict each other, and a permission that exists but not at three in
 * the morning.
 *
 * The empty rule set gets its own test because it is the state every newly
 * installed system is in, and the two possible readings of it — everybody in,
 * or nobody in — are a working building and a building nobody can enter.
 */

const officeHours: Schedule = {
  kind: "fixed",
  windows: {
    "1": [{ in: "08:00", out: "19:00" }],
    "2": [{ in: "08:00", out: "19:00" }],
    "3": [{ in: "08:00", out: "19:00" }],
    "4": [{ in: "08:00", out: "19:00" }],
    "5": [{ in: "08:00", out: "19:00" }],
  },
  graceMinutes: null,
  minMinutes: 0,
};

const person: Person = {
  id: 7,
  name: "Asha",
  groupId: 3,
  active: true,
  validFrom: null,
  validTo: null,
};

const credential: Credential = { id: 11, personId: 7, active: true, revokedAt: null };

/** Monday 10:00 in Kolkata. */
const MONDAY_10AM = new Date("2026-08-17T04:30:00Z");
/** Monday 03:00 in Kolkata — outside office hours. */
const MONDAY_3AM = new Date("2026-08-16T21:30:00Z");

function input(over: Partial<DecideInput> = {}): DecideInput {
  return {
    person,
    credential,
    zoneId: 1,
    rules: [],
    schedules: new Map([[100, officeHours]]),
    groupAncestry: [3, 2],
    at: MONDAY_10AM,
    timeZone: "Asia/Kolkata",
    ...over,
  };
}

function rule(over: Partial<AccessRule> = {}): AccessRule {
  return {
    id: 1,
    zoneId: null,
    groupId: null,
    personId: null,
    scheduleId: null,
    allow: true,
    priority: 0,
    validFrom: null,
    validTo: null,
    ...over,
  };
}

describe("the card itself", () => {
  it("refuses a card nobody has issued", () => {
    const d = decideAccess(input({ person: null, credential: null }));
    assert.equal(d.granted, false);
    assert.equal(d.reason, "unknown-card");
  });

  it("refuses a revoked card even where a rule would allow it", () => {
    const d = decideAccess(
      input({
        credential: { ...credential, active: false, revokedAt: "2026-01-01T00:00:00Z" },
        rules: [rule({ allow: true })],
      })
    );
    assert.equal(d.granted, false);
    assert.equal(d.reason, "revoked");
  });

  it("refuses somebody who has been deactivated", () => {
    const d = decideAccess(input({ person: { ...person, active: false } }));
    assert.equal(d.reason, "inactive");
  });

  it("refuses a leaver whose terminal list is stale", () => {
    /*
     * The case this whole layer exists for. The terminal granted it, because
     * the card is on the list it was pushed last week; the server knows the
     * person left on Friday. The record must say the door opened and should
     * not have.
     */
    const d = decideAccess(input({ person: { ...person, validTo: "2026-08-14" } }));
    assert.equal(d.granted, false);
    assert.equal(d.reason, "expired");
  });

  it("refuses somebody who has not started yet", () => {
    const d = decideAccess(input({ person: { ...person, validFrom: "2026-09-01" } }));
    assert.equal(d.reason, "not-yet-valid");
  });

  it("accepts on the first and last day of validity", () => {
    for (const dates of [{ validFrom: "2026-08-17" }, { validTo: "2026-08-17" }]) {
      const d = decideAccess(input({ person: { ...person, ...dates } }));
      assert.equal(d.granted, true, JSON.stringify(dates));
    }
  });
});

describe("the rule set", () => {
  it("lets everybody through when nothing has been configured", () => {
    // The state every new installation is in. The alternative is a building
    // where nobody's card works until somebody discovers why.
    const d = decideAccess(input({ rules: [] }));
    assert.equal(d.granted, true);
    assert.equal(d.ruleId, null);
  });

  it("refuses when a deny rule covers everybody", () => {
    const d = decideAccess(input({ rules: [rule({ id: 5, allow: false })] }));
    assert.equal(d.granted, false);
    assert.equal(d.reason, "not-allowed");
    assert.equal(d.ruleId, 5, "the rule that settled it is recorded");
  });

  it("lets a named person past a rule that shuts out their group", () => {
    const d = decideAccess(
      input({
        rules: [
          rule({ id: 1, groupId: 3, allow: false }),
          rule({ id: 2, personId: 7, allow: true }),
        ],
      })
    );
    assert.equal(d.granted, true);
    assert.equal(d.ruleId, 2);
  });

  it("applies a rule written against a parent group", () => {
    // A rule on "Grade 5" has to cover "5A".
    const d = decideAccess(input({ rules: [rule({ id: 9, groupId: 2, allow: false })] }));
    assert.equal(d.granted, false);
    assert.equal(d.ruleId, 9);
  });

  it("ignores a rule for a different door", () => {
    const d = decideAccess(input({ rules: [rule({ id: 4, zoneId: 99, allow: false })] }));
    assert.equal(d.granted, true, "the server-room rule does not close the front door");
  });

  it("lets priority override specificity", () => {
    const d = decideAccess(
      input({
        rules: [
          rule({ id: 1, personId: 7, allow: true, priority: 0 }),
          rule({ id: 2, allow: false, priority: 10 }),
        ],
      })
    );
    assert.equal(d.granted, false, "a site lockdown beats an individual permission");
    assert.equal(d.ruleId, 2);
  });

  it("refuses when two equal rules contradict each other", () => {
    /*
     * Somebody will eventually write this pair. The safe reading of "allowed
     * and also not allowed" is not allowed — and it produces a complaint
     * rather than a silent hole.
     */
    const d = decideAccess(
      input({
        rules: [rule({ id: 1, allow: true }), rule({ id: 2, allow: false })],
      })
    );
    assert.equal(d.granted, false);
  });

  it("ignores a rule that has expired", () => {
    const d = decideAccess(
      input({ rules: [rule({ id: 1, allow: false, validTo: "2026-08-01" })] })
    );
    assert.equal(d.granted, true);
  });
});

describe("rules limited to a schedule", () => {
  it("allows inside the window", () => {
    const d = decideAccess(input({ rules: [rule({ id: 1, allow: true, scheduleId: 100 })] }));
    assert.equal(d.granted, true);
  });

  it("says out-of-hours rather than not-allowed at three in the morning", () => {
    /*
     * The wording matters. "Not allowed" sends somebody to argue with security
     * about their permissions; "out of hours" tells them to come back later,
     * which is the actual situation.
     */
    const d = decideAccess(
      input({ at: MONDAY_3AM, rules: [rule({ id: 1, allow: true, scheduleId: 100 })] })
    );
    assert.equal(d.granted, false);
    assert.equal(d.reason, "out-of-hours");
  });

  it("still allows when another rule covers the same person at any hour", () => {
    const d = decideAccess(
      input({
        at: MONDAY_3AM,
        rules: [
          rule({ id: 1, allow: true, scheduleId: 100 }),
          rule({ id: 2, personId: 7, allow: true }),
        ],
      })
    );
    assert.equal(d.granted, true, "the night-shift exception applies");
  });

  it("does not apply a rule whose schedule has been deleted", () => {
    const d = decideAccess(
      input({ rules: [rule({ id: 1, allow: false, scheduleId: 999 })], schedules: new Map() })
    );
    assert.equal(d.granted, true, "a dangling deny must not lock a building");
  });
});

describe("helpers", () => {
  it("scores specificity so a person beats a group beats everyone", () => {
    assert.ok(specificity(rule({ personId: 1 })) > specificity(rule({ groupId: 1 })));
    assert.ok(specificity(rule({ groupId: 1 })) > specificity(rule({})));
  });

  it("treats date ranges as inclusive and open ended", () => {
    assert.equal(withinDates("2026-08-17", null, null), true);
    assert.equal(withinDates("2026-08-17", "2026-08-17", "2026-08-17"), true);
    assert.equal(withinDates("2026-08-16", "2026-08-17", null), false);
    assert.equal(withinDates("2026-08-18", null, "2026-08-17"), false);
  });
});

describe("direction", () => {
  it("uses what the terminal is configured as", () => {
    assert.equal(resolveDirection({ terminal: "in", lastDirection: "in" }), "in");
    assert.equal(resolveDirection({ terminal: "out", lastDirection: null }), "out");
  });

  it("alternates on a single reader serving both ways", () => {
    assert.equal(resolveDirection({ terminal: "auto", lastDirection: "in" }), "out");
    assert.equal(resolveDirection({ terminal: "auto", lastDirection: "out" }), "in");
  });

  it("assumes the first scan of the day is an arrival", () => {
    // Assuming "out" would open every register with people leaving a building
    // they had not entered.
    assert.equal(resolveDirection({ terminal: "auto", lastDirection: null }), "in");
  });
});

describe("duplicate suppression", () => {
  const base = { at: new Date("2026-08-17T04:30:00Z"), deviceId: "t1", direction: "in" };

  it("has nothing to compare against on the first scan", () => {
    assert.equal(isDuplicate(null, base, 60), false);
  });

  it("suppresses the same direction on the same reader", () => {
    const next = { ...base, at: new Date(base.at.getTime() + 3000) };
    assert.equal(isDuplicate(base, next, 60), true);
  });

  it("keeps a genuine exit on the same reader", () => {
    const next = { ...base, at: new Date(base.at.getTime() + 3000), direction: "out" };
    assert.equal(isDuplicate(base, next, 60), false, "a single reader alternates");
  });

  it("suppresses a second reader a metre away", () => {
    // Walking past the in-panel and the out-panel is not a two-second shift.
    const next = { ...base, at: new Date(base.at.getTime() + 2000), deviceId: "t2", direction: "out" };
    assert.equal(isDuplicate(base, next, 60), true);
  });

  it("keeps anything outside the window", () => {
    const next = { ...base, at: new Date(base.at.getTime() + 120_000) };
    assert.equal(isDuplicate(base, next, 60), false);
  });

  it("is not confused by a punch that arrives out of order", () => {
    // Offline replay can deliver an older punch after a newer one.
    const next = { ...base, at: new Date(base.at.getTime() - 5000) };
    assert.equal(isDuplicate(base, next, 60), false);
  });
});
