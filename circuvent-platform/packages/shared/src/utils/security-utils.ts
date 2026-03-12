// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Security Utilities
// Rate limiting, CSRF, HTML sanitization, password strength,
// OTP generation, hashing, constant-time compare, API keys,
// header masking, disposable email detection.
// ──────────────────────────────────────────────────────────────

import crypto from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(crypto.scrypt);

// ══════════════════════════════════════════════════════════════
// In-Memory Rate Limiter
// ══════════════════════════════════════════════════════════════

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * Check rate limit for a key. Returns { allowed, remaining, retryAfterMs }.
 */
export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, retryAfterMs: 0 };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.resetAt - now,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    retryAfterMs: 0,
  };
}

// ══════════════════════════════════════════════════════════════
// CSRF Token
// ══════════════════════════════════════════════════════════════

/**
 * Generate a CSRF token using HMAC-SHA256.
 */
export function generateCSRFToken(secret: string): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(16).toString("hex");
  const payload = `${timestamp}.${random}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return `${payload}.${signature}`;
}

/**
 * Validate a CSRF token against the secret.
 */
export function validateCSRFToken(token: string, secret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [timestamp, random, signature] = parts;
  const payload = `${timestamp}.${random}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  if (!constantTimeCompare(signature, expected)) return false;

  // Check expiry (1 hour max)
  const ts = parseInt(timestamp, 36);
  if (isNaN(ts)) return false;
  const ageMs = Date.now() - ts;
  return ageMs >= 0 && ageMs < 3600 * 1000;
}

// ══════════════════════════════════════════════════════════════
// HTML Sanitization
// ══════════════════════════════════════════════════════════════

const DANGEROUS_TAGS = [
  "script", "iframe", "object", "embed", "form", "input",
  "textarea", "button", "select", "link", "meta", "style",
  "applet", "base", "basefont", "bgsound", "blink",
  "layer", "ilayer", "marquee", "xml",
];

const DANGEROUS_ATTRS = [
  "onload", "onerror", "onclick", "onmouseover", "onmouseout",
  "onfocus", "onblur", "onchange", "onsubmit", "onreset",
  "onkeydown", "onkeyup", "onkeypress", "ondblclick",
  "oncontextmenu", "ondrag", "ondragstart", "ondragend",
  "onabort", "onbeforeunload", "onhashchange", "onpageshow",
  "onscroll", "ontouchstart", "ontouchmove", "ontouchend",
];

/**
 * Strip dangerous HTML tags and event attributes.
 * Allows safe tags like p, b, i, a (with sanitized href), ul, ol, li, br, etc.
 */
export function sanitizeHTML(input: string): string {
  if (!input) return "";

  let sanitized = input;

  // Remove dangerous tags and their content
  for (const tag of DANGEROUS_TAGS) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
    sanitized = sanitized.replace(regex, "");
    // Self-closing variants
    const selfClosing = new RegExp(`<${tag}[^>]*/?>`, "gi");
    sanitized = sanitized.replace(selfClosing, "");
  }

  // Remove dangerous attributes
  for (const attr of DANGEROUS_ATTRS) {
    const regex = new RegExp(`\\s${attr}\\s*=\\s*["'][^"']*["']`, "gi");
    sanitized = sanitized.replace(regex, "");
    // Unquoted
    const unquoted = new RegExp(`\\s${attr}\\s*=\\s*[^\\s>]+`, "gi");
    sanitized = sanitized.replace(unquoted, "");
  }

  // Remove javascript: URLs
  sanitized = sanitized.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  sanitized = sanitized.replace(/src\s*=\s*["']javascript:[^"']*["']/gi, 'src=""');

  // Remove data: URLs from src (can be used for XSS)
  sanitized = sanitized.replace(/src\s*=\s*["']data:[^"']*["']/gi, 'src=""');

  return sanitized.trim();
}

// ══════════════════════════════════════════════════════════════
// SQL Escape (defense-in-depth — always use parameterized queries)
// ══════════════════════════════════════════════════════════════

/**
 * Escape special SQL characters. NOT a substitute for parameterized queries.
 * Use only for defense-in-depth on user-provided identifiers.
 */
export function escapeSQL(input: string): string {
  if (!input) return "";
  return input
    .replace(/'/g, "''")
    .replace(/\\/g, "\\\\")
    .replace(/\0/g, "")
    .replace(/\x1a/g, "");
}

// ══════════════════════════════════════════════════════════════
// JWT Validation
// ══════════════════════════════════════════════════════════════

/**
 * Basic JWT structural validation (does NOT verify signature).
 * Use for quick format checks before passing to jwt.verify().
 */
export function validateJWTStructure(token: string): {
  valid: boolean;
  error?: string;
  header?: Record<string, any>;
  payload?: Record<string, any>;
} {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Token is empty or not a string" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "JWT must have 3 parts separated by dots" };
  }

  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));

    if (!header.alg) {
      return { valid: false, error: "Missing algorithm in header" };
    }

    if (header.alg === "none") {
      return { valid: false, error: "Algorithm 'none' is not allowed" };
    }

    return { valid: true, header, payload };
  } catch {
    return { valid: false, error: "Failed to decode JWT parts" };
  }
}

