import "./test-env";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { pool } from "./db";
import {
  issueRefreshToken, rotateRefreshToken, revokeFamily, revokeAllRefreshTokens, pruneRefreshTokens,
} from "./refresh";
import { clearSessionCache } from "./sessions";

/**
 * Refresh-token rotation and reuse detection.
 *
 * Epochs can end a session but cannot tell a thief's use of a token from the
 * owner's. Rotation is what makes replay observable, so the reuse tests here
 * are the reason the feature exists — the rest is bookkeeping around them.
 */

interface Row {
  id: number;
  user_id: string;
  family_id: string;
  token_hash: string;
  used_at: Date | null;
  expires_at: Date;
}

let rows: Row[];
let nextId: number;
let epochBumped: number;

const sha = (t: string) => crypto.createHash("sha256").update(t, "utf8").digest("hex");

function stubPool(): void {
  (pool as unknown as { query: unknown }).query = async (sql: string, params: unknown[] = []) => {
    const q = String(sql).replace(/\s+/g, " ").trim();

    if (q.startsWith("INSERT INTO refresh_tokens")) {
      rows.push({
        id: nextId++,
        user_id: String(params[0]),
        family_id: String(params[1]),
        token_hash: String(params[2]),
        used_at: null,
        expires_at: new Date(params[3] as string | Date),
      });
      return { rows: [], rowCount: 1 };
    }

    // Conditional claim — the database decides the race, not the caller.
    if (q.startsWith("UPDATE refresh_tokens SET used_at = now()")) {
      const hash = String(params[0]);
      const row = rows.find((r) => r.token_hash === hash && r.used_at === null);
      if (!row) return { rows: [], rowCount: 0 };
      row.used_at = new Date();
      return {
        rows: [{ id: String(row.id), user_id: row.user_id, family_id: row.family_id, expires_at: row.expires_at.toISOString() }],
        rowCount: 1,
      };
    }

    if (q.startsWith("SELECT user_id, family_id FROM refresh_tokens")) {
      const row = rows.find((r) => r.token_hash === String(params[0]));
      return { rows: row ? [{ user_id: row.user_id, family_id: row.family_id }] : [], rowCount: row ? 1 : 0 };
    }

    if (q.startsWith("DELETE FROM refresh_tokens WHERE family_id")) {
      const before = rows.length;
      rows = rows.filter((r) => r.family_id !== String(params[0]));
      return { rows: [], rowCount: before - rows.length };
    }

    if (q.startsWith("DELETE FROM refresh_tokens WHERE user_id")) {
      const before = rows.length;
      rows = rows.filter((r) => r.user_id !== String(params[0]));
      return { rows: [], rowCount: before - rows.length };
    }

    if (q.startsWith("DELETE FROM refresh_tokens WHERE expires_at")) {
      const now = Date.now();
      const before = rows.length;
      rows = rows.filter((r) => {
        const expired = r.expires_at.getTime() < now;
        const staleUsed = r.used_at !== null && r.used_at.getTime() < now - 7 * 24 * 3600_000;
        return !(expired || staleUsed);
      });
      return { rows: [], rowCount: before - rows.length };
    }

    // revokeAllSessions
    if (q.startsWith("UPDATE users SET token_epoch = token_epoch + 1")) {
      epochBumped += 1;
      return { rows: [{ token_epoch: "1" }], rowCount: 1 };
    }

    throw new Error(`Unstubbed query: ${q.slice(0, 90)}`);
  };
}

beforeEach(() => {
  rows = [];
  nextId = 1;
  epochBumped = 0;
  clearSessionCache();
  stubPool();
});

describe("issueRefreshToken", () => {
  test("returns a high-entropy token", async () => {
    const t = await issueRefreshToken(1);
    assert.ok(t.token.length >= 40, "must not be guessable");
  });

  test("never stores the token itself", async () => {
    const t = await issueRefreshToken(1);
    assert.equal(rows[0].token_hash, sha(t.token));
    assert.notEqual(rows[0].token_hash, t.token);
  });

  test("starts a new family by default", async () => {
    const a = await issueRefreshToken(1);
    const b = await issueRefreshToken(1);
    assert.notEqual(a.familyId, b.familyId, "separate sign-ins are separate chains");
  });

  test("continues a family when told to", async () => {
    const a = await issueRefreshToken(1);
    const b = await issueRefreshToken(1, a.familyId);
    assert.equal(a.familyId, b.familyId);
  });

  test("issues two different tokens for the same user", async () => {
    const a = await issueRefreshToken(1);
    const b = await issueRefreshToken(1);
    assert.notEqual(a.token, b.token);
  });
});

