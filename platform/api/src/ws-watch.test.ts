import "./test-env";
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import type { AddressInfo } from "node:net";
import { pool } from "./db";
import { config } from "./config";
import { clearSessionCache } from "./sessions";
import { attachWebSocket } from "./ws";
import { bus, watchedDevices } from "./mqtt";

/**
 * The camera watch handshake.
 *
 * A frame is relayed only if the device id is in `watchedDevices`, which is
 * populated when a client sends `{type:"watch"}`. Every other feed — state,
 * telemetry, status — needs no message from the client at all. So when the
 * watch is lost the app looks completely healthy: the device reports Online,
 * its settings update live, and only the video never starts. There is nothing
 * in a log to suggest where to look.
 *
 * That is what these tests pin down. The clients send `watch` from `onopen`,
 * which fires the instant the handshake completes, while the server was
 * attaching its `message` listener only after awaiting a Postgres round-trip.
 * The message arrived at an EventEmitter with no listener and was dropped.
 */

const DEVICE_ID = "camera-a41c9e02";
let server: http.Server;
let url = "";

function stubPool(): void {
  (pool as unknown as { query: unknown }).query = async (sql: string) => {
    if (sql.includes("token_epoch")) return { rows: [{ token_epoch: "0", blocked: false }], rowCount: 1 };
    if (sql.includes("FROM devices WHERE owner_id")) {
      // A deliberate delay. The real query is a round-trip to Postgres; without
      // something standing in for it the race closes by accident on a fast
      // machine and the test passes against the broken ordering.
      await new Promise((r) => setTimeout(r, 40));
      return { rows: [{ id: DEVICE_ID }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
}

function token(uid = 7): string {
  return jwt.sign({ uid, email: "owner@example.com", te: 0 }, config.JWT_SECRET, { expiresIn: "1h" });
}

before(async () => {
  server = http.createServer();
  attachWebSocket(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  clearSessionCache();
  watchedDevices.clear();
  stubPool();
});

/** Opens a socket and sends `watch` from onopen, exactly as the apps do. */
function connectAndWatch(deviceId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${url}?token=${encodeURIComponent(token())}`);
    ws.on("open", () => {
      // The real clients call rearmWatches() here — synchronously, in onopen.
      ws.send(JSON.stringify({ type: "watch", deviceId }));
      resolve(ws);
    });
    ws.on("error", reject);
  });
}

/** Waits for `watchedDevices` to contain an id, or gives up. */
async function watchRegistered(id: string, ms = 1500): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (watchedDevices.has(id)) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
}

describe("watch handshake", () => {
  test("a watch sent immediately on open is not lost", async () => {
    // This is the whole bug. A client cannot know when the server has finished
    // reading its device list, so the server has to be listening from the
    // first tick rather than after an await.
    const ws = await connectAndWatch(DEVICE_ID);
    assert.equal(
      await watchRegistered(DEVICE_ID),
      true,
      "the watch sent in onopen never reached the server — camera frames would never be relayed"
    );
    ws.close();
  });

  test("frames reach a socket that watched immediately on open", async () => {
    const ws = await connectAndWatch(DEVICE_ID);
    assert.equal(await watchRegistered(DEVICE_ID), true);

    const got = new Promise<Record<string, unknown>>((resolve) => {
      ws.on("message", (raw) => {
        const m = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (m.type === "device:frame") resolve(m);
      });
    });

    bus.emit("device:frame", {
      deviceId: DEVICE_ID,
      data: Buffer.from([0xff, 0xd8, 0xff]),
      bytes: 3,
      at: new Date().toISOString(),
    });

    const frame = await Promise.race([
      got,
      new Promise<null>((r) => setTimeout(() => r(null), 1500)),
    ]);
    assert.ok(frame, "the frame was never delivered to the watching client");
    assert.equal(frame.deviceId, DEVICE_ID);
    ws.close();
  });

  test("a client that did not ask for binary still gets base64 JSON", async () => {
    /*
     * Every app and browser in the field speaks the JSON shape. Defaulting the
     * other way would have turned all of their video off in one deploy, so the
     * default is pinned here rather than left to be inferred from the code.
     */
    const ws = await connectAndWatch(DEVICE_ID);
    assert.equal(await watchRegistered(DEVICE_ID), true);

    const got = new Promise<Record<string, unknown>>((resolve) => {
      ws.on("message", (raw, isBinary) => {
        if (isBinary) return;
        const m = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (m.type === "device:frame") resolve(m);
      });
    });

    bus.emit("device:frame", {
      deviceId: DEVICE_ID,
      data: Buffer.from([0xff, 0xd8, 0xff]),
      bytes: 3,
      at: new Date().toISOString(),
    });

    const frame = await Promise.race([
      got,
      new Promise<null>((r) => setTimeout(() => r(null), 1500)),
    ]);
    assert.ok(frame, "a legacy client stopped receiving frames");
    assert.equal(frame.jpeg, Buffer.from([0xff, 0xd8, 0xff]).toString("base64"));
    ws.close();
  });

  test("a client that says hello binaryFrames gets raw bytes", async () => {
    const ws = await connectAndWatch(DEVICE_ID);
    ws.send(JSON.stringify({ type: "hello", binaryFrames: true }));
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(await watchRegistered(DEVICE_ID), true);

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const got = new Promise<Buffer>((resolve) => {
      ws.on("message", (raw, isBinary) => {
        if (isBinary) resolve(raw as Buffer);
      });
    });

    bus.emit("device:frame", {
      deviceId: DEVICE_ID,
      data: jpeg,
      bytes: jpeg.length,
      at: new Date().toISOString(),
    });

    const buf = await Promise.race([
      got,
      new Promise<null>((r) => setTimeout(() => r(null), 1500)),
    ]);
    assert.ok(buf, "no binary frame arrived");
    assert.equal(buf[0], 1, "wire version must lead so an old client can refuse it");
    const idLen = buf[1];
    assert.equal(buf.subarray(2, 2 + idLen).toString("ascii"), DEVICE_ID);
    // The JPEG must survive byte for byte — this is the whole point of not
    // sending it through base64 and JSON.
    assert.deepEqual(buf.subarray(2 + idLen), jpeg);
    ws.close();
  });

  test("a watch for a device the caller does not own is refused", async () => {
    const ws = await connectAndWatch("someone-elses-camera");
    // Give the server the same window it would have had to accept it.
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(watchedDevices.has("someone-elses-camera"), false);
    ws.close();
  });

  test("unwatch releases the device so the camera stops being decoded", async () => {
    const ws = await connectAndWatch(DEVICE_ID);
    assert.equal(await watchRegistered(DEVICE_ID), true);
    ws.send(JSON.stringify({ type: "unwatch", deviceId: DEVICE_ID }));
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline && watchedDevices.has(DEVICE_ID)) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(watchedDevices.has(DEVICE_ID), false);
    ws.close();
  });

  test("a dropped socket releases its watches", async () => {
    // Otherwise the server keeps decoding frames for a viewer that is gone.
    const ws = await connectAndWatch(DEVICE_ID);
    assert.equal(await watchRegistered(DEVICE_ID), true);
    ws.close();
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline && watchedDevices.has(DEVICE_ID)) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(watchedDevices.has(DEVICE_ID), false);
  });

  test("two viewers of one camera are refcounted", async () => {
    const a = await connectAndWatch(DEVICE_ID);
    const b = await connectAndWatch(DEVICE_ID);
    assert.equal(await watchRegistered(DEVICE_ID), true);
    a.close();
    await new Promise((r) => setTimeout(r, 300));
    // One viewer leaving must not stop the feed for the other.
    assert.equal(watchedDevices.has(DEVICE_ID), true);
    b.close();
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline && watchedDevices.has(DEVICE_ID)) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(watchedDevices.has(DEVICE_ID), false);
  });
});
