// Must come first: visits.ts reaches config.ts through db.ts, and config
// process.exit(1)s on an incomplete environment — before any assertion runs.
import "../test-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { laneDirection, resolveDirection } from "./visits";

/**
 * The pure half of visit pairing.
 *
 * `applyRead` itself needs Postgres, so the state machine it drives is proved
 * here through the two decisions that determine every outcome: what lane a
 * device published, and which way a vehicle was therefore travelling. Get
 * either wrong and every in/out time, dwell figure and occupancy count derived
 * from them is wrong too.
 */

describe("laneDirection", () => {
  it("accepts the values the firmware publishes", () => {
    assert.equal(laneDirection("in"), "in");
    assert.equal(laneDirection("out"), "out");
    assert.equal(laneDirection("both"), "both");
  });

  it("accepts the words an installer or a third-party camera would send", () => {
    assert.equal(laneDirection("entry"), "in");
    assert.equal(laneDirection("Entrance"), "in");
    assert.equal(laneDirection("EXIT"), "out");
  });

  it("falls back to a shared lane for anything it does not recognise", () => {
    /*
     * "both" is the safe fallback, not "in".
     *
     * A shared lane is resolved by alternating, so an unknown value degrades to
     * a working — if slightly weaker — inference. Defaulting to "in" would log
     * every departure as another arrival, so a car that came once and left
     * would read as two entries and never appear to leave, and the occupancy
     * count would climb forever.
     */
    assert.equal(laneDirection("sideways"), "both");
    assert.equal(laneDirection(""), "both");
    assert.equal(laneDirection(null), "both");
    assert.equal(laneDirection(undefined), "both");
    assert.equal(laneDirection(42), "both");
  });
});

describe("resolveDirection", () => {
  it("trusts a dedicated lane over the vehicle's state", () => {
    // An entry lane records an arrival even if our ledger wrongly believes the
    // car is already inside — the camera observed it, the ledger inferred it,
    // and an observation beats an inference.
    assert.equal(resolveDirection("in", false), "in");
    assert.equal(resolveDirection("in", true), "in");
    assert.equal(resolveDirection("out", false), "out");
    assert.equal(resolveDirection("out", true), "out");
  });

  it("alternates on a shared lane", () => {
    assert.equal(resolveDirection("both", false), "in");
    assert.equal(resolveDirection("both", true), "out");
  });

  it("produces a coherent in/out/in sequence on a shared lane", () => {
    // Walks the state machine the way a real gate does, proving a single
    // camera still yields alternating movements rather than drifting.
    let inside = false;
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const d = resolveDirection("both", inside);
      seen.push(d);
      inside = d === "in";
    }
    assert.deepEqual(seen, ["in", "out", "in", "out", "in"]);
    assert.equal(inside, true);
  });

  it("keeps a dedicated entry lane from ever emitting an exit", () => {
    // Two entry cameras on a site must never manufacture a departure between
    // them; only the exit lane may close a visit.
    let inside = false;
    for (let i = 0; i < 4; i++) {
      assert.equal(resolveDirection("in", inside), "in");
      inside = true;
    }
  });
});
