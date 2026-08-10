#!/usr/bin/env node
/*
 * Inventory the credentials this project depends on.
 *
 * This records where each secret lives, whether it is present, whether git can
 * see it, and a hash of the file so drift is detectable. It deliberately does
 * NOT record any secret value. An inventory that contains the secrets is just
 * another copy of the secrets, in a place with no encryption and no access
 * control — which is the thing this whole exercise exists to avoid.
 *
 * The hash is of the file, not of the credential inside it, so it answers
 * "has this changed since I last looked" without revealing anything.
 *
 *   node scripts/secret-inventory.mjs          # human readable
 *   node scripts/secret-inventory.mjs --json   # machine readable
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");

/**
 * Every credential this project needs in order to build, deploy or run.
 * `scope` is what breaks if it is lost.
 */
const CANDIDATES = [
  {
    id: "play-upload-key-original",
    kind: "android-keystore",
    location: join(REPO, "mobile/credentials/circuvent-upload.jks"),
    scope: "Google Play upload — signed every release up to 1.8.0-vc10",
    status: "password-unknown",
    notes: "Matches the fingerprint Play expects (4C:89:1B:...) but the password was lost when its properties file was overwritten on 3 Aug.",
  },
  {
    id: "play-upload-key-wrong",
    kind: "android-keystore",
    location: join(REPO, "mobile/credentials/circuvent-upload.keystore"),
    scope: "nothing — signed 1.10.0-12 onward, which Play rejects",
    status: "wrong-key",
    notes: "43:56:71:9A:... Play does not accept this. Created 3 Aug; the cause of the rejected uploads.",
  },
  {
    id: "play-upload-key-2026",
    kind: "android-keystore",
    location: join(REPO, "mobile/credentials/circuvent-upload-2026.jks"),
    scope: "Google Play upload, once the upload key reset is approved",
    status: "pending-google-approval",
    notes: "E2:FD:C4:F4:... 4096-bit RSA, valid to 2056. Password stored in the vault, outside the repo.",
  },
  {
    id: "play-upload-key-properties",
    kind: "keystore-passwords",
    location: join(REPO, "mobile/credentials/upload-keystore.properties"),
    scope: "gradle signing config",
    status: "points-at-wrong-key",
  },
  {
    id: "play-upload-cert-pem",
    kind: "certificate",
    location: join(homedir(), "circuvent-vault/upload_certificate.pem"),
    scope: "attach to Play's upload key reset request",
    status: "ready",
    notes: "Public certificate. Safe to send to Google; not a secret by itself.",
  },
  {
    id: "play-upload-key-2026-password",
    kind: "password",
    location: join(homedir(), "circuvent-vault/NEW-UPLOAD-KEY.txt"),
    scope: "opens circuvent-upload-2026.jks",
    status: "active",
  },
  {
    id: "ssh-production-vm",
    kind: "ssh-private-key",
    location: join(tmpdir(), "cvkeys/ssh-key-2026-07-24.key"),
    scope: "root-equivalent shell on the production VM 140.245.238.154",
    status: "active",
    notes: "Lives in TEMP, which Windows clears. Belongs in the vault.",
  },
  {
    id: "env-web-local",
    kind: "env-file",
    location: join(REPO, ".env.local"),
    scope: "web app local development",
    status: "active",
  },
  {
    id: "env-web-production",
    kind: "env-file",
    location: join(REPO, ".env.production"),
    scope: "web app production build",
    status: "active",
  },
  {
    id: "env-platform",
    kind: "env-file",
    location: join(REPO, "circuvent-platform/.env"),
    scope: "control plane — Postgres password, JWT signing secret",
    status: "active",
  },
  {
    id: "env-mobile",
    kind: "env-file",
    location: join(REPO, "mobile/.env"),
    scope: "mobile build configuration",
    status: "active",
  },
];

function gitKnows(abs) {
  const rel = relative(REPO, abs).replace(/\\/g, "/");
  if (rel.startsWith("..")) return { tracked: 0, ignored: 0 };
  let tracked = 0;
  try {
    execSync(`git ls-files --error-unmatch "${rel}"`, { cwd: REPO, stdio: "pipe" });
    tracked = 1;
  } catch {
    tracked = 0;
  }
  let ignored = 0;
  try {
    execSync(`git check-ignore -q "${rel}"`, { cwd: REPO, stdio: "pipe" });
    ignored = 1;
  } catch {
    ignored = 0;
  }
  return { tracked, ignored };
}

const rows = CANDIDATES.map((c) => {
  const present = existsSync(c.location);
  let size = null;
  let sha = null;
  let mtime = null;
  if (present) {
    const st = statSync(c.location);
    size = st.size;
    mtime = st.mtime.toISOString();
    sha = createHash("sha256").update(readFileSync(c.location)).digest("hex");
  }
  const { tracked, ignored } = gitKnows(c.location);
  return {
    id: c.id,
    kind: c.kind,
    name: c.location.split(/[\\/]/).pop(),
    location: c.location.replace(homedir(), "~").replace(/\\/g, "/"),
    scope: c.scope || null,
    present: present ? 1 : 0,
    tracked_in_git: tracked,
    gitignored: ignored,
    size_bytes: size,
    sha256: sha,
    modified_at: mtime,
    status: present ? c.status || "active" : "missing",
    notes: c.notes || null,
  };
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const bad = rows.filter((r) => r.tracked_in_git === 1);
  for (const r of rows) {
    const mark = r.present ? (r.tracked_in_git ? "IN GIT" : "ok") : "absent";
    console.log(`${mark.padEnd(7)} ${r.id.padEnd(28)} ${r.kind.padEnd(20)} ${r.location}`);
  }
  console.log(`\n${rows.filter((r) => r.present).length}/${rows.length} present, ${bad.length} tracked in git`);
  if (bad.length) process.exitCode = 1;
}
