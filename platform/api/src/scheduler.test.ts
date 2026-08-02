import "./test-env";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pool } from "./db";
import { claimTick, tickKey, istClock } from "./automations";

/**
 * Scheduler tick claiming.
 *
 * The bug this replaces was not only a scaling concern. De-duplication lived in
 * a closure variable, so a process restart mid-minute reset it and every
 * automation scheduled for that minute ran a second time — pumps and lights
 * switching again because a deploy happened at the wrong moment.
 */

let claimed: Set<string>;
let inserts: number;

function stubPool(): void {
  (pool as unknown as { query: unknown }).query = async (sql: string, params: unknown[] = []) => {
    const q = String(sql).replace(/\s+/g, " ").trim();
    if (q.startsWith("INSERT INTO scheduler_ticks")) {
      inserts += 1;
      const key = String(params[0]);
      // Mirrors ON CONFLICT DO NOTHING against a primary key.
      if (claimed.has(key)) return { rows: [], rowCount: 0 };
      claimed.add(key);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unstubbed query: ${q.slice(0, 80)}`);
  };
}

beforeEach(() => {
  claimed = new Set();
  inserts = 0;
  stubPool();
});

describe("tickKey", () => {
  test("includes the date, so the same clock time on two days is distinct", () => {
    const a = tickKey(new Date("2026-08-02T02:00:00Z"));
    const b = tickKey(new Date("2026-08-03T02:00:00Z"));
    assert.notEqual(a, b, "keying on HH:MM alone would let today's 07:30 block tomorrow's");
  });

  test("is stable across the same minute", () => {
    const a = tickKey(new Date("2026-08-02T02:00:10Z"));
    const b = tickKey(new Date("2026-08-02T02:00:55Z"));
    assert.equal(a, b);
  });

  test("changes when the minute changes", () => {
    const a = tickKey(new Date("2026-08-02T02:00:59Z"));
    const b = tickKey(new Date("2026-08-02T02:01:00Z"));
    assert.notEqual(a, b);
  });

  test("is expressed in IST, matching how schedules are stored", () => {
    // 02:00 UTC is 07:30 IST (UTC+5:30).
    assert.equal(istClock(new Date("2026-08-02T02:00:00Z")), "07:30");
    assert.match(tickKey(new Date("2026-08-02T02:00:00Z")), /T07:30$/);
  });

  test("uses the IST date, not the UTC date, near midnight", () => {
    // 19:00 UTC on the 2nd is 00:30 IST on the 3rd.
    assert.match(tickKey(new Date("2026-08-02T19:00:00Z")), /^2026-08-03T00:30$/);
  });
});

describe("claimTick", () => {
  test("the first caller wins the minute", async () => {
    assert.equal(await claimTick("2026-08-02T07:30"), true);
  });

  test("a second caller for the same minute loses", async () => {
    await claimTick("2026-08-02T07:30");
    assert.equal(await claimTick("2026-08-02T07:30"), false);
  });

  test("exactly one of several racing replicas wins", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => claimTick("2026-08-02T07:30")),
    );
    assert.equal(results.filter(Boolean).length, 1, "N replicas must not fire a schedule N times");
    assert.equal(inserts, 5, "every replica should have attempted the claim");
  });

  test("a restart cannot re-run a minute already claimed", async () => {
    // The claim is in the database, so it survives the process that made it.
    await claimTick("2026-08-02T07:30");
    stubPool(); // simulates a fresh process: new closures, same database
    assert.equal(await claimTick("2026-08-02T07:30"), false);
  });

  test("the next minute is claimable", async () => {
    await claimTick("2026-08-02T07:30");
    assert.equal(await claimTick("2026-08-02T07:31"), true);
  });

  test("the same clock time tomorrow is claimable", async () => {
    await claimTick("2026-08-02T07:30");
    assert.equal(await claimTick("2026-08-03T07:30"), true);
  });
});
