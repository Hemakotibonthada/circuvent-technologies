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

/** What a browser sends. Express reads this to choose HTML over JSON. */
const BROWSER = { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };

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

    test(`${path} serves a real page to a browser`, async () => {
      /*
       * A JSON blob in a browser window is not a page. Somebody checking a
       * deployment, or a reviewer following a URL out of a console, is a
       * person — and a wall of quoted keys reads as unfinished whatever it
       * says.
       */
      const res = await fetch(base + path, { headers: BROWSER });
      assert.match(res.headers.get("content-type") ?? "", /text\/html/);
      const html = await res.text();
      assert.match(html, /<!doctype html>/i);
      assert.match(html, /Circuvent/);
      assert.match(html, /This endpoint is working/i, "must say plainly that nothing is broken");
      assert.match(html, /Google Home or Alexa app/i, "must say what to do instead");
    });

    test(`${path} still serves JSON to everything else`, async () => {
      /*
       * The other audience. Monitors, curl in a runbook and deployment checks
       * send `*​/*` or nothing, and serving them markup would break every
       * script that reads these endpoints. Getting the Accept ordering
       * backwards is the easy mistake, so it is pinned here.
       */
      const machineAccepts: Array<Record<string, string>> = [
        {},
        { accept: "*/*" },
        { accept: "application/json" },
      ];
      for (const headers of machineAccepts) {
        const res = await fetch(base + path, { headers });
        assert.match(
          res.headers.get("content-type") ?? "",
          /application\/json/,
          `Accept: ${JSON.stringify(headers)} should get JSON`
        );
        const body = (await res.json()) as { message?: string; error?: string };
        assert.equal(body.error, "method_not_allowed");
        assert.match(String(body.message), /working/i);
      }
    });
  }
});

describe("the account-linking page", () => {
  test("visited bare, it explains rather than saying Invalid client_id", async () => {
    // True and unhelpful: it reads as a misconfiguration when the endpoint is
    // healthy and simply was not given the parameters an assistant sends.
    const res = await fetch(base + "/oauth/authorize", { headers: BROWSER });
    const text = await res.text();
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    assert.match(text, /This endpoint is working/i);
    assert.match(text, /Google Home or Alexa app/i);
    assert.doesNotMatch(text, /^Invalid client_id$/);
  });

  test("the sign-in form and the status page look like one product", async () => {
    /*
     * Somebody linking an account sees the status page and then the sign-in
     * form. Two visual identities on adjacent screens reads as two services
     * glued together, which is exactly the impression a reviewer forms.
     */
    const status = await fetch(base + "/oauth/authorize", { headers: BROWSER }).then((r) => r.text());
    const form = await fetch(
      base +
        "/oauth/authorize?client_id=circuvent-smarthome&redirect_uri=" +
        encodeURIComponent("https://oauth-redirect.googleusercontent.com/r/cv") +
        "&response_type=code&state=s",
      { headers: BROWSER }
    ).then((r) => r.text());

    for (const html of [status, form]) {
      assert.match(html, /Circuvent/);
      assert.match(html, /#06b6d4|#8b5cf6/, "both should carry the brand gradient");
      assert.match(html, /viewport/, "both must be usable on a phone");
    }
    assert.match(form, /Sign in/i, "the real form is still a form");
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
