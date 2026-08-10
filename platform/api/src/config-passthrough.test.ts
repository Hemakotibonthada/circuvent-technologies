import "./test-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Every setting the API reads must actually reach the container.
 *
 * Compose passes through exactly the variables named in its `environment`
 * block and nothing else. A key declared in `config.ts` but absent there can be
 * set in `.env`, documented in `.env.example`, and have no effect whatsoever —
 * with no error at boot, because the Zod schema simply falls back to its
 * default.
 *
 * This is not hypothetical. `FEDERATION_SECRET` stayed silently unset that way
 * and single sign-on kept returning 501 until somebody read the compose file;
 * `.env.example` carries a warning about it at the top. `SMARTHOME_REDIRECT_URIS`
 * was found in the same state and fixed alongside this test.
 *
 * A comment cannot enforce it, so this does.
 */

const root = path.join(__dirname, "..", "..");
const configSrc = fs.readFileSync(path.join(root, "api", "src", "config.ts"), "utf8");
const composeSrc = fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8");

/** Keys the Zod schema pulls out of process.env. */
function schemaKeys(): string[] {
  const start = configSrc.indexOf("const schema = z.object(");
  const end = configSrc.indexOf("const parsed");
  assert.ok(start >= 0 && end > start, "could not locate the config schema");
  return [...configSrc.slice(start, end).matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]);
}

/** Keys compose hands to the api service. */
function composeKeys(): Set<string> {
  const api = composeSrc.slice(composeSrc.indexOf("  api:"), composeSrc.indexOf("  caddy:"));
  const env = api.slice(api.indexOf("environment:"), api.indexOf("depends_on:"));
  assert.ok(env.length > 0, "could not locate the api environment block");
  return new Set([...env.matchAll(/^\s+([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]));
}

describe("compose passes through every setting config.ts reads", () => {
  it("finds a plausible number of keys on both sides", () => {
    // Guards the parsing itself: if either regex stopped matching, every
    // assertion below would pass vacuously and the check would be worthless.
    assert.ok(schemaKeys().length > 20, "schema parse looks wrong");
    assert.ok(composeKeys().size > 20, "compose parse looks wrong");
  });

  it("leaves no declared setting unreachable", () => {
    const missing = schemaKeys().filter((k) => !composeKeys().has(k));
    assert.deepEqual(
      missing,
      [],
      `these are read by config.ts but never reach the container: ${missing.join(", ")}`
    );
  });

  it("documents the ANPR settings in .env.example", () => {
    // The example file is where an operator discovers a setting exists at all.
    const example = fs.readFileSync(path.join(root, ".env.example"), "utf8");
    for (const key of schemaKeys().filter((k) => k.startsWith("ANPR_"))) {
      assert.ok(example.includes(key), `${key} is missing from .env.example`);
    }
  });
});
