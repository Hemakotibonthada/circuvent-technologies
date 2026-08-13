import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  matchFace,
  distance,
  isDescriptor,
  profileUsable,
  sampleIsUseful,
  sampleBelongsToProfile,
  DEFAULT_THRESHOLD,
  MIN_MARGIN,
  type FaceProfile,
  type FaceSample,
} from "./match";

/**
 * These tests exist because a physical door opens on the output of this file.
 *
 * They are weighted towards the ways a wrong answer becomes an unlocked door —
 * a stranger admitted, a revoked profile still working, two siblings confused
 * for each other — rather than towards the happy path, which is one line.
 */

/** A descriptor at a known offset, so distances are exact and readable. */
const desc = (offset: number, dims = 128): number[] =>
  Array.from({ length: dims }, (_, i) => (i === 0 ? offset : 0));

/* Distance between desc(a) and desc(b) is |a-b|, which makes every threshold
   assertion below arithmetic rather than guesswork. */

const profile = (over: Partial<FaceProfile> = {}): FaceProfile => ({
  id: 1,
  name: "Asha",
  enabled: true,
  ...over,
});

const sample = (profileId: number, offset: number, id = offset * 1000): FaceSample => ({
  id,
  profileId,
  descriptor: desc(offset),
});

describe("isDescriptor", () => {
  it("accepts the embedding lengths the recogniser produces", () => {
    assert.equal(isDescriptor(desc(0, 128)), true);
    assert.equal(isDescriptor(desc(0, 512)), true);
  });

  it("rejects anything else, rather than comparing what it can", () => {
    assert.equal(isDescriptor(desc(0, 64)), false);
    assert.equal(isDescriptor([]), false);
    assert.equal(isDescriptor("128 numbers"), false);
    assert.equal(isDescriptor(null), false);
  });

  it("rejects a descriptor containing NaN or Infinity", () => {
    const bad = desc(0);
    bad[5] = NaN;
    assert.equal(isDescriptor(bad), false);

    const worse = desc(0);
    worse[5] = Infinity;
    assert.equal(isDescriptor(worse), false);
  });
});

describe("distance", () => {
  it("measures Euclidean distance", () => {
    assert.equal(distance(desc(0), desc(0.5)), 0.5);
  });

  it("refuses to compare descriptors from different models", () => {
    /*
     * A 128-d and a 512-d embedding come from different networks. Comparing
     * the overlap would return a number that looks like a distance, means
     * nothing, and could fall under the threshold.
     */
    assert.equal(distance(desc(0, 128), desc(0, 512)), Infinity);
  });
});

describe("matchFace — recognising the right person", () => {
  it("recognises an enrolled face", () => {
    const r = matchFace(desc(0.1), [profile()], [sample(1, 0)]);

    assert.equal(r.outcome, "match");
    assert.equal(r.grant, true);
    assert.equal(r.profile?.name, "Asha");
  });

  it("uses the closest of a person's samples, not the first or the average", () => {
    /*
     * The whole point of multiple samples: one is with glasses, one without.
     * A probe near either is still that person.
     */
    const samples = [sample(1, 0.0, 1), sample(1, 0.9, 2)];
    const r = matchFace(desc(0.95), [profile()], samples);

    assert.equal(r.outcome, "match");
    assert.ok(r.distance !== null && r.distance < 0.1);
  });

  it("refuses a face nobody is enrolled as", () => {
    const r = matchFace(desc(5), [profile()], [sample(1, 0)]);

    assert.equal(r.outcome, "no-match");
    assert.equal(r.grant, false);
    assert.equal(r.profile, null);
  });

  it("refuses when nobody is enrolled at all", () => {
    const r = matchFace(desc(0), [], []);

    assert.equal(r.outcome, "no-match");
    assert.equal(r.grant, false);
    assert.match(r.reason, /Nobody is enrolled/);
  });

  it("refuses a malformed descriptor rather than throwing at the door", () => {
    const r = matchFace([1, 2, 3], [profile()], [sample(1, 0)]);

    assert.equal(r.outcome, "no-match");
    assert.equal(r.grant, false);
  });

  it("ignores stored samples that are malformed", () => {
    const corrupt: FaceSample = { id: 9, profileId: 1, descriptor: [1, 2, 3] };
    const r = matchFace(desc(0.1), [profile()], [corrupt, sample(1, 0)]);

    assert.equal(r.outcome, "match");
  });

  it("ignores samples whose profile no longer exists", () => {
    // A deleted profile whose samples were left behind must not open a door.
    const r = matchFace(desc(0), [], [sample(99, 0)]);

    assert.equal(r.outcome, "no-match");
    assert.equal(r.grant, false);
  });
});