// ══════════════════════════════════════════════════════════════
// Password Strength
// ══════════════════════════════════════════════════════════════

/**
 * Check password strength. Returns score (0-5) and suggestions.
 */
export function checkPasswordStrength(password: string): {
  score: number;
  strength: "very_weak" | "weak" | "fair" | "strong" | "very_strong";
  suggestions: string[];
} {
  const suggestions: string[] = [];
  let score = 0;

  if (password.length >= 8) score++;
  else suggestions.push("Use at least 8 characters");

  if (password.length >= 12) score++;
  else if (password.length >= 8) suggestions.push("Consider using 12+ characters");

  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  else suggestions.push("Use both uppercase and lowercase letters");

  if (/\d/.test(password)) score++;
  else suggestions.push("Include at least one number");

  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?`~]/.test(password)) score++;
  else suggestions.push("Include a special character (!@#$%^&*...)");

  // Check for common patterns
  const commonPatterns = ["password", "123456", "qwerty", "abc123", "admin", "letmein"];
  if (commonPatterns.some((p) => password.toLowerCase().includes(p))) {
    score = Math.max(0, score - 2);
    suggestions.push("Avoid common password patterns");
  }

  // Sequential/repeated chars
  if (/(.)\1{2,}/.test(password)) {
    score = Math.max(0, score - 1);
    suggestions.push("Avoid repeated characters");
  }

  const strengths = ["very_weak", "weak", "fair", "strong", "very_strong"] as const;
  const strength = strengths[Math.min(score, 4)];

  return { score, strength, suggestions };
}

// ══════════════════════════════════════════════════════════════
// OTP / Secure Random
// ══════════════════════════════════════════════════════════════

/**
 * Generate a cryptographically secure OTP of specified length.
 */
export function generateSecureOTP(length: number = 6): string {
  const digits = "0123456789";
  const bytes = crypto.randomBytes(length);
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += digits[bytes[i] % 10];
  }
  return otp;
}

// ══════════════════════════════════════════════════════════════
// Hashing
// ══════════════════════════════════════════════════════════════

/**
 * Hash data with a salt using scrypt.
 */
export async function hashWithSalt(data: string, salt: string): Promise<string> {
  const derivedKey = (await scryptAsync(data, salt, 64)) as Buffer;
  return derivedKey.toString("hex");
}

// ══════════════════════════════════════════════════════════════
// Constant-Time Compare
// ══════════════════════════════════════════════════════════════

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ══════════════════════════════════════════════════════════════
// Disposable Email Detection
// ══════════════════════════════════════════════════════════════

const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com", "guerrillamail.com", "mailinator.com",
  "tempmail.com", "throwaway.email", "yopmail.com",
  "sharklasers.com", "guerrillamailblock.com", "grr.la",
  "dispostable.com", "trashmail.com", "maildrop.cc",
  "fakeinbox.com", "tempail.com", "mailnesia.com",
  "tempr.email", "temp-mail.org", "emailondeck.com",
  "getnada.com", "mohmal.com", "burnermail.io",
  "discard.email", "harakirimail.com", "spamgourmet.com",
]);

/**
 * Check if an email uses a known disposable email provider.
 */
export function isDisposableEmail(email: string): boolean {
  if (!email || !email.includes("@")) return false;
  const domain = email.split("@")[1].toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
}

// ══════════════════════════════════════════════════════════════
// API Key Generation
// ══════════════════════════════════════════════════════════════

/**
 * Generate a prefixed API key: cir_live_xxxx or cir_test_xxxx.
 */
export function generateAPIKey(prefix: string = "cir_live"): string {
  const randomPart = crypto.randomBytes(24).toString("base64url");
  return `${prefix}_${randomPart}`;
}

// ══════════════════════════════════════════════════════════════
// Header Masking
// ══════════════════════════════════════════════════════════════

const SENSITIVE_HEADERS = new Set([
  "authorization", "cookie", "set-cookie",
  "x-api-key", "x-auth-token", "proxy-authorization",
]);

/**
 * Mask sensitive values in HTTP headers for safe logging.
 */
export function maskSensitiveHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  const masked: Record<string, string | string[] | undefined> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      if (typeof value === "string") {
        masked[key] = value.length > 8
          ? value.substring(0, 4) + "****" + value.substring(value.length - 4)
          : "****";
      } else if (Array.isArray(value)) {
        masked[key] = value.map(() => "****");
      } else {
        masked[key] = "****";
      }
    } else {
      masked[key] = value;
    }
  }

  return masked;
}
