// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Security Utilities Test Suite
// Tests for rate limiting, CSRF, sanitization, password
// strength, OTP, hashing, JWT validation, API keys,
// header masking, disposable email detection.
// ──────────────────────────────────────────────────────────────

import {
  rateLimit,
  generateCSRFToken,
  validateCSRFToken,
  sanitizeHTML,
  escapeSQL,
  validateJWTStructure,
  checkPasswordStrength,
  generateSecureOTP,
  hashWithSalt,
  constantTimeCompare,
  generateAPIKey,
  maskSensitiveHeaders,
  isDisposableEmail,
} from "../utils/security-utils";

// ══════════════════════════════════════════════════════════════
// Rate Limiting
// ══════════════════════════════════════════════════════════════

describe("Rate Limiting", () => {
  it("should allow requests within limit", () => {
    const result = rateLimit("test-rate-1", 5, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("should decrement remaining on each request", () => {
    const key = `test-rate-${Date.now()}`;
    rateLimit(key, 3, 60000);
    const r2 = rateLimit(key, 3, 60000);
    expect(r2.remaining).toBe(1);
  });

  it("should deny requests over limit", () => {
    const key = `test-rate-deny-${Date.now()}`;
    for (let i = 0; i < 3; i++) rateLimit(key, 3, 60000);
    const result = rateLimit(key, 3, 60000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("should reset after window expires", () => {
    const key = `test-rate-reset-${Date.now()}`;
    rateLimit(key, 1, 1); // 1ms window
    // Wait slightly
    const result = rateLimit(key, 1, 1);
    // Should be allowed as window expired
    expect(result.allowed).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// CSRF Token
// ══════════════════════════════════════════════════════════════

describe("CSRF Token", () => {
  const secret = "test-csrf-secret-key-12345";

  it("should generate a valid token", () => {
    const token = generateCSRFToken(secret);
    expect(token).toBeDefined();
    expect(token.split(".")).toHaveLength(3);
  });

  it("should validate a correct token", () => {
    const token = generateCSRFToken(secret);
    expect(validateCSRFToken(token, secret)).toBe(true);
  });

  it("should reject token with wrong secret", () => {
    const token = generateCSRFToken(secret);
    expect(validateCSRFToken(token, "wrong-secret")).toBe(false);
  });

  it("should reject malformed token", () => {
    expect(validateCSRFToken("invalid-token", secret)).toBe(false);
    expect(validateCSRFToken("", secret)).toBe(false);
    expect(validateCSRFToken("a.b", secret)).toBe(false);
  });

  it("should generate unique tokens", () => {
    const t1 = generateCSRFToken(secret);
    const t2 = generateCSRFToken(secret);
    expect(t1).not.toBe(t2);
  });
});

// ══════════════════════════════════════════════════════════════
// HTML Sanitization
// ══════════════════════════════════════════════════════════════

describe("HTML Sanitization", () => {
  it("should remove script tags", () => {
    expect(sanitizeHTML('<script>alert("xss")</script>')).toBe("");
    expect(sanitizeHTML('<script src="evil.js"></script>')).toBe("");
  });

  it("should remove iframe tags", () => {
    expect(sanitizeHTML('<iframe src="evil.com"></iframe>')).toBe("");
  });

  it("should remove event handlers", () => {
    const result = sanitizeHTML('<img src="img.png" onerror="alert(1)">');
    expect(result).not.toContain("onerror");
  });

  it("should remove javascript: URLs", () => {
    const result = sanitizeHTML('<a href="javascript:alert(1)">Click</a>');
    expect(result).not.toContain("javascript:");
  });

  it("should preserve safe HTML", () => {
    const input = "<p>Hello <b>world</b></p>";
    expect(sanitizeHTML(input)).toBe("<p>Hello <b>world</b></p>");
  });

  it("should handle empty input", () => {
    expect(sanitizeHTML("")).toBe("");
    expect(sanitizeHTML(null as any)).toBe("");
  });

  it("should remove nested dangerous tags", () => {
    const input = '<div><script>var x = 1;</script><p>Safe</p></div>';
    const result = sanitizeHTML(input);
    expect(result).not.toContain("script");
    expect(result).toContain("Safe");
  });

  it("should remove data: URLs from src", () => {
    const result = sanitizeHTML('<img src="data:text/html,<script>alert(1)</script>">');
    expect(result).not.toContain("data:");
  });
});

// ══════════════════════════════════════════════════════════════
// SQL Escape
// ══════════════════════════════════════════════════════════════

describe("SQL Escape", () => {
  it("should escape single quotes", () => {
    expect(escapeSQL("O'Brien")).toBe("O''Brien");
  });

  it("should escape backslashes", () => {
    expect(escapeSQL("path\\to")).toBe("path\\\\to");
  });

  it("should handle null bytes", () => {
    expect(escapeSQL("null\0byte")).toBe("nullbyte");
  });

  it("should handle empty input", () => {
    expect(escapeSQL("")).toBe("");
  });
});

// ══════════════════════════════════════════════════════════════
// JWT Validation
// ══════════════════════════════════════════════════════════════

describe("JWT Structural Validation", () => {
  it("should validate a valid JWT structure", () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: "123", iat: 1234567890 })).toString("base64url");
    const signature = "fake-signature";
    const token = `${header}.${payload}.${signature}`;

    const result = validateJWTStructure(token);
    expect(result.valid).toBe(true);
    expect(result.header?.alg).toBe("HS256");
    expect(result.payload?.sub).toBe("123");
  });

  it("should reject token with wrong number of parts", () => {
    expect(validateJWTStructure("only.two").valid).toBe(false);
    expect(validateJWTStructure("one").valid).toBe(false);
  });

  it("should reject empty token", () => {
    expect(validateJWTStructure("").valid).toBe(false);
    expect(validateJWTStructure(null as any).valid).toBe(false);
  });

  it("should reject alg=none", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({})).toString("base64url");
    const result = validateJWTStructure(`${header}.${payload}.`);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("none");
  });
});

// ══════════════════════════════════════════════════════════════
// Password Strength
// ══════════════════════════════════════════════════════════════

describe("Password Strength", () => {
  it("should rate very weak passwords", () => {
    const result = checkPasswordStrength("abc");
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.strength).toBe("very_weak");
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("should rate strong passwords", () => {
    const result = checkPasswordStrength("MyStr0ng!Pass#2026");
    expect(result.score).toBeGreaterThanOrEqual(4);
    expect(["strong", "very_strong"]).toContain(result.strength);
  });

  it("should penalize common patterns", () => {
    const result = checkPasswordStrength("password123!");
    expect(result.suggestions).toContain("Avoid common password patterns");
  });

  it("should penalize repeated characters", () => {
    const result = checkPasswordStrength("Aaaa1234!");
    expect(result.suggestions).toContain("Avoid repeated characters");
  });

  it("should suggest uppercase when missing", () => {
    const result = checkPasswordStrength("alllowercase1!");
    expect(result.suggestions.some((s) => s.toLowerCase().includes("uppercase"))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// OTP Generation
// ══════════════════════════════════════════════════════════════

describe("OTP Generation", () => {
  it("should generate OTP of default length (6)", () => {
    const otp = generateSecureOTP();
    expect(otp).toHaveLength(6);
    expect(/^\d{6}$/.test(otp)).toBe(true);
  });

  it("should generate OTP of specified length", () => {
    expect(generateSecureOTP(4)).toHaveLength(4);
    expect(generateSecureOTP(8)).toHaveLength(8);
  });

  it("should generate unique OTPs", () => {
    const otps = new Set(Array.from({ length: 100 }, () => generateSecureOTP()));
    expect(otps.size).toBeGreaterThan(90); // At least 90% unique
  });
});

// ══════════════════════════════════════════════════════════════
// Hashing
// ══════════════════════════════════════════════════════════════

describe("Hashing", () => {
  it("should hash data with salt", async () => {
    const hash = await hashWithSalt("password", "salt123");
    expect(hash).toBeDefined();
    expect(hash.length).toBeGreaterThan(0);
  });

  it("should produce consistent hashes", async () => {
    const h1 = await hashWithSalt("test", "salt");
    const h2 = await hashWithSalt("test", "salt");
    expect(h1).toBe(h2);
  });

  it("should produce different hashes for different inputs", async () => {
    const h1 = await hashWithSalt("password1", "salt");
    const h2 = await hashWithSalt("password2", "salt");
    expect(h1).not.toBe(h2);
  });

  it("should produce different hashes for different salts", async () => {
    const h1 = await hashWithSalt("password", "salt1");
    const h2 = await hashWithSalt("password", "salt2");
    expect(h1).not.toBe(h2);
  });
});

// ══════════════════════════════════════════════════════════════
// Constant-Time Compare
// ══════════════════════════════════════════════════════════════

describe("Constant-Time Compare", () => {
  it("should return true for equal strings", () => {
    expect(constantTimeCompare("hello", "hello")).toBe(true);
  });

  it("should return false for different strings", () => {
    expect(constantTimeCompare("hello", "world")).toBe(false);
  });

  it("should return false for different lengths", () => {
    expect(constantTimeCompare("abc", "abcd")).toBe(false);
  });

  it("should handle non-string inputs", () => {
    expect(constantTimeCompare(null as any, "test")).toBe(false);
    expect(constantTimeCompare("test", undefined as any)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// API Key Generation
// ══════════════════════════════════════════════════════════════

describe("API Key Generation", () => {
  it("should generate key with default prefix", () => {
    const key = generateAPIKey();
    expect(key).toMatch(/^cir_live_.+$/);
  });

  it("should generate key with custom prefix", () => {
    const key = generateAPIKey("cir_test");
    expect(key).toMatch(/^cir_test_.+$/);
  });

  it("should generate unique keys", () => {
    const k1 = generateAPIKey();
    const k2 = generateAPIKey();
    expect(k1).not.toBe(k2);
  });
});

// ══════════════════════════════════════════════════════════════
// Header Masking
// ══════════════════════════════════════════════════════════════

describe("Header Masking", () => {
  it("should mask authorization header", () => {
    const result = maskSensitiveHeaders({ Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9" });
    expect(result.Authorization).toContain("****");
    expect(result.Authorization).not.toBe("Bearer eyJhbGciOiJIUzI1NiJ9");
  });

  it("should mask cookie header", () => {
    const result = maskSensitiveHeaders({ cookie: "session=abc123xyz" });
    expect(result.cookie).toContain("****");
  });

  it("should preserve non-sensitive headers", () => {
    const result = maskSensitiveHeaders({ "Content-Type": "application/json" });
    expect(result["Content-Type"]).toBe("application/json");
  });

  it("should handle array values", () => {
    const result = maskSensitiveHeaders({ "set-cookie": ["sess=abc", "tok=xyz"] as any });
    expect(result["set-cookie"]).toEqual(["****", "****"]);
  });
});

// ══════════════════════════════════════════════════════════════
// Disposable Email Detection
// ══════════════════════════════════════════════════════════════

describe("Disposable Email Detection", () => {
  it("should detect disposable emails", () => {
    expect(isDisposableEmail("test@mailinator.com")).toBe(true);
    expect(isDisposableEmail("user@guerrillamail.com")).toBe(true);
    expect(isDisposableEmail("test@yopmail.com")).toBe(true);
  });

  it("should allow legitimate emails", () => {
    expect(isDisposableEmail("user@gmail.com")).toBe(false);
    expect(isDisposableEmail("user@company.com")).toBe(false);
    expect(isDisposableEmail("admin@circuvent.com")).toBe(false);
  });

  it("should handle invalid emails", () => {
    expect(isDisposableEmail("")).toBe(false);
    expect(isDisposableEmail("not-an-email")).toBe(false);
  });

  it("should be case-insensitive", () => {
    expect(isDisposableEmail("USER@MAILINATOR.COM")).toBe(true);
  });
});
