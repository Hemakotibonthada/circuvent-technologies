// Must come first: site.ts reaches config.ts through db.ts, and config
// process.exit(1)s on an incomplete environment before any assertion runs.
import "../test-env";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../db";
import { DEFAULT_SETTINGS, getSettings, isFirstSighting, occupancy } from "./site";

/**
 * Site policy.
 *
 * The queries are stubbed rather than run against Postgres — the suite has no
 * database — so what is pinned here is the *arithmetic and the defaults*, which
 * is where the decisions live. Whether a site reports itself full, and whether
 * a customer who never asked for capacity management gets it anyway, are both
 * decided in this file rather than in SQL.
 */

type QueryStub = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const realQuery = pool.query.bind(pool);

function stub(fn: QueryStub): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = fn;
}

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = realQuery;
});

/** Answers the occupancy count with `inside`, and settings with `settings`. */
function stubSite(inside: number, settings: Record<string, unknown> | null): void {
  stub(async (sql: string) => {
    if (sql.includes("FROM plate_visits")) return { rows: [{ n: String(inside) }] };
    if (sql.includes("FROM anpr_settings")) return { rows: settings ? [settings] : [] };
    return { rows: [] };
  });
}

describe("settings defaults", () => {
  it("manages nothing until asked", async () => {
    /*
     * The whole point of the defaults. A customer who bought a camera to see
     * who came to their house must not discover capacity management by having
     * the console announce their driveway is full — every limit is null and
     * every optional alert is off.
     */
    stubSite(0, null);
    const s = await getSettings(1);
    assert.equal(s.capacity, null);
    assert.equal(s.overstayHours, null);
    assert.equal(s.alertUnknown, false);
    assert.deepEqual(s, DEFAULT_SETTINGS);
  });
});

describe("occupancy", () => {
  it("reports a count with no capacity fields when capacity is unmanaged", async () => {
    // null, not 0 and not Infinity: "not managed" is a distinct state, and a
    // free-space count of 0 would render as a full site.
    stubSite(7, null);
    const o = await occupancy(1);
    assert.equal(o.inside, 7);
    assert.equal(o.capacity, null);
    assert.equal(o.free, null);
    assert.equal(o.percent, null);
    assert.equal(o.full, false);
  });

  it("computes free spaces and percentage against a capacity", async () => {
    stubSite(6, { capacity: 10, overstay_hours: null, alert_unknown: false, alert_full: true });
    const o = await occupancy(1);
    assert.equal(o.free, 4);
    assert.equal(o.percent, 60);
    assert.equal(o.full, false);
  });

  it("is full at capacity and stays full beyond it", async () => {
    // Over-capacity is reachable: entry is never refused, and a missed exit
    // inflates the count. It must read as full rather than as negative space.
    stubSite(10, { capacity: 10, overstay_hours: null, alert_unknown: false, alert_full: true });
    assert.equal((await occupancy(1)).full, true);

    stubSite(13, { capacity: 10, overstay_hours: null, alert_unknown: false, alert_full: true });
    const over = await occupancy(1);
    assert.equal(over.full, true);
    assert.equal(over.free, 0, "free spaces must clamp at zero, never go negative");
    assert.equal(over.percent, 100, "percentage must clamp at 100 for a progress bar");
  });

  it("does not divide by a capacity of zero", async () => {
    stubSite(3, { capacity: 0, overstay_hours: null, alert_unknown: false, alert_full: true });
    const o = await occupancy(1);
    assert.equal(o.percent, null);
    assert.ok(Number.isFinite(o.free ?? 0));
  });
});

describe("isFirstSighting", () => {
  it("excludes the read that has just been inserted", async () => {
    /*
     * The read is written before this is asked, so without the exclusion every
     * vehicle would look like a returning one and the unknown-vehicle alert
     * would never fire even once.
     */
    let captured: unknown[] = [];
    stub(async (_sql: string, params?: unknown[]) => {
      captured = params ?? [];
      return { rows: [{ n: "0" }] };
    });
    assert.equal(await isFirstSighting(1, "KA01AB1234", 99), true);
    assert.deepEqual(captured, [1, "KA01AB1234", 99]);
  });

  it("reports a returning vehicle when earlier reads exist", async () => {
    stub(async () => ({ rows: [{ n: "4" }] }));
    assert.equal(await isFirstSighting(1, "KA01AB1234", 99), false);
  });
});
