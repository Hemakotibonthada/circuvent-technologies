// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Cryptographic Utilities
// Secure token generation, hashing, encryption for sensitive
// data (Aadhaar, bank account masking, API keys).
// ──────────────────────────────────────────────────────────────

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Generate a cryptographically secure random token.
 */
export function generateSecureToken(length = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Generate a short alphanumeric token (e.g., for verification codes).
 */
export function generateOTP(length = 6): string {
  const chars = "0123456789";
  let result = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * SHA-256 hash of a string.
 */
export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * HMAC-SHA256 for message authentication.
 */
export function hmacSha256(message: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

/**
 * Encrypt sensitive data using AES-256-GCM.
 * Returns base64 encoded string: iv:encrypted:tag
 */
export function encrypt(plaintext: string, key: string): string {
  const keyBuffer = crypto.scryptSync(key, "circuvent-salt", 32);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${encrypted}:${tag.toString("base64")}`;
}

/**
 * Decrypt AES-256-GCM encrypted data.
 */
export function decrypt(ciphertext: string, key: string): string {
  const [ivB64, encB64, tagB64] = ciphertext.split(":");
  if (!ivB64 || !encB64 || !tagB64) throw new Error("Invalid ciphertext format");

  const keyBuffer = crypto.scryptSync(key, "circuvent-salt", 32);
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encB64, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Mask a string showing only last N characters.
 * e.g., maskString("1234567890", 4) → "******7890"
 */
export function maskString(value: string, showLast = 4): string {
  if (value.length <= showLast) return value;
  return "*".repeat(value.length - showLast) + value.slice(-showLast);
}

/**
 * Mask PAN number: ABCDE1234F → ABCD***34F
 */
export function maskPAN(pan: string): string {
  if (pan.length !== 10) return maskString(pan, 3);
  return pan.slice(0, 4) + "***" + pan.slice(7);
}

/**
 * Mask Aadhaar: 1234 5678 9012 → XXXX XXXX 9012
 */
export function maskAadhaar(aadhaar: string): string {
  const cleaned = aadhaar.replace(/\s/g, "");
  if (cleaned.length !== 12) return maskString(cleaned, 4);
  return `XXXX XXXX ${cleaned.slice(-4)}`;
}

/**
 * Mask bank account number: 12345678901234 → XXXXXXXXXX1234
 */
export function maskBankAccount(account: string): string {
  return maskString(account, 4);
}

/**
 * Generate a RFC 4122 v4 UUID.
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Compute file checksum.
 */
export function computeChecksum(data: Buffer | string, algorithm = "sha256"): string {
  return crypto.createHash(algorithm).update(data).digest("hex");
}
