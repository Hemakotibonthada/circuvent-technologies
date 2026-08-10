#!/usr/bin/env node
/*
 * Refuse to commit a secret.
 *
 * .gitignore stops the files it knows about. It does not stop `git add -f`, a
 * secret pasted into a source file, a new .env under a name nobody thought of,
 * or an archive of the whole credentials directory. Those are the ways this
 * goes wrong, and the cost is not recoverable: git history is distributed, so
 * a secret pushed once is in every clone and every fork, and deleting the file
 * in a later commit does not remove it from history.
 *
 * What is at stake here specifically: the SSH private key to the production
 * VM, the Postgres password, the JWT signing secret, and the keystore that is
 * the app's identity on Google Play.
 *
 * Run over what is staged:   node scripts/check-no-secrets.js --staged
 * Run over the tree:         node scripts/check-no-secrets.js
 */
const { execSync } = require("child_process");
const { readFileSync, statSync, existsSync } = require("fs");
const { join, basename, extname } = require("path");

const ROOT = join(__dirname, "..");
const staged = process.argv.includes("--staged");

/** Files that are a secret by their very name. */
const FORBIDDEN_NAMES = [
  { re: /^\.env(\.|$)(?!.*(example|sample|template))/i, why: "environment file — these hold database passwords and signing secrets" },
  { re: /\.(jks|keystore|p12|pfx)$/i, why: "keystore — this is the app's identity on Google Play" },
  { re: /^id_(rsa|dsa|ecdsa|ed25519)$/, why: "SSH private key" },
  { re: /\.(pem|key)$/i, why: "private key" },
  { re: /^upload-keystore\.properties$/i, why: "keystore passwords" },
  { re: /\.vault$/i, why: "credential vault — encrypted, but it does not belong in git either" },
  { re: /^credentials?\.json$/i, why: "credentials file" },
];

/** Content that is a secret wherever it appears. */
const FORBIDDEN_CONTENT = [
  { re: /-----BEGIN (RSA |OPENSSH |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/, why: "a private key is embedded in this file" },
  { re: /\bAKIA[0-9A-Z]{16}\b/, why: "AWS access key id" },
  { re: /\bghp_[A-Za-z0-9]{36}\b/, why: "GitHub personal access token" },
  { re: /\bsk-[A-Za-z0-9]{32,}\b/, why: "API secret key" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, why: "Slack token" },
  { re: /postgres(ql)?:\/\/[^\s:/]+:([^\s@/]{6,})@/i, why: "a database URL with a password in it", captured: 2 },
  { re: /CV_UPLOAD_(STORE|KEY)_PASSWORD\s*=\s*(\S+)/, why: "keystore password", captured: 2 },
];

/**
 * A "password" that is a reference or a redaction is not a password.
 *
 * The first run of this check flagged six files and every one was a false
 * positive: `${POSTGRES_PASSWORD}` in a compose file, `******` in a redacted
 * sample, and `${props.CV_UPLOAD_STORE_PASSWORD}` in the build script that
 * reads the value at runtime. A check that reports six non-problems on its
 * first run is a check somebody switches off before it ever finds a real one.
 */
function isPlaceholder(value) {
  if (!value) return true;
  // Trim the syntax that surrounds a value in source: template-literal
  // backticks, quotes, escaped newlines, trailing commas and semicolons. The
  // first version captured `${props.CV_UPLOAD_STORE_PASSWORD}\n` + a backtick
  // and decided that was not a variable reference.
  const v = value.replace(/[`'";,]+$/g, "").replace(/\\n$/, "").trim();
  return (
    v.includes("${") ||                    // ${VAR} anywhere, including ${a.b}
    /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(v) ||
    /^%[A-Za-z_][A-Za-z0-9_]*%$/.test(v) ||
    /^[*x•]+/i.test(v) ||                  // ****** redactions
    v.startsWith("<") ||                   // <store password>
    /^(changeme|password|secret|example|placeholder|redacted|your[-_]?password)$/i.test(v)
  );
}

/** Anything genuinely safe that would otherwise trip the content rules. */
const ALLOWLIST = [
  /\.env\.example$/i,
  /check-no-secrets\.js$/,          // this file names the patterns it looks for
  /vault-collect\.mjs$/,
  /vault-restore\.mjs$/,
  /play-upload-key\.json$/,          // fingerprints are public
  /^Docs\//,
  /SECRETS\.md$/,
];

function listFiles() {
  if (staged) {
    const out = execSync("git diff --cached --name-only --diff-filter=ACM", { cwd: ROOT, encoding: "utf8" });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  }
  const out = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

/** Does this filename alone make the file a secret? */
function scanName(name) {
  return FORBIDDEN_NAMES.filter((rule) => rule.re.test(name)).map((rule) => ({ why: rule.why }));
}

/** Does this file's content contain a secret? */
function scanContent(text) {
  const found = [];
  for (const rule of FORBIDDEN_CONTENT) {
    const m = text.match(rule.re);
    if (!m) continue;
    if (rule.captured && isPlaceholder(m[rule.captured])) continue;
    found.push({ why: rule.why, sample: (m[0] || "").slice(0, 70) });
  }
  return found;
}

function isAllowlisted(rel) {
  return ALLOWLIST.some((re) => re.test(rel));
}

function main() {
const problems = [];
for (const rel of listFiles()) {
  if (isAllowlisted(rel)) continue;
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;

  for (const hit of scanName(basename(rel))) problems.push({ rel, ...hit });

  // Binaries are checked by name only; reading a 40 MB bundle to regex it
  // achieves nothing.
  const size = statSync(abs).size;
  if (size > 512 * 1024) continue;
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".aab", ".apk", ".woff", ".woff2"].includes(extname(rel).toLowerCase())) continue;

  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  for (const hit of scanContent(text)) problems.push({ rel, ...hit });
}

if (problems.length) {
  console.log(`\n✗ ${problems.length} file(s) must not be committed:\n`);
  for (const p of problems) console.log(`   ${p.rel}\n       ${p.why}${p.sample ? `\n       matched: ${p.sample}` : ""}`);
  console.log("\nGit history is permanent and distributed. A secret pushed once is in every");
  console.log("clone and every fork, and removing the file in a later commit does not remove");
  console.log("it from history — it has to be rewritten and every credential rotated.");
  console.log("\nUse scripts/vault-collect.mjs to back these up encrypted, outside the repo.");
  process.exitCode = 1;
} else {
  console.log(`✓ no-secrets — checked ${staged ? "staged files" : "the tracked tree"}`);
}
}

if (require.main === module) main();

module.exports = { scanName, scanContent, isPlaceholder, FORBIDDEN_NAMES, FORBIDDEN_CONTENT };
