// Must come first: objects.ts reaches config.ts, which process.exit(1)s on an
// incomplete environment before any assertion runs.
import "../test-env";
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { config } from "../config";
import {
  anprImageKey,
  deleteObject,
  getObject,
  isObjectStoreConfigured,
  isSafeObjectKey,
  objectStore,
  presignGet,
  putObject,
} from "./objects";

/**
 * The object store.
 *
 * Nothing here talks to a bucket. What is pinned is the part that cannot be
 * checked by running it once and seeing an image appear: the signature, the
 * key shape, and the behaviour when the store is absent or refusing.
 *
 * A signing bug is the reason this file exists. It fails as `403
 * SignatureDoesNotMatch` with no indication of which of the eight inputs was
 * wrong, and it fails identically whether the cause is a stray character class
 * in the encoder, the wrong region in the scope, or a header signed in the
 * wrong order — none of which a smoke test distinguishes.
 */

const ENV_KEYS = [
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_ENDPOINT",
  "R2_ACCOUNT_ID",
  "S3_REGION",
  "S3_FORCE_PATH_STYLE",
] as const;

type Writable = Record<string, string>;
const saved: Writable = {};

function configure(values: Partial<Record<(typeof ENV_KEYS)[number], string>>): void {
  for (const k of ENV_KEYS) {
    saved[k] = (config as unknown as Writable)[k];
    (config as unknown as Writable)[k] = values[k] ?? "";
  }
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  configure({});
});

afterEach(() => {
  for (const k of ENV_KEYS) (config as unknown as Writable)[k] = saved[k] ?? "";
  globalThis.fetch = realFetch;
});

describe("configuration", () => {
  it("treats an unconfigured store as absent rather than broken", () => {
    /*
     * The whole optionality contract. With no bucket the ANPR pipeline falls
     * back to the database column and a deployment that never bought object
     * storage gets a working gate — so "not configured" has to be a state the
     * code returns, not one it throws on.
     */
    assert.equal(objectStore(), null);
    assert.equal(isObjectStoreConfigured(), false);
  });

  it("is absent when a credential is missing, not half-configured", async () => {
    // A bucket name with no key is the shape a half-finished .env produces.
    // Signing with an empty secret would produce a 403 that reads like a
    // permissions problem on the bucket rather than a missing variable.
    configure({ S3_BUCKET: "cv-anpr", R2_ACCOUNT_ID: "acct" });
    assert.equal(isObjectStoreConfigured(), false);
    assert.equal(await putObject("anpr/1/x.jpg", Buffer.from("x")), false);
    assert.equal(await getObject("anpr/1/x.jpg"), null);
  });

  it("derives the R2 endpoint from the account id", () => {
    // The only thing a Cloudflare user has to hand. Deriving it removes a step
    // where a typo produces a signature error rather than a name error.
    configure({
      S3_BUCKET: "cv-anpr",
      S3_ACCESS_KEY_ID: "AKIA",
      S3_SECRET_ACCESS_KEY: "secret",
      R2_ACCOUNT_ID: "abc123",
    });
    assert.equal(objectStore()?.endpoint, "https://abc123.r2.cloudflarestorage.com");
    assert.equal(objectStore()?.region, "auto");
    assert.equal(objectStore()?.pathStyle, true);
  });

  it("lets an explicit endpoint win over the account shorthand", () => {
    configure({
      S3_BUCKET: "cv-anpr",
      S3_ACCESS_KEY_ID: "AKIA",
      S3_SECRET_ACCESS_KEY: "secret",
      R2_ACCOUNT_ID: "abc123",
      S3_ENDPOINT: "https://s3.eu-west-1.amazonaws.com/",
      S3_REGION: "eu-west-1",
      S3_FORCE_PATH_STYLE: "false",
    });
    const s = objectStore();
    // The trailing slash is stripped, or every signed path gains a double one
    // and the signature covers a path the server never sees.
    assert.equal(s?.endpoint, "https://s3.eu-west-1.amazonaws.com");
    assert.equal(s?.region, "eu-west-1");
    assert.equal(s?.pathStyle, false);
  });
});

