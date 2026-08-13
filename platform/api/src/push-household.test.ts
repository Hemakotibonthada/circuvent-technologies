import "./test-env";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pool } from "./db";
import { sendPushToHome, sendPushToUser } from "./push";

/**
 * Who hears about what happens in a shared home.
 *
 * Every alert in the system used to go to one account. In a household that is
 * the same as no alert half the time: the owner may be asleep, abroad, or the
 * one person in the family who left their phone upstairs.
 *
 * The audience is chosen per alert because the two mistakes are not
 * symmetric. Telling a houseguest the smoke alarm has gone off is at worst
 * startling. Telling a cleaner the house is empty and a door is unlocked is a
 * different thing entirely.
 */

/** Roles present in the fake household. */
let household: Record<number, string> = {};
/** Push tokens by user id. */
let tokens: Record<number, string[]> = {};
/** Recipients of the last send. */
let sentTo: string[] = [];

const HOME = 100;

function stubPool(): void {
  (pool as unknown as { query: unknown }).query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes("FROM home_members")) {
      const wanted = params[1] as string[];
      const rows = Object.entries(household)
        .filter(([, role]) => wanted.includes(role))
        .map(([id]) => ({ member_id: id }));
      return { rows, rowCount: rows.length };
    }
    if (sql.includes("FROM push_tokens")) {
      const ids = params[0] as number[];
      const rows = ids.flatMap((id) => (tokens[id] ?? []).map((token) => ({ token })));
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  };
}

/** Captures the Expo call without making one. */
function stubFetch(): void {
  (globalThis as { fetch: unknown }).fetch = async (_url: string, init: { body: string }) => {
    const messages = JSON.parse(init.body) as { to: string }[];
    sentTo = messages.map((m) => m.to);
    return { json: async () => ({ data: [] }) } as unknown as Response;
  };
}

beforeEach(() => {
  stubPool();
  stubFetch();
  sentTo = [];
  household = { 1: "adult", 2: "limited", 3: "guest" };
  tokens = {
    [HOME]: ["ExponentPushToken[owner]"],
    1: ["ExponentPushToken[adult]"],
    2: ["ExponentPushToken[teen]"],
    3: ["ExponentPushToken[guest]"],
  };
});

const msg = { title: "t", body: "b" };

describe("household notifications", () => {
  test("a panic button reaches everybody in the building", async () => {
    // Including the houseguest, who may be the only person in it.
    await sendPushToHome(HOME, msg, "everyone");
    assert.deepEqual(sentTo.sort(), [
      "ExponentPushToken[adult]",
      "ExponentPushToken[guest]",
      "ExponentPushToken[owner]",
      "ExponentPushToken[teen]",
    ]);
  });

  test("a guest is not told the house is unlocked", async () => {
    await sendPushToHome(HOME, msg, "adults");
    assert.ok(!sentTo.includes("ExponentPushToken[guest]"), "a guest must not get security alerts");
    assert.ok(!sentTo.includes("ExponentPushToken[teen]"), "limited access is not adult access");
    assert.deepEqual(sentTo.sort(), ["ExponentPushToken[adult]", "ExponentPushToken[owner]"]);
  });

  test("everyday alerts reach the people who live here", async () => {
    await sendPushToHome(HOME, msg, "residents");
    assert.deepEqual(sentTo.sort(), [
      "ExponentPushToken[adult]",
      "ExponentPushToken[owner]",
      "ExponentPushToken[teen]",
    ]);
  });

  test("the owner is always told, whatever the audience", async () => {
    // They are the account. Every one of these alerts was addressed to them
    // before households existed, and none should stop arriving.
    for (const audience of ["everyone", "residents", "adults"] as const) {
      sentTo = [];
      await sendPushToHome(HOME, msg, audience);
      assert.ok(sentTo.includes("ExponentPushToken[owner]"), `owner missed a ${audience} alert`);
    }
  });

  test("a home with nobody else in it behaves exactly as it did before", async () => {
    household = {};
    await sendPushToHome(HOME, msg, "residents");
    assert.deepEqual(sentTo, ["ExponentPushToken[owner]"]);
  });

  test("a hub with no home_members table still notifies the owner", async () => {
    // The control plane ships separately, so an un-migrated hub must degrade
    // to the old behaviour rather than silently sending nothing.
    (pool as unknown as { query: unknown }).query = async (sql: string, params: unknown[] = []) => {
      if (sql.includes("FROM home_members")) throw new Error('relation "home_members" does not exist');
      if (sql.includes("FROM push_tokens")) {
        const ids = params[0] as number[];
        const rows = ids.flatMap((id) => (tokens[id] ?? []).map((token) => ({ token })));
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    };
    await sendPushToHome(HOME, msg, "everyone");
    assert.deepEqual(sentTo, ["ExponentPushToken[owner]"]);
  });

  test("sendPushToUser still means one account", async () => {
    // Account-level messages must not fan out to a household.
    await sendPushToUser(HOME, msg);
    assert.deepEqual(sentTo, ["ExponentPushToken[owner]"]);
  });

  test("a household with no registered phones sends nothing at all", async () => {
    tokens = {};
    await sendPushToHome(HOME, msg, "everyone");
    assert.deepEqual(sentTo, []);
  });
});
