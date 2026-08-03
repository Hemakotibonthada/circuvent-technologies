import "./test-env";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { pool } from "./db";
import {
  API_SCOPES,
  generateApiKey,
  hashApiKey,
  displayPrefix,
  looksLikeApiKey,
  verifyApiKey,
  invalidateKeyCache,
  hasScope,
  originAllowed,
  normalizeOrigin,
  isApiScope,
  SCOPE_DESCRIPTIONS,
  type ApiKeyRecord,
} from "./api-keys";
import { requireApiAccess, type ApiRequest } from "./api-auth";
import { signWebhook, isPrivateAddress, isWebhookEvent, generateWebhookSecret } from "./webhooks";
import type { Response } from "express";

/**
 * The developer API is the first credential we hand to somebody outside the
 * company, so the assertions that matter are the ones that keep a key from
 * being worth more than it was issued for: scope enforcement, revocation
 * actually taking effect, and the browser-origin rule refusing by default.
 */

type KeyRow = {
  id: number;
  owner_id: number;
  name: string;
  env: string;
  scopes: string[];
  allowed_origins: string[];
  expires_at: Date | null;
  revoked_at: Date | null;
  blocked: boolean;
};

function stubPool(rows: KeyRow[] | Error): void {
  (pool as unknown as { query: unknown }).query = async () => {
    if (rows instanceof Error) throw rows;
    return { rows, rowCount: rows.length };
  };
}

function row(over: Partial<KeyRow> = {}): KeyRow {
  return {
    id: 1,
    owner_id: 42,
    name: "Test key",
    env: "live",
    scopes: ["devices:read"],
    allowed_origins: [],
    expires_at: null,
    revoked_at: null,
    blocked: false,
    ...over,
  };
}

beforeEach(() => {
  invalidateKeyCache();
});

describe("key format", () => {
  test("mints a key matching the documented shape", () => {
    const k = generateApiKey("live");
    assert.match(k.secret, /^cvk_live_[A-Za-z0-9_-]{43}$/);
    assert.ok(looksLikeApiKey(k.secret));
    assert.equal(k.hash, hashApiKey(k.secret));
  });

  test("test keys carry their own environment marker", () => {
    assert.match(generateApiKey("test").secret, /^cvk_test_/);
  });

  test("two keys never collide", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateApiKey().secret);
    assert.equal(seen.size, 500);
  });

  test("the stored prefix cannot authenticate", () => {
    const k = generateApiKey();
    const prefix = displayPrefix(k.secret);
    assert.ok(k.secret.startsWith(prefix));
    // The whole point of showing a prefix is that it is not a usable key.
    assert.ok(!looksLikeApiKey(prefix));
    assert.notEqual(hashApiKey(prefix), k.hash);
  });

  test("rejects things that are not keys", () => {
    for (const bad of [
      "",
      "cvk_live_short",
      "sk_live_" + "a".repeat(43),
      "cvk_prod_" + "a".repeat(43),
      "cvk_live_" + "a".repeat(44),
      "cvk_live_" + "!".repeat(43),
      // A JWT must not be mistaken for a key, or requireApiAccess would try to
      // verify a session token against api_keys and always 401.
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjF9.abc",
    ]) {
      assert.equal(looksLikeApiKey(bad), false, bad);
    }
  });

  test("the secret is never derivable from the hash", () => {
    const k = generateApiKey();
    assert.equal(k.hash.length, 64);
    assert.match(k.hash, /^[0-9a-f]{64}$/);
    assert.ok(!k.hash.includes(k.secret.slice(9)));
  });
});

