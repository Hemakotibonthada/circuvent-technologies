import "../test-env";
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { autoDecide, coversDay, type AccessRequestPerson } from "./access-requests";

/**
 * Who gets into the building without a person deciding.
 *
 * The whole value of auto-approval is that it is *narrow*. An implementation
 * that approved everything would look identical on a good day and would have
 * removed the only control the feature exists to provide — so these assertions
 * are mostly about what stays pending.
 */

const person = (over: Partial<AccessRequestPerson> = {}): AccessRequestPerson => ({
  id: 1,
  active: true,
  validFrom: null,
  validTo: null,
  role: "employee",
  ...over,
});

const DAY = "2026-08-20";

describe("auto-approving an office access request", () => {
  test("approves an active employee inside their dates", () => {
    const d = autoDecide(person(), DAY);
    assert.equal(d.status, "approved");
    assert.equal(d.decidedBy, "auto");
  });

  /*
   * The record has to say a rule decided this, not a person. After an incident
   * "who approved this" is the question, and "auto" is a different and honest
   * answer from a name.
   */
  test("records that the rule decided, not a person", () => {
    assert.equal(autoDecide(person(), DAY).decidedBy, "auto");
    assert.notEqual(autoDecide(person(), DAY).decidedBy, "");
  });

  test("leaves an inactive person pending", () => {
    const d = autoDecide(person({ active: false }), DAY);
    assert.equal(d.status, "pending");
    assert.equal(d.decidedBy, "");
  });

  test("leaves a leaver pending", () => {
    assert.equal(autoDecide(person({ validTo: "2026-08-19" }), DAY).status, "pending");
  });

  test("leaves a starter who has not started pending", () => {
    assert.equal(autoDecide(person({ validFrom: "2026-08-21" }), DAY).status, "pending");
  });

  test("includes the first and last valid day", () => {
    assert.equal(autoDecide(person({ validFrom: DAY }), DAY).status, "approved");
    assert.equal(autoDecide(person({ validTo: DAY }), DAY).status, "approved");
  });

  /*
   * Visitors and contractors are the reason this feature exists. Approving
   * them automatically would leave it doing nothing for the only cases where
   * somebody genuinely needs to know who is in the building.
   */
  test("never auto-approves a visitor or a contractor", () => {
    assert.equal(autoDecide(person({ role: "visitor" }), DAY).status, "pending");
    assert.equal(autoDecide(person({ role: "contractor" }), DAY).status, "pending");
  });

  test("gives a reason a person can act on", () => {
    assert.match(autoDecide(person({ active: false }), DAY).reason, /not active/i);
    assert.match(autoDecide(person({ role: "visitor" }), DAY).reason, /visitor/i);
  });
});

describe("whether an approved request covers today", () => {
  const req = (over: Partial<{ status: string; validFrom: string | null; validTo: string | null }> = {}) => ({
    status: "approved",
    validFrom: null as string | null,
    validTo: null as string | null,
    ...over,
  });

  test("an open-ended approval covers any day", () => {
    assert.equal(coversDay(req(), DAY), true);
  });

  /*
   * The bug this prevents: a contractor approved for one day holds an approved
   * row for ever. Reading only the status would let them in a month later.
   */
  test("an approval for a past day does not cover today", () => {
    assert.equal(coversDay(req({ validTo: "2026-08-19" }), DAY), false);
  });

  test("an approval for a future day does not cover today", () => {
    assert.equal(coversDay(req({ validFrom: "2026-08-21" }), DAY), false);
  });

  test("anything not approved covers nothing", () => {
    for (const status of ["pending", "rejected", "revoked"]) {
      assert.equal(coversDay(req({ status }), DAY), false);
    }
  });
});
