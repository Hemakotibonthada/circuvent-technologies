// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Shared Validators
// Comprehensive validation utilities for Indian document
// formats (PAN, Aadhaar, GSTIN, IFSC, UAN), email, phone,
// password strength, date ranges, file validation, and
// input sanitization for XSS prevention.
// ──────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export interface PasswordStrength {
  score: number; // 0-4 (0 = very weak, 4 = very strong)
  label: "very_weak" | "weak" | "fair" | "strong" | "very_strong";
  suggestions: string[];
  isAcceptable: boolean;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ══════════════════════════════════════════════════════════════
// Email Validation (RFC 5322 compliant subset)
// ══════════════════════════════════════════════════════════════

/**
 * Validate email address against RFC 5322 standard.
 * Checks for proper format, valid characters, and domain structure.
 */
export function validateEmail(email: string): ValidationResult {
  if (!email || typeof email !== "string") {
    return { valid: false, error: "Email is required" };
  }

  const trimmed = email.trim().toLowerCase();

  if (trimmed.length > 254) {
    return { valid: false, error: "Email must not exceed 254 characters" };
  }

  // RFC 5322 compliant regex (practical subset)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: "Invalid email format" };
  }

  const [local, domain] = trimmed.split("@");

  if (local.length > 64) {
    return { valid: false, error: "Local part of email must not exceed 64 characters" };
  }

  if (!domain || !domain.includes(".")) {
    return { valid: false, error: "Email domain must contain at least one dot" };
  }

  const tld = domain.split(".").pop();
  if (!tld || tld.length < 2) {
    return { valid: false, error: "Invalid top-level domain" };
  }

  return { valid: true };
}

// ══════════════════════════════════════════════════════════════
// Phone Number Validation (Indian)
// ══════════════════════════════════════════════════════════════

/**
 * Validate Indian mobile phone number.
 * Accepts: +91XXXXXXXXXX, 91XXXXXXXXXX, 0XXXXXXXXXX, XXXXXXXXXX
 */
