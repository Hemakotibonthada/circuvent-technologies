import { createHash, createHmac, randomBytes } from "node:crypto";
import { config } from "../config";
import { logger } from "../logger";

/**
 * Object storage for the things that are too big to belong in Postgres.
 *
 * WHY THIS EXISTS
 *
 * ANPR captures were stored as base64 in `plate_reads.thumb`. That works, and
 * it is why the column is still read — but it makes the database carry the
 * product's bulk. Base64 inflates a JPEG by a third, TOAST compresses it badly
 * because it is already compressed, and every `pg_dump` and every replica
 * carries every photograph of every car that ever came to the gate. The
 * 96 KB `ANPR_THUMBNAIL_MAX_KB` ceiling exists purely to bound that, and it is
 * paid for in evidence: a capture over the cap was recorded with *no image at
 * all*, which is exactly the read somebody later disputes.
 *
 * Moving the bytes to a bucket removes the reason for the ceiling. The row
 * keeps the metadata it is queried by; the bucket keeps the picture.
 *
 * WHY IT IS HAND-ROLLED
 *
 * The control plane has thirteen runtime dependencies and runs on a 1 vCPU VM.
 * `@aws-sdk/client-s3` is ~15 MB across ~40 packages to issue three request
 * shapes. `scripts/upload-firmware-to-r2.cjs` already signs SigV4 by hand for
 * the firmware bucket and has done so in production; this is the same routine,
 * typed, shared, and with GET/DELETE and presigning added.
 *
 * WHY THE BUCKET MUST BE PRIVATE
 *
 * The firmware bucket is public, because an ESP32 doing an OTA check cannot
 * sign a request. This one holds photographs of vehicles, and of whoever was
 * walking past — personal data about people who never agreed to anything. It
 * is served back through `GET /anpr/reads/:id/image`, which checks ownership,
 * or by a presigned URL that expires. There is no configuration that makes it
 * public, and `Docs/20-anpr.md` says so.
 *
 * S3 AND R2 ARE THE SAME API HERE
 *
 * R2 is S3-compatible for the four operations used. Set `S3_ENDPOINT` to
 * `https://<account>.r2.cloudflarestorage.com` with region `auto`, or leave it
 * empty and set `S3_REGION` for real AWS. Path-style addressing is the default
 * because R2 requires it and S3 still accepts it.
 */

const ALGORITHM = "AWS4-HMAC-SHA256";
const UNSIGNED = "UNSIGNED-PAYLOAD";

const sha256 = (d: Buffer | string): string => createHash("sha256").update(d).digest("hex");
const hmac = (k: Buffer | string, d: string): Buffer => createHmac("sha256", k).update(d).digest();

/**
 * The RFC 3986 encoding SigV4 wants, which is not what `encodeURIComponent`
 * produces: `!`, `'`, `(`, `)` and `*` are unreserved to JavaScript and
 * reserved to AWS. A key containing one of them signs correctly here and
 * returns `SignatureDoesNotMatch` if left to the built-in.
 */
function uriEncode(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
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
 * Null is a supported state, not an error: object storage is optional in the
 * same way the plate recogniser is. Without it captures fall back to the
 * database column and everything else works, so a deployment that has not
 * bought a bucket gets a working gate rather than a broken one.
 */
export function objectStore(): ObjectStoreConfig | null {
  const bucket = config.S3_BUCKET.trim();
  const accessKeyId = config.S3_ACCESS_KEY_ID.trim();
  const secretAccessKey = config.S3_SECRET_ACCESS_KEY.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) return null;

  // R2_ACCOUNT_ID is offered as a shorthand because it is the only thing a
  // Cloudflare user has to hand; deriving the endpoint from it removes a step
  // where a typo produces a signature error rather than a name error.
  const account = config.R2_ACCOUNT_ID.trim();
  const endpoint = (
    config.S3_ENDPOINT.trim() || (account ? `https://${account}.r2.cloudflarestorage.com` : "")
  ).replace(/\/+$/, "");
  if (!endpoint) return null;

  return {
    endpoint,
    region: config.S3_REGION.trim() || "auto",
    bucket,
    accessKeyId,
    secretAccessKey,
    pathStyle: config.S3_FORCE_PATH_STYLE !== "false",
  };
}

