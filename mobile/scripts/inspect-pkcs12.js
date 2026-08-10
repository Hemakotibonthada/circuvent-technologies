#!/usr/bin/env node
/*
 * Is this PKCS12's certificate readable without the password?
 *
 * PKCS12 may store certificate bags encrypted or in the clear -- the standard
 * allows both, and plenty of tools write them unencrypted because a
 * certificate is public anyway. If they are in the clear here, the certificate
 * can be fingerprinted without any password, which answers the only question
 * that matters: is this the key Google Play expects, or is it a third
 * unrelated key and the real one was never on this machine?
 *
 * Walks the DER far enough to find certBag OIDs (1.2.840.113549.1.12.10.1.3)
 * and the x509Certificate OID (1.2.840.113549.1.9.22.1) that precedes the
 * DER-encoded certificate itself.
 */
const { readFileSync } = require("fs");
const { createHash } = require("crypto");

const file = process.argv[2];
if (!file) {
  console.log("usage: node inspect-pkcs12.js <file>");
  process.exit(2);
}
const buf = readFileSync(file);

const CERT_BAG_OID = Buffer.from("2A864886F70D010C0A0103", "hex"); // 1.2.840.113549.1.12.10.1.3
const X509_OID = Buffer.from("2A864886F70D010916 01".replace(/\s/g, ""), "hex"); // 1.2.840.113549.1.9.22.1
const ENCRYPTED_DATA_OID = Buffer.from("2A864886F70D010706", "hex"); // pkcs7 encryptedData

const has = (needle) => buf.includes(needle);

console.log(`file: ${file}`);
console.log(`size: ${buf.length} bytes`);
console.log(`certBag present in the clear : ${has(CERT_BAG_OID)}`);
console.log(`x509Certificate bag attribute: ${has(X509_OID)}`);
console.log(`pkcs7 encryptedData present  : ${has(ENCRYPTED_DATA_OID)}`);

if (!has(X509_OID)) {
  console.log("\nThe certificate bags are encrypted, so the certificate cannot be read");
  console.log("without the store password. Nothing further can be established from the file.");
  process.exit(1);
}

/*
 * After the x509Certificate OID comes: [0] EXPLICIT, then an OCTET STRING
 * holding the DER certificate. Find each occurrence and pull the certificate
 * out by its own SEQUENCE header, which is self-describing.
 */
const fmt = (hex) => hex.toUpperCase().match(/../g).join(":");
let from = 0;
let n = 0;

while (true) {
  const at = buf.indexOf(X509_OID, from);
  if (at === -1) break;
  from = at + X509_OID.length;

  // Scan forward for the next certificate SEQUENCE (0x30 0x82 len-hi len-lo).
  for (let p = from; p < Math.min(from + 64, buf.length - 4); p++) {
    if (buf[p] !== 0x30 || buf[p + 1] !== 0x82) continue;
    const len = buf.readUInt16BE(p + 2);
    const der = buf.subarray(p, p + 4 + len);
    if (der.length !== 4 + len) break;
    // A certificate starts with SEQUENCE { SEQUENCE { [0] version ... } }
    if (der[4] !== 0x30) continue;
    n++;
    console.log(`\ncertificate ${n}`);
    console.log(`  SHA1:   ${fmt(createHash("sha1").update(der).digest("hex"))}`);
    console.log(`  SHA256: ${fmt(createHash("sha256").update(der).digest("hex"))}`);
    break;
  }
}

if (!n) console.log("\nFound the bag attribute but could not isolate a certificate.");