export function validatePhone(phone: string): ValidationResult {
  if (!phone || typeof phone !== "string") {
    return { valid: false, error: "Phone number is required" };
  }

  const cleaned = phone.replace(/[\s\-()]/g, "");

  // Remove leading +91, 91, or 0
  let digits = cleaned;
  if (digits.startsWith("+91")) digits = digits.substring(3);
  else if (digits.startsWith("91") && digits.length === 12) digits = digits.substring(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.substring(1);

  if (digits.length !== 10) {
    return { valid: false, error: "Indian mobile number must be 10 digits" };
  }

  // Mobile numbers start with 6, 7, 8, or 9
  if (!/^[6-9]/.test(digits)) {
    return { valid: false, error: "Indian mobile number must start with 6, 7, 8, or 9" };
  }

  if (!/^\d{10}$/.test(digits)) {
    return { valid: false, error: "Phone number must contain only digits" };
  }

  return { valid: true };
}

// ══════════════════════════════════════════════════════════════
// PAN Card Validation (India)
// ══════════════════════════════════════════════════════════════

/**
 * Validate Indian PAN card number.
 * Format: ABCDE1234F (5 letters + 4 digits + 1 letter)
 * 4th character indicates entity type.
 */
export function validatePAN(pan: string): ValidationResult {
  if (!pan || typeof pan !== "string") {
    return { valid: false, error: "PAN number is required" };
  }

  const cleaned = pan.trim().toUpperCase();

  if (cleaned.length !== 10) {
    return { valid: false, error: "PAN must be exactly 10 characters" };
  }

  // Format: AAAAA9999A
  const panRegex = /^[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z]$/;
  if (!panRegex.test(cleaned)) {
    return { valid: false, error: "Invalid PAN format. Expected format: ABCDE1234F" };
  }

  return { valid: true };
}

// ══════════════════════════════════════════════════════════════
// Aadhaar Validation (India) — Verhoeff Algorithm
// ══════════════════════════════════════════════════════════════

// Verhoeff multiplication table
const verhoeffD: number[][] = [
  [0,1,2,3,4,5,6,7,8,9],
  [1,2,3,4,0,6,7,8,9,5],
  [2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],
  [4,0,1,2,3,9,5,6,7,8],
  [5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],
  [7,6,5,9,8,2,1,0,4,3],
  [8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0],
];

// Verhoeff permutation table
const verhoeffP: number[][] = [
  [0,1,2,3,4,5,6,7,8,9],
  [1,5,7,6,2,8,3,0,9,4],
  [5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],
  [9,4,5,3,1,2,6,8,7,0],
  [4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],
  [7,0,4,6,9,1,3,2,5,8],
];

/**
 * Validate Indian Aadhaar number using Verhoeff checksum algorithm.
 * Must be exactly 12 digits and pass the Verhoeff check.
 */
export function validateAadhaar(aadhaar: string): ValidationResult {
  if (!aadhaar || typeof aadhaar !== "string") {
    return { valid: false, error: "Aadhaar number is required" };
  }

  const cleaned = aadhaar.replace(/[\s-]/g, "");

  if (cleaned.length !== 12) {
    return { valid: false, error: "Aadhaar number must be exactly 12 digits" };
  }

  if (!/^\d{12}$/.test(cleaned)) {
    return { valid: false, error: "Aadhaar number must contain only digits" };
  }

  // Must not start with 0 or 1
  if (cleaned[0] === "0" || cleaned[0] === "1") {
    return { valid: false, error: "Aadhaar number cannot start with 0 or 1" };
  }

  // Verhoeff checksum validation
  let c = 0;
  const digits = cleaned.split("").map(Number).reverse();

  for (let i = 0; i < digits.length; i++) {
    c = verhoeffD[c][verhoeffP[i % 8][digits[i]]];
  }

  if (c !== 0) {
    return { valid: false, error: "Invalid Aadhaar number (checksum failed)" };
  }

  return { valid: true };
}

// ══════════════════════════════════════════════════════════════
// GSTIN Validation (India)
// ══════════════════════════════════════════════════════════════

/**
 * Validate Indian GST Identification Number.
 * Format: 2-digit state code + 10-char PAN + 1 entity code + Z + checksum
 */
export function validateGSTIN(gstin: string): ValidationResult {
  if (!gstin || typeof gstin !== "string") {
    return { valid: false, error: "GSTIN is required" };
  }

  const cleaned = gstin.trim().toUpperCase();

  if (cleaned.length !== 15) {
    return { valid: false, error: "GSTIN must be exactly 15 characters" };
  }

  const gstinRegex = /^[0-3][0-9][A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z]\d[Z][A-Z0-9]$/;
  if (!gstinRegex.test(cleaned)) {
    return { valid: false, error: "Invalid GSTIN format" };
  }

  // Validate state code (01-37)
  const stateCode = parseInt(cleaned.substring(0, 2), 10);
  if (stateCode < 1 || stateCode > 37) {
    return { valid: false, error: "Invalid state code in GSTIN" };
  }

  // Validate embedded PAN
  const pan = cleaned.substring(2, 12);
  const panResult = validatePAN(pan);
  if (!panResult.valid) {
    return { valid: false, error: "Invalid PAN embedded in GSTIN" };
  }

  return { valid: true };
}

// ══════════════════════════════════════════════════════════════
// IFSC Code Validation (India)
// ══════════════════════════════════════════════════════════════

/**
 * Validate Indian bank IFSC code.
 * Format: 4 letters (bank) + 0 + 6 alphanumeric characters (branch)
 */
export function validateIFSC(ifsc: string): ValidationResult {
  if (!ifsc || typeof ifsc !== "string") {
    return { valid: false, error: "IFSC code is required" };
  }

  const cleaned = ifsc.trim().toUpperCase();

  if (cleaned.length !== 11) {
    return { valid: false, error: "IFSC code must be exactly 11 characters" };
  }

  const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  if (!ifscRegex.test(cleaned)) {
    return { valid: false, error: "Invalid IFSC format. Expected: 4 letters + 0 + 6 alphanumeric" };
  }

  return { valid: true };
}

// ══════════════════════════════════════════════════════════════
// UAN Validation (India) — Universal Account Number
// ══════════════════════════════════════════════════════════════

/**
 * Validate Universal Account Number for EPF.
 * Must be exactly 12 digits.
 */
export function validateUAN(uan: string): ValidationResult {
  if (!uan || typeof uan !== "string") {
    return { valid: false, error: "UAN is required" };
  }

  const cleaned = uan.replace(/[\s-]/g, "");

  if (cleaned.length !== 12) {
    return { valid: false, error: "UAN must be exactly 12 digits" };
  }

  if (!/^\d{12}$/.test(cleaned)) {
    return { valid: false, error: "UAN must contain only digits" };
  }

  // UAN starts with 10
  if (!cleaned.startsWith("10")) {
    return { valid: false, error: "UAN typically starts with 10" };
  }

  return { valid: true };
}

// ══════════════════════════════════════════════════════════════
// Indian Pincode Validation
// ══════════════════════════════════════════════════════════════

/**
 * Validate Indian 6-digit pincode.
 * First digit is 1-9, remaining 5 are digits.
 */
export function validatePincode(pincode: string): ValidationResult {
  if (!pincode || typeof pincode !== "string") {
    return { valid: false, error: "Pincode is required" };
  }

  const cleaned = pincode.trim();

  if (cleaned.length !== 6) {
    return { valid: false, error: "Pincode must be exactly 6 digits" };
  }

  if (!/^[1-9]\d{5}$/.test(cleaned)) {
    return { valid: false, error: "Invalid pincode. Must be 6 digits starting with 1-9" };
  }

  return { valid: true };
}

// ══════════════════════════════════════════════════════════════
// Bank Account Number Validation
// ══════════════════════════════════════════════════════════════

/**
 * Validate Indian bank account number.
 * Typically 9-18 digits, varies by bank.
 */
export function validateBankAccount(account: string): ValidationResult {
  if (!account || typeof account !== "string") {
    return { valid: false, error: "Bank account number is required" };
  }

  const cleaned = account.replace(/[\s-]/g, "");

  if (!/^\d+$/.test(cleaned)) {
    return { valid: false, error: "Account number must contain only digits" };
  }

  if (cleaned.length < 9 || cleaned.length > 18) {
    return { valid: false, error: "Account number must be between 9 and 18 digits" };
  }

  return { valid: true };
}

// ══════════════════════════════════════════════════════════════
// Password Strength Checker
// ══════════════════════════════════════════════════════════════

/**
 * Check password strength and return score with suggestions.
 * Score 0-4: very_weak, weak, fair, strong, very_strong.
 * Minimum acceptable score is 2 (fair).
 */
export function validatePassword(password: string): PasswordStrength {
  const suggestions: string[] = [];
  let score = 0;

  if (!password || typeof password !== "string") {
    return { score: 0, label: "very_weak", suggestions: ["Password is required"], isAcceptable: false };
  }

  // Length checks
  if (password.length < 8) {
    suggestions.push("Use at least 8 characters");
  } else if (password.length >= 12) {
    score++;
    if (password.length >= 16) score++;
  } else {
    score++;
  }

  // Uppercase letters
  if (/[A-Z]/.test(password)) {
    score++;
  } else {
    suggestions.push("Include at least one uppercase letter");
  }

  // Lowercase letters
  if (!/[a-z]/.test(password)) {
    suggestions.push("Include at least one lowercase letter");
  }

  // Numbers
  if (/\d/.test(password)) {
    score++;
  } else {
    suggestions.push("Include at least one number");
  }

  // Special characters
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    score++;
  } else {
    suggestions.push("Include at least one special character (!@#$%^&*...)");
  }

  // Penalize common patterns
  const commonPatterns = [
    /^(password|123456|qwerty|admin|letmein|welcome|monkey|dragon)/i,
    /^(.)\1{3,}$/, // Repeated characters
    /^(012|123|234|345|456|567|678|789)/, // Sequential digits
    /^(abc|bcd|cde|def)/i, // Sequential letters
  ];

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      score = Math.max(0, score - 1);
      suggestions.push("Avoid common passwords and sequential patterns");
      break;
    }
  }

  // Cap score
  score = Math.min(4, Math.max(0, score));

  const labels: PasswordStrength["label"][] = ["very_weak", "weak", "fair", "strong", "very_strong"];

  return {
    score,
    label: labels[score],
    suggestions,
    isAcceptable: score >= 2,
  };
}

