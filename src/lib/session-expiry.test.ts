import {
  MAX_SESSION_MS,
  issuedAtFromJwt,
  msUntilExpiry,
  sessionExpired,
  sessionStartedAt,
} from "./session-expiry";

const NOW = Date.UTC(2026, 7, 10, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

const jwt = (payload: Record<string, unknown>) =>
  `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

describe("when a session began", () => {
  it("uses what we recorded at sign-in", () => {
    expect(sessionStartedAt({ stamp: NOW - HOUR, now: NOW })).toBe(NOW - HOUR);
  });

  /*
   * Sessions that existed before any of this was recorded still have to be
   * judged, or deploying the cap signs out everyone holding a valid session.
   */
  it("falls back to the token's own issued-at for sessions that predate the stamp", () => {
    const iat = Math.floor((NOW - 3 * HOUR) / 1000);
    expect(sessionStartedAt({ stamp: null, tokenIssuedAt: iat, now: NOW })).toBe(iat * 1000);
  });

  /*
   * The console renews its token whenever a request 401s. If a renewal were
   * allowed to move the start, the 24 hour cap would never be reached and the
   * session would run for the refresh token's sixty days.
   */
  it("takes the earlier of the two, so renewing a token does not extend the session", () => {
    const signedIn = NOW - 20 * HOUR;
    const renewedJustNow = Math.floor((NOW - 1000) / 1000);
    expect(sessionStartedAt({ stamp: signedIn, tokenIssuedAt: renewedJustNow, now: NOW })).toBe(signedIn);
  });

  it("clamps a start in the future to now rather than granting extra time", () => {
    expect(sessionStartedAt({ stamp: NOW + 5 * HOUR, now: NOW })).toBe(NOW);
  });

  it("reports nothing when there is nothing to go on", () => {
    expect(sessionStartedAt({ stamp: null, tokenIssuedAt: null, now: NOW })).toBeNull();
    expect(sessionStartedAt({ stamp: 0, tokenIssuedAt: 0, now: NOW })).toBeNull();
    expect(sessionStartedAt({ stamp: Number.NaN, now: NOW })).toBeNull();
  });
});

describe("whether it is over", () => {
  it("lasts 24 hours", () => {
    expect(sessionExpired(NOW - 23 * HOUR, NOW)).toBe(false);
    expect(sessionExpired(NOW - 24 * HOUR, NOW)).toBe(true);
    expect(sessionExpired(NOW - 25 * HOUR, NOW)).toBe(true);
  });

  it("ends exactly on the boundary, not a moment after", () => {
    expect(sessionExpired(NOW - MAX_SESSION_MS + 1, NOW)).toBe(false);
    expect(sessionExpired(NOW - MAX_SESSION_MS, NOW)).toBe(true);
  });

  it("treats an unknowable start as over", () => {
    expect(sessionExpired(null, NOW)).toBe(true);
  });
});

describe("time remaining", () => {
  it("is what is left of the 24 hours", () => {
    expect(msUntilExpiry(NOW - 20 * HOUR, NOW)).toBe(4 * HOUR);
  });

  it("never goes negative, so a timer cannot be scheduled into the past", () => {
    expect(msUntilExpiry(NOW - 40 * HOUR, NOW)).toBe(0);
    expect(msUntilExpiry(null, NOW)).toBe(0);
  });
});

describe("reading issued-at out of a token", () => {
  it("finds it", () => {
    expect(issuedAtFromJwt(jwt({ iat: 1_700_000_000, uid: 3 }))).toBe(1_700_000_000);
  });

  it("returns null for anything it cannot read, rather than throwing on the sign-in path", () => {
    expect(issuedAtFromJwt(null)).toBeNull();
    expect(issuedAtFromJwt("")).toBeNull();
    expect(issuedAtFromJwt("not-a-jwt")).toBeNull();
    expect(issuedAtFromJwt("a.!!!not-base64!!!.c")).toBeNull();
    expect(issuedAtFromJwt(jwt({ uid: 3 }))).toBeNull();
    expect(issuedAtFromJwt(jwt({ iat: "yesterday" }))).toBeNull();
  });
});
