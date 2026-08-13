/**
 * Acting as the person rather than as the home.
 *
 * Deliberately free of any database import so that the rule below can be
 * tested without a live Postgres — this is the piece that stands between a
 * household member and somebody else's password, and a check that is awkward
 * to test is a check that stops being run.
 */
import type { Response, NextFunction } from "express";
import type { AuthedRequest } from "../auth";
import { can, refusalFor, type Capability } from "./roles";

/**
 * Who to record as having done something.
 *
 * Always the real person, never the home. An audit trail that credits every
 * action to the account holder is worse than none: it says with authority that
 * the owner opened a door somebody else opened.
 */
export function actorId(req: AuthedRequest): number {
  return req.home?.actorId ?? req.user!.uid;
}

/**
 * Undoes the home rewrite for a whole router.
 *
 * `requireAuth` rewrites `user.uid` to the home being acted in, which is what
 * lets device queries scope correctly. On anything about the *account* that
 * rewrite is a catastrophe: `/auth/change-password` would change the owner's
 * password, `/account/sessions` would list the owner's phones and their IP
 * addresses, and a member could sign the owner out of everything.
 *
 * Mounted on the router rather than checked in each handler on purpose. A
 * per-route check is a thing somebody has to remember when they add the next
 * route, and the cost of forgetting once is an account takeover. This way the
 * default for anything added to those files is already right, and
 * `account-scope.test.ts` fails if a new account-level router is mounted
 * without it.
 */
export function asActor(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const home = req.home;
  if (home && home.actorId !== home.homeId && req.user) {
    req.user = { ...req.user, uid: home.actorId };
    req.home = { ...home, homeId: home.actorId, role: "owner" };
  }
  next();
}

/** Why this member may not take this household action, or null. */
export function refuse(req: AuthedRequest, capability: Capability): string | null {
  const home = req.home;
  if (!home || home.actorId === home.homeId) return null;
  return can(home.role, capability) ? null : refusalFor(home.role, capability);
}

/**
 * Express middleware form, for routers where the mutating routes need a
 * capability.
 *
 * Reads are left alone deliberately: seeing who is enrolled at the front door,
 * or what the automations are, is something everybody in a household has a
 * stake in, and hiding it makes the home less safe rather than more private.
 *
 * `except` names the mutating paths that are *not* management — running a
 * scene, sending a command — which need `control` and have their own check.
 * Listing them here rather than sprinkling the guard across each handler means
 * the default for anything added later is closed, and the exceptions are in
 * one place somebody can read.
 *
 * The paths are matched against `req.path`, which inside a mounted router is
 * relative to the mount point — `/lamp-01/command`, not `/devices/lamp-01/
 * command`. `require-capability.test.ts` exercises that rather than trusting
 * it: an exemption that never matches locks a household member out of their
 * own light switch, and one that matches too much opens a management route.
 */
export function requireCapability(capability: Capability, options: { except?: RegExp[] } = {}) {
  return function (req: AuthedRequest, res: Response, next: NextFunction): void {
    if (req.method === "GET" || req.method === "HEAD") {
      next();
      return;
    }
    if (options.except?.some((re) => re.test(req.path))) {
      next();
      return;
    }
    const refusal = refuse(req, capability);
    if (refusal) {
      res.status(403).json({ error: refusal });
      return;
    }
    next();
  };
}
