import "./test-env";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import type { AddressInfo } from "node:net";
import { pool } from "./db";
import { config } from "./config";
import { clearSessionCache } from "./sessions";
import { attachWebSocket } from "./ws";

/**
 * The live socket, in a shared home.
 *
 * This is the half of household sharing that fails quietly rather than
 * dangerously. Every device query on the socket is `owner_id = uid`, and the
 * socket never went through `requireAuth`, so it had no idea a home had been
 * switched. A member viewing somebody else's house would have been sent their
 * *own* devices — so the console would list the shared home's devices over
 * HTTP and then never update any of them, and every toggle would look like it
 * did nothing at all.
 *
 * The refusal case matters for the same reason in reverse: falling back to
 * their own home would put one household's telemetry underneath another's
 * device list, which is worse than a closed socket.
 */

const OWNER = 7;
const HOME = 42;
const MEMBER = 9;

let server: http.Server;
let url = "";

/** Devices, by the account that owns them. */
const DEVICES: Record<number, { id: string; type: string }[]> = {
  [OWNER]: [{ id: "lamp-own", type: "smart-light" }],
  [HOME]: [
    { id: "lamp-shared", type: "smart-light" },
    { id: "cam-shared", type: "camera" },
  ],
};

/** Membership rows, keyed `home:member`. */
let memberships: Record<string, string> = {};

function stubPool(): void {
  (pool as unknown as { query: unknown }).query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes("token_epoch")) {
      return { rows: [{ token_epoch: "0", blocked: false }], rowCount: 1 };
    }
    if (sql.includes("FROM home_members")) {
      const role = memberships[`${params[0]}:${params[1]}`];
      return role ? { rows: [{ role }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (sql.includes("FROM devices WHERE owner_id")) {
      const rows = DEVICES[Number(params[0])] ?? [];
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  };
}

function token(uid: number): string {
  return jwt.sign({ uid, email: `u${uid}@example.com`, te: 0 }, config.JWT_SECRET, {
    expiresIn: "1h",
  });
}

/** Connects and resolves with the `ready` payload, or the close code. */
function connect(query: string): Promise<{ devices?: string[]; closed?: number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url + query);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("timed out"));
    }, 4000);

    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === "ready") {
        clearTimeout(timer);
        ws.close();
        resolve({ devices: m.devices });
      }
    });
    ws.on("close", (code) => {
      clearTimeout(timer);
      resolve({ closed: code });
    });
    ws.on("error", () => {
      /* A refused handshake closes; the close handler answers. */
    });
  });
}

before(async () => {
  stubPool();
  server = http.createServer();
  attachWebSocket(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((r) => server.close(() => r()));
});

describe("live socket in a shared home", () => {
  test("with no home asked for, you get your own devices", async () => {
    clearSessionCache();
    memberships = {};
    const r = await connect("?token=" + encodeURIComponent(token(OWNER)));
    assert.deepEqual(r.devices, ["lamp-own"]);
  });

  test("a member asking for a home they belong to gets that home's devices", async () => {
    // The failure this prevents is silent: without it they get their own
    // devices, so the console lists the shared home and never updates it.
    clearSessionCache();
    memberships = { [`${HOME}:${MEMBER}`]: "adult" };
    const r = await connect("?token=" + encodeURIComponent(token(MEMBER)) + "&home=" + HOME);
    assert.deepEqual(r.devices?.sort(), ["cam-shared", "lamp-shared"]);
  });

  test("a home they do not belong to is refused, not quietly swapped", async () => {
    clearSessionCache();
    memberships = {};
    const r = await connect("?token=" + encodeURIComponent(token(MEMBER)) + "&home=" + HOME);
    assert.equal(r.closed, 4403, "must close rather than fall back to their own home");
    assert.equal(r.devices, undefined);
  });

  test("a membership row claiming owner is refused", async () => {
    // The owner of a home is the account, never a row. Honouring one would
    // turn a bad migration into a live camera feed.
    clearSessionCache();
    memberships = { [`${HOME}:${MEMBER}`]: "owner" };
    const r = await connect("?token=" + encodeURIComponent(token(MEMBER)) + "&home=" + HOME);
    assert.equal(r.closed, 4403);
  });

  test("asking for your own home by id is not treated as a membership", async () => {
    // Nobody is a member of their own home, so a client that helpfully sends
    // its own id must not be refused for having no row.
    clearSessionCache();
    memberships = {};
    const r = await connect("?token=" + encodeURIComponent(token(OWNER)) + "&home=" + OWNER);
    assert.deepEqual(r.devices, ["lamp-own"]);
  });

  test("a junk home parameter falls back to your own rather than failing", async () => {
    clearSessionCache();
    memberships = {};
    for (const bad of ["abc", "-1", "0", ""]) {
      const r = await connect("?token=" + encodeURIComponent(token(OWNER)) + "&home=" + bad);
      assert.deepEqual(r.devices, ["lamp-own"], `home=${bad} should fall back`);
    }
  });
});
