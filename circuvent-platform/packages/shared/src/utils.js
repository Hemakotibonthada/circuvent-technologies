"use strict";
// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Shared Utility Functions
// ──────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCode = generateCode;
exports.normalizePagination = normalizePagination;
exports.buildPaginationMeta = buildPaginationMeta;
exports.successResponse = successResponse;
exports.errorResponse = errorResponse;
exports.getFinancialYear = getFinancialYear;
exports.isValidPAN = isValidPAN;
exports.isValidMAC = isValidMAC;
exports.redactSensitiveFields = redactSensitiveFields;
const constants_1 = require("./constants");
/**
 * Generates a sequential code with prefix.
 * e.g., generateCode("PROJ", 5) => "PROJ-005"
 */
function generateCode(prefix, sequence, pad = 3) {
    return `${prefix}-${String(sequence).padStart(pad, "0")}`;
}
/**
 * Normalizes pagination query with sane defaults.
 */
function normalizePagination(query) {
    return {
        page: Math.max(1, query.page ?? constants_1.DEFAULT_PAGE),
        limit: Math.min(constants_1.MAX_LIMIT, Math.max(1, query.limit ?? constants_1.DEFAULT_LIMIT)),
        sortBy: query.sortBy ?? "createdAt",
        sortOrder: query.sortOrder ?? "desc",
        search: query.search ?? "",
    };
}
/**
 * Builds pagination metadata from total count.
 */
function buildPaginationMeta(total, page, limit) {
    return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
    };
}
/**
 * Wraps data in a standard API response.
 */
function successResponse(data, message, meta) {
    return {
        success: true,
        data,
        message,
        meta,
    };
}
/**
 * Creates a standard error response.
 */
function errorResponse(error, message) {
    return {
        success: false,
        error,
        message,
    };
}
/**
 * Generates a financial year string from a date.
 * e.g., March 2026 => "2025-2026"
 */
function getFinancialYear(date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed
    if (month < 3) {
        // Jan-Mar falls in previous FY
        return `${year - 1}-${year}`;
    }
    return `${year}-${year + 1}`;
}
/**
 * Validates an Indian PAN number format.
 */
function isValidPAN(pan) {
    return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
}
/**
 * Validates a MAC address format.
 */
function isValidMAC(mac) {
    return /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac);
}
/**
 * Redacts sensitive fields for logging.
 */
function redactSensitiveFields(obj, fields = ["password", "passwordHash", "aadhaarNumber", "bankAccountNo", "token"]) {
    const redacted = { ...obj };
    for (const field of fields) {
        if (field in redacted) {
            redacted[field] = "***REDACTED***";
        }
    }
    return redacted;
}
//# sourceMappingURL=utils.js.map