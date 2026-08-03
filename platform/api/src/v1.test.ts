import "./test-env";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { pool } from "./db";
import { generateApiKey, invalidateKeyCache } from "./api-keys";
import { __setMqttClientForTests } from "./mqtt";
import { v1Router } from "./routes/v1";
import type { MqttClient } from "mqtt";

/**
 * Integration coverage for the public surface.
 *
 * api-keys.test.ts proves the middleware decides correctly in isolation. That
 * is not the same as proving the router is wired up: a mount path typo, a
 * handler that throws on an empty result, or a response shape that does not
 * match the published OpenAPI document would all pass unit tests and fail the
 * first real request. This boots the actual Express router over a real socket
 * and speaks HTTP to it.
 *
 * Postgres is stubbed per-test rather than run — these assertions are about
 * routing, auth wiring and response shape, none of which need a live database.
 */

let server: http.Server;
let base = "";

/** Routes queries to a canned answer chosen by what the SQL mentions. */
function stubQueries(handler: (sql: string, params: unknown[]) => unknown[]): void {
  (pool as unknown as { query: unknown }).query = async (sql: string, params: unknown[] = []) => {
    const rows = handler(sql, params);
    return { rows, rowCount: rows.length };
  };
}

const KEY = generateApiKey("live");

function keyRow(scopes: string[]) {
  return {
    id: 1,
    owner_id: 7,
    name: "Integration key",
    env: "live",
    scopes,
    allowed_origins: [] as string[],
    expires_at: null,
    revoked_at: null,
    blocked: false,
  };
}

const DEVICE = {
  id: "hub-a1b2",
  name: "Living room hub",
  type: "home-hub",
  room: "Living Room",
  favorite: true,
  online: true,
  last_seen: new Date("2026-08-03T09:12:44.201Z"),
  state: { power: true, power2: false },
  fw_version: "1.4.2",
};

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/v1", v1Router);
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  // Node's fetch (undici) keeps sockets alive in a pool, so server.close()
  // alone waits for those idle connections and the test process never exits.
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

async function get(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, { headers });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("GET /v1 index", () => {
  test("is reachable without a credential", async () => {
    // A developer whose key will not work needs to confirm the base URL is
    // right before they can debug anything else.
    const r = await get("/v1");
    assert.equal(r.status, 200);
    assert.equal(r.body.version, "1");
  });

  test("advertises every scope with a description", async () => {
    const r = await get("/v1");
    const scopes = r.body.scopes as { scope: string; description: string }[];
    assert.ok(scopes.length >= 10);
    for (const s of scopes) assert.ok(s.description.length > 10, s.scope);
  });

  test("the advertised endpoint list matches the documented paths", async () => {
    const r = await get("/v1");
    const paths = (r.body.endpoints as { path: string }[]).map((e) => e.path);
    for (const expected of [
      "/v1/devices",
      "/v1/devices/{id}/commands",
      "/v1/scenes/{id}/activate",
      "/v1/events",
    ]) {
      assert.ok(paths.includes(expected), `index is missing ${expected}`);
    }
  });
});

