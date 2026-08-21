/**
 * Publishes compiled firmware to the public R2 bucket, and writes the manifest
 * that drives OTA.
 *
 *   node scripts/publish-firmware.cjs              (dry run — shows what would go)
 *   node scripts/publish-firmware.cjs --commit
 *
 * WHY THIS REPLACES upload-firmware-to-r2.cjs FOR RELEASES
 *
 * That script uploads whatever `.bin` files somebody had left in `public/fw/`.
 * It has no idea what version any of them is, so the operator had to name the
 * files correctly by hand and then set `OTA_<TYPE>` by hand to match. Two
 * hand-copied strings that must agree, in a mechanism whose failure mode is a
 * fleet that silently cannot be updated — which is the exact bug the home-hub
 * changelog records happening once already.
 *
 * This reads the version out of the source (`CV_FW_VERSION`) and the device
 * type out of the `CircuventDevice cv("...")` constructor, so the name of the
 * object, the version in the manifest and the version the device reports are
 * all the same fact from the same place. A build nobody rebuilt cannot be
 * published under a version somebody typed.
 *
 * THE BUCKET IS THE PUBLIC ONE, AND THAT IS DELIBERATE
 *
 * An ESP32 doing an OTA check holds no credentials and cannot sign a request,
 * so firmware has to be fetchable without one. It is a different bucket from
 * `circuvent-anpr`, which holds photographs of people's vehicles and must
 * never be public. Two buckets is the only way to have both.
 *
 * Integrity does not come from the bucket being private — it comes from the
 * device pinning ISRG Root X1 for the download (see `_applyOta`), and from the
 * SHA-256 recorded in the manifest.
 */
const fs = require("node:fs");
const path = require("node:path");
const { createHash, createHmac } = require("node:crypto");

const BUCKET = process.env.FIRMWARE_BUCKET || "circuvent-firmware";
const ACCOUNT = process.env.R2_ACCOUNT_ID;
const ACCESS = process.env.S3_ACCESS_KEY_ID;
const SECRET = process.env.S3_SECRET_ACCESS_KEY;
const PUBLIC_BASE =
  process.env.FIRMWARE_PUBLIC_BASE || "https://pub-d7f0dba2b9e5487092a2a1de50a12a2c.r2.dev";
const COMMIT = process.argv.includes("--commit");

const ENDPOINT = `https://${ACCOUNT}.r2.cloudflarestorage.com`;
const FW_DIR = path.join(__dirname, "..", "firmware");

const sha256 = (d) => createHash("sha256").update(d).digest("hex");
const hmac = (k, d) => createHmac("sha256", k).update(d).digest();

