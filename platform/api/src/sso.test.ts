import "./test-env";
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

import { config } from "./config";
import { resetSsoCaches, ssoEnabled, verifyIdToken } from "./sso";

/**
 * These are the assertions that decide whether single sign-on is authentication
 * or decoration.
 *
 * Every one of them is a way a token can look right and be worthless: signed by
 * somebody else's key, signed with an algorithm the caller chose, minted by a
 * different provider, or minted for a different application that happens to
 * share our directory. A verifier that skips any of them accepts forgeries
 * while appearing to work perfectly for real users, which is why they are
 * asserted rather than assumed.
 */

const ISSUER = "https://auth.example.test";
const AUDIENCE = "control-plane-test";

const good = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const attacker = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

const KID = "test-key-1";

function jwkFor(key: crypto.KeyObject, kid: string) {
  return { ...key.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" };
}

/** Serves discovery and the published keys, as the provider would. */
function stubProvider(publish: crypto.KeyObject = good.publicKey): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("openid-configuration")
      ? { jwks_uri: `${ISSUER}/.well-known/jwks.json` }
      : { keys: [jwkFor(publish, KID)] };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function sign(
  claims: Record<string, unknown>,
  key: crypto.KeyObject = good.privateKey,
  header: Record<string, unknown> = {}
): string {
  return jwt.sign(
    { sub: "user-1", email: "person@circuvent.com", name: "A Person", ...claims },
    key.export({ type: "pkcs8", format: "pem" }) as string,
    { algorithm: "RS256", expiresIn: "5m", issuer: ISSUER, audience: AUDIENCE, keyid: KID, ...header }
  );
}

describe("single sign-on token verification", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    (config as { AUTH_ISSUER: string }).AUTH_ISSUER = ISSUER;
    (config as { SSO_CLIENT_ID: string }).SSO_CLIENT_ID = AUDIENCE;
    resetSsoCaches();
    stubProvider();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("accepts a token the provider signed", async () => {
    const claims = await verifyIdToken(sign({}));
    assert.equal(claims.email, "person@circuvent.com");
    assert.equal(claims.name, "A Person");
  });

  test("lower-cases the address, so one person is not two accounts", async () => {
    const claims = await verifyIdToken(sign({ email: "Person@Circuvent.com" }));
    assert.equal(claims.email, "person@circuvent.com");
  });

  test("rejects a token signed by somebody else's key", async () => {
    // The forgery is well-formed and claims everything a real token claims.
    // Only the signature gives it away.
    await assert.rejects(() => verifyIdToken(sign({}, attacker.privateKey)));
  });

  test("rejects a token from a different issuer", async () => {
    await assert.rejects(() => verifyIdToken(sign({}, good.privateKey, { issuer: "https://evil.test" })));
  });

  test("rejects a token minted for another application", async () => {
    // Same directory, same signing key, different audience: a token handed to
    // one relying party must not open a session in this one.
    await assert.rejects(() => verifyIdToken(sign({}, good.privateKey, { audience: "some-other-app" })));
  });

  test("rejects an expired token", async () => {
    await assert.rejects(() => verifyIdToken(sign({}, good.privateKey, { expiresIn: "-1s" })));
  });

  test("refuses HS256, so a public key cannot be used as a shared secret", async () => {
    const forged = jwt.sign(
      { sub: "user-1", email: "person@circuvent.com", iss: ISSUER, aud: AUDIENCE },
      good.publicKey.export({ type: "spki", format: "pem" }) as string,
      { algorithm: "HS256", keyid: KID, expiresIn: "5m" }
    );
    await assert.rejects(() => verifyIdToken(forged), /Unsupported signing algorithm/);
  });

  test("refuses a token with no email", async () => {
    await assert.rejects(() => verifyIdToken(sign({ email: undefined })));
  });

  test("refuses an address the provider says is unverified", async () => {
    await assert.rejects(() => verifyIdToken(sign({ email_verified: false })));
  });

  test("refetches the keys when a token arrives with an unknown kid", async () => {
    // A rotation must not break sign-in until a cache expires.
    await verifyIdToken(sign({}));

    const rotated = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const NEW_KID = "test-key-2";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("openid-configuration")
        ? { jwks_uri: `${ISSUER}/.well-known/jwks.json` }
        : { keys: [jwkFor(rotated.publicKey, NEW_KID)] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const token = jwt.sign(
      { sub: "user-1", email: "person@circuvent.com" },
      rotated.privateKey.export({ type: "pkcs8", format: "pem" }) as string,
      { algorithm: "RS256", expiresIn: "5m", issuer: ISSUER, audience: AUDIENCE, keyid: NEW_KID }
    );
    const claims = await verifyIdToken(token);
    assert.equal(claims.email, "person@circuvent.com");
  });

  test("is disabled when no client id is configured", () => {
    (config as { SSO_CLIENT_ID: string }).SSO_CLIENT_ID = "";
    assert.equal(ssoEnabled(), false);
  });
});
