// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Shared Constants
// ──────────────────────────────────────────────────────────────

export const APP_NAME = "Circuvent Platform";
export const APP_VERSION = "1.0.0";

// Pagination defaults
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// JWT
export const JWT_EXPIRY = "15m";
export const JWT_REFRESH_EXPIRY = "7d";

// File size limits
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/zip",
  "text/csv",
];

// Date formats
export const DATE_FORMAT = "YYYY-MM-DD";
export const DATETIME_FORMAT = "YYYY-MM-DD HH:mm:ss";

// Employee codes
export const EMPLOYEE_CODE_PREFIX = "CIR-EMP";
export const PROJECT_CODE_PREFIX = "PROJ";
export const INVOICE_PREFIX = "INV";
export const EXPENSE_PREFIX = "EXP";
export const DEVICE_CODE_PREFIX = "DEV";

// HTTP Status
export const HTTP_STATUS = {
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
} as const;