describe("signing", () => {
  function configureR2(): void {
    configure({
      S3_BUCKET: "cv-anpr",
      S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
      S3_SECRET_ACCESS_KEY: "secretexample",
      R2_ACCOUNT_ID: "acct",
    });
  }

  /** Captures the request a call would have made, without making it. */
  function captureRequest(): { calls: Array<{ url: string; init: RequestInit }> } {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: string | URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), { status: 200 });
    }) as unknown as typeof fetch;
    return { calls };
  }

  it("signs a PUT with the payload hash, not UNSIGNED-PAYLOAD", async () => {
    /*
     * R2 and S3 both accept UNSIGNED-PAYLOAD on a PUT, and using it would work
     * — right up until a bucket policy requires content integrity, at which
     * point every upload fails at once and the cause is a header nobody looks
     * at. The hash also means a truncated body is rejected by the store rather
     * than stored as a half JPEG, which renders as a grey box and reads as a
     * camera fault.
     */
    configureR2();
    const { calls } = captureRequest();
    const body = Buffer.from("pretend-jpeg-bytes");

    assert.equal(await putObject("anpr/7/2026/08/18/x.jpg", body, "image/jpeg"), true);
    assert.equal(calls.length, 1);

    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers["x-amz-content-sha256"], createHash("sha256").update(body).digest("hex"));
    assert.equal(headers["content-type"], "image/jpeg");
    assert.match(headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/\d{8}\/auto\/s3\/aws4_request/);
    // Every header that is sent must be signed, or the store rejects it.
    assert.match(headers.authorization, /SignedHeaders=cache-control;content-length;content-type;host;x-amz-content-sha256;x-amz-date/);
  });

  it("addresses path-style for R2 and virtual-hosted when asked", async () => {
    // R2 requires path-style. Getting this wrong signs one path and requests
    // another, which fails as a signature error rather than a 404.
    configureR2();
    const r2 = captureRequest();
    await putObject("anpr/7/x.jpg", Buffer.from("a"));
    assert.equal(r2.calls[0].url, "https://acct.r2.cloudflarestorage.com/cv-anpr/anpr/7/x.jpg");

    configure({
      S3_BUCKET: "cv-anpr",
      S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
      S3_SECRET_ACCESS_KEY: "secretexample",
      S3_ENDPOINT: "https://s3.eu-west-1.amazonaws.com",
      S3_REGION: "eu-west-1",
      S3_FORCE_PATH_STYLE: "false",
    });
    const aws = captureRequest();
    await putObject("anpr/7/x.jpg", Buffer.from("a"));
    assert.equal(aws.calls[0].url, "https://cv-anpr.s3.eu-west-1.amazonaws.com/anpr/7/x.jpg");
  });

  it("produces a presigned URL carrying its own signature and expiry", () => {
    configureR2();
    const url = presignGet("anpr/7/2026/08/18/x.jpg", 300);
    assert.ok(url);
    const u = new URL(url);
    assert.equal(u.pathname, "/cv-anpr/anpr/7/2026/08/18/x.jpg");
    assert.equal(u.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
    assert.equal(u.searchParams.get("X-Amz-Expires"), "300");
    assert.equal(u.searchParams.get("X-Amz-SignedHeaders"), "host");
    assert.match(u.searchParams.get("X-Amz-Signature") ?? "", /^[0-9a-f]{64}$/);
    // No credential is in the URL beyond the access key id, which is not secret.
    assert.equal(url.includes("secretexample"), false);
  });

  it("clamps a presigned expiry to a day", () => {
    /*
     * A link to a photograph of somebody's vehicle that works for a week is a
     * link that ends up pasted into a chat. The clamp is the difference
     * between a short-lived URL and a permanent one somebody generated once.
     */
    configureR2();
    const long = new URL(presignGet("anpr/7/x.jpg", 60 * 60 * 24 * 30)!);
    assert.equal(long.searchParams.get("X-Amz-Expires"), "86400");
    const zero = new URL(presignGet("anpr/7/x.jpg", 0)!);
    assert.equal(zero.searchParams.get("X-Amz-Expires"), "1");
  });
});