// ══════════════════════════════════════════════════════════════
// Date Range Validation
// ══════════════════════════════════════════════════════════════

/**
 * Validate that start date is before end date.
 */
export function validateDateRange(
  start: Date | string,
  end: Date | string,
  options?: { allowSameDay?: boolean; maxDaysSpan?: number }
): ValidationResult {
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (isNaN(startDate.getTime())) {
    return { valid: false, error: "Invalid start date" };
  }

  if (isNaN(endDate.getTime())) {
    return { valid: false, error: "Invalid end date" };
  }

  if (options?.allowSameDay) {
    if (startDate > endDate) {
      return { valid: false, error: "Start date must be on or before end date" };
    }
  } else {
    if (startDate >= endDate) {
      return { valid: false, error: "Start date must be before end date" };
    }
  }

  if (options?.maxDaysSpan) {
    const daysDiff = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysDiff > options.maxDaysSpan) {
      return { valid: false, error: `Date range must not exceed ${options.maxDaysSpan} days` };
    }
  }

  return { valid: true };
}

// ══════════════════════════════════════════════════════════════
// Input Sanitization (XSS Prevention)
// ══════════════════════════════════════════════════════════════

/**
 * Sanitize user input to prevent XSS attacks.
 * Escapes HTML entities and removes script tags.
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== "string") return "";

  return input
    // Remove script tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove event handlers
    .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
    // Escape HTML entities
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;")
    // Remove null bytes
    .replace(/\0/g, "");
}

// ══════════════════════════════════════════════════════════════
// Currency Validation
// ══════════════════════════════════════════════════════════════

/**
 * Validate that amount is a positive number suitable for currency.
 */
