#!/usr/bin/env node
/*
 * Collect every credential this project needs into one encrypted file.
 *
 * The Play upload key was effectively lost once already -- the password that
 * opened it was overwritten and eight releases' worth of app identity went
 * with it. The SSH keys for the production VM currently live in %TEMP%, which
 * Windows deletes. So a backup is genuinely needed.
 *
 * What it must not be is a plain zip in git. Git history is permanent and
 * distributed: a secret pushed once is in every clone and every fork forever,
 * and deleting the file later does not remove it from history. These
 * particular secrets are the SSH key to the production VM, the database
 * password, the JWT signing secret and the key that is the app's identity on
 * Google Play.
 *
 * So the archive is encrypted with AES-256-GCM under a passphrase, and the
 * result is safe to put anywhere -- including cloud storage that is not
 * yours -- because without the passphrase it is noise. The passphrase belongs
 * in a password manager, not in this repo.
 *
 *   node scripts/vault-collect.mjs                 # collect + encrypt
 *   node scripts/vault-restore.mjs <file>          # decrypt + list
 */
import { createCipheriv, randomBytes, scryptSync, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.USERPROFILE || process.env.HOME || "";
const TEMP = process.env.TEMP || "/tmp";

/**
 * What goes in.
 *
 * Explicit rather than a glob for *.key or *.env: a wildcard over a working
 * tree picks up .env.example, which is documentation, and would eventually
 * pick up something nobody meant to archive.
 */
const SOURCES = [
  { kind: "env", label: "site production env (Vercel)", path: join(ROOT, ".vercel/.env.production.local") },
  { kind: "env", label: "site local env", path: join(ROOT, ".env.local") },
  { kind: "env", label: "control plane env", path: join(ROOT, "circuvent-platform/.env") },
  { kind: "env", label: "control plane production env (Vercel)", path: join(ROOT, "circuvent-platform/.vercel/.env.production.local") },
  { kind: "android-keystore", label: "Play upload key (24 July — signs 1.1.0…1.8.0, the releases Play accepts)", path: join(ROOT, "mobile/credentials/circuvent-upload.jks") },
  { kind: "android-keystore", label: "second upload key (3 Aug — Play refuses bundles signed with it)", path: join(ROOT, "mobile/credentials/circuvent-upload.keystore") },
  { kind: "android-keystore-props", label: "passwords for circuvent-upload.keystore", path: join(ROOT, "mobile/credentials/upload-keystore.properties") },
];

// SSH keys for the control-plane VM. They are in TEMP, which is the whole
// problem: %TEMP% is cleared, and that host has no other way in.
for (const name of ["ssh-key-2026-08-03.key", "ssh-key-2026-08-02.key", "ssh-key-2026-07-24.key", "ssh-key-2026-07-11.key", "ssh-key-2026-03-19.key"]) {
  SOURCES.push({ kind: "ssh-key", label: `control plane VM key (${name.replace(/^ssh-key-|\.key$/g, "")})`, path: join(TEMP, "cvkeys", name) });
}
for (const name of ["id_rsa", "id_ed25519"]) {
  SOURCES.push({ kind: "ssh-key", label: `personal ${name}`, path: join(HOME, ".ssh", name), optional: true });
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const onData = (ch) => {
        if (["\n", "\r", "\u0004"].includes(ch.toString())) process.stdin.removeListener("data", onData);
        else process.stdout.write("\x1b[2K\x1b[200D" + question + "*".repeat(rl.line.length));
      };
      process.stdin.on("data", onData);
    }
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(a);
    });
  });
}

const found = [];
const missing = [];
for (const s of SOURCES) {
  if (existsSync(s.path)) {
    const body = readFileSync(s.path);
    found.push({
      ...s,
      bytes: body.length,
      sha256: createHash("sha256").update(body).digest("hex"),
      body: body.toString("base64"),
      mtime: statSync(s.path).mtime.toISOString(),
    });
  } else if (!s.optional) {
    missing.push(s);
  }
}

console.log(`collecting ${found.length} file(s)\n`);
for (const f of found) console.log(`  ${f.kind.padEnd(22)} ${basename(f.path).padEnd(34)} ${String(f.bytes).padStart(6)} bytes`);
if (missing.length) {
  console.log(`\nnot on this machine (${missing.length}):`);
  for (const m of missing) console.log(`  ${basename(m.path)}`);
}

const pass = await ask("\npassphrase for the vault (nothing is echoed): ", { hidden: true });
if (!pass || pass.length < 12) {
  console.log("\nRefusing: a vault holding a production SSH key and an app signing key needs at least 12 characters.");
  process.exit(1);
}
const again = await ask("again: ", { hidden: true });
if (pass !== again) {
  console.log("\nThose do not match. Nothing written.");
  process.exit(1);
}

const payload = Buffer.from(
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      note: "Circuvent credentials. Decrypt with scripts/vault-restore.mjs.",
      files: found.map(({ kind, label, path, bytes, sha256, mtime, body }) => ({ kind, label, path, bytes, sha256, mtime, body })),
    },
    null,
    1
  ),
  "utf8"
);

// scrypt over a random salt, AES-256-GCM over a random iv. The tag makes
// tampering detectable rather than silently decrypting to rubbish.
const salt = randomBytes(16);
const iv = randomBytes(12);
const key = scryptSync(pass, salt, 32, { N: 2 ** 15, r: 8, p: 1 });
const cipher = createCipheriv("aes-256-gcm", key, iv);
const enc = Buffer.concat([cipher.update(payload), cipher.final()]);
const tag = cipher.getAuthTag();

const outDir = join(HOME, "circuvent-vault");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const outFile = join(outDir, `circuvent-secrets-${stamp}.vault`);

writeFileSync(
  outFile,
  Buffer.concat([Buffer.from("CVVAULT1"), salt, iv, tag, enc])
);

const manifest = {
  createdAt: new Date().toISOString(),
  vault: basename(outFile),
  algorithm: "AES-256-GCM, key from scrypt(N=2^15, r=8, p=1) over a 16-byte salt",
  contents: found.map(({ kind, label, path, bytes, sha256, mtime }) => ({
    kind,
    label,
    origin: path.replace(ROOT, ".").replace(HOME, "~"),
    bytes,
    sha256,
    mtime,
  })),
};
writeFileSync(join(outDir, `manifest-${stamp}.json`), JSON.stringify(manifest, null, 2));

console.log(`\n✓ ${outFile}`);
console.log(`  ${join(outDir, `manifest-${stamp}.json`)}  (checksums only, no secrets)`);
console.log("\nDeliberately written outside the repository, so it cannot be committed by accident.");
console.log("Put the passphrase in a password manager. Without it this file is unrecoverable —");
console.log("which is the point, and also the risk.");
