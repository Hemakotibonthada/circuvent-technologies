/**
 * The capability middleware, exercised rather than read.
 *
 * The exempt list is a regex against `req.path`, which inside a mounted router
 * is relative to the mount point. That is exactly the sort of thing that is
 * subtly wrong in a way source-reading cannot catch: an exemption that never
 * matches silently locks a limited member out of their own light switch, and
 * one that matches too much opens a management route to a guest.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { requireCapability } from "./actor";
import type { AuthedRequest } from "../auth";
import type { HomeRole } from "./roles";

interface Result {
  passed: boolean;
  status: number | null;
  error: string | null;
}

/** Runs the middleware against a request shaped like Express makes them. */
function run(
  middleware: ReturnType<typeof requireCapability>,
  opts: { method: string; path: string; role: HomeRole | null }
): Result {
  const out: Result = { passed: false, status: null, error: null };

  const req = {
    method: opts.method,
    path: opts.path,
    user: { uid: 100, email: "m@example.com" },
    /* null role means the owner acting in their own home — no membership
       distinction, which is every request the product made before this. */
    home:
      opts.role === null
        ? { homeId: 100, actorId: 100, role: "owner" as HomeRole }
        : { homeId: 100, actorId: 9, role: opts.role },
  } as unknown as AuthedRequest;

  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json(body: { error?: string }) {
      out.error = body.error ?? null;
      return this;
    },
  };

  middleware(req, res as never, () => {
    out.passed = true;
  });
  return out;
}

const manageDevices = requireCapability("manage-devices", { except: [/\/command$/] });
const manageAutomations = requireCapability("manage-automations", { except: [/\/activate$/] });

test("a limited member can still send a command", () => {
  // The exemption is relative to the mount point, so this is the path Express
  // actually presents inside the devices router.
  const r = run(manageDevices, { method: "POST", path: "/lamp-01/command", role: "limited" });
  assert.equal(r.passed, true, "a limited member must keep their light switch");
});

test("a limited member cannot rename or unclaim a device", () => {
  for (const [method, path] of [
    ["PATCH", "/lamp-01"],
    ["DELETE", "/lamp-01"],
    ["POST", "/claim"],
    ["POST", "/provision"],
  ] as const) {
    const r = run(manageDevices, { method, path, role: "limited" });
    assert.equal(r.passed, false, `${method} ${path} should need manage-devices`);
    assert.equal(r.status, 403);
    assert.ok(r.error && r.error.length > 0, "a refusal must say something a person can act on");
  }
});

test("a limited member can run a scene but not edit one", () => {
  assert.equal(run(manageAutomations, { method: "POST", path: "/5/activate", role: "limited" }).passed, true);
  assert.equal(run(manageAutomations, { method: "PATCH", path: "/5", role: "limited" }).passed, false);
  assert.equal(run(manageAutomations, { method: "DELETE", path: "/5", role: "limited" }).passed, false);
  assert.equal(run(manageAutomations, { method: "POST", path: "/", role: "limited" }).passed, false);
});

test("the exemption does not match a path that merely contains the word", () => {
  // A route named /command-history must not inherit the exemption.
  assert.equal(run(manageDevices, { method: "POST", path: "/x/command-history", role: "limited" }).passed, false);
  assert.equal(run(manageAutomations, { method: "POST", path: "/5/activate-all", role: "limited" }).passed, false);
});

test("reading is never refused", () => {
  // Everybody in a household has a stake in knowing what the house does by
  // itself; hiding it makes the home less safe rather than more private.
  for (const role of ["adult", "limited", "guest"] as HomeRole[]) {
    assert.equal(run(manageDevices, { method: "GET", path: "/", role }).passed, true);
    assert.equal(run(manageAutomations, { method: "GET", path: "/5", role }).passed, true);
    assert.equal(run(manageDevices, { method: "HEAD", path: "/", role }).passed, true);
  }
});

test("an owner in their own home is never refused anything", () => {
  // This is every request the product made before households existed, and not
  // one of them may change behaviour.
  for (const [method, path] of [
    ["POST", "/provision"],
    ["PATCH", "/lamp-01"],
    ["DELETE", "/lamp-01"],
    ["POST", "/lamp-01/command"],
  ] as const) {
    assert.equal(run(manageDevices, { method, path, role: null }).passed, true, `${method} ${path}`);
  }
});

test("an adult may manage, a guest may not", () => {
  assert.equal(run(manageDevices, { method: "PATCH", path: "/lamp-01", role: "adult" }).passed, true);
  assert.equal(run(manageDevices, { method: "PATCH", path: "/lamp-01", role: "guest" }).passed, false);
});

test("the exempt path passes a guest through here, and refuses them further in", () => {
  /*
   * Worth stating plainly, because it looks wrong at a glance. The exemption
   * is about *which* check applies, not whether one does: `/command` needs
   * `control` rather than `manage-devices`, and that is decided by
   * `refuseCommand` inside the handler, which also has the command in front of
   * it and so can tell a lamp from a deadbolt.
   *
   * Reading this as "guests can send commands" is the mistake this test exists
   * to prevent. `guard.test.ts` is where the guest is actually refused.
   */
  assert.equal(run(manageDevices, { method: "POST", path: "/lamp-01/command", role: "guest" }).passed, true);
});
