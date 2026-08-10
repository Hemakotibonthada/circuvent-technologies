import * as web from "@/lib/session-expiry";
import * as app from "../mobile/src/session";

/*
 * Two copies of the same rule.
 *
 * The app cannot import from the web project — Metro will not resolve a module
 * outside the app root — so the 24 hour cap exists twice. Duplicated logic
 * drifts, and the half that drifts is the half nobody notices, so both are
 * driven through the same cases here and asserted to agree.
 */

const NOW = Date.UTC(2026, 7, 10, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

const jwt = (payload: Record<string, unknown>) =>
  `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

describe("the app and the site agree on when a session ends", () => {
  it("caps both at the same 24 hours", () => {
    expect(app.MAX_SESSION_MS).toBe(web.MAX_SESSION_MS);
    expect(app.MAX_SESSION_MS).toBe(24 * HOUR);
  });

  it.each([
    ["fresh", NOW - HOUR],
    ["just inside", NOW - 23 * HOUR],
    ["exactly on the boundary", NOW - 24 * HOUR],
    ["long past", NOW - 40 * HOUR],
  ])("decides the same way for a session that is %s", (_label, startedAt) => {
    expect(app.sessionExpired(startedAt, NOW)).toBe(web.sessionExpired(startedAt, NOW));
  });

  it("treats an unknowable start the same way, which is as over", () => {
    expect(app.sessionExpired(null, NOW)).toBe(true);
    expect(web.sessionExpired(null, NOW)).toBe(true);
  });

  /*
   * The case the whole design turns on: a renewal must not move the start, or
   * the cap is never reached and the session lasts as long as the refresh chain.
   */
  it("both take the earlier of the sign-in and the token, so a renewal extends nothing", () => {
    const signedIn = NOW - 20 * HOUR;
    const renewedJustNow = Math.floor((NOW - 1000) / 1000);
    const args = { stamp: signedIn, tokenIssuedAt: renewedJustNow, now: NOW };

    expect(app.sessionStartedAt(args)).toBe(signedIn);
    expect(web.sessionStartedAt(args)).toBe(signedIn);
  });

  it("both clamp a start in the future rather than granting extra time", () => {
    const args = { stamp: NOW + 5 * HOUR, now: NOW };
    expect(app.sessionStartedAt(args)).toBe(NOW);
    expect(web.sessionStartedAt(args)).toBe(NOW);
  });

  it("both fall back to the token's issued-at for sessions with no stamp", () => {
    const iat = Math.floor((NOW - 3 * HOUR) / 1000);
    const args = { stamp: null, tokenIssuedAt: iat, now: NOW };
    expect(app.sessionStartedAt(args)).toBe(web.sessionStartedAt(args));
    expect(app.sessionStartedAt(args)).toBe(iat * 1000);
  });

  it("both read issued-at out of a token, and both refuse rubbish rather than throwing", () => {
    const t = jwt({ iat: 1_700_000_000 });
    expect(app.issuedAtFromJwt(t)).toBe(web.issuedAtFromJwt(t));
    for (const bad of [null, "", "not-a-jwt", jwt({ iat: "yesterday" })]) {
      expect(app.issuedAtFromJwt(bad as string)).toBe(web.issuedAtFromJwt(bad as string));
      expect(app.issuedAtFromJwt(bad as string)).toBeNull();
    }
  });
});
