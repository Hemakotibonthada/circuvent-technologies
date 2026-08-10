#!/usr/bin/env node
/*
 * Open a vault made by vault-collect.mjs.
 *
 * Lists what is inside by default and writes nothing. Restoring a file is
 * deliberately one explicit flag and one explicit name: the common case is
 * "which key is in here and does its checksum match", not "spray credentials
 * across the disk".
 *
 *   node scripts/vault-restore.mjs <vault>                       # list
 *   node scripts/vault-restore.mjs <vault> --extract <name> <to> # one file
 */
import { createDecipheriv, scryptSync, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";

const [file, ...rest] = process.argv.slice(2);
if (!file) {
  console.log("usage: node scripts/vault-restore.mjs <vault> [--extract <name> <destination>]");
  process.exit(2);
}
if (!existsSync(file)) {
  console.log(`no such file: ${file}`);
  process.exit(1);
}

const buf = readFileSync(file);
if (buf.subarray(0, 8).toString() !== "CVVAULT1") {
  console.log("Not a Circuvent vault (bad header).");
  process.exit(1);
}
const salt = buf.subarray(8, 24);
const iv = buf.subarray(24, 36);
const tag = buf.subarray(36, 52);
const enc = buf.subarray(52);

function ask(q) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (ch) => {
      if (["\n", "\r", "\u0004"].includes(ch.toString())) process.stdin.removeListener("data", onData);
      else process.stdout.write("\x1b[2K\x1b[200D" + q + "*".repeat(rl.line.length));
    };
    process.stdin.on("data", onData);
    rl.question(q, (a) => { rl.close(); process.stdout.write("\n"); resolve(a); });
  });
}

const pass = await ask("passphrase: ");
const key = scryptSync(pass, salt, 32, { N: 2 ** 15, r: 8, p: 1 });
const d = createDecipheriv("aes-256-gcm", key, iv);
d.setAuthTag(tag);

let json;
try {
  json = JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString("utf8"));
} catch {
  // GCM's tag fails closed, so this is either the wrong passphrase or a
  // modified file. Both are worth saying plainly rather than "unexpected token".
  console.log("\nWrong passphrase, or the file has been altered since it was written.");
  process.exit(1);
}

console.log(`\nvault written ${json.createdAt}`);
console.log(`${json.files.length} file(s):\n`);
for (const f of json.files) {
  const body = Buffer.from(f.body, "base64");
  const ok = createHash("sha256").update(body).digest("hex") === f.sha256;
  console.log(`  ${basename(f.path).padEnd(34)} ${String(f.bytes).padStart(6)}B  ${ok ? "checksum ok" : "CHECKSUM MISMATCH"}`);
  console.log(`      ${f.label}`);
}

const i = rest.indexOf("--extract");
if (i !== -1) {
  const name = rest[i + 1];
  const dest = rest[i + 2];
  if (!name || !dest) {
    console.log("\n--extract needs a file name and a destination.");
    process.exit(2);
  }
  const hit = json.files.find((f) => basename(f.path) === name);
  if (!hit) {
    console.log(`\nNothing called ${name} in this vault.`);
    process.exit(1);
  }
  writeFileSync(dest, Buffer.from(hit.body, "base64"));
  console.log(`\nwrote ${dest}`);
  console.log("Delete it when you are done — it is a plaintext secret on disk again.");
}