export function isObjectStoreConfigured(): boolean {
  return objectStore() !== null;
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
  const host = `${s.bucket}.${base.host}`;
  return { url: new URL(`${base.protocol}//${host}${path}`), path };
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

function signRequest(
  s: ObjectStoreConfig,
  method: string,
  key: string,
  payloadHash: string,
  extraHeaders: Record<string, string> = {}
): SignedRequest {
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
 * A time-limited URL for one object.
 *
 * Query-string SigV4 rather than header SigV4, because the point is to hand
 * the URL to something that cannot add an Authorization header — an `<img>`
 * tag. `expiresSec` is clamped to a day: a link to a photograph of somebody's
 * vehicle that works for a week is a link that ends up pasted into a chat.
 */
export function presignGet(key: string, expiresSec = 300): string | null {
  const s = objectStore();
  if (!s || !isSafeObjectKey(key)) return null;

  const { url, path } = requestTarget(s, key);
  const { amz, stamp } = amzDate(new Date());
  const scope = `${stamp}/${s.region}/s3/aws4_request`;
  const expires = Math.min(Math.max(Math.floor(expiresSec), 1), 86400);

  const query: Record<string, string> = {
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": `${s.accessKeyId}/${scope}`,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join("&");

  const canonicalRequest = ["GET", path, canonicalQuery, `host:${url.host}\n`, "host", UNSIGNED].join(
    "\n"
  );
  const stringToSign = [ALGORITHM, amz, scope, sha256(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(s, stamp)).update(stringToSign).digest("hex");

  return `${url.origin}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/**
 * Every request is bounded.
 *
 * A bucket that has become unreachable — a DNS failure, a network partition,
 * an endpoint typo — must not hold an ANPR burst open. The pipeline treats a
 * failed upload as "no image", which is recoverable; a hung one would stall
 * `MAX_INFLIGHT` and stop the gate reading plates at all.
 */
async function send(req: SignedRequest, method: string, body?: Blob): Promise<Response | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), config.S3_TIMEOUT_MS);
  try {
    return await fetch(req.url, { method, headers: req.headers, body, signal: ac.signal });
  } catch (err) {
    logger.error({ err, method }, "object store request failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Uploads one object. Returns false rather than throwing.
 *
 * The caller is on the ANPR hot path, where the correct response to a bucket
 * that is refusing writes is to store the read without its image and carry on.
 * Losing the photograph of one arrival is a bad day; losing the arrival is a
 * gate that stopped working.
 */
export async function putObject(
  key: string,
  body: Buffer,
  contentType = "application/octet-stream"
): Promise<boolean> {
  const s = objectStore();
  if (!s || !isSafeObjectKey(key)) return false;

  const req = signRequest(s, "PUT", key, sha256(body), {
    "content-type": contentType,
    "content-length": String(body.byteLength),
    // A capture is immutable: the key carries a random suffix, so the bytes
    // behind a given key never change.
    "cache-control": "private, max-age=31536000, immutable",
  });

  // A Blob rather than the Buffer: it is the shape this codebase already hands
  // to fetch for binary bodies (see anpr/recognizer.ts), and the only one the
  // Node 20 typings accept without a cast. Untyped, so the explicit
  // content-type header above is the one that is signed and sent.
  const res = await send(req, "PUT", new Blob([new Uint8Array(body)]));
  if (!res) return false;
  if (!res.ok) {
    logger.error(
      { status: res.status, key, detail: (await res.text().catch(() => "")).slice(0, 200) },
      "object store put failed"
    );
    return false;
  }
  return true;
}

/** Fetches one object. Null when it is missing or the store is unreachable. */
export async function getObject(key: string): Promise<Buffer | null> {
  const s = objectStore();
  if (!s || !isSafeObjectKey(key)) return null;

  const req = signRequest(s, "GET", key, UNSIGNED);
  const res = await send(req, "GET");
  if (!res) return null;
  if (!res.ok) {
    // 404 is ordinary: an image can be swept by a bucket lifecycle rule before
    // the row that names it. Logged at debug so retention doing its job does
    // not read as a fault.
    if (res.status !== 404) logger.error({ status: res.status, key }, "object store get failed");
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Deletes one object. Idempotent — S3 returns 204 for a key that is absent. */
export async function deleteObject(key: string): Promise<boolean> {
  const s = objectStore();
  if (!s || !isSafeObjectKey(key)) return false;

  const req = signRequest(s, "DELETE", key, UNSIGNED);
  const res = await send(req, "DELETE");
  if (!res) return false;
  if (!res.ok && res.status !== 404) {
    logger.error({ status: res.status, key }, "object store delete failed");
    return false;
  }
  return true;
}

/**
 * Deletes many objects with a bounded fan-out.
 *
 * The multi-object `POST ?delete` call would be one request instead of N, but
 * it is the one operation in this file that needs an XML body *and* an XML
 * response parser, and it fails in a way that hides which keys survived. The
 * retention sweep runs once a day against at most a few thousand keys and is
 * on nobody's path, so N bounded requests is the trade worth making. Failures
 * are counted rather than thrown: a key that could not be deleted today is
 * retried by the next sweep, because the row naming it is only cleared once
 * the object is actually gone.
 */
export async function deleteObjects(keys: string[], concurrency = 8): Promise<number> {
  if (!keys.length || !isObjectStoreConfigured()) return 0;

  let index = 0;
  let deleted = 0;
  const workers = Array.from({ length: Math.min(concurrency, keys.length) }, async () => {
    for (;;) {
      const i = index++;
      if (i >= keys.length) return;
      if (await deleteObject(keys[i])) deleted++;
    }
  });
  await Promise.all(workers);
  return deleted;
}

/**
 * The key for one ANPR capture.
 *
 * Date-partitioned so a lifecycle rule on the bucket can express the same
 * retention the sweep does, and so a human looking for "the captures from the
 * night of the 3rd" can list one prefix instead of scanning a flat namespace.
 * Owner-scoped first, because the only bulk operation anybody ever asks for is
 * "delete everything belonging to this account".
 *
 * The random suffix is what makes the object immutable and therefore safely
 * cacheable, and it also means a read id is not enough to guess a key — the
 * bucket is private, but a guessable key in a private bucket is still a worse
 * design than an unguessable one.
 */
export function anprImageKey(ownerId: number, at: Date = new Date()): string {
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, "0");
  const d = String(at.getUTCDate()).padStart(2, "0");
  return `anpr/${ownerId}/${y}/${m}/${d}/${at.getTime()}-${randomBytes(6).toString("hex")}.jpg`;
}

/**
 * True for a key this deployment is allowed to address.
 *
 * `image_key` is read out of the database and used to build a request, so it is
 * treated as untrusted input: a row holding `../` or an absolute URL must not
 * be able to address a different bucket or escape the prefix. Nothing writes
 * such a value today, which is exactly when a check like this is cheap.
 */
export function isSafeObjectKey(key: string): boolean {
  return (
    typeof key === "string" &&
    key.length > 0 &&
    key.length <= 512 &&
    !key.startsWith("/") &&
    !key.includes("..") &&
    !key.includes("://") &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f]/.test(key)
  );
}