export function validateCurrency(
  amount: number | string,
  options?: { allowZero?: boolean; maxAmount?: number; minAmount?: number }
): ValidationResult {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;

  if (isNaN(num)) {
    return { valid: false, error: "Amount must be a valid number" };
  }

  if (!options?.allowZero && num === 0) {
    return { valid: false, error: "Amount must be greater than zero" };
  }

  if (num < 0) {
    return { valid: false, error: "Amount must be a positive number" };
  }

  if (options?.minAmount !== undefined && num < options.minAmount) {
    return { valid: false, error: `Amount must be at least ${options.minAmount}` };
  }

  if (options?.maxAmount !== undefined && num > options.maxAmount) {
    return { valid: false, error: `Amount must not exceed ${options.maxAmount}` };
  }

  // Check for excessive decimal places (max 2 for currency)
  const decimalStr = num.toString().split(".")[1];
  if (decimalStr && decimalStr.length > 2) {
    return { valid: false, error: "Amount can have at most 2 decimal places" };
  }

  return { valid: true };
}

// ══════════════════════════════════════════════════════════════
// File Validation
// ══════════════════════════════════════════════════════════════

/**
 * Validate file extension against allowed types.
 */
export function validateFileType(
  filename: string,
  allowedTypes: string[]
): ValidationResult {
  if (!filename || typeof filename !== "string") {
    return { valid: false, error: "Filename is required" };
  }

  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) {
    return { valid: false, error: "File must have an extension" };
  }

  const normalizedAllowed = allowedTypes.map(t => t.replace(/^\./, "").toLowerCase());
  if (!normalizedAllowed.includes(ext)) {
    return {
      valid: false,
      error: `File type .${ext} is not allowed. Allowed types: ${normalizedAllowed.map(t => `.${t}`).join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Validate file size against maximum limit.
 */
export function validateFileSize(bytes: number, maxMB: number): ValidationResult {
  if (typeof bytes !== "number" || bytes < 0) {
    return { valid: false, error: "Invalid file size" };
  }

  const maxBytes = maxMB * 1024 * 1024;

  if (bytes > maxBytes) {
    const actualMB = (bytes / (1024 * 1024)).toFixed(2);
    return { valid: false, error: `File size (${actualMB} MB) exceeds maximum of ${maxMB} MB` };
  }

  if (bytes === 0) {
    return { valid: false, error: "File is empty" };
  }

  return { valid: true };
}
