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
import { generateSerial } from "./serial";
import { __setMqttClientForTests } from "./mqtt";
import { adminRouter } from "./routes/admin";
import type { MqttClient } from "mqtt";

/**
 * Integration coverage for the device registry.
 *
 * The assertion that earns its keep here is the route-order one. Express
 * matches in registration order, so a literal `/devices/lookup` declared after
 * `/devices/:id` is silently swallowed — the lookup endpoint would return "no
 * such device" for every query and look like a data problem rather than a
 * routing one. Nothing in a unit test catches that; only speaking HTTP does.
 */

let server: http.Server;
let base = "";
let token = "";

const SERIAL = generateSerial("smart-plug", "a41c9e02");

const DEVICE = {
  id: "smart-plug-a41c9e02",
  serial: SERIAL,
  name: "Lobby plug",
  type: "smart-plug",
  room: "Lobby",
  online: true,
  last_seen: new Date("2026-08-03T09:00:00.000Z"),
  fw_version: "1.4.2",
  created_at: new Date("2026-01-05T08:30:00.000Z"),
  batch: "",
  owner_email: "customer@example.com",
  owner_id: "7",
};

/** Every query the routes make, answered by what the SQL mentions. */
function stubQueries(handler: (sql: string, params: unknown[]) => unknown[]): void {
  (pool as unknown as { query: unknown }).query = async (sql: string, params: unknown[] = []) => {
    // The admin guard runs before every route. This registry is exercised by an
    // operator throughout, matching every one of these tests' existing
    // expectations of full read/write access — the observer/operator split is
    // covered separately in admin-roles.test.ts.
    if (sql.includes("is_admin")) {
      return { rows: [{ is_admin: true, email: "ops@circuvent.com", admin_role: "operator" }], rowCount: 1 };
    }
    if (sql.includes("token_epoch") && sql.includes("blocked")) {
      return { rows: [{ token_epoch: "0", blocked: false }], rowCount: 1 };
    }
    const rows = handler(sql, params);
    return { rows, rowCount: rows.length };
  };
}

before(async () => {
  token = jwt.sign({ uid: 1, email: "ops@circuvent.com", te: 0 }, config.JWT_SECRET, { expiresIn: "1h" });
  const app = express();
  app.use(express.json());
  app.use("/admin", adminRouter);
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  // undici pools sockets; without this server.close() waits on idle
  // connections and the test process never exits.
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  __setMqttClientForTests(null);
});

beforeEach(() => {
  clearSessionCache();
});

async function call(
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

describe("lookup routing", () => {
  test("/devices/lookup is not swallowed by /devices/:id", async () => {
    // If the literal route were registered after the parameterised one this
    // would come back as a device named "lookup" — a 404 that looks like bad
    // data and would be debugged in the wrong place entirely.
    stubQueries((sql) => (sql.includes("FROM devices d") ? [DEVICE] : []));
    const r = await call("GET", `/admin/devices/lookup?q=${encodeURIComponent(SERIAL)}`);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.devices), "lookup returned a device record, not a list");
    assert.equal(r.body.matchedBy, "serial");
  });

  test("requires a usable search term", async () => {
    stubQueries(() => []);
    assert.equal((await call("GET", "/admin/devices/lookup?q=")).status, 400);
    assert.equal((await call("GET", "/admin/devices/lookup?q=a")).status, 400);
  });
});

