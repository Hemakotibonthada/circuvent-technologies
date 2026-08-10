#!/usr/bin/env node
/*
 * Try one password against the keystores in credentials/, in both formats.
 *
 * keytool's "keystore password was incorrect" is the same message whether the
 * password is wrong or the store type is being guessed wrongly, so a single
 * failed attempt does not actually tell you which. This tries each
 * combination and reports the certificate fingerprint on success, which is the
 * only thing that answers the real question: is this the key Play expects?
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CRED = join(ROOT, "credentials");
const expected = JSON.parse(readFileSync(join(ROOT, "play-upload-key.json"), "utf8")).uploadCertificate.sha1.toUpperCase();

const password = process.argv[2];
const explicitFile = process.argv[3];
if (!password) {
  console.log("usage: node try-keystore-password.mjs <password> [keystore-file]");
  console.log("       the file is optional; without it, everything in credentials/ is tried");
  process.exit(2);
}

function keytool() {
  const home = process.env.JAVA_HOME;
  if (home) {
    const p = join(home, "bin", process.platform === "win32" ? "keytool.exe" : "keytool");
    if (existsSync(p)) return p;
  }
  return "keytool";
}

const stores = explicitFile ? [explicitFile] : readdirSync(CRED).filter((f) => /\.(jks|keystore|p12|pfx)$/i.test(f));
console.log(`expected by Play: ${expected}\n`);

let found = false;
for (const file of stores) {
  const path = explicitFile ? file : join(CRED, file);
  for (const type of ["JKS", "PKCS12"]) {
    const args = ["-list", "-v", "-storetype", type, "-keystore", path, "-storepass", password];
    try {
      const out = execFileSync(keytool(), args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const sha1 = (out.match(/SHA1:\s*([0-9A-F:]{40,})/i) || [])[1];
      const alias = (out.match(/Alias name:\s*(.+)/) || [])[1];
      const match = sha1 && sha1.toUpperCase() === expected;
      console.log(`OPENS  ${file} as ${type}`);
      console.log(`       alias ${alias?.trim()}`);
      console.log(`       SHA1  ${sha1}`);
      console.log(`       ${match ? "*** this is the key Play expects ***" : "not the key Play expects"}\n`);
      found = true;
    } catch {
      console.log(`no     ${file} as ${type}`);
    }
  }
}

if (!found) console.log("\nNothing in credentials/ opens with that password.");
