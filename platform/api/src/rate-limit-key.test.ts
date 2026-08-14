import "./test-env";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ipKeyGenerator } from "express-rate-limit";

/**
 * How the developer API's rate limit decides who is who.
 *
 * The keying is duplicated here rather than imported because `index.ts` builds
 * it inside `main()` alongside a server, a database connection and an MQTT
 * client. Extracting it purely would be better; asserting the *behaviour* is
 * what stops the bypass coming back, and that is what this does.
 *
 * The bug: unauthenticated requests were bucketed on the raw address. A single
 * client is routinely handed a whole IPv6 /64, so it could take a fresh
 * 600-per-minute allowance for every address it felt like using — a limit that
 * bounded nobody. express-rate-limit warns about exactly this at startup, and
 * the warning was printed on every boot and read as noise.
 */
function keyFor(headers: Record<string, string | undefined>, ip: string): string {
  const h = headers.authorization;
  const raw = h?.startsWith("Bearer ") ? h.slice(7).trim() : headers["x-api-key"];
  if (raw) return "k:" + createHash("sha256").update(raw).digest("hex").slice(0, 32);
  return "ip:" + ipKeyGenerator(ip);
}

describe("developer API rate-limit keying", () => {
  test("a whole IPv6 /64 shares one budget", () => {
    // The bypass, stated as a test: these are all the same client as far as a
    // limit is concerned, and were three separate allowances before.
    const a = keyFor({}, "2001:db8:abcd:1234::1");
    const b = keyFor({}, "2001:db8:abcd:1234::2");
    const c = keyFor({}, "2001:db8:abcd:1234:ffff:ffff:ffff:ffff");
    assert.equal(a, b);
    assert.equal(a, c);
  });

  test("different IPv6 subnets are still different callers", () => {
    // Bucketing too widely would be its own bug — one abusive customer would
    // throttle unrelated ones.
    const a = keyFor({}, "2001:db8:abcd:1234::1");
    const b = keyFor({}, "2001:db8:abcd:9999::1");
    assert.notEqual(a, b);
  });

  test("IPv4 addresses are counted individually, as before", () => {
    assert.notEqual(keyFor({}, "203.0.113.7"), keyFor({}, "203.0.113.8"));
    assert.equal(keyFor({}, "203.0.113.7"), keyFor({}, "203.0.113.7"));
  });

  test("a key is counted per key, whatever address it arrives from", () => {
    // An integration runs from one server and may move; the budget belongs to
    // the credential, not the machine.
    const fromA = keyFor({ authorization: "Bearer cv_live_abc" }, "203.0.113.7");
    const fromB = keyFor({ authorization: "Bearer cv_live_abc" }, "2001:db8::99");
    assert.equal(fromA, fromB);
  });

  test("two different keys are two different budgets", () => {
    assert.notEqual(
      keyFor({ authorization: "Bearer cv_live_abc" }, "203.0.113.7"),
      keyFor({ authorization: "Bearer cv_live_xyz" }, "203.0.113.7")
    );
  });

  test("the key itself never becomes the bucket name", () => {
    /*
     * Rate-limiter state is held in memory and turns up in heap dumps and
     * metrics labels. A bucket named after the credential leaks it to anywhere
     * those are read.
     */
    const secret = "cv_live_do_not_leak_me";
    const key = keyFor({ authorization: `Bearer ${secret}` }, "203.0.113.7");
    assert.ok(!key.includes(secret));
    assert.match(key, /^k:[0-9a-f]{32}$/);
  });

  test("x-api-key is honoured as well as Authorization", () => {
    // Two spellings are documented; a limit that knows one of them buckets
    // half the callers by address instead.
    assert.equal(
      keyFor({ "x-api-key": "cv_live_abc" }, "203.0.113.7"),
      keyFor({ authorization: "Bearer cv_live_abc" }, "198.51.100.4")
    );
  });
});
