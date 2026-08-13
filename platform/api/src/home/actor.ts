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