describe("rotateRefreshToken", () => {
  test("exchanges a valid token for a new one", async () => {
    const first = await issueRefreshToken(7);
    const out = await rotateRefreshToken(first.token);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.uid, 7);
    assert.notEqual(out.next.token, first.token, "the token must actually rotate");
  });

  test("keeps the replacement in the same family", async () => {
    const first = await issueRefreshToken(7);
    const out = await rotateRefreshToken(first.token);
    assert.equal(out.ok && out.next.familyId, first.familyId);
  });

  test("rejects a token that was never issued", async () => {
    const out = await rotateRefreshToken("not-a-real-token-aaaaaaaaaaaaaaaaaaaa");
    assert.equal(out.ok, false);
    assert.equal(out.ok === false && out.reason, "unknown");
  });

  test("rejects an expired token", async () => {
    const first = await issueRefreshToken(7);
    rows[0].expires_at = new Date(Date.now() - 1000);
    const out = await rotateRefreshToken(first.token);
    assert.equal(out.ok, false);
    assert.equal(out.ok === false && out.reason, "expired");
  });

  test("the old token stops working after rotation", async () => {
    const first = await issueRefreshToken(7);
    await rotateRefreshToken(first.token);
    const again = await rotateRefreshToken(first.token);
    assert.equal(again.ok, false, "single-use is what makes replay detectable");
  });

  test("a chain can rotate repeatedly", async () => {
    let current = await issueRefreshToken(7);
    for (let i = 0; i < 4; i++) {
      const out = await rotateRefreshToken(current.token);
      assert.equal(out.ok, true, `rotation ${i} should succeed`);
      if (!out.ok) return;
      current = out.next;
    }
  });
});

describe("reuse detection", () => {
  test("reports reuse, not merely failure", async () => {
    const first = await issueRefreshToken(7);
    await rotateRefreshToken(first.token);
    const replay = await rotateRefreshToken(first.token);
    assert.equal(replay.ok === false && replay.reason, "reused");
  });

  test("destroys the whole family on reuse", async () => {
    const first = await issueRefreshToken(7);
    const second = await rotateRefreshToken(first.token);
    assert.equal(second.ok, true);
    if (!second.ok) return;

    await rotateRefreshToken(first.token); // replay

    // The attacker's copy is dead, and so is the token the real client holds.
    assert.equal(rows.length, 0, "no token in a compromised family may survive");
    const legit = await rotateRefreshToken(second.next.token);
    assert.equal(legit.ok, false, "the genuine holder is signed out too — deliberately");
  });

  test("revokes the account's sessions on reuse", async () => {
    const first = await issueRefreshToken(7);
    await rotateRefreshToken(first.token);
    await rotateRefreshToken(first.token);
    assert.equal(epochBumped, 1, "a replayed chain must not leave live access tokens behind");
  });

  test("leaves other families of the same user alone", async () => {
    // A phone being compromised should not sign the user out of a laptop they
    // are actively using... except that reuse also bumps the epoch, which does.
    // This pins the *token* behaviour so the intent stays visible.
    const compromised = await issueRefreshToken(7);
    const other = await issueRefreshToken(7);
    await rotateRefreshToken(compromised.token);
    await rotateRefreshToken(compromised.token); // replay

    assert.ok(rows.some((r) => r.family_id === other.familyId), "an unrelated family should survive the family purge");
  });
});

describe("bulk revocation", () => {
  test("revokeFamily clears exactly one chain", async () => {
    const a = await issueRefreshToken(7);
    const b = await issueRefreshToken(7);
    await revokeFamily(a.familyId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].family_id, b.familyId);
  });

  test("revokeAllRefreshTokens clears every chain for one user only", async () => {
    await issueRefreshToken(7);
    await issueRefreshToken(7);
    await issueRefreshToken(9);
    await revokeAllRefreshTokens(7);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, "9");
  });

  test("a revoked token cannot be rotated", async () => {
    const t = await issueRefreshToken(7);
    await revokeAllRefreshTokens(7);
    const out = await rotateRefreshToken(t.token);
    assert.equal(out.ok, false);
    assert.equal(out.ok === false && out.reason, "unknown");
  });
});

describe("pruneRefreshTokens", () => {
  test("removes expired tokens", async () => {
    await issueRefreshToken(7);
    rows[0].expires_at = new Date(Date.now() - 1000);
    assert.equal(await pruneRefreshTokens(), 1);
  });

  test("keeps a live token", async () => {
    await issueRefreshToken(7);
    assert.equal(await pruneRefreshTokens(), 0);
  });

  test("keeps a recently used token, so replay is still detectable", async () => {
    const t = await issueRefreshToken(7);
    await rotateRefreshToken(t.token);
    await pruneRefreshTokens();
    const replay = await rotateRefreshToken(t.token);
    assert.equal(replay.ok === false && replay.reason, "reused", "pruning too eagerly would turn replay into a plain 'unknown'");
  });
});
