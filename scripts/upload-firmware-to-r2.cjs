/**
 * Moves the firmware images out of the application bundle and into R2.
 *
 * Eighteen compiled images, about twenty megabytes, were committed under
 * `public/fw/` and served by the Next.js app. Every deployment carried them,
 * every build uploaded them, and a device downloading one pulled it through
 * the application's own bandwidth.
 *
 * They go to a **separate, public bucket**. Firmware has to be fetchable by a
 * device holding no credentials — an ESP32 doing an OTA check cannot sign a
 * request — and the bucket that holds resumes must never be public. Two
 * buckets is the only way to have both.
 *
 *   node scripts/upload-firmware-to-r2.cjs            (dry run)
 *   node scripts/upload-firmware-to-r2.cjs --commit
 */
const fs = require("node:fs");
const path = require("node:path");
const { createHash, createHmac } = require("node:crypto");

const BUCKET = process.env.FIRMWARE_BUCKET || "circuvent-firmware";
const ACCOUNT = process.env.R2_ACCOUNT_ID;
const ACCESS = process.env.S3_ACCESS_KEY_ID;
const SECRET = process.env.S3_SECRET_ACCESS_KEY;
const COMMIT = process.argv.includes("--commit");

const ENDPOINT = `https://${ACCOUNT}.r2.cloudflarestorage.com`;
const DIR = path.join(__dirname, "..", "public", "fw");

const sha256 = (d) => createHash("sha256").update(d).digest("hex");
const hmac = (k, d) => createHmac("sha256", k).update(d).digest();

/** SigV4, header form, path-style — the shape R2 wants. */
function sign(method, key, payloadHash, extra = {}) {
  const host = new URL(ENDPOINT).host;
  const p = `/${BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...extra,
  };
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = names
    .map((h) => `${h}:${String(headers[Object.keys(headers).find((k) => k.toLowerCase() === h)]).trim()}\n`)
    .join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [method, p, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const key2 = hmac(hmac(hmac(hmac(`AWS4${SECRET}`, dateStamp), "auto"), "s3"), "aws4_request");
  const signature = createHmac("sha256", key2).update(stringToSign).digest("hex");

  headers.Authorization =
    `AWS4-HMAC-SHA256 Credential=${ACCESS}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url: `${ENDPOINT}${p}`, headers };
}

(async () => {
  if (!ACCOUNT || !ACCESS || !SECRET) {
    console.error("Set R2_ACCOUNT_ID, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.");
    process.exit(1);
  }

  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".bin"))
    .sort();
  const total = files.reduce((n, f) => n + fs.statSync(path.join(DIR, f)).size, 0);
  console.log(`${files.length} images, ${(total / 1048576).toFixed(2)} MB -> ${BUCKET}\n`);

  if (!COMMIT) {
    for (const f of files) {
      console.log(`  would upload fw/${f}  (${Math.round(fs.statSync(path.join(DIR, f)).size / 1024)} KB)`);
    }
    console.log("\nDRY RUN — pass --commit to upload.");
    return;
  }

  let done = 0;
  for (const f of files) {
    const body = fs.readFileSync(path.join(DIR, f));
    const key = `fw/${f}`;
    const { url, headers } = sign("PUT", key, sha256(body), {
      "content-type": "application/octet-stream",
      "content-length": String(body.byteLength),
      /*
       * A year, immutable. A firmware image is identified by its version in
       * the filename, so the bytes behind a given URL never change — and a
       * device on a slow link should not re-download one it already has.
       */
      "cache-control": "public, max-age=31536000, immutable",
    });
    const res = await fetch(url, { method: "PUT", headers, body: new Uint8Array(body) });
    if (!res.ok) {
      console.error(`  FAIL ${key}: ${res.status} ${(await res.text()).slice(0, 160)}`);
      process.exitCode = 1;
      continue;
    }
    done++;
    console.log(`  ok   ${key}  (${Math.round(body.byteLength / 1024)} KB)`);
  }
  console.log(`\nuploaded ${done}/${files.length}`);
})();
