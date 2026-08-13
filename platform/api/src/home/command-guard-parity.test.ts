/**
 * Every path that can move a physical thing must consult the household guard.
 *
 * `refuseCommand` being correct is worth nothing if a route forgets to call
 * it. Ownership is not the check any more: a member's uid is rewritten to the
 * home, so `ownsDevice` passes for everybody in the household — including a
 * guest aiming an unlock at the front door.
 *
 * This reads the sources rather than the running app because the alternative
 * is standing up Postgres and a broker to prove a call exists. It is a
 * coarse test and it is the one that would have caught the gap.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..");

/**
 * Files that publish to a device on behalf of a signed-in person.
 *
 * Deliberately not derived by scanning for `publishCommand`, because two
 * callers legitimately have no requester to check and a scan would either fail
 * on them forever or teach everybody to add exclusions without thinking:
 *
 *   automations.ts — a rule firing on a timer. There is no person on the other
 *   end; the household's own configured intent is the authority, and only an
 *   adult can create one in the first place.
 *
 *   admin.ts — platform staff, not a household. It has its own, stricter gate,
 *   and is mounted behind `asActor` so a member can never reach it as somebody
 *   else.
 */
const GUARDED = [
  "routes/devices.ts",
  "routes/scenes.ts",
  "routes/v1.ts",
  "routes/drone.ts",
  "routes/gate.ts",
];

for (const file of GUARDED) {
  test(`${file} consults the household guard before publishing`, () => {
    const src = readFileSync(join(SRC, file), "utf8");
    assert.match(
      src,
      /refuseCommand\(/,
      `${file} publishes commands without calling refuseCommand — a guest of this home could send them`
    );
  });
}

test("the face router is closed to anybody but an adult", () => {
  // Enrolling a face is cutting a key to the house, and it does not expire.
  const src = readFileSync(join(SRC, "face", "routes.ts"), "utf8");
  assert.match(src, /requireCapability\("manage-devices"\)/);
});

test("command audit records the person, not the home", () => {
  // Writing the home's id here would state that the owner opened a door that
  // somebody else opened — an audit trail that is confidently wrong.
  for (const file of ["routes/devices.ts", "routes/scenes.ts", "routes/v1.ts"]) {
    const src = readFileSync(join(SRC, file), "utf8");
    /* Match through the argument array, not to the first bracket — `VALUES
       ($1, $2, $3)` closes one and the id we care about comes after it. */
    const inserts = src.match(/INSERT INTO commands[\s\S]{0,400}?\]\)/g) ?? [];
    assert.ok(inserts.length > 0, `${file} no longer writes a command audit row — update this test`);
    for (const stmt of inserts) {
      assert.match(
        stmt,
        /actorId\(/,
        `${file} writes a command audit row using the home id instead of actorId(req)`
      );
    }
  }
});