describe("scopes", () => {
  test("every scope has a description the console and docs can show", () => {
    for (const s of API_SCOPES) {
      assert.equal(typeof SCOPE_DESCRIPTIONS[s], "string");
      assert.ok(SCOPE_DESCRIPTIONS[s].length > 10, s);
    }
  });

  test("unknown scopes are not accepted", () => {
    assert.ok(isApiScope("devices:read"));
    assert.ok(!isApiScope("devices:*"));
    assert.ok(!isApiScope("admin"));
    assert.ok(!isApiScope(""));
  });

  test("hasScope does not treat one scope as implying another", () => {
    const key: ApiKeyRecord = {
      id: 1,
      ownerId: 1,
      name: "k",
      env: "live",
      scopes: ["devices:read"],
      allowedOrigins: [],
    };
    assert.ok(hasScope(key, "devices:read"));
    // Reading devices must not confer the ability to switch them.
    assert.ok(!hasScope(key, "devices:control"));
    assert.ok(!hasScope(key, "devices:write"));
  });
});

describe("verifyApiKey", () => {
  test("resolves a live key to its owner and scopes", async () => {
    const k = generateApiKey();
    stubPool([row({ scopes: ["devices:read", "devices:control"] })]);
    const v = await verifyApiKey(k.secret);
    assert.ok(v.ok);
    assert.equal(v.key?.ownerId, 42);
    assert.deepEqual(v.key?.scopes, ["devices:read", "devices:control"]);
  });

  test("refuses a revoked key", async () => {
    const k = generateApiKey();
    stubPool([row({ revoked_at: new Date(Date.now() - 1000) })]);
    const v = await verifyApiKey(k.secret);
    assert.equal(v.ok, false);
    assert.equal(v.reason, "revoked");
  });

  test("refuses an expired key", async () => {
    const k = generateApiKey();
    stubPool([row({ expires_at: new Date(Date.now() - 1000) })]);
    const v = await verifyApiKey(k.secret);
    assert.equal(v.ok, false);
    assert.equal(v.reason, "expired");
  });

  test("a key that expires in the future still works", async () => {
    const k = generateApiKey();
    stubPool([row({ expires_at: new Date(Date.now() + 60_000) })]);
    assert.ok((await verifyApiKey(k.secret)).ok);
  });

  test("blocking an account stops its keys", async () => {
    // Otherwise disabling somebody would leave every integration they ever
    // created still able to open their locks.
    const k = generateApiKey();
    stubPool([row({ blocked: true })]);
    const v = await verifyApiKey(k.secret);
    assert.equal(v.ok, false);
    assert.equal(v.reason, "blocked");
  });

  test("an unknown key is rejected without a database round-trip", async () => {
    let queried = false;
    (pool as unknown as { query: unknown }).query = async () => {
      queried = true;
      return { rows: [], rowCount: 0 };
    };
    const v = await verifyApiKey("not-a-key");
    assert.equal(v.ok, false);
    assert.equal(v.reason, "invalid");
    assert.equal(queried, false, "malformed keys must not reach Postgres");
  });

  test("scopes the database does not recognise are dropped, not trusted", async () => {
    const k = generateApiKey();
    stubPool([row({ scopes: ["devices:read", "admin:everything"] })]);
    const v = await verifyApiKey(k.secret);
    assert.deepEqual(v.key?.scopes, ["devices:read"]);
  });

  test("revocation takes effect immediately, not when the cache expires", async () => {
    const k = generateApiKey();
    stubPool([row()]);
    assert.ok((await verifyApiKey(k.secret)).ok);

    // Simulate the DELETE handler: revoke, then invalidate.
    stubPool([row({ revoked_at: new Date() })]);
    invalidateKeyCache(hashApiKey(k.secret));

    const after = await verifyApiKey(k.secret);
    assert.equal(after.ok, false, "a revoked key must stop working at once");
    assert.equal(after.reason, "revoked");
  });
});

