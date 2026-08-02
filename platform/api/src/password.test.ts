import "./test-env";
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import bcrypt from "bcryptjs";
import { pool } from "./db";
import { authRouter } from "./routes/auth";
import { clearSessionCache } from "./sessions";

/**
 * Password change and reset, driven over real HTTP.
 *
 * The router is mounted on a throwaway Express app and exercised with fetch, so
 * these test the middleware chain, validation and status codes as a client
 * actually meets them — not just the handler bodies. Express is already a
 * dependency and Node has fetch, so this needs nothing new.
 *
 * `pool.query` is routed by SQL text. No email is sent: with no SMTP or Resend
 * configured, `sendMail` logs and returns false, which is exactly the
 * development behaviour.
 */

let server: Server;
let base = "";

/** Recorded so tests can assert on what the handlers actually wrote. */
interface Db {
  user: { id: number; email: string; name: string; password: string; blocked: boolean; token_epoch: number } | null;
  reset: { email: string; otp_hash: string; attempts: number; expires_at: Date } | null;
  resetDeleted: boolean;
  passwordUpdatedTo: string | null;
  epochBumped: boolean;
  /** True once every refresh chain for the account has been deleted. */
  refreshRevoked: boolean;
  refreshIssued: number;
}

let db: Db;

function freshDb(over: Partial<Db> = {}): Db {
  return {
    user: { id: 42, email: "a@example.com", name: "Ada", password: "", blocked: false, token_epoch: 0 },
    reset: null,
    resetDeleted: false,
    passwordUpdatedTo: null,
    epochBumped: false,
    refreshRevoked: false,
    refreshIssued: 0,
    ...over,
  };
}

function installStub(): void {
  (pool as unknown as { query: unknown }).query = async (sql: string, params: unknown[] = []) => {
    const q = String(sql).replace(/\s+/g, " ").trim();

    if (q.startsWith("SELECT password FROM users WHERE id")) {
      return { rows: db.user ? [{ password: db.user.password }] : [], rowCount: db.user ? 1 : 0 };
    }
    if (q.startsWith("SELECT id, name, blocked FROM users WHERE email")) {
      return { rows: db.user ? [{ id: db.user.id, name: db.user.name, blocked: db.user.blocked }] : [], rowCount: db.user ? 1 : 0 };
    }
    if (q.startsWith("SELECT token_epoch, blocked FROM users WHERE id")) {
      return { rows: db.user ? [{ token_epoch: String(db.user.token_epoch), blocked: db.user.blocked }] : [], rowCount: db.user ? 1 : 0 };
    }
    if (q.startsWith("SELECT otp_hash, attempts, expires_at FROM password_resets")) {
      return { rows: db.reset ? [{ otp_hash: db.reset.otp_hash, attempts: db.reset.attempts, expires_at: db.reset.expires_at.toISOString() }] : [], rowCount: db.reset ? 1 : 0 };
    }
    if (q.startsWith("UPDATE users SET password")) {
      db.passwordUpdatedTo = String(params[1]);
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith("UPDATE users SET token_epoch = token_epoch + 1")) {
      db.epochBumped = true;
      if (db.user) db.user.token_epoch += 1;
      return { rows: [{ token_epoch: String(db.user?.token_epoch ?? 1) }], rowCount: 1 };
    }
    if (q.startsWith("INSERT INTO password_resets")) {
      db.reset = { email: String(params[0]), otp_hash: String(params[1]), attempts: 0, expires_at: new Date(params[2] as string | Date) };
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith("UPDATE password_resets SET attempts")) {
      if (db.reset) db.reset.attempts += 1;
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith("DELETE FROM password_resets")) {
      db.resetDeleted = true;
      db.reset = null;
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith("INSERT INTO refresh_tokens")) {
      db.refreshIssued += 1;
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith("DELETE FROM refresh_tokens WHERE user_id")) {
      db.refreshRevoked = true;
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith("SELECT email, name, blocked FROM users WHERE id")) {
      return { rows: db.user ? [{ email: db.user.email, name: db.user.name, blocked: db.user.blocked }] : [], rowCount: db.user ? 1 : 0 };
    }
    throw new Error(`Unstubbed query: ${q.slice(0, 90)}`);
  };
}

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

