/**
 * Every mutating route is behind a capability, or exempt on purpose.
 *
 * The capabilities were defined, tested, and then wired to almost nothing —
 * `manage-automations` in particular existed for a while and was enforced
 * nowhere, so a `limited` member of a household could rewrite the rules that
 * run the house while being refused a light switch. That is the same defect as
 * a button that does nothing, except it fails in the direction where nobody
 * notices until it matters.
 *
 * This walks the route files and insists every router that a household member
 * can reach either applies a guard or is listed below with a reason.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES = join(__dirname, "..", "routes");

/** Routers a household member reaches, and the capability their writes need. */
const GUARDED: Record<string, string> = {
  "automations.ts": "manage-automations",
  "scenes.ts": "manage-automations",
  "rooms.ts": "manage-devices",
  "devices.ts": "manage-devices",
};

/**
 * Routers deliberately not guarded this way, and why.
 *
 * Each of these is a decision rather than an oversight, which is the whole
 * reason the list is written down instead of the check being skipped.
 */
const EXEMPT: Record<string, string> = {
  // Platform staff, not a household. Has its own admin gate, and is mounted
  // behind asActor so a member can never reach it as somebody else.
  "admin.ts": "platform staff",
  // Account-level; mounted behind asActor.
  "account.ts": "account level",
  "auth.ts": "account level",
  "developer.ts": "account level",
  // Keyed by an API token with its own scopes, and its command and scene paths
  // consult the household guard per action.
  "v1.ts": "api key scopes",
  // Every mutating route consults refuseCommand directly — the aircraft check
  // has to see the command, not just the method.
  "drone.ts": "per-command guard",
  // Redemption is unauthenticated by design (the code is the credential), and
  // minting a pass consults refuseCommand for the gate it opens.
  "gate.ts": "per-command guard",
  // Devices post their own captures; the human-facing writes are settings on a
  // camera the caller owns.
  "anpr.ts": "device callbacks",
  // Unauthenticated device self-provisioning.
  "provisioning.ts": "device callbacks",
  // Voice assistants, with their own token and a narrower device map.
  "smarthome.ts": "voice token",
  "oauth.ts": "oauth flow",
  // Marking one's own notifications read.
  "events.ts": "own notifications",
  "health.ts": "no writes",
  "energy.ts": "no writes",
  "console.ts": "no writes",
};

for (const [file, capability] of Object.entries(GUARDED)) {
  test(`${file} guards its writes with ${capability}`, () => {
    const src = readFileSync(join(ROUTES, file), "utf8");
    assert.match(
      src,
      new RegExp(`requireCapability\\("${capability}"`),
      `${file} has mutating routes a household member can reach with no capability check`
    );
  });
}

test("every route file is either guarded or exempt for a stated reason", () => {
  // A new router landing with neither should fail here rather than ship open.
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  const files = readdirSync(ROUTES).filter((f) => f.endsWith(".ts") && !f.includes(".test."));
  for (const f of files) {
    assert.ok(
      f in GUARDED || f in EXEMPT,
      `routes/${f} is new: either guard its writes with requireCapability, or add it to EXEMPT with the reason`
    );
  }
});

test("the exemptions inside guarded routers are the ones intended", () => {
  // Running a scene and sending a command are `control`, not management, and
  // are judged per action inside their handlers. Anything else slipping into
  // an except list would be a hole with no other check behind it.
  const scenes = readFileSync(join(ROUTES, "scenes.ts"), "utf8");
  assert.match(scenes, /except: \[\/\\\/activate\$\/\]/);

  const devices = readFileSync(join(ROUTES, "devices.ts"), "utf8");
  assert.match(devices, /except: \[\/\\\/command\$\/\]/);

  // ...and both of those handlers must still consult the per-command guard.
  assert.match(scenes, /refuseCommand\(/);
  assert.match(devices, /refuseCommand\(/);
});