/** SigV4, header form, path-style — the shape R2 wants. */
function sign(method, key, payloadHash, extra = {}) {
  const host = new URL(ENDPOINT).host;
  const p = `/${BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const headers = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, ...extra };
  const names = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const canonicalHeaders = names
    .map(
      (h) =>
        `${h}:${String(headers[Object.keys(headers).find((k) => k.toLowerCase() === h)]).trim()}\n`
    )
    .join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [method, p, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${SECRET}`, dateStamp), "auto"), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  headers.Authorization =
    `AWS4-HMAC-SHA256 Credential=${ACCESS}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url: `${ENDPOINT}${p}`, headers };
}

async function put(key, body, contentType, cacheControl) {
  const { url, headers } = sign("PUT", key, sha256(body), {
    "content-type": contentType,
    "content-length": String(body.byteLength),
    "cache-control": cacheControl,
  });
  const res = await fetch(url, { method: "PUT", headers, body: new Uint8Array(body) });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
}

/** Reads a single-quoted-ish define out of a sketch. */
function match(src, re) {
  const m = re.exec(src);
  return m ? m[1] : "";
}

/**
 * Chooses which compiled image to publish for a sketch.
 *
 * This used to take the first `.pio/build/<env>/firmware.bin` that readdir
 * happened to return. That is fine while a sketch has exactly one env, and
 * quietly wrong the moment it has more: firmware/meter builds a three-channel
 * default plus single-channel and HLW8012 variants, and "first in directory
 * order" would have been a coin toss between them. Publishing the
 * single-channel image as the three-channel product gives every customer a
 * meter whose other two channels read zero forever — an OTA that looks
 * completely successful.
 *
 * Preference order: the env named by default_envs, then an env named after the
 * device type or the folder, then — only if the choice is unambiguous — the
 * single env present. An ambiguous pick is refused rather than guessed.
 */
function pickImage(dir, buildDir, folder, type) {
  const envs = fs
    .readdirSync(buildDir)
    .filter((e) => fs.existsSync(path.join(buildDir, e, "firmware.bin")));
  if (envs.length === 0) return null;
  if (envs.length === 1) return path.join(buildDir, envs[0], "firmware.bin");

  const iniPath = path.join(dir, "platformio.ini");
  const ini = fs.existsSync(iniPath) ? fs.readFileSync(iniPath, "utf8") : "";
  const declared = match(ini, /^\s*default_envs\s*=\s*(.+)$/m)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const want of [...declared, type, folder]) {
    if (envs.includes(want)) return path.join(buildDir, want, "firmware.bin");
  }
  throw new Error(
    `${folder}: ${envs.length} build envs (${envs.join(", ")}) and none matches ` +
      `default_envs/${type}/${folder} — refusing to guess which image is the product.`,
  );
}

/** Every sketch that has both a version and a compiled image. */
function collect() {
  const out = [];
  for (const entry of fs.readdirSync(FW_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === ".pio" || entry.name === "CircuventDevice") continue;
    const dir = path.join(FW_DIR, entry.name);
    const ino = fs.readdirSync(dir).find((f) => f.endsWith(".ino"));
    if (!ino) continue;

    const src = fs.readFileSync(path.join(dir, ino), "utf8");
    const version = match(src, /#define\s+CV_FW_VERSION\s+"([^"]+)"/);
    /*
     * The *device type*, not the folder name. They differ where a product was
     * renamed — drone-fc builds the `drone-x1` type — and the type is what the
     * device sends to the manifest endpoint, so the folder name would simply
     * never match.
     */
    const type = match(src, /CircuventDevice\s+\w+\("([^"]+)"/) || entry.name;
    if (!version) continue;

    const buildDir = path.join(dir, ".pio", "build");
    if (!fs.existsSync(buildDir)) continue;
    const bin = pickImage(dir, buildDir, entry.name, type);
    if (!bin) continue;

    out.push({ sketch: entry.name, type, version, bin });
  }
  return out.sort((a, b) => a.type.localeCompare(b.type));
}

(async () => {
  if (!ACCOUNT || !ACCESS || !SECRET) {
    console.error("Set R2_ACCOUNT_ID, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.");
    process.exit(1);
  }

  const builds = collect();
  if (!builds.length) {
    console.error("No compiled firmware found. Run `pio run` in each firmware/<sketch> first.");
    process.exit(1);
  }

  const manifest = { generatedAt: new Date().toISOString(), builds: {} };
  let total = 0;

  for (const b of builds) {
    const body = fs.readFileSync(b.bin);
    b.key = `fw/${b.type}-${b.version}.bin`;
    b.digest = sha256(body);
    b.bytes = body.byteLength;
    b.body = body;
    total += body.byteLength;
    manifest.builds[b.type] = {
      version: b.version,
      url: `${PUBLIC_BASE}/${b.key}`,
      sha256: b.digest,
      bytes: b.bytes,
      sketch: b.sketch,
    };
  }

  console.log(`${builds.length} images, ${(total / 1048576).toFixed(2)} MB -> ${BUCKET}\n`);
  for (const b of builds) {
    console.log(`  ${b.type.padEnd(18)} ${b.version.padEnd(9)} ${String(Math.round(b.bytes / 1024)).padStart(5)} KB  ${b.key}`);
  }

  if (!COMMIT) {
    console.log("\nDRY RUN — pass --commit to upload.");
    console.log("\nOTA env for the manifest endpoint:");
    for (const [type, m] of Object.entries(manifest.builds)) {
      console.log(`  OTA_${type.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}="${m.version}|${m.url}"`);
    }
    return;
  }

  let done = 0;
  for (const b of builds) {
    try {
      /*
       * A year, immutable. The version is in the filename, so the bytes behind
       * a given URL never change — and a device on a slow link must not
       * re-download an image it already has.
       */
      await put(b.key, b.body, "application/octet-stream", "public, max-age=31536000, immutable");
      done++;
      console.log(`  ok   ${b.key}`);
    } catch (err) {
      console.error(`  FAIL ${b.key}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  /*
   * The manifest is deliberately NOT immutable: it is the thing that changes
   * when a release is published, and a cached copy is a rollout that did not
   * happen. Five minutes is short enough to be a non-event and long enough
   * that a fleet checking in together does not stampede the origin.
   */
  const manifestBody = Buffer.from(JSON.stringify(manifest, null, 2));
  await put("fw/manifest.json", manifestBody, "application/json", "public, max-age=300");
  console.log(`  ok   fw/manifest.json`);

  /*
   * Factory images, if any have been built.
   *
   * Kept optional rather than required, because they take a full rebuild of
   * every project to produce and a release should not be blocked on that. But
   * when they exist they are uploaded alongside, because the OTA image alone
   * cannot revive a device whose flash has been erased — there is no bootloader
   * left to receive it. That gap is invisible until the one moment it matters.
   */
  const factoryDir = path.join(__dirname, "..", ".factory-images");
  let factoryDone = 0;
  if (fs.existsSync(factoryDir)) {
    const images = fs.readdirSync(factoryDir).filter((f) => f.endsWith("-factory.bin"));
    for (const f of images) {
      const key = `fw/${f}`;
      try {
        await put(key, fs.readFileSync(path.join(factoryDir, f)),
                  "application/octet-stream", "public, max-age=31536000, immutable");
        factoryDone++;
        console.log(`  ok   ${key}`);
      } catch (err) {
        console.error(`  FAIL ${key}: ${err.message}`);
        process.exitCode = 1;
      }
    }
    const idx = path.join(factoryDir, "index.json");
    if (fs.existsSync(idx)) {
      await put("fw/factory-index.json", fs.readFileSync(idx), "application/json", "public, max-age=300");
      console.log(`  ok   fw/factory-index.json`);
    }
  }

  console.log(`\nuploaded ${done}/${builds.length} images + manifest` +
              (factoryDone ? ` + ${factoryDone} factory images` : ""));
  console.log("\nOTA env for the manifest endpoint:");
  for (const [type, m] of Object.entries(manifest.builds)) {
    console.log(`  OTA_${type.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}="${m.version}|${m.url}"`);
  }
})();
