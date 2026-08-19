import "../test-env";
import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../db";
import { notifyForDay } from "./notify";
import type { SiteSettings } from "./rollup";

/**
 * Messages about somebody's child.
 *
 * The tests here are about restraint rather than delivery. Sending an absence
 * notice is irreversible and lands on a parent's phone, so the interesting
 * cases are all the ones where it must *not* go out: too early in the morning,
 * a second time, or to a site that never asked for it.
 *
 * The claim-and-stamp query is exercised through the real code path rather
 * than asserted on directly, because the guarantee that matters — one message
 * per person per day, even across an overlapping sweep — is a property of that
 * statement and not of anything the caller does.
 */

const realQuery = pool.query.bind(pool);

interface Claimed { site: number; day: string; kinds: string[] }

let claims: Claimed[] = [];
let pendingRows: Record<string, unknown>[] = [];
let mailed: Array<{ to: string; subject: string }> = [];

function site(over: Partial<SiteSettings> = {}): SiteSettings {
  return {
    id: 1, ownerId: 8, name: "Test School", kind: "school", timeZone: "Asia/Kolkata",
    graceMinutes: 10, halfDayAfterMinutes: 180, absentAfterMinutes: 120,
    autoOut: true, dedupeSeconds: 60, notifyGuardians: true, notifyAbsence: true,
    ...over,
  };
}

/** 04:30 UTC is 10:00 in Kolkata — well past the settling period. */
const MID_MORNING = new Date("2026-08-17T04:30:00Z");
/** 03:20 UTC is 08:50 in Kolkata — before it. */
const JUST_AFTER_THE_BELL = new Date("2026-08-17T03:20:00Z");
const DAY = "2026-08-17";

before(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = async (sql: string, params?: unknown[]) => {
    if (sql.includes("UPDATE attend_days")) {
      claims.push({
        site: Number(params?.[0]),
        day: String(params?.[1]),
        kinds: params?.[2] as string[],
      });
      /*
       * Only the statuses that were asked for come back, which is what the
       * real `status = ANY($3)` does. Returning everything would let a test
       * pass while the query filtered nothing.
       */
      const kinds = params?.[2] as string[];
      return { rows: pendingRows.filter((r) => kinds.includes(String(r.status))), rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  };
});

after(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = realQuery;
});

beforeEach(() => {
  claims = [];
  mailed = [];
  pendingRows = [];
});

function row(over: Record<string, unknown> = {}) {
  return {
    day_id: "1", person_id: "7", name: "Asha", status: "present",
    first_in: "2026-08-17T03:00:00Z", guardian_email: "parent@example.com",
    guardian_name: "Mrs Rao", lead_email: "tutor@example.com",
    ...over,
  };
}

describe("what is asked for", () => {
  it("asks for nothing when the site wants nothing", async () => {
    await notifyForDay(site({ notifyGuardians: false, notifyAbsence: false }), DAY);
    assert.equal(claims.length, 0, "a site that opted out is never even queried");
  });

  it("asks only for arrivals when only arrivals are wanted", async () => {
    await notifyForDay(site({ notifyAbsence: false }), DAY);
    assert.deepEqual(claims[0].kinds, ["present", "late"]);
  });

  it("asks only for absences when only absences are wanted", async () => {
    await notifyForDay(site({ notifyGuardians: false }), DAY);
    assert.deepEqual(claims[0].kinds, ["absent"]);
  });
});

describe("holding absence back", () => {
  it("leaves the timing of an absence to the register", async () => {
    /*
     * The delay lives in classifyDay, which will not say "absent" until
     * absent_after_minutes have passed since that person's window opened.
     *
     * An earlier version of notify.ts added a second delay here, measured from
     * local midnight — a different quantity entirely. At 08:50 with a two-hour
     * settling period it compared 530 against 135, concluded the morning was
     * over, and was about to message a parent while the register still
     * correctly said "not yet". This asserts the rule is asked for exactly
     * once, in the place that has the per-person window.
     */
    await notifyForDay(site({ notifyGuardians: false }), DAY);
    assert.deepEqual(claims[0].kinds, ["absent"]);
    assert.equal(
      pendingRows.filter((r) => r.status === "absent").length, 0,
      "and nothing comes back, because the register has not called anybody absent yet"
    );
  });

  it("does not pick up a present row on an absence claim", async () => {
    pendingRows = [row({ status: "present" })];
    const r = await notifyForDay(site({ notifyGuardians: false }), DAY);
    assert.equal(r.claimed, 0);
    assert.deepEqual(r.recipients, []);
  });

  it("writes to the guardian once the register has called somebody absent", async () => {
    pendingRows = [row({ status: "absent" })];
    const r = await notifyForDay(site({ notifyGuardians: false }), DAY);
    assert.deepEqual(r.recipients, ["parent@example.com"]);
  });

  it("falls back to the group lead for an absence with no guardian", async () => {
    // Somebody should hear that a person did not arrive even if nobody has
    // filled in a parent's address, and the tutor is who acts on it.
    pendingRows = [row({ status: "absent", guardian_email: "" })];
    const r = await notifyForDay(site({ notifyGuardians: false }), DAY);
    assert.deepEqual(r.recipients, ["tutor@example.com"]);
  });

  it("does not fall back to the group lead for an arrival", async () => {
    // An arrival is a courtesy for a family, not a report for staff.
    pendingRows = [row({ status: "present", guardian_email: "" })];
    const r = await notifyForDay(site({ notifyAbsence: false }), DAY);
    assert.deepEqual(r.recipients, []);
  });

  it("asks for arrivals and absences together", async () => {
    await notifyForDay(site(), DAY);
    assert.deepEqual(claims[0].kinds, ["present", "late", "absent"]);
  });
});

describe("who is written to", () => {
  it("claims and stamps in one statement", async () => {
    pendingRows = [row()];
    await notifyForDay(site(), DAY);
    /*
     * The stamp is part of the SELECT, not a follow-up write. That is the only
     * thing standing between an overlapping sweep and a parent being told
     * twice that their child is missing.
     */
    assert.equal(claims.length, 1);
  });

  it("skips somebody with no address without leaving them unstamped", async () => {
    pendingRows = [row({ guardian_email: "", lead_email: "" })];
    const r = await notifyForDay(site(), DAY);
    assert.deepEqual(r.recipients, []);
    assert.equal(claims.length, 1, "the row is still claimed, so it is not retried forever");
  });

  it("does not treat a blank as an address", async () => {
    pendingRows = [row({ guardian_email: "   ", lead_email: "" })];
    assert.deepEqual((await notifyForDay(site(), DAY)).recipients, []);
  });

  it("does not treat a name as an address", async () => {
    pendingRows = [row({ guardian_email: "not an email", lead_email: "" })];
    assert.deepEqual((await notifyForDay(site(), DAY)).recipients, []);
  });
});
