import "./test-env";
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import { pool } from "./db";
import { config } from "./config";
import { clearSessionCache } from "./sessions";
import { __setMqttClientForTests } from "./mqtt";
import { adminRouter, normalizeAdminRole } from "./routes/admin";
import type { MqttClient } from "mqtt";

/**
 * The observer/operator split inside /admin.
 *
 * `is_admin` still decides whether a caller reaches `/admin` at all — every
 * request below is already past that gate, on an account with `is_admin =
 * true`. What is under test is the finer question `admin_role` adds on top:
 * once inside, can this caller change anything, or only look.
 *
 * The direction that matters is asymmetric. An observer who cannot read
 * something is an inconvenience; an unrecognised or missing role that is
 * treated as full write access is a way for a bug, a bad migration, or a
 * hand-edited row to hand somebody the ability to unlock every door in the
 * fleet. That is why "fail closed to observer" is asserted repeatedly here
 * rather than assumed from one example.
 */

let server: http.Server;
let base = "";

const OPERATOR_UID = 101;
const OBSERVER_UID = 102;
const NON_ADMIN_UID = 103;

/** The row adminGuard reads for each uid, so one server can serve every role in the suite. */
let userRows: Record<number, { is_admin: boolean; email: string; admin_role: unknown } | undefined> = {};

function tokenFor(uid: number, email: string): string {
  return jwt.sign({ uid, email, te: 0 }, config.JWT_SECRET, { expiresIn: "1h" });
}

/**
 * Every query the routes make, answered by what the SQL mentions.
 *
 * `admin_role` only ever appears in adminGuard's own SELECT (the `/admin/users`
 * listing selects `is_admin` too, but never `admin_role`), so matching on it is
 * an unambiguous way to serve the per-uid row without also intercepting other
 * admin queries that happen to mention `is_admin`.
 */
function stubQueries(extra: (sql: string, params: unknown[]) => unknown[] = () => []): void {
  (pool as unknown as { query: unknown }).query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes("admin_role")) {
      const uid = Number(params[0]);
      const row = userRows[uid];
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes("token_epoch") && sql.includes("blocked")) {
      return { rows: [{ token_epoch: "0", blocked: false }], rowCount: 1 };
    }
    const rows = extra(sql, params);
    return { rows, rowCount: rows.length };
  };
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/admin", adminRouter);
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  __setMqttClientForTests(null);
});

beforeEach(() => {
  clearSessionCache();
  __setMqttClientForTests(null);
  userRows = {
    [OPERATOR_UID]: { is_admin: true, email: "operator@circuvent.com", admin_role: "operator" },
    [OBSERVER_UID]: { is_admin: true, email: "observer@circuvent.com", admin_role: "observer" },
    [NON_ADMIN_UID]: { is_admin: false, email: "nobody@circuvent.com", admin_role: "operator" },
  };
});

