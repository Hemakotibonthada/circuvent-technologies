/**
 * A shipped feature must declare a capability.
 *
 * `build-info.ts` says it plainly: "Adding an entry is part of shipping the
 * feature." It also records that ANPR and drone were added late, so a console
 * newer than its server had to infer support from a 404 and it cost an
 * afternoon.
 *
 * Then FaceDoor and households shipped without entries, the same way, for the
 * same reason — a hand-maintained list depends on somebody remembering, and
 * the comment warning about it is not a mechanism.
 *
 * This is the mechanism. It maps a router that exists in the source to the
 * capability that promises it works, and fails when one has no other.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CAPABILITIES } from "./build-info";

const SRC = join(__dirname);

/**
 * Feature → the file that would not exist if the feature were absent.
 *
 * Keyed on a file rather than on a route string because a route can be
 * commented out or renamed while still matching a grep, and the point is to
 * detect a build that genuinely lacks the behaviour.
 */
const PROMISES: Array<{ capability: string; provenBy: string; feature: string }> = [
  { capability: "faceRecognition", provenBy: "face/routes.ts", feature: "FaceDoor enrolment and matching" },
  { capability: "householdSharing", provenBy: "home/routes.ts", feature: "household members and invitations" },
  { capability: "anpr", provenBy: "anpr/index.ts", feature: "number-plate recognition" },
  { capability: "droneTelemetry", provenBy: "drone/index.ts", feature: "drone telemetry and flight log" },
  { capability: "developerApi", provenBy: "routes/v1.ts", feature: "the public developer API" },
  { capability: "deviceCommands", provenBy: "routes/devices.ts", feature: "device commands" },
  { capability: "frameRelay", provenBy: "ws.ts", feature: "camera frame relay" },
];

for (const { capability, provenBy, feature } of PROMISES) {
  test(`${capability} is declared, because ${feature} is in this build`, () => {
    assert.ok(
      existsSync(join(SRC, provenBy)),
      `${provenBy} is gone — if ${feature} was removed, drop "${capability}" from CAPABILITIES so clients stop expecting it`
    );
    assert.ok(
      (CAPABILITIES as readonly string[]).includes(capability),
      `${feature} ships in this build but does not declare "${capability}". A client newer than this server then has no way to ask whether it is supported, and has to guess from a 404 that could mean a dozen things.`
    );
  });
}

test("the capability list has no duplicates", () => {
  const seen = new Set(CAPABILITIES);
  assert.equal(seen.size, CAPABILITIES.length);
});

test("householdSharing is declared, and its absence is not merely a missing feature", () => {
  /*
   * Stated separately because this one is not like the others. A build without
   * household support does not reject the x-circuvent-home header — it ignores
   * it, and answers for the caller's own home while the client believes it is
   * showing somebody else's. That is a screen confidently displaying the wrong
   * house, which is worse than an error.
   *
   * So a client must treat the absence of this capability as "refuse to switch
   * homes", not as "hide the switcher".
   */
  assert.ok((CAPABILITIES as readonly string[]).includes("householdSharing"));
  assert.ok(existsSync(join(SRC, "home", "membership.ts")));
});
