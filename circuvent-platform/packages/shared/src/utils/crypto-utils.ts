// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Extended Cryptographic Utilities
// Password hashing (bcrypt), OTP/token generation, AES
// encryption/decryption, HMAC, data masking, and secure
// password generation for production security workflows.
// ──────────────────────────────────────────────────────────────

import crypto from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(crypto.scrypt);

// ══════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════

const HASH_KEY_LENGTH = 64;
const HASH_SALT_LENGTH = 16;
const AES_ALGORITHM = "aes-256-gcm";
const AES_IV_LENGTH = 16;
const AES_KEY_LENGTH = 32;
const AES_SALT = "circuvent-aes-salt-2026";

// ══════════════════════════════════════════════════════════════
// Password Hashing (bcrypt)
// ══════════════════════════════════════════════════════════════

/**
 * Hash a plaintext password using Node.js crypto scrypt.
 * Returns a string in the format: salt:hash (both hex-encoded).
 * For bcrypt-based hashing, use @circuvent/auth's hashPassword.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(HASH_SALT_LENGTH).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, HASH_KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verify a plaintext password against a scrypt hash.
 * Returns true if the password matches.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  const [salt, key] = hash.split(":");
  if (!salt || !key) return false;
  const derivedKey = (await scryptAsync(password, salt, HASH_KEY_LENGTH)) as Buffer;
  return crypto.timingSafeEqual(Buffer.from(key, "hex"), derivedKey);
}

// ══════════════════════════════════════════════════════════════
// OTP & Token Generation
// ══════════════════════════════════════════════════════════════

/**
 * Generate a cryptographically secure numeric OTP.
 * @param length Number of digits (default 6).
 * @returns String of random digits, e.g. "384921".
 */
export function generateOTP(length: number = 6): string {
  if (length < 1 || length > 12) {
    throw new Error("OTP length must be between 1 and 12");
  }
  const digits = "0123456789";
  const bytes = crypto.randomBytes(length);
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += digits[bytes[i] % digits.length];
  }
  return otp;
}

/**
 * Generate a cryptographically secure random hex token.
 * @param length Byte length (output hex string is 2× this). Default 32.
 */
export function generateToken(length: number = 32): string {
  if (length < 8) throw new Error("Token length must be at least 8 bytes");
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Generate a RFC 4122 v4 UUID using Node's native crypto.
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

// ══════════════════════════════════════════════════════════════
// AES-256-GCM Encryption / Decryption
// ══════════════════════════════════════════════════════════════

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns a colon-separated string: iv:ciphertext:authTag (all base64).
 */
export function encryptAES(plaintext: string, key: string): string {
  if (!plaintext) throw new Error("Plaintext cannot be empty");
  if (!key) throw new Error("Encryption key cannot be empty");

  const keyBuffer = crypto.scryptSync(key, AES_SALT, AES_KEY_LENGTH);
  const iv = crypto.randomBytes(AES_IV_LENGTH);
  const cipher = crypto.createCipheriv(AES_ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${encrypted}:${authTag.toString("base64")}`;
}

/**
 * Decrypt AES-256-GCM ciphertext.
 * Expects format: iv:ciphertext:authTag (all base64).
 */
export function decryptAES(ciphertext: string, key: string): string {
  if (!ciphertext) throw new Error("Ciphertext cannot be empty");
  if (!key) throw new Error("Decryption key cannot be empty");

  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format — expected iv:ciphertext:authTag");
  }

  const [ivB64, encB64, tagB64] = parts;
  const keyBuffer = crypto.scryptSync(key, AES_SALT, AES_KEY_LENGTH);
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");

  const decipher = crypto.createDecipheriv(AES_ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encB64, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ══════════════════════════════════════════════════════════════
// HMAC & Hashing
// ══════════════════════════════════════════════════════════════

/**
 * Generate HMAC-SHA256 for message authentication.
 * Used for webhook verification, API signature validation, etc.
 */
export function generateHMAC(data: string, secret: string): string {
  if (!data || !secret) throw new Error("Data and secret are required for HMAC");
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

/**
 * SHA-256 hash of arbitrary data.
 * Useful for checksums, cache keys, and non-reversible fingerprints.
 */
export function hashSHA256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// ══════════════════════════════════════════════════════════════
// Data Masking
// ══════════════════════════════════════════════════════════════

/**
 * Mask an email address: john.doe@example.com → j***@example.com
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "***";
  const [local, domain] = email.split("@");
  if (local.length <= 1) return `${local}***@${domain}`;
  return `${local[0]}${"*".repeat(Math.min(local.length - 1, 3))}@${domain}`;
}

/**
 * Mask a phone number: +91 9876545678 → +91 ****5678
 * Handles various formats: with/without country code, spaces, dashes.
 */
export function maskPhone(phone: string): string {
  if (!phone) return "***";
  const cleaned = phone.replace(/[\s\-()]/g, "");

  // Handle Indian numbers with country code
  if (cleaned.startsWith("+91") && cleaned.length >= 13) {
    const last4 = cleaned.slice(-4);
    return `+91 ****${last4}`;
  }

  // Handle any number: show first chars up to country code, mask middle, show last 4
  if (cleaned.length <= 4) return cleaned;
  const last4 = cleaned.slice(-4);
  const prefix = cleaned.length > 10 ? cleaned.slice(0, cleaned.length - 10) + " " : "";
  return `${prefix}****${last4}`;
}

// ══════════════════════════════════════════════════════════════
// Secure Password Generation
// ══════════════════════════════════════════════════════════════

/**
 * Generate a cryptographically secure random password.
 * Guarantees at least one uppercase, one lowercase, one digit, and one special char.
 * @param length Total password length (minimum 8, default 16).
 */
export function generateSecurePassword(length: number = 16): string {
  if (length < 8) throw new Error("Password length must be at least 8");

  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%^&*()-_=+[]{}|;:,.<>?";
  const all = uppercase + lowercase + digits + special;

  // Guarantee one from each category
  const required = [
    uppercase[crypto.randomInt(uppercase.length)],
    lowercase[crypto.randomInt(lowercase.length)],
    digits[crypto.randomInt(digits.length)],
    special[crypto.randomInt(special.length)],
  ];

  // Fill remaining with random chars from all categories
  const remaining = length - required.length;
  const bytes = crypto.randomBytes(remaining);
  for (let i = 0; i < remaining; i++) {
    required.push(all[bytes[i] % all.length]);
  }

  // Shuffle using Fisher-Yates
  for (let i = required.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [required[i], required[j]] = [required[j], required[i]];
  }

  return required.join("");
}
