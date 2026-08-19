// S3 / R2 object storage for the storefront.
//
// WHY THIS EXISTS
//
// Profile pictures need somewhere to live that is not the `accounts` row. That
// row is a JSONB blob read on every profile fetch and every sign-in, so a
// 20 KB base64 avatar sitting in it would be dragged across the wire on every
// one of those, and carried by every dump and every replica besides. The row
// keeps the key; the bucket keeps the picture.
//
// WHY IT IS HAND-ROLLED
//
// `@aws-sdk/client-s3` is roughly 15 MB across ~40 packages to issue three
// request shapes. The control plane already refused that trade and signs SigV4
// by hand in platform/api/src/storage/objects.ts; this is the same routine,
// trimmed to what the storefront needs. Keeping the two in step matters less
// than it looks — SigV4 is a fixed specification, and the awkward parts are
// commented in both.
//
// WHY THE BUCKET STAYS PRIVATE
//
// A profile photograph is personal data. There is no public base URL here and
// no way to configure one: avatars are read back through an authenticated
// route that checks the session, so a key leaking is not the same as the
// picture leaking.
//
// SERVER ONLY.

import { createHash, createHmac } from "node:crypto";

const ALGORITHM = "AWS4-HMAC-SHA256";
const TIMEOUT_MS = Number(process.env.S3_TIMEOUT_MS || 10_000);

const sha256 = (d: Buffer | string): string => createHash("sha256").update(d).digest("hex");
const hmac = (k: Buffer | string, d: string): Buffer => createHmac("sha256", k).update(d).digest();

/**
 * The RFC 3986 encoding SigV4 wants, which is not what `encodeURIComponent`
 * produces: `!`, `'`, `(`, `)` and `*` are unreserved to JavaScript and
 * reserved to AWS. A key containing one of them signs correctly here and
 * returns `SignatureDoesNotMatch` if left to the built-in.
 */
function uriEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/** Object keys keep their separators; every other character is encoded. */
function encodeKey(key: string): string {
  return key.split("/").map(uriEncode).join("/");
}

export interface ObjectStoreConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  pathStyle: boolean;
}

/**
 * Resolves the bucket configuration, or null when it is not configured.
 *
 * Null is a supported state. A deployment without a bucket keeps working and
 * simply cannot store a picture — callers fall back to initials, which is what
 * every account looked like before this existed.
 */
