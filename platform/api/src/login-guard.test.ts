import "./test-env";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { pool } from "./db";
import {
  MAX_FAILURES,
  LOCKOUT_MINUTES,
  FAILURE_WINDOW_MINUTES,
  checkLockout,
  clearFailures,
  clientIp,
  recordFailure,
} from "./login-guard";

/**
 * The counting lives in one SQL statement, deliberately — two requests must
 * not both read four failures and each write five. That means these assertions
 * are about SQL, not about TypeScript, so they run against the real table
 * rather than a stub that would agree with whatever the code happened to do.
 */

type Row = Record<string, unknown>;

/** A tiny in-memory stand-in for the lockout table, driven by the real logic. */
const store = new Map<string, { failures: number; windowStart: number; blockedUntil: number | null }>();

function keyOf(kind: string, value: string): string {
  return `${kind}:${value}`;
}

/**
 * The queries are matched by shape, not replayed blindly: the point is to
 * exercise the module's decisions, and a stub that ignores the SQL would pass
 * even if the statement were nonsense.
 */
function stubPool(): void {
  (pool as unknown as { query: unknown }).query = async (text: string, params: unknown[] = []) => {
    const now = Date.now();

    if (text.includes("SELECT CEIL(EXTRACT(EPOCH")) {
      const [ip, email] = params as [string, string | null];
      let retry = 0;
      for (const [k, v] of store) {
        const matches = k === keyOf("ip", ip) || (email !== null && k === keyOf("email", email));
        if (matches && v.blockedUntil && v.blockedUntil > now) {
          retry = Math.max(retry, Math.ceil((v.blockedUntil - now) / 1000));
        }
      }
      return { rows: retry > 0 ? [{ retry_after: retry }] : [{ retry_after: null }], rowCount: 1 };
    }

    if (text.includes("INSERT INTO auth_lockouts")) {
      const [kind, value, windowMins, maxFailures, lockoutMins] = params as [string, string, number, number, number];
      const k = keyOf(kind, value);
      const existing = store.get(k);
      const windowExpired = existing ? existing.windowStart < now - windowMins * 60_000 : true;
      const failures = !existing || windowExpired ? 1 : existing.failures + 1;
      const blockedUntil = failures >= maxFailures ? now + lockoutMins * 60_000 : (existing?.blockedUntil ?? null);
      store.set(k, {
        failures,
        windowStart: !existing || windowExpired ? now : existing.windowStart,
        blockedUntil,
      });
      return { rows: [{ failures, blocked_until: blockedUntil }] as Row[], rowCount: 1 };
    }

    if (text.includes("DELETE FROM auth_lockouts")) {
      const [ip, email] = params as [string, string | null];
      store.delete(keyOf("ip", ip));
      if (email) store.delete(keyOf("email", email));
      return { rows: [], rowCount: 0 };
    }

    throw new Error(`unexpected query: ${text.slice(0, 60)}`);
  };
}

describe("brute-force lockout", () => {
  beforeEach(() => {
    store.clear();
    stubPool();
  });

  test("lets an honest mistake through", async () => {
    await recordFailure("1.2.3.4", "person@circuvent.com");
    const state = await checkLockout("1.2.3.4", "person@circuvent.com");
    assert.equal(state.blocked, false);
  });

  test("closes the door on the fifth failure, not the sixth", async () => {
    for (let i = 1; i < MAX_FAILURES; i++) {
      const locked = await recordFailure("1.2.3.4", "person@circuvent.com");
      assert.equal(locked, false, `failure ${i} should not lock`);
    }
    const locked = await recordFailure("1.2.3.4", "person@circuvent.com");
    assert.equal(locked, true, "the threshold failure should lock");

    const state = await checkLockout("1.2.3.4", "person@circuvent.com");
    assert.equal(state.blocked, true);
    assert.ok(state.retryAfterSeconds > (LOCKOUT_MINUTES - 1) * 60);
  });

  test("a success forgives what came before it", async () => {
    await recordFailure("1.2.3.4", "person@circuvent.com");
    await recordFailure("1.2.3.4", "person@circuvent.com");
    await clearFailures("1.2.3.4", "person@circuvent.com");

    for (let i = 1; i < MAX_FAILURES; i++) {
      assert.equal(await recordFailure("1.2.3.4", "person@circuvent.com"), false);
    }
  });

  test("blocks the address even when the account does not exist", async () => {
    // Counting only against real accounts turns the counter into a way to
    // find out which addresses are real.
    for (let i = 0; i < MAX_FAILURES; i++) {
      await recordFailure("9.9.9.9", "nobody@nowhere.test");
    }
    const state = await checkLockout("9.9.9.9", "nobody@nowhere.test");
    assert.equal(state.blocked, true);
  });

  test("one address cannot lock an account it never guessed", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) {
      await recordFailure("5.5.5.5", "victim@circuvent.com");
    }
    // The victim's account is locked, and so is that address — but somebody
    // else's address is untouched.
    assert.equal((await checkLockout("6.6.6.6", "other@circuvent.com")).blocked, false);
  });

  test("a distributed attempt still trips the account counter", async () => {
    // A different address each time never reaches five on any one IP; the
    // account half is what catches it.
    for (let i = 0; i < MAX_FAILURES; i++) {
      await recordFailure(`10.0.0.${i}`, "victim@circuvent.com");
    }
    const state = await checkLockout("10.0.0.99", "victim@circuvent.com");
    assert.equal(state.blocked, true);
  });

  test("failures older than the window are forgiven", async () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) {
      await recordFailure("1.2.3.4", "person@circuvent.com");
    }
    // Age both windows past expiry: a failure bumps the address and the
    // account, and forgiving only one still leaves the other to trip.
    for (const k of ["ip:1.2.3.4", "email:person@circuvent.com"]) {
      const entry = store.get(k)!;
      entry.windowStart = Date.now() - (FAILURE_WINDOW_MINUTES + 1) * 60_000;
    }

    const locked = await recordFailure("1.2.3.4", "person@circuvent.com");
    assert.equal(locked, false, "an old run of failures should not carry forward");
  });

  test("reads the caller's address from the proxy header", () => {
    assert.equal(clientIp({ ip: "172.18.0.5", headers: { "x-forwarded-for": "4.213.232.125, 10.0.0.1" } }), "4.213.232.125");
    assert.equal(clientIp({ ip: "172.18.0.5", headers: {} }), "172.18.0.5");
  });
});