async function call(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

describe("normalizeAdminRole — the fail-closed helper itself", () => {
  test("the exact string 'operator' is the only value treated as full access", () => {
    assert.equal(normalizeAdminRole("operator"), "operator");
  });

  test("'observer' is read-only", () => {
    assert.equal(normalizeAdminRole("observer"), "observer");
  });

  test("garbage, near-misses, casing, and absent values all fail closed to observer", () => {
    const badValues: unknown[] = [
      "Operator",
      "OPERATOR",
      "operator ",
      " operator",
      "admin",
      "superuser",
      "root",
      "",
      null,
      undefined,
      0,
      1,
      {},
      ["operator"],
    ];
    for (const bad of badValues) {
      assert.equal(
        normalizeAdminRole(bad),
        "observer",
        `expected observer for unrecognised value ${JSON.stringify(bad)}, the reverse would be a privilege-escalation bug`
      );
    }
  });
});

describe("GET /admin/me exposes the role", () => {
  test("an operator sees role: 'operator'", async () => {
    stubQueries();
    const token = tokenFor(OPERATOR_UID, "operator@circuvent.com");
    const r = await call(token, "GET", "/admin/me");
    assert.equal(r.status, 200);
    assert.equal(r.body.role, "operator");
    assert.equal(r.body.admin, true);
  });

  test("an observer sees role: 'observer', but is_admin ('admin') still reads true", async () => {
    stubQueries();
    const token = tokenFor(OBSERVER_UID, "observer@circuvent.com");
    const r = await call(token, "GET", "/admin/me");
    assert.equal(r.status, 200);
    assert.equal(r.body.role, "observer");
    assert.equal(r.body.admin, true, "admin_role only subdivides access; is_admin is still the door into /admin");
  });

  test("a garbage admin_role is reported as 'observer', never 'operator'", async () => {
    userRows[OPERATOR_UID] = { is_admin: true, email: "operator@circuvent.com", admin_role: "made-up-role" };
    stubQueries();
    const token = tokenFor(OPERATOR_UID, "operator@circuvent.com");
    const r = await call(token, "GET", "/admin/me");
    assert.equal(r.status, 200);
    assert.equal(r.body.role, "observer");
  });
});

describe("observers can still read the fleet", () => {
  test("GET /admin/devices — the fleet listing — is open to an observer", async () => {
    stubQueries((sql) =>
      sql.includes("FROM devices d LEFT JOIN users u")
        ? [{ id: "lock-front-door", serial: "CV-LOK-0001", owner_email: "customer@example.com" }]
        : []
    );
    const token = tokenFor(OBSERVER_UID, "observer@circuvent.com");
    const r = await call(token, "GET", "/admin/devices");
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.devices));
    assert.equal((r.body.devices as unknown[]).length, 1);
  });

  test("GET /admin/users is open to an observer", async () => {
    stubQueries((sql) => (sql.includes("FROM users u ORDER BY") ? [{ id: "1", email: "a@example.com" }] : []));
    const token = tokenFor(OBSERVER_UID, "observer@circuvent.com");
    const r = await call(token, "GET", "/admin/users");
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.users));
  });

  test("GET /admin/stats is open to an observer", async () => {
    stubQueries((sql) => (/COUNT\(\*\)::int c/.test(sql) ? [{ c: "0" }] : []));
    const token = tokenFor(OBSERVER_UID, "observer@circuvent.com");
    const r = await call(token, "GET", "/admin/stats");
    assert.equal(r.status, 200);
    assert.equal(r.body.devices, 0);
  });
});