describe("serial lookup", () => {
  test("normalises what an operator types off a label", async () => {
    let queriedWith: unknown[] = [];
    stubQueries((sql, params) => {
      if (sql.includes("FROM devices d")) {
        queriedWith = params;
        return [DEVICE];
      }
      return [];
    });
    // Lower case, no dashes — what somebody actually types while on the phone.
    const messy = SERIAL.toLowerCase().replace(/-/g, "");
    const r = await call("GET", `/admin/devices/lookup?q=${encodeURIComponent(messy)}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.normalized, SERIAL);
    assert.equal(queriedWith[0], SERIAL, "the query must use the canonical serial");
  });

  test("a mistyped serial says so instead of returning nothing", async () => {
    // "Not found" would send the operator looking for a device that never
    // existed. The check character knows the difference.
    stubQueries(() => []);
    const broken = SERIAL.slice(0, -1) + (SERIAL.endsWith("Z") ? "Y" : "Z");
    const r = await call("GET", `/admin/devices/lookup?q=${encodeURIComponent(broken)}`);
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "bad_serial_checksum");
  });

  test("falls back to a fuzzy search for anything that is not a serial", async () => {
    stubQueries((sql) => (sql.includes("LIKE $1") ? [DEVICE] : []));
    const r = await call("GET", "/admin/devices/lookup?q=customer@example.com");
    assert.equal(r.status, 200);
    assert.equal(r.body.matchedBy, "search");
    assert.equal((r.body.devices as unknown[]).length, 1);
  });
});

describe("reissue key", () => {
  test("refuses without a reason", async () => {
    // The action disconnects a customer's device. It must not be possible to
    // do it with nothing on the record explaining why.
    stubQueries(() => []);
    const r = await call("POST", "/admin/devices/smart-plug-a41c9e02/reissue-key", {});
    assert.equal(r.status, 400);

    const short = await call("POST", "/admin/devices/smart-plug-a41c9e02/reissue-key", { note: "x" });
    assert.equal(short.status, 400);
  });

  test("issues a new key and records the reason", async () => {
    const audits: unknown[][] = [];
    __setMqttClientForTests({ publish: () => {} } as unknown as MqttClient);
    stubQueries((sql, params) => {
      if (sql.includes("SELECT id, owner_id, key_rotations")) {
        return [{ id: DEVICE.id, owner_id: "7", key_rotations: 1 }];
      }
      if (sql.includes("INSERT INTO device_audit")) {
        audits.push(params);
        return [];
      }
      return [];
    });

    const r = await call("POST", `/admin/devices/${DEVICE.id}/reissue-key`, {
      note: "Customer lost the claim card — ticket 4471",
    });
    assert.equal(r.status, 200);
    assert.equal(typeof r.body.key, "string");
    assert.ok((r.body.key as string).length > 10);
    assert.equal(r.body.mqttPassword, r.body.key);
    assert.equal(audits.length, 1, "the reissue must reach the audit trail");
    assert.equal(audits[0][3], "reissue-key");
    assert.ok(String(audits[0][5]).includes("4471"));
    __setMqttClientForTests(null);
  });

  test("404s for a device that does not exist", async () => {
    stubQueries(() => []);
    const r = await call("POST", "/admin/devices/nope/reissue-key", { note: "a valid reason" });
    assert.equal(r.status, 404);
  });
});

describe("assign", () => {
  test("requires a reason for an unaudited-looking transfer", async () => {
    stubQueries(() => []);
    const r = await call("POST", `/admin/devices/${DEVICE.id}/assign`, { ownerEmail: "new@example.com" });
    assert.equal(r.status, 400);
  });

  test("refuses an address with no account rather than orphaning the device", async () => {
    stubQueries((sql) => {
      if (sql.includes("SELECT id, owner_id FROM devices")) return [{ id: DEVICE.id, owner_id: "7" }];
      return []; // no user matches
    });
    const r = await call("POST", `/admin/devices/${DEVICE.id}/assign`, {
      ownerEmail: "nobody@example.com",
      note: "RMA 4471",
    });
    assert.equal(r.status, 404);
  });

  test("transfers and audits", async () => {
    const audits: unknown[][] = [];
    stubQueries((sql, params) => {
      if (sql.includes("SELECT id, owner_id FROM devices")) return [{ id: DEVICE.id, owner_id: "7" }];
      if (sql.includes("FROM users WHERE LOWER(email)")) return [{ id: "9", email: "new@example.com" }];
      if (sql.includes("INSERT INTO device_audit")) {
        audits.push(params);
        return [];
      }
      return [];
    });
    const r = await call("POST", `/admin/devices/${DEVICE.id}/assign`, {
      ownerEmail: "new@example.com",
      note: "RMA 4471 — replacement unit",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.ownerEmail, "new@example.com");
    assert.equal(audits.length, 1);
    assert.equal(audits[0][3], "assign");
  });
});

describe("claim for user", () => {
  test("refuses a key that does not match the device", async () => {
    stubQueries((sql) => {
      if (sql.includes("key_hash")) {
        // A real bcrypt hash of something else entirely.
        return [{ id: DEVICE.id, key_hash: "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy", owner_id: null }];
      }
      return [];
    });
    const r = await call("POST", "/admin/devices/claim-for-user", {
      device: SERIAL,
      key: "definitely-not-the-key",
      ownerEmail: "customer@example.com",
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "key_mismatch");
  });

  test("404s for an unknown serial", async () => {
    stubQueries(() => []);
    const r = await call("POST", "/admin/devices/claim-for-user", {
      device: SERIAL,
      key: "some-key-value",
      ownerEmail: "customer@example.com",
    });
    assert.equal(r.status, 404);
  });

  test("validates its input before touching anything", async () => {
    stubQueries(() => {
      throw new Error("must not query on invalid input");
    });
    const r = await call("POST", "/admin/devices/claim-for-user", { device: SERIAL, key: "k" });
    assert.equal(r.status, 400);
  });
});

describe("report", () => {
  test("returns the assembled admin report", async () => {
    stubQueries((sql) => {
      if (sql.includes("FROM devices d LEFT JOIN users u")) {
        return [
          {
            ...DEVICE,
            hwid: "a41c9e02",
            favorite: false,
            state: { power: true },
            notes: "",
            key_issued_at: new Date("2026-01-05T08:30:00.000Z"),
            key_rotated_at: null,
            key_rotations: 0,
            owner_name: "A Customer",
          },
        ];
      }
      if (sql.includes("telemetry_total")) {
        return [{ telemetry_total: "10", command_total: "3", first_seen: null }];
      }
      return [];
    });
    const r = await call("GET", `/admin/devices/${DEVICE.id}/report`);
    assert.equal(r.status, 200);
    const report = r.body.report as Record<string, Record<string, unknown>>;
    assert.equal(report.audience, "admin" as unknown as Record<string, unknown>);
    assert.equal(report.identity.serial, SERIAL);
    assert.equal(report.ownership.ownerEmail, "customer@example.com");
    // Even the operator's copy contains no credential — there is none to give.
    assert.equal(report.credentials.recoverable, false);
    assert.ok(!JSON.stringify(report).includes("key_hash"));
  });

  test("404s for an unknown device", async () => {
    stubQueries(() => []);
    assert.equal((await call("GET", "/admin/devices/nope/report")).status, 404);
  });
});
