/**
 * Account-level routers must run as the person, not as the home.
 *
 * `requireAuth` rewrites `user.uid` to the home being acted in so that device
 * queries scope correctly. On anything about the account that rewrite is an
 * account takeover: a household member could change the owner's password, read
 * the owner's signed-in devices and their IP addresses, or sign the owner out
 * of every device they have.
 *
 * `asActor` undoes the rewrite for a whole router. This test exists because
 * that protection is otherwise a thing somebody has to remember when they add
 * the next account route, and the cost of forgetting once is somebody else's
 * house.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { asActor } from "./actor";
import type { AuthedRequest } from "../auth";

/**
 * Routers whose routes are about the account rather than the home.
 *
 * Adding a router here is how you say "this is about the person". Removing one
 * is how you say it is not — and should take an argument, not a moment.
 */
const ACCOUNT_LEVEL = ["/auth", "/developer", "/account", "/admin"];

test("every account-level router is mounted behind asActor", () => {
  const src = readFileSync(join(__dirname, "..", "index.ts"), "utf8");

  for (const mount of ACCOUNT_LEVEL) {
    const line = src
      .split("\n")
      .find((l) => l.includes(`app.use("${mount}"`));
    assert.ok(line, `${mount} is no longer mounted — update this list deliberately`);
    assert.match(
      line!,
      /asActor/,
      `${mount} is mounted without asActor: a household member acting in this home would act as its owner on it`
    );
  }
});

test("asActor restores the real identity", () => {
  const req = {
    user: { uid: 100, email: "member@example.com" },
    home: { homeId: 100, actorId: 7, role: "adult" as const },
  } as unknown as AuthedRequest;

  let called = false;
  asActor(req, {} as never, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(req.user!.uid, 7, "uid must be the person, not the home");
  assert.equal(req.home!.homeId, 7, "the home must collapse to their own");
  assert.equal(req.home!.role, "owner", "in their own account they are the owner");
});

test("asActor leaves an owner's own request untouched", () => {
  const req = {
    user: { uid: 42, email: "owner@example.com" },
    home: { homeId: 42, actorId: 42, role: "owner" as const },
  } as unknown as AuthedRequest;

  asActor(req, {} as never, () => {});
  assert.equal(req.user!.uid, 42);
  assert.equal(req.home!.role, "owner");
});

test("asActor copes with no membership at all", () => {
  // Requests that never went through the home resolution — device callbacks,
  // anything mounted before it — must pass straight through rather than throw.
  const req = { user: { uid: 5, email: "a@b.c" } } as unknown as AuthedRequest;
  let called = false;
  asActor(req, {} as never, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(req.user!.uid, 5);
});
