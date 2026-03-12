// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Validators Test Suite
// Tests for all shared validator functions with valid/invalid
// inputs, edge cases, and boundary conditions.
// ──────────────────────────────────────────────────────────────

import {
  isValidPAN,
  isValidMAC,
  redactSensitiveFields,
} from "../utils";

// ══════════════════════════════════════════════════════════════
// Inline validators being tested (mirrors validators.ts exports)
// ══════════════════════════════════════════════════════════════

/** Email validation — RFC 5322 basic compliance. */
function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Indian mobile number +91-XXXXXXXXXX. */
function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return /^(\+91|91)?[6-9]\d{9}$/.test(cleaned);
}

/** Indian PAN: ABCDE1234F. */
function validatePAN(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase());
}

/** Aadhaar: 12 digits, no leading zero. */
function validateAadhaar(aadhaar: string): boolean {
  const cleaned = aadhaar.replace(/[\s\-]/g, "");
  return /^[2-9]\d{11}$/.test(cleaned);
}

/** GSTIN: 15 chars — 2-digit state, PAN, 1-digit entity, Z, checksum. */
function validateGSTIN(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.toUpperCase());
}

/** IFSC: 4-letter bank code, 0, 6 alphanumeric. */
function validateIFSC(ifsc: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase());
}

/** Password: min 8 chars, upper, lower, digit, special. */
function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 8) errors.push("Minimum 8 characters required");
  if (!/[A-Z]/.test(password)) errors.push("At least one uppercase letter required");
  if (!/[a-z]/.test(password)) errors.push("At least one lowercase letter required");
  if (!/[0-9]/.test(password)) errors.push("At least one digit required");
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) errors.push("At least one special character required");
  return { valid: errors.length === 0, errors };
}