describe("authentication over HTTP", () => {
  test("an unauthenticated request is refused", async () => {
    const r = await get("/v1/devices");
    assert.equal(r.status, 401);
  });

  test("a valid key returns devices in the documented shape", async () => {
    invalidateKeyCache();
    stubQueries((sql) => {
      if (sql.includes("api_keys")) return [keyRow(["devices:read"])];
      if (sql.includes("FROM devices")) return [DEVICE];
      return [];
    });

    const r = await get("/v1/devices", { authorization: `Bearer ${KEY.secret}` });
    assert.equal(r.status, 200);
    const devices = r.body.devices as Record<string, unknown>[];
    assert.equal(devices.length, 1);

    const d = devices[0];
    // These names are published in the OpenAPI document and on the docs page.
    // Renaming one silently breaks every integration, so pin them here.
    assert.deepEqual(Object.keys(d).sort(), [
      "favorite",
      "firmware",
      "id",
      "lastSeen",
      "name",
      "online",
      "room",
      "state",
      "type",
    ]);
    assert.equal(d.id, "hub-a1b2");
    assert.equal(d.lastSeen, "2026-08-03T09:12:44.201Z");
    assert.deepEqual(d.state, { power: true, power2: false });
  });

  test("a key without the scope gets 403 naming what it needs", async () => {
    invalidateKeyCache();
    stubQueries((sql) => (sql.includes("api_keys") ? [keyRow(["devices:read"])] : []));

    const res = await fetch(base + "/v1/devices/hub-a1b2/commands", {
      method: "POST",
      headers: { authorization: `Bearer ${KEY.secret}`, "content-type": "application/json" },
      body: JSON.stringify({ power: true }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.code, "insufficient_scope");
    assert.equal(body.required, "devices:control");
  });
});

describe("commands", () => {
  /** Records what would have gone to the broker. */
  const published: { topic: string; payload: string }[] = [];
  const fakeBroker = {
    publish: (topic: string, payload: string) => {
      published.push({ topic, payload });
    },
  } as unknown as MqttClient;

  test("responds 202, not 200 — accepted for delivery, not confirmed", async () => {
    invalidateKeyCache();
    __setMqttClientForTests(fakeBroker);
    published.length = 0;
    stubQueries((sql) => {
      if (sql.includes("api_keys")) return [keyRow(["devices:control"])];
      if (sql.includes("FROM devices WHERE id")) return [{ id: "hub-a1b2" }];
      return [];
    });

    const res = await fetch(base + "/v1/devices/hub-a1b2/commands", {
      method: "POST",
      headers: { authorization: `Bearer ${KEY.secret}`, "content-type": "application/json" },
      body: JSON.stringify({ ch: 0, on: true }),
    });
    assert.equal(res.status, 202);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.accepted, true);
    assert.deepEqual(body.command, { ch: 0, on: true });

    // The command must actually reach the device's topic unchanged.
    assert.equal(published.length, 1);
    assert.equal(published[0].topic, "cv/hub-a1b2/cmd");
    assert.deepEqual(JSON.parse(published[0].payload), { ch: 0, on: true });
    __setMqttClientForTests(null);
  });

  test("rejects a non-object body", async () => {
    invalidateKeyCache();
    stubQueries((sql) => (sql.includes("api_keys") ? [keyRow(["devices:control"])] : []));

    const res = await fetch(base + "/v1/devices/hub-a1b2/commands", {
      method: "POST",
      headers: { authorization: `Bearer ${KEY.secret}`, "content-type": "application/json" },
      body: JSON.stringify(["power", true]),
    });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as Record<string, unknown>).code, "invalid_body");
  });

  test("a device on another account is 404, not 403", async () => {
    // 403 would confirm the id exists.
    invalidateKeyCache();
    stubQueries((sql) => (sql.includes("api_keys") ? [keyRow(["devices:control"])] : []));

    const res = await fetch(base + "/v1/devices/someone-elses-device/commands", {
      method: "POST",
      headers: { authorization: `Bearer ${KEY.secret}`, "content-type": "application/json" },
      body: JSON.stringify({ power: true }),
    });
    assert.equal(res.status, 404);
  });
});

describe("broker unavailable", () => {
  test("answers 503 instead of hanging when MQTT is down", async () => {
    // publishCommand throws "MQTT not connected" whenever the broker is
    // restarting — which index.ts explicitly plans for. Express 4 does not
    // catch rejections from async handlers, so without the safe() wrapper this
    // request never gets a response at all and the caller waits until its own
    // timeout. A hung integration is far worse than an error it can retry.
    invalidateKeyCache();
    stubQueries((sql) => {
      if (sql.includes("api_keys")) return [keyRow(["devices:control"])];
      if (sql.includes("FROM devices WHERE id")) return [{ id: "hub-a1b2" }];
      return [];
    });

    const res = await fetch(base + "/v1/devices/hub-a1b2/commands", {
      method: "POST",
      headers: { authorization: `Bearer ${KEY.secret}`, "content-type": "application/json" },
      body: JSON.stringify({ power: true }),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(res.status, 503);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.code, "broker_unavailable");
  });
});

describe("input validation", () => {
  test("a malformed `since` is refused rather than silently ignored", async () => {
    invalidateKeyCache();
    stubQueries((sql) => (sql.includes("api_keys") ? [keyRow(["events:read"])] : []));

    const r = await get("/v1/events?since=not-a-date", { authorization: `Bearer ${KEY.secret}` });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "invalid_query");
  });
});

describe("unknown routes", () => {
  test("return the /v1 JSON error shape, not an HTML 404", async () => {
    const r = await get("/v1/does-not-exist");
    assert.equal(r.status, 404);
    assert.equal(r.body.code, "not_found");
  });
});
