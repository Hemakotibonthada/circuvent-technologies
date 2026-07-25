// RFC 6238 TOTP + RFC 4648 base32, using only Node's crypto (no deps). Used for
// authenticator-app 2FA (Google Authenticator, Authy, 1Password, etc.).
import { createHmac, randomBytes } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Generate a random base32 secret (default 20 bytes / 160 bits). */
export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** Compute the TOTP code for a given secret at a point in time. */
export function totpCode(secret: string, atMs = Date.now(), stepSec = 30, digits = 6): string {
  const counter = Math.floor(atMs / 1000 / stepSec);
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** Verify a user-supplied code, allowing ±`window` steps for clock drift. */
export function verifyTotp(secret: string, code: string, window = 1, atMs = Date.now(), stepSec = 30): boolean {
  const clean = String(code || "").replace(/\D/g, "");
  if (clean.length < 6) return false;
  for (let w = -window; w <= window; w++) {
    if (totpCode(secret, atMs + w * stepSec * 1000, stepSec) === clean) return true;
  }
  return false;
}

/** Build the otpauth:// URI that authenticator apps encode into a QR code. */
export function otpauthUrl(secret: string, account: string, issuer = "Circuvent"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}