after(() => {
  server.close();
});

beforeEach(() => {
  clearSessionCache();
  db = freshDb();
  installStub();
});

describe("POST /auth/change-password", () => {
  /** Signs in as uid 42 at the current epoch. */
  async function tokenForUser(): Promise<string> {
    const { signUserToken } = await import("./auth");
    return signUserToken({ uid: 42, email: "a@example.com" });
  }

  test("refuses without a token", async () => {
    const r = await post("/auth/change-password", { currentPassword: "old-password", newPassword: "new-password" });
    assert.equal(r.status, 401);
  });

  test("refuses a new password that is too short", async () => {
    db.user!.password = await bcrypt.hash("old-password", 4);
    const r = await post("/auth/change-password", { currentPassword: "old-password", newPassword: "short" }, await tokenForUser());
    assert.equal(r.status, 400);
    assert.equal(db.passwordUpdatedTo, null);
  });

  test("refuses reusing the same password", async () => {
    db.user!.password = await bcrypt.hash("old-password", 4);
    const r = await post("/auth/change-password", { currentPassword: "old-password", newPassword: "old-password" }, await tokenForUser());
    assert.equal(r.status, 400);
    assert.equal(db.passwordUpdatedTo, null);
  });

  test("refuses when the current password is wrong, and changes nothing", async () => {
    db.user!.password = await bcrypt.hash("old-password", 4);
    const r = await post("/auth/change-password", { currentPassword: "not-it", newPassword: "new-password" }, await tokenForUser());
    assert.equal(r.status, 401);
    assert.equal(db.passwordUpdatedTo, null);
    assert.equal(db.epochBumped, false);
  });

  test("changes the password and ends every session", async () => {
    db.user!.password = await bcrypt.hash("old-password", 4);
    const r = await post("/auth/change-password", { currentPassword: "old-password", newPassword: "new-password" }, await tokenForUser());
    assert.equal(r.status, 200);
    assert.ok(db.passwordUpdatedTo, "password should have been written");
    assert.ok(await bcrypt.compare("new-password", db.passwordUpdatedTo!), "stored value must be a hash of the new password");
    assert.equal(db.epochBumped, true, "changing a password without revoking leaves old tokens working");
  });

  test("also destroys refresh chains, which would otherwise mint new tokens", async () => {
    db.user!.password = await bcrypt.hash("old-password", 4);
    await post("/auth/change-password", { currentPassword: "old-password", newPassword: "new-password" }, await tokenForUser());
    assert.equal(db.refreshRevoked, true, "a surviving refresh chain defeats the revocation entirely");
  });

  test("returns a working refresh token so the caller can keep rotating", async () => {
    db.user!.password = await bcrypt.hash("old-password", 4);
    const r = await post("/auth/change-password", { currentPassword: "old-password", newPassword: "new-password" }, await tokenForUser());
    assert.equal(typeof r.body?.refreshToken, "string", "revoking the caller's own chain without replacing it would sign them out at the next refresh");
  });

  test("returns a replacement token so the caller is not signed out too", async () => {
    db.user!.password = await bcrypt.hash("old-password", 4);
    const r = await post("/auth/change-password", { currentPassword: "old-password", newPassword: "new-password" }, await tokenForUser());
    assert.equal(typeof r.body?.token, "string");
  });

  test("never stores the password in plain text", async () => {
    db.user!.password = await bcrypt.hash("old-password", 4);
    await post("/auth/change-password", { currentPassword: "old-password", newPassword: "new-password" }, await tokenForUser());
    assert.notEqual(db.passwordUpdatedTo, "new-password");
  });
});

