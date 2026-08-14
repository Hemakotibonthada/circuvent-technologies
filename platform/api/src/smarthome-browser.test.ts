import "./test-env";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import type { AddressInfo } from "node:net";
import { smarthomeRouter } from "./routes/smarthome";
import { oauthRouter } from "./routes/oauth";

/**
 * What a browser is told when it lands on a POST-only endpoint.
 *
 * These endpoints answer POST from Google's and Amazon's servers, so a GET
 * fell through to the catch-all and returned `{"error":"Not found"}`. The
 * endpoint was healthy; the message said it did not exist.
 *
 * That is not a cosmetic difference. Pasting the fulfilment URL into a browser
 * is the first thing anybody does when account linking misbehaves, and it is
 * something a certification reviewer does too — so the natural first check
 * reported the integration as missing while it worked perfectly. It cost the
 * person who owns this product a round of "is it broken?" before anyone had
 * looked at a log.
 */

let server: http.Server;
let base = "";

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/smarthome", smarthomeRouter);
  app.use("/oauth", oauthRouter);
  /* The same catch-all as index.ts, so a route that stops matching falls
     through here exactly as it does in production and the test sees the 404
     rather than a hang. */
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((r) => server.close(() => r()));
});

const POST_ONLY = ["/smarthome/google", "/smarthome/alexa", "/oauth/token"];

describe("a browser landing on a POST-only endpoint", () => {
  for (const path of POST_ONLY) {
    test(`${path} answers 405, not 404`, async () => {
      const res = await fetch(base + path);
      assert.equal(
        res.status,
        405,
        `${path} said ${res.status}. 404 means "there is nothing here", which is untrue and reads as a broken deploy.`
      );
    });

    test(`${path} says which method it wants`, async () => {
      const res = await fetch(base + path);
      assert.equal(res.headers.get("allow"), "POST");
    });

    test(`${path} tells a person it is working`, async () => {
      /*
       * The message is the point. A machine-readable 405 still leaves somebody
       * staring at a browser wondering whether their deployment is broken.
       */
      const res = await fetch(base + path);
      const body = (await res.json()) as { message?: string };
      assert.match(String(body.message), /working/i, "should say plainly that the endpoint is healthy");
      assert.match(String(body.message), /browser/i, "should explain why they are seeing it");
    });
  }
});

describe("the account-linking page", () => {
  test("visited bare, it explains rather than saying Invalid client_id", async () => {
    // True and unhelpful: it reads as a misconfiguration when the endpoint is
    // healthy and simply was not given the parameters an assistant sends.
    const res = await fetch(base + "/oauth/authorize");
    const text = await res.text();
    assert.match(text, /working/i);
    assert.match(text, /Google Home|Alexa/);
    assert.doesNotMatch(text, /^Invalid client_id$/);
  });

  test("a wrong client_id is still refused plainly", async () => {
    // The friendly page must not become a way to skip the check.
    const res = await fetch(base + "/oauth/authorize?client_id=wrong&redirect_uri=https://x.test/");
    assert.equal(res.status, 400);
    assert.match(await res.text(), /Invalid client_id/);
  });

  test("a hostile redirect_uri is refused even with the right client_id", async () => {
    const bad =
      "/oauth/authorize?client_id=circuvent-smarthome&redirect_uri=" +
      encodeURIComponent("https://oauth-redirect.googleusercontent.com@evil.tld/r/x");
    const res = await fetch(base + bad);
    assert.equal(res.status, 400);
    assert.match(await res.text(), /Invalid redirect_uri/);
  });
});

describe("POST still behaves", () => {
  test("the fulfilment endpoints answer their own protocol, not 405", async () => {
    // The 405 handler must sit beside the POST route, never in front of it.
    const google = await fetch(base + "/smarthome/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: "t", inputs: [{ intent: "action.devices.SYNC" }] }),
    });
    assert.equal(google.status, 401, "unauthenticated SYNC is an auth failure, not a method error");

    const token = await fetch(base + "/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", code: "x" }),
    });
    assert.equal(token.status, 401);
    assert.deepEqual(await token.json(), { error: "invalid_client" });
  });
});
