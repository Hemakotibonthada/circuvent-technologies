import "./test-env";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { clientIp, factsFrom, geoFrom, isDue, resetThrottle, SEEN_THROTTLE_MS } from "./app-installs";

/*
 * Everything here arrives in headers, which means it arrives from whoever is
 * calling. The parsing is separated from the database precisely so the hostile
 * cases can be tested — they are the ones that matter, and none of them are
 * visible from the happy path.
 */

describe("finding the client's address", () => {
  /*
   * x-forwarded-for is a list appended to by each proxy, so the client is the
   * *first* entry and our own reverse proxy is the last. Reading the wrong end
   * gives every user the same address — which looks like it works right up to
   * the moment somebody tries to use it.
   */
  test("takes the first entry, not the last", () => {
    assert.equal(clientIp({ "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2" }), "203.0.113.9");
  });

  test("copes with a single entry and with padding", () => {
    assert.equal(clientIp({ "x-forwarded-for": "203.0.113.9" }), "203.0.113.9");
    assert.equal(clientIp({ "x-forwarded-for": "  203.0.113.9  ,10.0.0.1" }), "203.0.113.9");
  });

  test("falls back to x-real-ip and then to the socket", () => {
    assert.equal(clientIp({ "x-real-ip": "198.51.100.4" }), "198.51.100.4");
    assert.equal(clientIp({}, "192.0.2.7"), "192.0.2.7");
    assert.equal(clientIp({}), "");
  });

  /*
   * The same client over IPv4 and over an IPv4-mapped IPv6 socket would
   * otherwise read as two different addresses, and show as two installs.
   */
  test("normalises IPv4-mapped IPv6", () => {
    assert.equal(clientIp({}, "::ffff:203.0.113.9"), "203.0.113.9");
  });

  test("strips control characters and caps the length", () => {
    const nasty = clientIp({ "x-forwarded-for": `203.0.113.9\n\r\u0000${"x".repeat(200)}` });
    assert.ok(!nasty.includes("\n"));
    assert.ok(!nasty.includes("\u0000"));
    assert.ok(nasty.length <= 64);
  });
});

describe("geolocation", () => {
  /*
   * Nothing here looks anything up. An invented city is worse than an empty
   * one, because "signed in from Mumbai" is the sort of thing somebody acts on.
   */
  test("is empty when the edge did not provide one", () => {
    assert.deepEqual(geoFrom({}), { city: "", country: "" });
    assert.deepEqual(geoFrom({ "x-forwarded-for": "203.0.113.9" }), { city: "", country: "" });
  });

  test("reads Cloudflare, Vercel and nginx headers", () => {
    assert.equal(geoFrom({ "cf-ipcity": "Hyderabad", "cf-ipcountry": "in" }).city, "Hyderabad");
    assert.equal(geoFrom({ "cf-ipcountry": "in" }).country, "IN");
    assert.equal(geoFrom({ "x-vercel-ip-city": "Pune" }).city, "Pune");
    assert.equal(geoFrom({ "x-geo-city": "Chennai" }).city, "Chennai");
  });

  test("decodes a percent-encoded city, as Vercel sends", () => {
    assert.equal(geoFrom({ "x-vercel-ip-city": "New%20Delhi" }).city, "New Delhi");
  });

  test("survives a malformed encoding rather than throwing", () => {
    assert.equal(geoFrom({ "x-vercel-ip-city": "%E0%A4" }).city, "%E0%A4");
  });
});

describe("what counts as an app install", () => {
  const base = {
    "x-cv-install": "abc123",
    "x-cv-platform": "Android",
    "x-cv-os": "14",
    "x-cv-app": "1.12.0",
    "x-cv-model": "Pixel 8",
    "x-forwarded-for": "203.0.113.9",
  };

  test("reads the app's own headers", () => {
    const f = factsFrom(base)!;
    assert.equal(f.installId, "abc123");
    assert.equal(f.platform, "android");
    assert.equal(f.appVersion, "1.12.0");
    assert.equal(f.model, "Pixel 8");
    assert.equal(f.ip, "203.0.113.9");
  });

  /*
   * No install id means this is not the app — a browser, a curl, the console.
   * Recording those would fill the table with rows nobody can act on, and make
   * "how many phones are on this account" meaningless.
   */
  test("ignores anything that is not the app", () => {
    assert.equal(factsFrom({}), null);
    assert.equal(factsFrom({ "x-forwarded-for": "203.0.113.9" }), null);
    assert.equal(factsFrom({ ...base, "x-cv-install": "   " }), null);
  });

  test("caps every field, because the client chooses them", () => {
    const f = factsFrom({
      "x-cv-install": "i".repeat(500),
      "x-cv-model": "m".repeat(500),
      "x-cv-app": "a".repeat(500),
    })!;
    assert.ok(f.installId.length <= 64);
    assert.ok(f.model.length <= 64);
    assert.ok(f.appVersion.length <= 32);
  });

  test("strips control characters from a hostile header", () => {
    const f = factsFrom({ "x-cv-install": "ok", "x-cv-model": "Pixel\n8\u0000" })!;
    assert.ok(!f.model.includes("\n"));
    assert.ok(!f.model.includes("\u0000"));
  });

  test("works with a fetch-style Headers object as well as a plain map", () => {
    const h = new Map<string, string>(Object.entries(base));
    const f = factsFrom({ get: (n: string) => h.get(n) ?? null })!;
    assert.equal(f.installId, "abc123");
  });
});

describe("the write throttle", () => {
  beforeEach(() => resetThrottle());

  /*
   * This runs on the authenticated hot path. Without the throttle every API
   * call becomes an UPDATE, which is the difference between a useful feature
   * and a self-inflicted load problem.
   */
  test("writes the first time and not again immediately", () => {
    assert.equal(isDue("u1:i1"), true);
    assert.equal(isDue("u1:i1"), false);
    assert.equal(isDue("u1:i1"), false);
  });

  test("writes again once the window has passed", () => {
    const t0 = 1_000_000;
    assert.equal(isDue("u1:i1", t0), true);
    assert.equal(isDue("u1:i1", t0 + SEEN_THROTTLE_MS - 1), false);
    assert.equal(isDue("u1:i1", t0 + SEEN_THROTTLE_MS), true);
  });

  test("throttles per install, not globally", () => {
    assert.equal(isDue("u1:i1"), true);
    assert.equal(isDue("u1:i2"), true);
    assert.equal(isDue("u2:i1"), true);
  });

  /* After a revoke the next call must write, so the row stops looking revoked
     the moment the phone is used again. */
  test("can be reset for one install", () => {
    assert.equal(isDue("u1:i1"), true);
    resetThrottle("u1:i1");
    assert.equal(isDue("u1:i1"), true);
  });
});