/** Strip HTML tags and dangerous characters. */
function sanitizeInput(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[<>"'&]/g, "")
    .trim();
}

/** Validate Indian bank account number: 9-18 digits. */
function validateBankAccount(account: string): boolean {
  const cleaned = account.replace(/\s/g, "");
  return /^\d{9,18}$/.test(cleaned);
}

/** Validate Indian PIN code: 6 digits, first digit 1-9. */
function validatePinCode(pin: string): boolean {
  return /^[1-9]\d{5}$/.test(pin);
}

/** Validate UPI ID: handle@provider. */
function validateUPI(upi: string): boolean {
  return /^[\w.\-]+@[\w]+$/.test(upi);
}

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("Validators", () => {
  // ────────────────────────────────────────────────────────────
  // Email Validation
  // ────────────────────────────────────────────────────────────
  describe("validateEmail", () => {
    it("should accept valid email addresses", () => {
      expect(validateEmail("user@example.com")).toBe(true);
      expect(validateEmail("john.doe@circuvent.io")).toBe(true);
      expect(validateEmail("admin+tag@company.co.in")).toBe(true);
      expect(validateEmail("test_user@sub.domain.org")).toBe(true);
      expect(validateEmail("a@b.co")).toBe(true);
    });

    it("should reject invalid email addresses", () => {
      expect(validateEmail("")).toBe(false);
      expect(validateEmail("@example.com")).toBe(false);
      expect(validateEmail("user@")).toBe(false);
      expect(validateEmail("user@.com")).toBe(false);
      expect(validateEmail("user@com")).toBe(false);
      expect(validateEmail("user example@domain.com")).toBe(false);
      expect(validateEmail("plainstring")).toBe(false);
    });

    it("should reject email with spaces", () => {
      expect(validateEmail("user @domain.com")).toBe(false);
      expect(validateEmail("user@ domain.com")).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Phone Validation
  // ────────────────────────────────────────────────────────────
  describe("validatePhone", () => {
    it("should accept valid Indian phone numbers", () => {
      expect(validatePhone("9876543210")).toBe(true);
      expect(validatePhone("+919876543210")).toBe(true);
      expect(validatePhone("919876543210")).toBe(true);
      expect(validatePhone("6000000000")).toBe(true);
      expect(validatePhone("7999999999")).toBe(true);
      expect(validatePhone("8123456789")).toBe(true);
    });

    it("should accept numbers with formatting", () => {
      expect(validatePhone("+91 98765 43210")).toBe(true);
      expect(validatePhone("+91-9876543210")).toBe(true);
      expect(validatePhone("(91) 9876543210")).toBe(true);
    });

    it("should reject invalid phone numbers", () => {
      expect(validatePhone("")).toBe(false);
      expect(validatePhone("1234567890")).toBe(false);
      expect(validatePhone("5555555555")).toBe(false);
      expect(validatePhone("12345")).toBe(false);
      expect(validatePhone("98765432101")).toBe(false);
      expect(validatePhone("abcdefghij")).toBe(false);
    });

    it("should reject numbers starting with 0-5", () => {
      expect(validatePhone("0123456789")).toBe(false);
      expect(validatePhone("3456789012")).toBe(false);
      expect(validatePhone("5000000000")).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // PAN Validation
  // ────────────────────────────────────────────────────────────
  describe("validatePAN", () => {
    it("should accept valid PAN numbers", () => {
      expect(validatePAN("ABCDE1234F")).toBe(true);
      expect(validatePAN("ZZZZZ9999Z")).toBe(true);
      expect(validatePAN("AABCA1234A")).toBe(true);
    });

    it("should be case-insensitive", () => {
      expect(validatePAN("abcde1234f")).toBe(true);
      expect(validatePAN("AbCdE1234f")).toBe(true);
    });

    it("should reject invalid PAN numbers", () => {
      expect(validatePAN("")).toBe(false);
      expect(validatePAN("ABCDE1234")).toBe(false);
      expect(validatePAN("12345ABCDE")).toBe(false);
      expect(validatePAN("ABCDE12345")).toBe(false);
      expect(validatePAN("ABCD12345F")).toBe(false);
      expect(validatePAN("ABCDEF1234")).toBe(false);
      expect(validatePAN("A")).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Aadhaar Validation
  // ────────────────────────────────────────────────────────────
  describe("validateAadhaar", () => {
    it("should accept valid Aadhaar numbers", () => {
      expect(validateAadhaar("234567890123")).toBe(true);
      expect(validateAadhaar("999999999999")).toBe(true);
      expect(validateAadhaar("200000000000")).toBe(true);
    });

    it("should accept Aadhaar with spaces and dashes", () => {
      expect(validateAadhaar("2345 6789 0123")).toBe(true);
      expect(validateAadhaar("2345-6789-0123")).toBe(true);
    });

    it("should reject invalid Aadhaar numbers", () => {
      expect(validateAadhaar("")).toBe(false);
      expect(validateAadhaar("123456789012")).toBe(false); // starts with 1
      expect(validateAadhaar("012345678901")).toBe(false); // starts with 0
      expect(validateAadhaar("23456789012")).toBe(false);  // 11 digits
      expect(validateAadhaar("2345678901234")).toBe(false); // 13 digits
      expect(validateAadhaar("abcdefghijkl")).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // GSTIN Validation
  // ────────────────────────────────────────────────────────────
  describe("validateGSTIN", () => {
    it("should accept valid GSTIN numbers", () => {
      expect(validateGSTIN("29ABCDE1234F1Z5")).toBe(true);
      expect(validateGSTIN("07AAACW8849R1ZR")).toBe(true);
      expect(validateGSTIN("27AABCS1429B1Z4")).toBe(true);
    });

    it("should be case-insensitive", () => {
      expect(validateGSTIN("29abcde1234f1z5")).toBe(true);
    });

    it("should reject invalid GSTIN numbers", () => {
      expect(validateGSTIN("")).toBe(false);
      expect(validateGSTIN("29ABCDE1234F1Z")).toBe(false);  // 14 chars
      expect(validateGSTIN("29ABCDE1234F1Z55")).toBe(false); // 16 chars
      expect(validateGSTIN("XXABCDE1234F1Z5")).toBe(false);  // invalid state
      expect(validateGSTIN("29ABCDE1234F0Z5")).toBe(false);  // 0 in entity code
    });
  });

  // ────────────────────────────────────────────────────────────
  // IFSC Validation
  // ────────────────────────────────────────────────────────────
  describe("validateIFSC", () => {
    it("should accept valid IFSC codes", () => {
      expect(validateIFSC("SBIN0001234")).toBe(true);
      expect(validateIFSC("HDFC0001234")).toBe(true);
      expect(validateIFSC("ICIC0BRANCH")).toBe(true);
      expect(validateIFSC("KKBK0000001")).toBe(true);
    });

    it("should be case-insensitive", () => {
      expect(validateIFSC("sbin0001234")).toBe(true);
    });

    it("should reject invalid IFSC codes", () => {
      expect(validateIFSC("")).toBe(false);
      expect(validateIFSC("SBI0001234")).toBe(false);    // 3 char bank code
      expect(validateIFSC("SBIN1001234")).toBe(false);   // 5th char not 0
      expect(validateIFSC("1BIN0001234")).toBe(false);   // starts with digit
      expect(validateIFSC("SBIN000123")).toBe(false);    // too short
      expect(validateIFSC("SBIN00012345")).toBe(false);  // too long
    });
  });

  // ────────────────────────────────────────────────────────────
  // Password Validation
  // ────────────────────────────────────────────────────────────
  describe("validatePassword", () => {
    it("should accept valid passwords", () => {
      const result = validatePassword("Passw0rd!");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should accept complex passwords", () => {
      expect(validatePassword("C!rcuv3nt@2026").valid).toBe(true);
      expect(validatePassword("Str0ng$P@ssword").valid).toBe(true);
      expect(validatePassword("MyP@ss1234").valid).toBe(true);
    });

    it("should reject passwords shorter than 8 characters", () => {
      const result = validatePassword("P@ss1");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Minimum 8 characters required");
    });

    it("should reject passwords without uppercase", () => {
      const result = validatePassword("password1!");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("At least one uppercase letter required");
    });

    it("should reject passwords without lowercase", () => {
      const result = validatePassword("PASSWORD1!");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("At least one lowercase letter required");
    });

    it("should reject passwords without digits", () => {
      const result = validatePassword("Password!");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("At least one digit required");
    });

    it("should reject passwords without special characters", () => {
      const result = validatePassword("Password1");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("At least one special character required");
    });

    it("should accumulate multiple errors", () => {
      const result = validatePassword("short");
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it("should handle empty string", () => {
      const result = validatePassword("");
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(5);
    });
  });

  // ────────────────────────────────────────────────────────────
  // sanitizeInput
  // ────────────────────────────────────────────────────────────
  describe("sanitizeInput", () => {
    it("should strip HTML tags", () => {
      expect(sanitizeInput("<script>alert('xss')</script>")).toBe("alert(xss)");
      expect(sanitizeInput("<b>Bold</b>")).toBe("Bold");
      expect(sanitizeInput("<p class=\"x\">Hello</p>")).toBe("Hello");
    });

    it("should remove dangerous characters", () => {
      expect(sanitizeInput("Hello <World>")).toBe("Hello World");
      expect(sanitizeInput("A & B")).toBe("A  B");
      expect(sanitizeInput("He said \"hi\"")).toBe("He said hi");
    });

    it("should trim whitespace", () => {
      expect(sanitizeInput("  hello  ")).toBe("hello");
      expect(sanitizeInput("  \n  text  \t  ")).toBe("text");
    });

    it("should handle empty and clean strings", () => {
      expect(sanitizeInput("")).toBe("");
      expect(sanitizeInput("Clean text 123")).toBe("Clean text 123");
    });

    it("should handle nested HTML", () => {
      expect(sanitizeInput("<div><span>Nested</span></div>")).toBe("Nested");
    });
  });

  // ────────────────────────────────────────────────────────────
  // PAN Validation (from utils.ts — isValidPAN)
  // ────────────────────────────────────────────────────────────
  describe("isValidPAN (from utils)", () => {
    it("should validate correct PAN formats", () => {
      expect(isValidPAN("ABCDE1234F")).toBe(true);
      expect(isValidPAN("ZZZZZ9999Z")).toBe(true);
    });

    it("should reject lowercase PAN (strict mode)", () => {
      expect(isValidPAN("abcde1234f")).toBe(false);
    });

    it("should reject malformed PANs", () => {
      expect(isValidPAN("")).toBe(false);
      expect(isValidPAN("ABC")).toBe(false);
      expect(isValidPAN("12345ABCDE")).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // MAC Address Validation (from utils.ts — isValidMAC)
  // ────────────────────────────────────────────────────────────
  describe("isValidMAC (from utils)", () => {
    it("should accept valid MAC addresses", () => {
      expect(isValidMAC("00:1A:2B:3C:4D:5E")).toBe(true);
      expect(isValidMAC("AA:BB:CC:DD:EE:FF")).toBe(true);
      expect(isValidMAC("aa:bb:cc:dd:ee:ff")).toBe(true);
      expect(isValidMAC("00-1A-2B-3C-4D-5E")).toBe(true);
    });

    it("should reject invalid MAC addresses", () => {
      expect(isValidMAC("")).toBe(false);
      expect(isValidMAC("00:1A:2B:3C:4D")).toBe(false);
      expect(isValidMAC("GG:HH:II:JJ:KK:LL")).toBe(false);
      expect(isValidMAC("001A2B3C4D5E")).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // redactSensitiveFields (from utils.ts)
  // ────────────────────────────────────────────────────────────
  describe("redactSensitiveFields", () => {
    it("should redact default sensitive fields", () => {
      const obj = { name: "John", password: "secret123", email: "john@example.com" };
      const redacted = redactSensitiveFields(obj);
      expect(redacted.password).toBe("***REDACTED***");
      expect(redacted.name).toBe("John");
      expect(redacted.email).toBe("john@example.com");
    });

    it("should redact custom fields", () => {
      const obj = { name: "John", ssn: "123-45-6789", phone: "9876543210" };
      const redacted = redactSensitiveFields(obj, ["ssn", "phone"]);
      expect(redacted.ssn).toBe("***REDACTED***");
      expect(redacted.phone).toBe("***REDACTED***");
      expect(redacted.name).toBe("John");
    });

    it("should handle objects without sensitive fields", () => {
      const obj = { name: "John", department: "Engineering" };
      const redacted = redactSensitiveFields(obj);
      expect(redacted).toEqual(obj);
    });

    it("should not mutate original object", () => {
      const obj = { password: "secret" };
      redactSensitiveFields(obj);
      expect(obj.password).toBe("secret");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Bank Account Validation
  // ────────────────────────────────────────────────────────────
  describe("validateBankAccount", () => {
    it("should accept valid bank account numbers", () => {
      expect(validateBankAccount("123456789")).toBe(true);       // 9 digits
      expect(validateBankAccount("123456789012345678")).toBe(true); // 18 digits
      expect(validateBankAccount("50100123456789")).toBe(true);  // 14 digits
    });

    it("should accept numbers with spaces", () => {
      expect(validateBankAccount("5010 0123 4567 89")).toBe(true);
    });

    it("should reject invalid bank account numbers", () => {
      expect(validateBankAccount("")).toBe(false);
      expect(validateBankAccount("12345678")).toBe(false);         // 8 digits
      expect(validateBankAccount("1234567890123456789")).toBe(false); // 19 digits
      expect(validateBankAccount("ABCDEFGHI")).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // PIN Code Validation
  // ────────────────────────────────────────────────────────────
  describe("validatePinCode", () => {
    it("should accept valid Indian PIN codes", () => {
      expect(validatePinCode("560001")).toBe(true);
      expect(validatePinCode("110001")).toBe(true);
      expect(validatePinCode("400001")).toBe(true);
      expect(validatePinCode("999999")).toBe(true);
    });

    it("should reject invalid PIN codes", () => {
      expect(validatePinCode("")).toBe(false);
      expect(validatePinCode("000001")).toBe(false);  // starts with 0
      expect(validatePinCode("56000")).toBe(false);   // 5 digits
      expect(validatePinCode("5600001")).toBe(false);  // 7 digits
      expect(validatePinCode("ABCDEF")).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // UPI ID Validation
  // ────────────────────────────────────────────────────────────
  describe("validateUPI", () => {
    it("should accept valid UPI IDs", () => {
      expect(validateUPI("user@upi")).toBe(true);
      expect(validateUPI("john.doe@paytm")).toBe(true);
      expect(validateUPI("9876543210@ybl")).toBe(true);
      expect(validateUPI("myname-123@okicici")).toBe(true);
    });

    it("should reject invalid UPI IDs", () => {
      expect(validateUPI("")).toBe(false);
      expect(validateUPI("user")).toBe(false);
      expect(validateUPI("@upi")).toBe(false);
      expect(validateUPI("user@")).toBe(false);
      expect(validateUPI("user @upi")).toBe(false);
    });
  });
});