describe("browser origin policy", () => {
  const serverKey: ApiKeyRecord = { id: 1, ownerId: 1, name: "s", env: "live", scopes: [], allowedOrigins: [] };
  const browserKey: ApiKeyRecord = {
    id: 2,
    ownerId: 1,
    name: "b",
    env: "live",
    scopes: [],
    allowedOrigins: ["https://dash.example.com"],
  };

  test("a server-side call (no Origin) is allowed", () => {
    assert.ok(originAllowed(serverKey, undefined));
  });

  test("a key with no registered origins refuses browsers by default", () => {
    // Fail closed: pasting a server key into front-end code must break loudly
    // rather than quietly publish the credential.
    assert.equal(originAllowed(serverKey, "https://dash.example.com"), false);
  });

  test("a registered origin is allowed and others are not", () => {
    assert.ok(originAllowed(browserKey, "https://dash.example.com"));
    assert.equal(originAllowed(browserKey, "https://evil.example.com"), false);
    // Scheme, host and port must all match — no prefix matching.
    assert.equal(originAllowed(browserKey, "http://dash.example.com"), false);
    assert.equal(originAllowed(browserKey, "https://dash.example.com:8443"), false);
    assert.equal(originAllowed(browserKey, "https://dash.example.com.evil.com"), false);
  });

  test("normalizeOrigin strips paths and rejects insecure public origins", () => {
    assert.equal(normalizeOrigin("https://a.example.com/dashboard?x=1"), "https://a.example.com");
    assert.equal(normalizeOrigin("https://a.example.com:8443"), "https://a.example.com:8443");
    assert.equal(normalizeOrigin("http://localhost:3000"), "http://localhost:3000");
    assert.equal(normalizeOrigin("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
    // Plaintext to a public host would expose the key to anyone on the path.
    assert.equal(normalizeOrigin("http://a.example.com"), null);
    assert.equal(normalizeOrigin("javascript:alert(1)"), null);
    assert.equal(normalizeOrigin("file:///etc/passwd"), null);
    assert.equal(normalizeOrigin("not a url"), null);
  });
});

/* ------------------------------------------------------------------ */
/* requireApiAccess                                                    */
/* ------------------------------------------------------------------ */

function run(
  headers: Record<string, string>,
  scope: Parameters<typeof requireApiAccess>[0]
): Promise<{ status: number | null; body: Record<string, unknown> | null; passed: boolean; req: ApiRequest }> {
  return new Promise((resolve) => {
    const req = { headers, method: "GET", path: "/v1/devices" } as unknown as ApiRequest;
    let status: number | null = null;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(body: Record<string, unknown>) {
        resolve({ status, body, passed: false, req });
        return this;
      },
    } as unknown as Response;
    requireApiAccess(scope)(req, res, () => resolve({ status, body: null, passed: true, req }));
  });
}

describe("requireApiAccess", () => {
  test("lets a key with the required scope through as its owner", async () => {
    const k = generateApiKey();
    stubPool([row({ scopes: ["devices:read"] })]);
    const r = await run({ authorization: `Bearer ${k.secret}` }, "devices:read");
    assert.ok(r.passed);
    assert.equal(r.req.user?.uid, 42);
    assert.equal(r.req.apiKey?.name, "Test key");
  });

  test("accepts the X-API-Key header too", async () => {
    const k = generateApiKey();
    stubPool([row({ scopes: ["devices:read"] })]);
    const r = await run({ "x-api-key": k.secret }, "devices:read");
    assert.ok(r.passed);
  });

  test("refuses a key that lacks the scope, and says which one", async () => {
    const k = generateApiKey();
    stubPool([row({ scopes: ["devices:read"] })]);
    const r = await run({ authorization: `Bearer ${k.secret}` }, "devices:control");
    assert.equal(r.passed, false);
    assert.equal(r.status, 403);
    assert.equal(r.body?.code, "insufficient_scope");
    assert.equal(r.body?.required, "devices:control");
  });

  test("refuses a browser origin that is not registered", async () => {
    const k = generateApiKey();
    stubPool([row({ scopes: ["devices:read"], allowed_origins: ["https://ok.example.com"] })]);
    const r = await run(
      { authorization: `Bearer ${k.secret}`, origin: "https://evil.example.com" },
      "devices:read"
    );
    assert.equal(r.status, 403);
    assert.equal(r.body?.code, "origin_not_allowed");
  });

  test("the scope check is not skipped when the origin is allowed", async () => {
    const k = generateApiKey();
    stubPool([row({ scopes: ["devices:read"], allowed_origins: ["https://ok.example.com"] })]);
    const r = await run(
      { authorization: `Bearer ${k.secret}`, origin: "https://ok.example.com" },
      "devices:control"
    );
    assert.equal(r.status, 403);
    assert.equal(r.body?.code, "insufficient_scope");
  });

  test("fails closed when the database is unavailable", async () => {
    // A Postgres blip must not become open access to everybody's relays.
    const k = generateApiKey();
    stubPool(new Error("connection terminated"));
    const r = await run({ authorization: `Bearer ${k.secret}` }, "devices:read");
    assert.equal(r.passed, false);
    assert.equal(r.status, 401);
  });

  test("reports why a key was refused so a developer can self-diagnose", async () => {
    const k = generateApiKey();
    stubPool([row({ revoked_at: new Date() })]);
    const r = await run({ authorization: `Bearer ${k.secret}` }, "devices:read");
    assert.equal(r.status, 401);
    assert.equal(r.body?.code, "key_revoked");
  });
});

/* ------------------------------------------------------------------ */
/* Webhooks                                                            */
/* ------------------------------------------------------------------ */

describe("webhook signing", () => {
  test("produces the documented t=,v1= format", () => {
    const sig = signWebhook("whsec_test", '{"a":1}', 1_700_000_000);
    assert.match(sig, /^t=1700000000,v1=[0-9a-f]{64}$/);
  });

  test("verifies with the recipe published in the docs", () => {
    const secret = generateWebhookSecret();
    const body = JSON.stringify({ event: "device.state", deviceId: "d1" });
    const ts = Math.floor(Date.now() / 1000);
    const header = signWebhook(secret, body, ts);

    const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
    const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${body}`).digest("hex");
    assert.equal(parts.v1, expected);
  });

  test("the timestamp is inside the signature, so a delivery cannot be replayed later", () => {
    const body = '{"a":1}';
    const a = signWebhook("s", body, 1000);
    const b = signWebhook("s", body, 2000);
    assert.notEqual(a.split("v1=")[1], b.split("v1=")[1]);
  });

  test("a different secret produces a different signature", () => {
    assert.notEqual(signWebhook("a", "{}", 1), signWebhook("b", "{}", 1));
  });

  test("tampering with the body invalidates the signature", () => {
    const secret = "whsec_x";
    const ts = 1_700_000_000;
    assert.notEqual(signWebhook(secret, '{"on":true}', ts), signWebhook(secret, '{"on":false}', ts));
  });

  test("only known events are accepted", () => {
    assert.ok(isWebhookEvent("device.state"));
    assert.ok(isWebhookEvent("device.offline"));
    assert.ok(!isWebhookEvent("device.*"));
    assert.ok(!isWebhookEvent("account.deleted"));
  });
});

describe("webhook SSRF guard", () => {
  test("blocks loopback, private, link-local and CGNAT ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "127.1.2.3",
      "0.0.0.0",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "100.64.0.1",
      // The cloud metadata endpoint — the single most valuable SSRF target.
      "169.254.169.254",
      "224.0.0.1",
      "::1",
      "fe80::1",
      "fd00::1",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
    ]) {
      assert.equal(isPrivateAddress(ip), true, `${ip} must be blocked`);
    }
  });

  test("allows ordinary public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "2606:4700::1111"]) {
      assert.equal(isPrivateAddress(ip), false, `${ip} should be allowed`);
    }
  });

  test("refuses anything it cannot parse rather than guessing", () => {
    assert.equal(isPrivateAddress("not-an-ip"), true);
    assert.equal(isPrivateAddress(""), true);
  });
});