describe("POST /auth/forgot-password", () => {
  test("answers the same for a real account and an unknown one", async () => {
    const real = await post("/auth/forgot-password", { email: "a@example.com" });
    db = freshDb({ user: null });
    installStub();
    const unknown = await post("/auth/forgot-password", { email: "nobody@example.com" });

    assert.equal(real.status, unknown.status);
    assert.deepEqual(real.body, unknown.body, "a different answer here is an account-enumeration oracle");
  });

  test("answers the same for a malformed address", async () => {
    const good = await post("/auth/forgot-password", { email: "a@example.com" });
    const bad = await post("/auth/forgot-password", { email: "not-an-email" });
    assert.equal(good.status, bad.status);
    assert.deepEqual(good.body, bad.body);
  });

  test("stores a reset code for a real account", async () => {
    await post("/auth/forgot-password", { email: "a@example.com" });
    assert.ok(db.reset, "a reset row should exist");
  });

  test("stores only a hash of the code, never the code", async () => {
    await post("/auth/forgot-password", { email: "a@example.com" });
    assert.match(db.reset!.otp_hash, /^\$2[aby]\$/, "must be a bcrypt hash");
  });

  test("issues nothing for a disabled account, but says nothing either", async () => {
    db.user!.blocked = true;
    const r = await post("/auth/forgot-password", { email: "a@example.com" });
    assert.equal(r.status, 200);
    assert.equal(db.reset, null, "a disabled account must not be recoverable by its former owner");
  });
});

describe("POST /auth/reset-password", () => {
  const OTP = "123456";

  async function pendingReset(over: Partial<Db["reset"]> = {}) {
    db.reset = {
      email: "a@example.com",
      otp_hash: await bcrypt.hash(OTP, 4),
      attempts: 0,
      expires_at: new Date(Date.now() + 10 * 60_000),
      ...over,
    } as Db["reset"];
  }

  test("refuses when no reset is in progress", async () => {
    const r = await post("/auth/reset-password", { email: "a@example.com", otp: OTP, newPassword: "new-password" });
    assert.equal(r.status, 404);
  });

  test("refuses an expired code and clears it", async () => {
    await pendingReset({ expires_at: new Date(Date.now() - 1000) } as Partial<Db["reset"]>);
    const r = await post("/auth/reset-password", { email: "a@example.com", otp: OTP, newPassword: "new-password" });
    assert.equal(r.status, 410);
    assert.equal(db.resetDeleted, true);
  });

  test("refuses after too many attempts and clears it", async () => {
    await pendingReset({ attempts: 6 } as Partial<Db["reset"]>);
    const r = await post("/auth/reset-password", { email: "a@example.com", otp: OTP, newPassword: "new-password" });
    assert.equal(r.status, 429);
    assert.equal(db.resetDeleted, true);
  });

  test("counts a wrong code against the attempt budget", async () => {
    await pendingReset();
    const r = await post("/auth/reset-password", { email: "a@example.com", otp: "000000", newPassword: "new-password" });
    assert.equal(r.status, 400);
    assert.equal(db.reset!.attempts, 1, "brute force must cost attempts");
    assert.equal(db.passwordUpdatedTo, null);
  });

  test("refuses a new password that is too short", async () => {
    await pendingReset();
    const r = await post("/auth/reset-password", { email: "a@example.com", otp: OTP, newPassword: "short" });
    assert.equal(r.status, 400);
    assert.equal(db.passwordUpdatedTo, null);
  });

  test("resets the password, ends every session, and consumes the code", async () => {
    await pendingReset();
    const r = await post("/auth/reset-password", { email: "a@example.com", otp: OTP, newPassword: "new-password" });
    assert.equal(r.status, 200);
    assert.ok(await bcrypt.compare("new-password", db.passwordUpdatedTo!));
    assert.equal(db.epochBumped, true, "a reset that leaves existing sessions alive is not a reset");
    assert.equal(db.refreshRevoked, true, "nor is one that leaves a refresh chain alive");
    assert.equal(db.resetDeleted, true, "the code must not be replayable");
  });

  test("refuses if the account was disabled after the code was issued", async () => {
    await pendingReset();
    db.user!.blocked = true;
    const r = await post("/auth/reset-password", { email: "a@example.com", otp: OTP, newPassword: "new-password" });
    assert.equal(r.status, 403);
    assert.equal(db.passwordUpdatedTo, null);
  });

  test("refuses if the account was deleted after the code was issued", async () => {
    await pendingReset();
    db.user = null;
    const r = await post("/auth/reset-password", { email: "a@example.com", otp: OTP, newPassword: "new-password" });
    assert.equal(r.status, 403);
    assert.equal(db.passwordUpdatedTo, null);
  });
});