describe("broadcast — the widest action in the product", () => {
  test("an operator may broadcast to the fleet", async () => {
    __setMqttClientForTests({ publish: () => {} } as unknown as MqttClient);
    stubQueries((sql) => (sql.includes("SELECT id FROM devices") ? [{ id: "lock-1" }, { id: "lock-2" }] : []));
    const token = tokenFor(OPERATOR_UID, "operator@circuvent.com");
    const r = await call(token, "POST", "/admin/broadcast", { command: { action: "unlock" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.sent, 2);
  });

  test("an observer gets 403, and no command is ever published", async () => {
    let published = false;
    __setMqttClientForTests({ publish: () => { published = true; } } as unknown as MqttClient);
    stubQueries((sql, params) => {
      if (sql.includes("SELECT id FROM devices")) {
        throw new Error(`an observer's broadcast must be refused before the fleet is even queried: ${sql} ${JSON.stringify(params)}`);
      }
      return [];
    });
    const token = tokenFor(OBSERVER_UID, "observer@circuvent.com");
    const r = await call(token, "POST", "/admin/broadcast", { command: { action: "unlock" } });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "operator_role_required");
    assert.match(String(r.body.error), /operator/i, "the 403 must name the role required");
    assert.equal(published, false, "an observer must never cause a command to reach a device");
  });
});

describe("ota-broadcast — firmware for the whole fleet", () => {
  test("an operator may push firmware fleet-wide", async () => {
    __setMqttClientForTests({ publish: () => {} } as unknown as MqttClient);
    stubQueries((sql) => (sql.includes("SELECT id FROM devices") ? [{ id: "cam-1" }] : []));
    const token = tokenFor(OPERATOR_UID, "operator@circuvent.com");
    const r = await call(token, "POST", "/admin/ota-broadcast", { url: "https://updates.example.com/fw.bin" });
    assert.equal(r.status, 200);
    assert.equal(r.body.sent, 1);
  });

  test("an observer gets 403 and no firmware pointer is published", async () => {
    let published = false;
    __setMqttClientForTests({ publish: () => { published = true; } } as unknown as MqttClient);
    stubQueries((sql) => {
      if (sql.includes("SELECT id FROM devices")) throw new Error("must not reach the fleet query");
      return [];
    });
    const token = tokenFor(OBSERVER_UID, "observer@circuvent.com");
    const r = await call(token, "POST", "/admin/ota-broadcast", { url: "https://updates.example.com/fw.bin" });
    assert.equal(r.status, 403);
    assert.equal(published, false);
  });
});

describe("every mutating admin route refuses an observer", () => {
  // Every POST/PATCH/DELETE under /admin, each with a body that would pass its
  // own Zod validation — so a 403 here can only be requireOperator, not an
  // incidental 400 that would pass this assertion for the wrong reason.
  const mutations: Array<{ label: string; method: string; path: string; body?: unknown }> = [
    { label: "toggle a user's admin/blocked flag", method: "PATCH", path: "/admin/users/9", body: { blocked: true } },
    { label: "revoke a user's sessions", method: "POST", path: "/admin/users/9/revoke-sessions", body: {} },
    { label: "delete a user", method: "DELETE", path: "/admin/users/9", body: {} },
    {
      label: "claim a device for a user",
      method: "POST",
      path: "/admin/devices/claim-for-user",
      body: { device: "dev-1", key: "some-key", ownerEmail: "a@example.com" },
    },
    {
      label: "transfer a device to another owner",
      method: "POST",
      path: "/admin/devices/dev-1/assign",
      body: { ownerEmail: "a@example.com", note: "test transfer reason" },
    },
    {
      label: "reissue a device's key",
      method: "POST",
      path: "/admin/devices/dev-1/reissue-key",
      body: { note: "test reissue reason" },
    },
    {
      label: "force a command to one device",
      method: "POST",
      path: "/admin/devices/dev-1/command",
      body: { action: "unlock" },
    },
    {
      label: "push OTA firmware to one device",
      method: "POST",
      path: "/admin/devices/dev-1/ota",
      body: { url: "https://updates.example.com/fw.bin" },
    },
    { label: "force-delete a device", method: "DELETE", path: "/admin/devices/dev-1", body: {} },
    { label: "rename / re-room / retype a device", method: "PATCH", path: "/admin/devices/dev-1", body: { name: "New name" } },
    { label: "provision a new device", method: "POST", path: "/admin/devices/provision", body: { type: "smart-plug" } },
    { label: "broadcast a command fleet-wide", method: "POST", path: "/admin/broadcast", body: { command: { action: "unlock" } } },
    {
      label: "push firmware fleet-wide",
      method: "POST",
      path: "/admin/ota-broadcast",
      body: { url: "https://updates.example.com/fw.bin" },
    },
  ];

  for (const m of mutations) {
    test(`observer refused — ${m.label} (${m.method} ${m.path})`, async () => {
      stubQueries(() => {
        throw new Error(
          `${m.method} ${m.path}: requireOperator must refuse an observer before any handler query runs`
        );
      });
      const token = tokenFor(OBSERVER_UID, "observer@circuvent.com");
      const r = await call(token, m.method, m.path, m.body);
      assert.equal(r.status, 403, `${m.method} ${m.path} must refuse an observer with 403`);
      assert.equal(r.body.code, "operator_role_required", `${m.method} ${m.path} must use the operator-role 403`);
    });
  }
});

describe("fail closed on an unrecognised or missing role", () => {
  test("a garbage admin_role value on an is_admin account is treated as observer, not operator", async () => {
    userRows[OPERATOR_UID] = { is_admin: true, email: "operator@circuvent.com", admin_role: "super-admin-typo" };
    stubQueries(() => {
      throw new Error("must not reach a mutating query with an unrecognised role");
    });
    const token = tokenFor(OPERATOR_UID, "operator@circuvent.com");
    const r = await call(token, "POST", "/admin/broadcast", { command: { action: "unlock" } });
    assert.equal(r.status, 403, "an unrecognised role must never be treated as operator");
  });

  test("a null admin_role (e.g. a pre-migration read glitch) is treated as observer", async () => {
    userRows[OPERATOR_UID] = { is_admin: true, email: "operator@circuvent.com", admin_role: null };
    stubQueries(() => {
      throw new Error("must not reach a mutating query with a null role");
    });
    const token = tokenFor(OPERATOR_UID, "operator@circuvent.com");
    const r = await call(token, "POST", "/admin/broadcast", { command: { action: "unlock" } });
    assert.equal(r.status, 403);
  });

  test("case is not forgiven: 'Operator' is not 'operator'", async () => {
    userRows[OPERATOR_UID] = { is_admin: true, email: "operator@circuvent.com", admin_role: "Operator" };
    stubQueries(() => {
      throw new Error("must not reach a mutating query for a mis-cased role");
    });
    const token = tokenFor(OPERATOR_UID, "operator@circuvent.com");
    const r = await call(token, "POST", "/admin/broadcast", { command: { action: "unlock" } });
    assert.equal(r.status, 403);
  });

  test("an unrecognised role can still read — GET is unaffected by the fail-closed rule", async () => {
    // Fail-closed means "cannot write", not "cannot see". A garbage value must
    // not turn into an accidental lockout of read access either.
    userRows[OPERATOR_UID] = { is_admin: true, email: "operator@circuvent.com", admin_role: "not-a-real-role" };
    stubQueries((sql) => (sql.includes("FROM devices d LEFT JOIN users u") ? [{ id: "lock-1" }] : []));
    const token = tokenFor(OPERATOR_UID, "operator@circuvent.com");
    const r = await call(token, "GET", "/admin/devices");
    assert.equal(r.status, 200);
  });
});

describe("the default keeps every existing admin's access unchanged", () => {
  test("an is_admin account with admin_role = 'operator' (the column default) broadcasts exactly as before", async () => {
    // This is the row shape every already-is_admin account has the instant the
    // `ALTER TABLE ... ADD COLUMN admin_role ... DEFAULT 'operator'` runs:
    // is_admin was already true, and admin_role now exists holding its default,
    // untouched by anything else. Access must be byte-identical to pre-migration.
    userRows[OPERATOR_UID] = { is_admin: true, email: "long-time-admin@circuvent.com", admin_role: "operator" };
    __setMqttClientForTests({ publish: () => {} } as unknown as MqttClient);
    stubQueries((sql) => (sql.includes("SELECT id FROM devices") ? [{ id: "lock-1" }] : []));
    const token = tokenFor(OPERATOR_UID, "long-time-admin@circuvent.com");
    const r = await call(token, "POST", "/admin/broadcast", { command: { action: "unlock" } });
    assert.equal(r.status, 200, "an existing admin must broadcast exactly as they could before this migration shipped");
    assert.equal(r.body.sent, 1);
  });

  test("the same account also keeps every other mutating action — device delete", async () => {
    userRows[OPERATOR_UID] = { is_admin: true, email: "long-time-admin@circuvent.com", admin_role: "operator" };
    // The handler also deprovisions the device's broker client; give it a fake
    // client so that is a no-op instead of a logged (harmless but noisy) error.
    __setMqttClientForTests({ publish: () => {} } as unknown as MqttClient);
    stubQueries(() => []);
    const token = tokenFor(OPERATOR_UID, "long-time-admin@circuvent.com");
    const r = await call(token, "DELETE", "/admin/devices/dev-1", {});
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
  });
});

describe("is_admin is still the only door into /admin", () => {
  test("a non-admin account is refused before admin_role is ever consulted", async () => {
    stubQueries();
    const token = tokenFor(NON_ADMIN_UID, "nobody@circuvent.com");
    const r = await call(token, "GET", "/admin/devices");
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "Admin access required");
  });

  test("a non-admin account cannot reach a mutating route either, for the same reason", async () => {
    stubQueries();
    const token = tokenFor(NON_ADMIN_UID, "nobody@circuvent.com");
    const r = await call(token, "POST", "/admin/broadcast", { command: { action: "unlock" } });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "Admin access required");
  });
});