describe("failure behaviour", () => {
  function configureR2(): void {
    configure({
      S3_BUCKET: "cv-anpr",
      S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
      S3_SECRET_ACCESS_KEY: "secretexample",
      R2_ACCOUNT_ID: "acct",
    });
  }

  it("returns false from a refused upload rather than throwing", async () => {
    /*
     * The caller is the ANPR hot path. An exception there would abandon the
     * read — and losing the arrival because its photograph would not upload is
     * a gate that stopped working, which is a far worse failure than a read
     * with no picture.
     */
    configureR2();
    globalThis.fetch = (async () => new Response("AccessDenied", { status: 403 })) as unknown as typeof fetch;
    assert.equal(await putObject("anpr/7/x.jpg", Buffer.from("a")), false);
  });

  it("returns false rather than throwing when the network is gone", async () => {
    configureR2();
    globalThis.fetch = (async () => {
      throw new Error("ENOTFOUND");
    }) as unknown as typeof fetch;
    assert.equal(await putObject("anpr/7/x.jpg", Buffer.from("a")), false);
    assert.equal(await getObject("anpr/7/x.jpg"), null);
    assert.equal(await deleteObject("anpr/7/x.jpg"), false);
  });

  it("treats a missing object as absent, and a missing delete as done", async () => {
    // 404 on GET is ordinary: a bucket lifecycle rule can expire an object
    // before the retention sweep clears the column naming it. 404 on DELETE
    // means the object is gone, which is the outcome the caller asked for —
    // reporting failure would make the sweep retry it forever.
    configureR2();
    globalThis.fetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    assert.equal(await getObject("anpr/7/x.jpg"), null);
    assert.equal(await deleteObject("anpr/7/x.jpg"), true);
  });
});

describe("keys", () => {
  it("partitions by owner and date", () => {
    /*
     * Owner first, because the only bulk operation anybody ever asks for is
     * "delete everything belonging to this account". Date next, so a bucket
     * lifecycle rule can express the same retention the sweep does.
     */
    const key = anprImageKey(42, new Date("2026-08-18T06:24:43.034Z"));
    assert.match(key, /^anpr\/42\/2026\/08\/18\/\d+-[0-9a-f]{12}\.jpg$/);
  });

  it("never produces the same key twice", () => {
    // The key is what makes an object immutable and therefore safely cacheable
    // for a year. A collision would serve one vehicle's photograph for another
    // vehicle's read.
    const at = new Date("2026-08-18T06:24:43.034Z");
    const keys = new Set(Array.from({ length: 500 }, () => anprImageKey(42, at)));
    assert.equal(keys.size, 500);
  });

  it("refuses a key that could address something else", () => {
    /*
     * image_key is read out of the database and used to build a request, so it
     * is untrusted input. Nothing writes a traversal today, which is exactly
     * when the check is cheap.
     */
    assert.equal(isSafeObjectKey("anpr/42/2026/08/18/x.jpg"), true);
    assert.equal(isSafeObjectKey("../../etc/passwd"), false);
    assert.equal(isSafeObjectKey("/anpr/42/x.jpg"), false);
    assert.equal(isSafeObjectKey("https://evil.test/x.jpg"), false);
    assert.equal(isSafeObjectKey("anpr/42/\u0000.jpg"), false);
    assert.equal(isSafeObjectKey(""), false);
    assert.equal(isSafeObjectKey("a".repeat(513)), false);
  });

  it("will not sign a request for an unsafe key", async () => {
    configure({
      S3_BUCKET: "cv-anpr",
      S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
      S3_SECRET_ACCESS_KEY: "secretexample",
      R2_ACCOUNT_ID: "acct",
    });
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;

    assert.equal(await getObject("../secrets"), null);
    assert.equal(await deleteObject("../secrets"), false);
    assert.equal(presignGet("../secrets"), null);
    assert.equal(called, false, "an unsafe key must be refused before it is signed");
  });
});
