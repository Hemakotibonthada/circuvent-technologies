import "./test-env";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pool } from "./db";
import { withDeviceLock, _deviceLockDepth } from "./device-lock";

/**
 * Per-device serialisation of inbound messages.
 *
 * Every state message runs read-modify-write against the devices row: read the
 * previous state, write the new one, then diff the two to decide which alerts
 * and automations to fire. Each await yields, and messages are dispatched with
 * `void handleMessage(...)`, so two messages from the same device interleave
 * freely.
 *
 * Two things go wrong when they do, and both are silent:
 *
 *   - both readers see the same "previous" state, so an edge from false to true
 *     is detected twice and the alert fires twice — a duplicate SOS push, or an
 *     automation that runs its actions a second time;
 *   - the writes can land out of order, leaving the older payload stored as the
 *     device's current state until the next message happens to correct it.
 *
 * Serialising per device fixes both without serialising the whole fleet, which
 * would put every device behind the slowest one.
 */

beforeEach(() => {
  (pool as unknown as { query: unknown }).query = async () => ({ rows: [], rowCount: 0 });
});

/** A read-modify-write that yields in the middle, like the real one does. */
function makeRacyWorker(store: { state: number; seenPrev: number[] }) {
  return async (next: number): Promise<void> => {
    const prev = store.state; // "SELECT"
    await new Promise((r) => setTimeout(r, 5)); // the await that lets others in
    store.seenPrev.push(prev);
    store.state = next; // "UPDATE"
    await new Promise((r) => setTimeout(r, 1));
  };
}

describe("withDeviceLock", () => {
  test("serialises work for one device", async () => {
    const store = { state: 0, seenPrev: [] as number[] };
    const work = makeRacyWorker(store);

    await Promise.all([
      withDeviceLock("dev-1", () => work(1)),
      withDeviceLock("dev-1", () => work(2)),
      withDeviceLock("dev-1", () => work(3)),
    ]);

    // Each run must observe the previous one's write. Without the lock all
    // three would see 0 and the last write would be whichever finished first.
    assert.deepEqual(store.seenPrev, [0, 1, 2]);
    assert.equal(store.state, 3);
  });

  test("without the lock the same work interleaves — the bug this prevents", async () => {
    const store = { state: 0, seenPrev: [] as number[] };
    const work = makeRacyWorker(store);

    await Promise.all([work(1), work(2), work(3)]);

    // Every reader saw the same stale "previous" value. In the real handler
    // that is the false->true edge being detected three times over.
    assert.deepEqual(store.seenPrev, [0, 0, 0]);
  });

  test("does not serialise different devices", async () => {
    // A slow or chatty device must not hold up the rest of the fleet.
    const order: string[] = [];
    const slow = withDeviceLock("slow", async () => {
      await new Promise((r) => setTimeout(r, 60));
      order.push("slow");
    });
    const fast = withDeviceLock("fast", async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push("fast");
    });
    await Promise.all([slow, fast]);
    assert.deepEqual(order, ["fast", "slow"]);
  });

  test("a thrown error does not wedge the device forever", async () => {
    // If a failure left the chain rejected, every later message for that
    // device would be dropped and the device would silently go dark.
    await assert.rejects(withDeviceLock("dev-2", async () => { throw new Error("boom"); }));

    let ran = false;
    await withDeviceLock("dev-2", async () => { ran = true; });
    assert.equal(ran, true, "the device was wedged by an earlier failure");
  });

  test("the result is passed back to the caller", async () => {
    assert.equal(await withDeviceLock("dev-3", async () => 42), 42);
  });

  test("finished devices do not leak entries", async () => {
    // The map is keyed by device id. Never releasing means a slow memory leak
    // proportional to how many devices have ever spoken to this process.
    const before = _deviceLockDepth();
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => withDeviceLock(`leaky-${i}`, async () => {}))
    );
    // Give the microtask that clears the entry a chance to run.
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(_deviceLockDepth(), before, "device locks were not released");
  });

  test("keeps ordering under a burst", async () => {
    const store = { state: 0, seenPrev: [] as number[] };
    const work = makeRacyWorker(store);
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => withDeviceLock("burst", () => work(i + 1)))
    );
    assert.deepEqual(store.seenPrev, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.equal(store.state, 12);
  });
});
