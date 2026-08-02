import "./test-env";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { pool } from "./db";
import { config } from "./config";
import { requireAuth, signUserToken, verifyUserToken } from "./auth";
import { clearSessionCache } from "./sessions";
import type { AuthedRequest } from "./auth";
import type { Response } from "express";

/**
 * requireAuth is where every authenticated request is allowed or refused, so
 * these are the assertions that matter most in the API. The fail-closed test in
 * particular is the one that would otherwise rot: it is easy to "fix" a
 * database blip by letting requests through, which silently resurrects every
 * revoked token.
 */

type Row = { token_epoch: string; blocked: boolean };

function stubPool(next: Row[] | Error): void {
  (pool as unknown as { query: unknown }).query = async () => {
    if (next instanceof Error) throw next;
    return { rows: next, rowCount: next.length };
  };
}

/** Minimal Express doubles; resolves once the middleware has decided. */
function run(token: string | null): Promise<{ status: number | null; body: unknown; passed: boolean; req: AuthedRequest }> {
  return new Promise((resolve) => {
    const req = {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    } as unknown as AuthedRequest;

    let status: number | null = null;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(body: unknown) {
        resolve({ status, body, passed: false, req });
        return this;
      },
    } as unknown as Response;

    requireAuth(req, res, () => resolve({ status, body: null, passed: true, req }));
  });
}

/** A token with an explicit epoch claim, bypassing the DB read in signUserToken. */
function tokenWithEpoch(uid: number, te: number | undefined): string {
  const claims: Record<string, unknown> = { uid, email: "a@example.com" };
  if (te !== undefined) claims.te = te;
  return jwt.sign(claims, config.JWT_SECRET, { expiresIn: "1h" });
}

beforeEach(() => {
  clearSessionCache();
  stubPool([{ token_epoch: "0", blocked: false }]);
});

describe("requireAuth", () => {
  test("refuses a request with no token", async () => {
    const r = await run(null);
    assert.equal(r.passed, false);
    assert.equal(r.status, 401);
  });

  test("refuses a token we did not sign", async () => {
    const forged = jwt.sign({ uid: 1, email: "a@example.com" }, "not-the-real-secret");
    const r = await run(forged);
    assert.equal(r.passed, false);
    assert.equal(r.status, 401);
  });

  test("refuses an expired token", async () => {
    const expired = jwt.sign({ uid: 1, email: "a@example.com" }, config.JWT_SECRET, { expiresIn: -10 });
    const r = await run(expired);
    assert.equal(r.passed, false);
    assert.equal(r.status, 401);
  });

  test("admits a valid token and attaches the claims", async () => {
    stubPool([{ token_epoch: "2", blocked: false }]);
    const r = await run(tokenWithEpoch(7, 2));
    assert.equal(r.passed, true);
    assert.equal(r.req.user?.uid, 7);
    assert.equal(r.req.user?.email, "a@example.com");
  });

  test("refuses a token from before the account revoked", async () => {
    stubPool([{ token_epoch: "3", blocked: false }]);
    const r = await run(tokenWithEpoch(7, 2));
    assert.equal(r.passed, false);
    assert.equal(r.status, 401);
  });

  test("refuses a disabled account with 403, not 401", async () => {
    // 401 invites the client to sign in again, which a disabled account cannot
    // usefully do; 403 says the decision is deliberate.
    stubPool([{ token_epoch: "0", blocked: true }]);
    const r = await run(tokenWithEpoch(7, 0));
    assert.equal(r.passed, false);
    assert.equal(r.status, 403);
  });

  test("refuses a token belonging to a deleted account", async () => {
    stubPool([]);
    const r = await run(tokenWithEpoch(7, 0));
    assert.equal(r.passed, false);
    assert.equal(r.status, 401);
  });

  test("admits a legacy token with no epoch claim while the epoch is still 0", async () => {
    stubPool([{ token_epoch: "0", blocked: false }]);
    const r = await run(tokenWithEpoch(7, undefined));
    assert.equal(r.passed, true);
  });

  test("refuses a legacy token once the account has revoked", async () => {
    stubPool([{ token_epoch: "1", blocked: false }]);
    const r = await run(tokenWithEpoch(7, undefined));
    assert.equal(r.passed, false);
    assert.equal(r.status, 401);
  });

  test("fails CLOSED when the database is unavailable", async () => {
    // Letting requests through on a database error would quietly re-enable
    // every revoked and blocked token for the duration of the outage.
    stubPool(new Error("connection refused"));
    const r = await run(tokenWithEpoch(7, 0));
    assert.equal(r.passed, false);
    assert.equal(r.status, 401);
  });
});

describe("signUserToken", () => {
  test("stamps the account's current epoch into the token", async () => {
    stubPool([{ token_epoch: "4", blocked: false }]);
    const token = await signUserToken({ uid: 7, email: "a@example.com" });
    assert.equal(verifyUserToken(token)?.te, 4);
  });

  test("produces a token that requireAuth accepts", async () => {
    stubPool([{ token_epoch: "4", blocked: false }]);
    const token = await signUserToken({ uid: 7, email: "a@example.com" });
    clearSessionCache();
    stubPool([{ token_epoch: "4", blocked: false }]);
    assert.equal((await run(token)).passed, true);
  });
});

describe("verifyUserToken", () => {
  test("reads a missing epoch claim as 0 rather than NaN", async () => {
    assert.equal(verifyUserToken(tokenWithEpoch(1, undefined))?.te, 0);
  });

  test("rejects a token with no uid", async () => {
    const bad = jwt.sign({ email: "a@example.com" }, config.JWT_SECRET);
    assert.equal(verifyUserToken(bad), null);
  });

  test("rejects a token with no email", async () => {
    const bad = jwt.sign({ uid: 1 }, config.JWT_SECRET);
    assert.equal(verifyUserToken(bad), null);
  });
});
