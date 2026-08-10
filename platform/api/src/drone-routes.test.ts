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
import { droneRouter } from "./routes/drone";
import type { MqttClient } from "mqtt";

/**
 * HTTP-level coverage for the drone router.
 *
 * This exists because of a real support call: the console's Safety tab showed
 * a red "Not found" banner, which is the control plane's own 404 body. The
 * cause turned out to be a control plane running a build older than the
 * feature — but nothing in the code could tell those two apart, and the first
 * hour went into hunting a routing bug that did not exist.
 *
 * Two things are asserted here, and neither can be caught by a unit test:
 *
 *  1. **Every documented path resolves.** A literal route registered after a
 *     parameterised one is silently swallowed by it — the trap already
 *     documented for `/devices/lookup` in platform/DEVICE_REGISTRY.md. Here the
 *     candidate is `/drone/settings` sitting below `/drone/:id/command`; if
 *     that ever became a bare `/:id`, `settings` would be read as a device id
 *     and every save would 404.
 *
 *  2. **A missing route 404s while a present one does not.** That is the
 *     distinction the console now relies on to tell "this endpoint does not
 *     exist on this control plane" from "this request failed", so it has to
 *     stay true.
 */

let server: http.Server;
let base = "";
let token = "";

/** Answers every query these routes make from what the SQL mentions. */
function stubQueries(handler: (sql: string, params: unknown[]) => unknown[] = () => []): void {
  (pool as unknown as { query: unknown }).query = async (sql: string, params: unknown[] = []) => {
    // The auth guard runs before every route.
    if (sql.includes("token_epoch") && sql.includes("blocked")) {
      return { rows: [{ token_epoch: "0", blocked: false }], rowCount: 1 };
    }
    const rows = handler(sql, params);
    return { rows, rowCount: rows.length };
  };
}

before(async () => {
  token = jwt.sign({ uid: 1, email: "pilot@circuvent.com", te: 0 }, config.JWT_SECRET, { expiresIn: "1h" });
  __setMqttClientForTests({ publish: () => {} } as unknown as MqttClient);
  const app = express();
  app.use(express.json());
  app.use("/drone", droneRouter);
  // Mirrors the real server's terminal handler, so an unmatched path produces
  // exactly the body the console sees in production.
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
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
  stubQueries();
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

describe("every drone route resolves", () => {
  /*
   * The list is the API table in Docs/21-drone.md. A route that stops
   * resolving fails here rather than in a console tab three weeks later.
   */
  const GETS = [
    "/drone/live",
    "/drone/flights",
    "/drone/flights.csv",
    "/drone/missions",
    "/drone/batteries",
    "/drone/settings",
    "/drone/events",
  ];

  for (const path of GETS) {
    test(`GET ${path} is routed`, async () => {
      const r = await call("GET", path);
      assert.notEqual(
        r.status,
        404,
        `${path} returned the terminal 404 — the route is not registered, or a parameterised route above it swallowed the literal`
      );
    });
  }

  test("PUT /drone/settings is routed", async () => {
    const r = await call("PUT", "/drone/settings", { maxAltM: 100 });
    assert.notEqual(r.status, 404, "settings save is not routed");
  });

  /*
   * The specific swallow this file was written to prevent. `/drone/settings`
   * is a literal below `/drone/:id/command`; it must never be read as a device
   * named "settings".
   */
  test("/drone/settings is not read as a device id", async () => {
    const r = await call("GET", "/drone/settings");
    assert.equal(r.status, 200);
    assert.ok(r.body.settings, "settings returned something other than a settings object");
  });

  test("an unknown drone path still 404s", async () => {
    // The console distinguishes "this control plane is too old" from "this
    // request failed" purely by the status code, so a missing path must 404
    // and a present one must not.
    const r = await call("GET", "/drone/not-a-real-endpoint");
    assert.equal(r.status, 404);
    assert.equal(r.body.error, "Not found");
  });
});

describe("commands are refused with a reason, not a 404", () => {
  test("a command to an aircraft that is not ours is 404, with a message", async () => {
    stubQueries(() => []);
    const r = await call("POST", "/drone/nope/command", { action: "rtl" });
    assert.equal(r.status, 404);
    // Deliberately not the terminal "Not found": the route ran and made a
    // decision. If this ever read "Not found" the console would tell the
    // operator their control plane needs upgrading when in fact they simply do
    // not own that aircraft.
    assert.equal(r.body.error, "No such aircraft");
  });

  test("an unknown action is rejected by the schema", async () => {
    const r = await call("POST", "/drone/drone-link-1/command", { action: "barrel-roll" });
    assert.equal(r.status, 400);
  });
});
