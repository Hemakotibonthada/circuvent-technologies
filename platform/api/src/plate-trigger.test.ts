import "./test-env";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { pool } from "./db";
import { automationRouter } from "./routes/automations";
import { signUserToken } from "./auth";

/**
 * Plate triggers, over real HTTP.
 *
 * The failure this guards against is the worst shape a bug can take here: a
 * rule that saves, shows as enabled, displays a sensible description — and
 * never fires. The ANPR pipeline publishes `payload.plate` already normalised,
 * so a rule stored as the user typed it ("KA 01 AB 1234") can never equal the
 * read of that exact vehicle, and nothing anywhere reports a problem.
 *
 * Normalisation happens in the route rather than the console so that every
 * client gets it, which means it has to be proved through the route.
 */

let server: http.Server;
let base = "";
/**
 * Triggers the route handed to the INSERT, newest last.
 *
 * An array rather than a nullable variable: the value is written inside the
 * query stub, which TypeScript's control-flow analysis cannot see, so a plain
 * variable reset to null or undefined between cases narrows to `never` at
 * every read site.
 */
const inserted: Array<{ match?: Record<string, unknown> }> = [];
let auth = "";

function stubQueries(): void {
  (pool as unknown as { query: unknown }).query = async (sql: string, params: unknown[] = []) => {
    // requireAuth resolves the session epoch through sessions.ts.
    if (/FROM users/i.test(sql)) return { rows: [{ token_epoch: "0", blocked: false }], rowCount: 1 };
    // Device ownership check performed by ownsReferencedDevices.
    if (/FROM devices/i.test(sql)) return { rows: [{ id: "anpr-cam-a1" }], rowCount: 1 };
    if (/INSERT INTO automations/i.test(sql)) {
      inserted.push(params[3] as { match?: Record<string, unknown> });      return {
        rows: [{ id: 1, name: params[1], enabled: true, trigger: params[3], action: params[4], created_at: new Date() }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  };
}

before(async () => {
  stubQueries();
  auth = `Bearer ${await signUserToken({ uid: 7, email: "gate@example.com" })}`;
  const app = express();
  app.use(express.json());
  app.use("/automations", automationRouter);
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

async function createRule(match: Record<string, unknown>) {
  inserted.length = 0;
  const res = await fetch(`${base}/automations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: auth },
    body: JSON.stringify({
      name: "Open the gate for the car",
      trigger: { type: "event", deviceId: "anpr-cam-a1", eventType: "plate", match },
      action: { type: "command", deviceId: "anpr-cam-a1", command: { action: "open" } },
    }),
  });
  const stored = inserted.at(-1);
  return { status: res.status, match: stored?.match };
}

describe("plate trigger normalisation", () => {
  test("stores a spaced plate the way the pipeline publishes it", async () => {
    const r = await createRule({ plate: "KA 01 AB 1234" });
    assert.equal(r.status, 200);
    assert.equal(r.match?.plate, "KA01AB1234");
  });

  test("accepts the separators people actually type", async () => {
    assert.equal((await createRule({ plate: "ka-01-ab-1234" })).match?.plate, "KA01AB1234");
    assert.equal((await createRule({ plate: "  ka01ab1234  " })).match?.plate, "KA01AB1234");
  });

  test("corrects a character confusion the same way a read would be", async () => {
    // The recogniser corrects O->0 in a digit slot, so a rule typed with the
    // letter O must land on the same string or it can never match.
    assert.equal((await createRule({ plate: "KAO1AB1234" })).match?.plate, "KA01AB1234");
  });

  test("keeps the other match keys untouched", async () => {
    const r = await createRule({ plate: "KA 01 AB 1234", direction: "in", decision: "allow" });
    assert.deepEqual(r.match, { plate: "KA01AB1234", direction: "in", decision: "allow" });
  });

  test("leaves a string that is not a registration exactly as typed", async () => {
    // Rewriting it would hide the mistake from somebody reading their own rule
    // back. It cannot match a real read either way.
    assert.equal((await createRule({ plate: "NOT A PLATE" })).match?.plate, "NOTAPLATE");
  });

  test("does not touch a non-plate event's match", async () => {
    inserted.length = 0;
    const res = await fetch(`${base}/automations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth },
      body: JSON.stringify({
        name: "Welcome home",
        trigger: { type: "event", deviceId: "anpr-cam-a1", eventType: "access", match: { name: "Hema" } },
        action: { type: "notify", title: "Home" },
      }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(inserted.at(-1)?.match, { name: "Hema" });
  });
});
