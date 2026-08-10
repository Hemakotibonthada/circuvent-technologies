// Must come first: ownership.ts reaches config.ts through db.ts, and config
// process.exit(1)s on an incomplete environment before any assertion runs.
import "./test-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { invalidateOwnership, onOwnershipChange } from "./ownership";

/**
 * The ownership-change fan-out.
 *
 * `ownership.ts` states the contract in a comment — every path that mutates
 * `devices.owner_id` must invalidate — but a comment cannot enforce that a
 * *second* cache keyed by the same device is cleared as well. This pins it.
 */
describe("ownership change hooks", () => {
  it("notifies registered device caches when ownership moves", () => {
    /*
     * The ANPR pipeline caches owner + lane per device for 30 s. If an
     * ownership change does not reach that cache, a device unclaimed and
     * re-claimed by another account inside the window files the new owner's
     * number-plate reads into the previous owner's log — a cross-account leak
     * that surfaces no error anywhere.
     */
    const seen: string[] = [];
    onOwnershipChange((id) => seen.push(id));
    invalidateOwnership("cam-a1b2c3");
    assert.deepEqual(seen, ["cam-a1b2c3"]);
  });

  it("does not let a failing hook break the ownership change", () => {
    // Revoking access must succeed even when a downstream cache throws;
    // otherwise one broken subsystem keeps a revoked owner in command of a
    // device, which is the exact failure invalidation exists to prevent.
    onOwnershipChange(() => {
      throw new Error("cache exploded");
    });
    const seen: string[] = [];
    onOwnershipChange((id) => seen.push(id));
    assert.doesNotThrow(() => invalidateOwnership("cam-zzz"));
    assert.ok(seen.includes("cam-zzz"));
  });
});
