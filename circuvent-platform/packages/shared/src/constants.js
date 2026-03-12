"use strict";
// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Shared Constants
// ──────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.HTTP_STATUS = exports.DEVICE_CODE_PREFIX = exports.EXPENSE_PREFIX = exports.INVOICE_PREFIX = exports.PROJECT_CODE_PREFIX = exports.EMPLOYEE_CODE_PREFIX = exports.DATETIME_FORMAT = exports.DATE_FORMAT = exports.ALLOWED_FILE_TYPES = exports.MAX_FILE_SIZE = exports.JWT_REFRESH_EXPIRY = exports.JWT_EXPIRY = exports.MAX_LIMIT = exports.DEFAULT_LIMIT = exports.DEFAULT_PAGE = exports.APP_VERSION = exports.APP_NAME = void 0;
exports.APP_NAME = "Circuvent Platform";
exports.APP_VERSION = "1.0.0";
// Pagination defaults
exports.DEFAULT_PAGE = 1;
exports.DEFAULT_LIMIT = 20;
exports.MAX_LIMIT = 100;
// JWT
exports.JWT_EXPIRY = "15m";
exports.JWT_REFRESH_EXPIRY = "7d";
// File size limits
exports.MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
exports.ALLOWED_FILE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "application/zip",
    "text/csv",
];
// Date formats
exports.DATE_FORMAT = "YYYY-MM-DD";
exports.DATETIME_FORMAT = "YYYY-MM-DD HH:mm:ss";
// Employee codes
exports.EMPLOYEE_CODE_PREFIX = "CIR-EMP";
exports.PROJECT_CODE_PREFIX = "PROJ";
exports.INVOICE_PREFIX = "INV";
exports.EXPENSE_PREFIX = "EXP";
exports.DEVICE_CODE_PREFIX = "DEV";
// HTTP Status
exports.HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
};
//# sourceMappingURL=constants.js.map