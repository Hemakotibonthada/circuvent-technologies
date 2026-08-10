#!/usr/bin/env node
/*
 * Read the certificate fingerprints out of a JKS without its password.
 *
 * Play rejected the upload with "signed with the wrong key" and printed the
 * fingerprint it expects. There are two keystores in credentials/ and the
 * password on file only opens one of them, so keytool cannot answer the
 * question that matters: is the other one the key Play wants, or is the real
 * upload key not on this machine at all?
 *
 * A JKS encrypts private keys but stores certificates in the clear, so the
 * answer is readable without any password. That is the difference between
 * "find the password for this file" and "this file is not the one".
 *
 * Format (sun.security.provider.JavaKeyStore):
 *   u4 magic 0xFEEDFEED, u4 version, u4 entryCount
 *   per entry: u4 tag (1 = key, 2 = trusted cert)
 *              utf alias, u8 timestamp
 *              tag 1: u4 keyLen, keyLen bytes, u4 chainLen, then chain
 *              tag 2: one cert
 *   per cert: utf type ("X.509"), u4 len, len bytes DER
 */
const { readFileSync } = require("fs");
const { createHash } = require("crypto");

const file = process.argv[2];
if (!file) {
  console.log("usage: node read-jks-certs.js <keystore>");
  process.exit(2);
}

const buf = readFileSync(file);
let p = 0;
const u4 = () => { const v = buf.readUInt32BE(p); p += 4; return v; };
const u8 = () => { p += 8; };
const utf = () => { const n = buf.readUInt16BE(p); p += 2; const s = buf.toString("utf8", p, p + n); p += n; return s; };

const magic = u4();
if (magic !== 0xfeedfeed) {
  console.log(`not a JKS (magic 0x${magic.toString(16)}) — probably PKCS12, which encrypts its certificates too`);
  process.exit(1);
}
const version = u4();
const count = u4();
console.log(`JKS v${version}, ${count} entr${count === 1 ? "y" : "ies"}\n`);

const fmt = (hex) => hex.toUpperCase().match(/../g).join(":");

for (let i = 0; i < count; i++) {
  const tag = u4();
  const alias = utf();
  u8();

  let certs = 0;
  if (tag === 1) {
    const keyLen = u4();
    p += keyLen;
    certs = u4();
  } else if (tag === 2) {
    certs = 1;
  } else {
    console.log(`unknown entry tag ${tag}, stopping`);
    break;
  }

  console.log(`alias: ${alias}  (${tag === 1 ? "private key" : "trusted cert"}, ${certs} cert${certs === 1 ? "" : "s"})`);
  for (let c = 0; c < certs; c++) {
    const type = utf();
    const len = u4();
    const der = buf.subarray(p, p + len);
    p += len;
    console.log(`  ${type}`);
    console.log(`  SHA1:   ${fmt(createHash("sha1").update(der).digest("hex"))}`);
    console.log(`  SHA256: ${fmt(createHash("sha256").update(der).digest("hex"))}`);
  }
  console.log("");
}