export function objectStore(): ObjectStoreConfig | null {
  const bucket = (process.env.S3_BUCKET || "").trim();
  const accessKeyId = (process.env.S3_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.S3_SECRET_ACCESS_KEY || "").trim();
  if (!bucket || !accessKeyId || !secretAccessKey) return null;

  // R2_ACCOUNT_ID is offered as a shorthand because it is the only thing a
  // Cloudflare user has to hand; deriving the endpoint from it removes a step
  // where a typo produces a signature error rather than a name error.
  const account = (process.env.R2_ACCOUNT_ID || "").trim();
  const endpoint = (
    (process.env.S3_ENDPOINT || "").trim() || (account ? `https://${account}.r2.cloudflarestorage.com` : "")
  ).replace(/\/+$/, "");
  if (!endpoint) return null;

  return {
    endpoint,
    region: (process.env.S3_REGION || "").trim() || "auto",
    bucket,
    accessKeyId,
    secretAccessKey,
    pathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
}

export function isObjectStoreConfigured(): boolean {
  return objectStore() !== null;
}

/**
 * Keys this code is willing to sign.
 *
 * Traversal is the obvious one, but the empty key and a leading slash both
 * produce requests that address the bucket rather than an object, which fail
 * in confusing ways rather than safe ones.
 */
export function isSafeObjectKey(key: string): boolean {
  if (!key || key.length > 512) return false;
  if (key.startsWith("/") || key.includes("//")) return false;
  if (key.split("/").some((seg) => seg === "." || seg === "..")) return false;
  return /^[A-Za-z0-9!_.*'()/-]+$/.test(key);
}

function amzDate(now: Date): { amz: string; stamp: string } {
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz, stamp: amz.slice(0, 8) };
}

function signingKey(s: ObjectStoreConfig, stamp: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${s.secretAccessKey}`, stamp), s.region), "s3"), "aws4_request");
}

/** `/bucket/key` path-style, or `/key` when the bucket is in the hostname. */
function requestTarget(s: ObjectStoreConfig, key: string): { url: URL; path: string } {
  const base = new URL(s.endpoint);
  if (s.pathStyle) {
    const path = `/${uriEncode(s.bucket)}/${encodeKey(key)}`;
    return { url: new URL(base.origin + path), path };
  }
  const path = `/${encodeKey(key)}`;
  return { url: new URL(`${base.protocol}//${s.bucket}.${base.host}${path}`), path };
}

function signRequest(
  s: ObjectStoreConfig,
  method: string,
  key: string,
  payloadHash: string,
  extraHeaders: Record<string, string> = {},
): { url: string; headers: Record<string, string> } {
  const { url, path } = requestTarget(s, key);
  const { amz, stamp } = amzDate(new Date());

  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
    ...extraHeaders,
  };

  const lower = new Map<string, string>();
  for (const [k, v] of Object.entries(headers)) lower.set(k.toLowerCase(), String(v).trim());
  const names = [...lower.keys()].sort();
  const canonicalHeaders = names.map((n) => `${n}:${lower.get(n)}\n`).join("");
  const signedHeaders = names.join(";");

  const canonicalRequest = [method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${stamp}/${s.region}/s3/aws4_request`;
  const stringToSign = [ALGORITHM, amz, scope, sha256(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(s, stamp)).update(stringToSign).digest("hex");

  headers.authorization =
    `${ALGORITHM} Credential=${s.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url: url.toString(), headers };
}

/**
 * Every request is bounded. A bucket that has become unreachable must not hold
 * a request handler open until the platform's own timeout kills it, because
 * that turns "your picture did not save" into "the page hung".
 */
async function send(
  req: { url: string; headers: Record<string, string> },
  method: string,
  body?: Blob,
): Promise<Response | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(req.url, { method, headers: req.headers, body, signal: ac.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Uploads one object. Returns false rather than throwing. */
export async function putObject(key: string, body: Buffer, contentType = "application/octet-stream"): Promise<boolean> {
  const s = objectStore();
  if (!s || !isSafeObjectKey(key)) return false;

  const req = signRequest(s, "PUT", key, sha256(body), {
    "content-type": contentType,
    "content-length": String(body.byteLength),
    // The key carries a random suffix, so the bytes behind a given key never
    // change and this can be cached hard. Private, because it is a photograph
    // of a person and shared caches have no business holding it.
    "cache-control": "private, max-age=31536000, immutable",
  });

  const res = await send(req, "PUT", new Blob([new Uint8Array(body)]));
  return !!res && res.ok;
}

/** Fetches one object, or null when it is missing or the bucket is unreachable. */
export async function getObject(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  const s = objectStore();
  if (!s || !isSafeObjectKey(key)) return null;

  const req = signRequest(s, "GET", key, "UNSIGNED-PAYLOAD");
  const res = await send(req, "GET");
  if (!res || !res.ok) return null;
  return {
    body: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "application/octet-stream",
  };
}

/** Deletes one object. True when it is gone, including when it never existed. */
export async function deleteObject(key: string): Promise<boolean> {
  const s = objectStore();
  if (!s || !isSafeObjectKey(key)) return false;

  const req = signRequest(s, "DELETE", key, "UNSIGNED-PAYLOAD");
  const res = await send(req, "DELETE");
  // S3 answers 204 for a delete and does not distinguish "was there" from
  // "was not"; 404 is treated the same way, since the caller's intent — that
  // the object not be there — is satisfied either way.
  return !!res && (res.ok || res.status === 404);
}
