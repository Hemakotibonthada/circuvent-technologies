import "./test-env";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { pool } from "./db";
import { config } from "./config";
import { clearSessionCache } from "./sessions";
import { verifySmartHomeToken } from "./routes/oauth";

/**
 * Smart-home grant revocation.
 *
 * These tokens authorize Alexa and Google to actuate mains relays, pumps, and
 * the hub. They were minted without a token-epoch claim and verified with a
 * bare jwt.verify, so they never reached checkSession() — which meant signing
 * out all devices, changing the password, resetting a forgotten password, an
 * admin revoking sessions and even an admin *blocking the account* all left
 * them fully working. The refresh token lasted ten years and no unlink
 * endpoint exists, so a grant obtained once could not be taken away at all.
 *
 * The tests are written as security assertions: each one is a thing an owner
 * does to stop someone controlling their house.
 *
 * No database is involved; pool.query is stubbed, and pg opens no connection
 * until a query runs.
 */

type Row = { token_epoch: string; blocked: boolean };

let row: Row | null = null;

/**
 * Session state is cached for SESSION_TTL_MS (5s), so a revocation takes up to
 * that long to bite — the same window the console path already accepts. These
 * tests clear it explicitly rather than sleeping, so what is being asserted is
 * the revocation logic and not the cache's expiry.
 */
function stubUser(next: Row | null): void {
  row = next;
  clearSessionCache();
  (pool as unknown as { query: unknown }).query = async () => ({
    rows: row ? [row] : [],
    rowCount: row ? 1 : 0,
  });
}

/** Mints exactly what oauth.ts mints, so the test cannot drift from it. */
const mint = (purpose: string, uid: number, te: number | undefined, expiresIn = "1h") =>
  jwt.sign(
    te === undefined ? { uid, purpose } : { uid, purpose, te },
    config.JWT_SECRET,
    { expiresIn } as jwt.SignOptions
  );

describe("smart-home token revocation", () => {
  beforeEach(() => stubUser({ token_epoch: "4", blocked: false }));

  test("a current token is accepted", async () => {
    assert.equal(await verifySmartHomeToken(mint("sh_access", 7, 4)), 7);
  });

  test("signing out all devices kills it", async () => {
    // The owner bumped their epoch to 5; a grant minted at 4 must stop working.
    const token = mint("sh_access", 7, 4);
    stubUser({ token_epoch: "5", blocked: false });
    assert.equal(await verifySmartHomeToken(token), null);
  });

  test("blocking the account kills it", async () => {
    // Previously the bridge queried `devices` directly and never consulted
    // `users`, so a blocked owner's voice assistant kept switching mains.
    const token = mint("sh_access", 7, 4);
    stubUser({ token_epoch: "4", blocked: true });
    assert.equal(await verifySmartHomeToken(token), null);
  });

  test("a pre-fix token with no epoch claim is retired once the epoch moves", async () => {
    // Legacy ten-year grants carry no `te`. Treating a missing claim as epoch 0
    // is what retires them: any account that has ever revoked anything is above
    // 0 and rejects them. Defaulting to the *current* epoch would grandfather
    // in precisely the tokens this exists to kill.
    const legacy = mint("sh_access", 7, undefined, "3650d");
    stubUser({ token_epoch: "1", blocked: false });
    assert.equal(await verifySmartHomeToken(legacy), null);
  });

  test("purpose is still enforced, so a refresh token is not an access token", async () => {
    assert.equal(await verifySmartHomeToken(mint("sh_refresh", 7, 4)), null);
    assert.equal(await verifySmartHomeToken(mint("access", 7, 4)), null);
  });

  test("a forged or expired token is rejected", async () => {
    const wrongKey = jwt.sign({ uid: 7, purpose: "sh_access", te: 4 }, "not-the-secret");
    assert.equal(await verifySmartHomeToken(wrongKey), null);
    assert.equal(await verifySmartHomeToken(mint("sh_access", 7, 4, "-1s")), null);
    assert.equal(await verifySmartHomeToken("garbage"), null);
    assert.equal(await verifySmartHomeToken(""), null);
  });

  test("an unknown user is rejected", async () => {
    const token = mint("sh_access", 7, 4);
    stubUser(null);
    assert.equal(await verifySmartHomeToken(token), null);
  });

  test("it fails closed when the database is unreachable", async () => {
    // An outage must not become an authorization bypass on the path that
    // switches mains voltage.
    const token = mint("sh_access", 7, 4);
    clearSessionCache();
    (pool as unknown as { query: unknown }).query = async () => {
      throw new Error("connection refused");
    };
    assert.equal(await verifySmartHomeToken(token), null);
  });
});
