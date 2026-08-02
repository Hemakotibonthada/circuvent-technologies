import "./test-env";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pool } from "./db";
import * as sessions from "./sessions";

/**
 * Session revocation tests.
 *
 * Run with:  npm test
 *
 * No database is involved. `./test-env` is imported first for its side effect
 * so `config.ts` does not exit on an incomplete environment, and `pool.query`
 * is replaced with a stub — `pg` opens no connection until a query runs, so
 * nothing here talks to Postgres.
 *
 * These cover the decisions that stop a stolen token from opening a door, so
 * they are written as security assertions rather than for coverage.
 */

type Row = { token_epoch: string; blocked: boolean };

let rows: Row[] = [];
let queries = 0;

function stubPool(next: Row[]): void {
  rows = next;
  queries = 0;
  (pool as unknown as { query: unknown }).query = async () => {
    queries += 1;
    return { rows, rowCount: rows.length };
  };
}

beforeEach(() => {
  sessions.clearSessionCache();
  stubPool([{ token_epoch: "0", blocked: false }]);
});

describe("checkSession", () => {
  test("accepts a token minted at the current epoch", async () => {
    stubPool([{ token_epoch: "3", blocked: false }]);
    assert.equal(await sessions.checkSession(1, 3), "ok");
  });

  test("rejects a token older than the current epoch", async () => {
    // This is the whole point: the account revoked, the token must die.
    stubPool([{ token_epoch: "4", blocked: false }]);
    assert.equal(await sessions.checkSession(1, 3), "revoked");
  });

  test("rejects every token belonging to a disabled account", async () => {
    stubPool([{ token_epoch: "0", blocked: true }]);
    assert.equal(await sessions.checkSession(1, 0), "blocked");
  });

  test("rejects a token for an account that no longer exists", async () => {
    // Deleting a user previously left their token working everywhere except
    // device commands.
    stubPool([]);
    assert.equal(await sessions.checkSession(99, 0), "unknown-user");
  });

  test("accepts a legacy token that carries no epoch claim", async () => {
    // Tokens minted before this feature decode to 0, and the column defaults to
    // 0, so shipping the change must not sign the whole user base out.
    stubPool([{ token_epoch: "0", blocked: false }]);
    assert.equal(await sessions.checkSession(1, 0), "ok");
  });

  test("kills legacy tokens as soon as the account revokes once", async () => {
    stubPool([{ token_epoch: "1", blocked: false }]);
    assert.equal(await sessions.checkSession(1, 0), "revoked");
  });

  test("does not lock out a token from a future epoch", async () => {
    // Should not occur, but treating it as revoked would sign a user out
    // moments after they signed in if a replica read a stale row.
    stubPool([{ token_epoch: "2", blocked: false }]);
    assert.equal(await sessions.checkSession(1, 5), "ok");
  });

  test("blocked takes precedence over a matching epoch", async () => {
    stubPool([{ token_epoch: "7", blocked: true }]);
    assert.equal(await sessions.checkSession(1, 7), "blocked");
  });
});

describe("caching", () => {
  test("reads the row once for repeated checks", async () => {
    stubPool([{ token_epoch: "0", blocked: false }]);
    await sessions.checkSession(1, 0);
    await sessions.checkSession(1, 0);
    await sessions.checkSession(1, 0);
    assert.equal(queries, 1, "requireAuth runs on every request; this must not be a query each time");
  });

  test("invalidateUser forces a fresh read", async () => {
    stubPool([{ token_epoch: "0", blocked: false }]);
    await sessions.checkSession(1, 0);
    sessions.invalidateUser(1);
    await sessions.checkSession(1, 0);
    assert.equal(queries, 2);
  });

  test("caches per account, not globally", async () => {
    stubPool([{ token_epoch: "0", blocked: false }]);
    await sessions.checkSession(1, 0);
    await sessions.checkSession(2, 0);
    assert.equal(queries, 2);
  });

  test("never caches a missing account as valid", async () => {
    stubPool([]);
    await sessions.checkSession(1, 0);
    await sessions.checkSession(1, 0);
    assert.equal(queries, 2, "a deleted account must be re-checked, not remembered");
  });
});

describe("revokeAllSessions", () => {
  test("returns the bumped epoch so a replacement token is minted correctly", async () => {
    // Minting the new token with the old epoch would invalidate it instantly.
    stubPool([{ token_epoch: "5", blocked: false }]);
    assert.equal(await sessions.revokeAllSessions(1), 5);
  });

  test("drops the cached row so the next check sees the new epoch", async () => {
    stubPool([{ token_epoch: "0", blocked: false }]);
    await sessions.checkSession(1, 0);
    const before = queries;
    await sessions.revokeAllSessions(1);
    await sessions.checkSession(1, 0);
    assert.ok(queries > before + 1, "the check after a revoke must not come from cache");
  });

  test("survives a database that returns nothing", async () => {
    stubPool([]);
    assert.equal(await sessions.revokeAllSessions(1), 0);
  });
});

describe("currentEpoch", () => {
  test("reports the account's epoch for stamping into a new token", async () => {
    stubPool([{ token_epoch: "9", blocked: false }]);
    assert.equal(await sessions.currentEpoch(1), 9);
  });

  test("reports 0 for an unknown account rather than throwing", async () => {
    stubPool([]);
    assert.equal(await sessions.currentEpoch(1), 0);
  });
});