describe("matchFace — refusing safely", () => {
  it("will not be talked into a looser threshold", () => {
    /*
     * A configuration mistake that loosens the threshold is a configuration
     * mistake that admits strangers, so the ceiling is not negotiable.
     */
    const r = matchFace(desc(2), [profile()], [sample(1, 0)], { threshold: 5 });

    assert.equal(r.outcome, "no-match");
    assert.equal(r.grant, false);
  });

  it("accepts a stricter threshold", () => {
    const r = matchFace(desc(0.4), [profile()], [sample(1, 0)], { threshold: 0.3 });

    assert.equal(r.outcome, "no-match");
  });

  it("refuses when two people are too close to tell apart", () => {
    // Siblings. Both inside the threshold, separated by less than the margin.
    const profiles = [profile({ id: 1, name: "Asha" }), profile({ id: 2, name: "Anya" })];
    const samples = [sample(1, 0, 1), sample(2, 0.02, 2)];
    const r = matchFace(desc(0.01), profiles, samples);

    assert.equal(r.outcome, "unsure");
    assert.equal(r.grant, false);
    assert.match(r.reason, /Asha/);
    assert.match(r.reason, /Anya/);
  });

  it("does not call it unsure when the runner-up is outside the threshold", () => {
    // Only one candidate is plausible, so there is nothing to confuse it with.
    const profiles = [profile({ id: 1 }), profile({ id: 2, name: "Stranger" })];
    const samples = [sample(1, 0, 1), sample(2, 3, 2)];
    const r = matchFace(desc(0.05), profiles, samples);

    assert.equal(r.outcome, "match");
  });

  it("reports ambiguity before eligibility", () => {
    /*
     * Saying "Anya's access expired" would assert an identity that was never
     * established. If we cannot tell who it is, that is the answer.
     */
    const profiles = [
      profile({ id: 1, name: "Asha" }),
      profile({ id: 2, name: "Anya", enabled: false }),
    ];
    const samples = [sample(1, 0.02, 1), sample(2, 0, 2)];
    const r = matchFace(desc(0.01), profiles, samples);

    assert.equal(r.outcome, "unsure");
  });

  it("keeps the margin at the documented floor", () => {
    assert.ok(MIN_MARGIN > 0);
    assert.ok(DEFAULT_THRESHOLD <= 0.6);
  });
});

describe("matchFace — eligibility", () => {
  it("refuses a disabled profile even on a perfect match", () => {
    const r = matchFace(desc(0), [profile({ enabled: false })], [sample(1, 0)]);

    assert.equal(r.outcome, "disabled");
    assert.equal(r.grant, false);
    // The person is still named, so the event log says who was turned away.
    assert.equal(r.profile?.name, "Asha");
  });

  it("refuses an expired profile", () => {
    const r = matchFace(
      desc(0),
      [profile({ expiresAt: "2026-01-01T00:00:00.000Z" })],
      [sample(1, 0)],
      { now: new Date("2026-08-13T10:00:00.000Z") }
    );

    assert.equal(r.outcome, "expired");
    assert.equal(r.grant, false);
  });

  it("still admits a profile whose expiry has not arrived", () => {
    const r = matchFace(
      desc(0),
      [profile({ expiresAt: "2027-01-01T00:00:00.000Z" })],
      [sample(1, 0)],
      { now: new Date("2026-08-13T10:00:00.000Z") }
    );

    assert.equal(r.outcome, "match");
  });
});

describe("profileUsable — time windows", () => {
  const at = (h: number, m = 0) => new Date(2026, 7, 13, h, m);

  it("admits inside a daytime window", () => {
    const p = profile({ allowFrom: "09:00", allowTo: "17:00" });
    assert.equal(profileUsable(p, at(12)).ok, true);
  });

  it("refuses outside it, and says when they are allowed", () => {
    const p = profile({ allowFrom: "09:00", allowTo: "17:00" });
    const r = profileUsable(p, at(21));

    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.outcome, "out-of-hours");
      assert.match(r.reason, /09:00/);
    }
  });

  it("handles a window that wraps midnight", () => {
    /*
     * "22:00 to 06:00" is how a night shift is written. Treated as a normal
     * range it is empty, and the person is locked out for exactly the hours
     * they were given.
     */
    const p = profile({ allowFrom: "22:00", allowTo: "06:00" });

    assert.equal(profileUsable(p, at(23)).ok, true);
    assert.equal(profileUsable(p, at(2)).ok, true);
    assert.equal(profileUsable(p, at(12)).ok, false);
  });

  it("treats a missing or malformed window as no restriction", () => {
    // A typo in a time must not lock the household out of its own door.
    assert.equal(profileUsable(profile(), at(3)).ok, true);
    assert.equal(profileUsable(profile({ allowFrom: "nine", allowTo: "17:00" }), at(3)).ok, true);
  });
});

describe("sampleIsUseful", () => {
  it("accepts a genuinely different angle", () => {
    assert.equal(sampleIsUseful(desc(0.3), [desc(0)]).ok, true);
  });

  it("rejects a near-duplicate frame", () => {
    /*
     * Enrolment grabs several frames in a row and a still face barely moves.
     * Storing them all slows every match and adds no coverage.
     */
    const r = sampleIsUseful(desc(0.01), [desc(0)]);

    assert.equal(r.ok, false);
    assert.match(r.reason, /different angle/);
  });

  it("accepts the first sample, which has nothing to duplicate", () => {
    assert.equal(sampleIsUseful(desc(0), []).ok, true);
  });

  it("rejects a malformed descriptor", () => {
    assert.equal(sampleIsUseful([1, 2], []).ok, false);
  });
});

describe("sampleBelongsToProfile", () => {
  it("accepts the first sample of a new profile", () => {
    assert.equal(sampleBelongsToProfile(desc(0), []).ok, true);
  });

  it("accepts another sample of the same person", () => {
    assert.equal(sampleBelongsToProfile(desc(0.3), [desc(0)]).ok, true);
  });

  it("refuses a different person's face on an existing profile", () => {
    /*
     * The quiet attack this prevents: add your own face to the owner's profile
     * and the door opens for you under their name, with nothing downstream to
     * notice.
     */
    const r = sampleBelongsToProfile(desc(4), [desc(0)]);

    assert.equal(r.ok, false);
    assert.match(r.reason, /new profile/);
  });

  it("is satisfied by any one existing sample, not all of them", () => {
    // Glasses on and glasses off are far apart; a third sample need only match
    // one of them.
    assert.equal(sampleBelongsToProfile(desc(0.9), [desc(0), desc(1.0)]).ok, true);
  });
});
