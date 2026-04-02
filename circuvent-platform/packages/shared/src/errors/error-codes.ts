// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Structured Error Codes
// Every error in the system maps to a unique code for
// traceability, logging, and client-side handling.
// ──────────────────────────────────────────────────────────────

export const ErrorCodes = {
  // ── Authentication (1xxx) ──
  AUTH_INVALID_CREDENTIALS: { code: 1001, httpStatus: 401, message: "Invalid email or password" },
  AUTH_TOKEN_EXPIRED: { code: 1002, httpStatus: 401, message: "Access token has expired" },
  AUTH_TOKEN_INVALID: { code: 1003, httpStatus: 401, message: "Invalid or malformed token" },
  AUTH_REFRESH_EXPIRED: { code: 1004, httpStatus: 401, message: "Refresh token has expired" },
  AUTH_REFRESH_REVOKED: { code: 1005, httpStatus: 401, message: "Refresh token has been revoked" },
  AUTH_FORBIDDEN: { code: 1006, httpStatus: 403, message: "Insufficient permissions" },
  AUTH_ACCOUNT_INACTIVE: { code: 1007, httpStatus: 403, message: "Account is inactive or suspended" },
  AUTH_RATE_LIMITED: { code: 1008, httpStatus: 429, message: "Too many authentication attempts" },
  AUTH_SESSION_EXPIRED: { code: 1009, httpStatus: 401, message: "Session has expired" },

  // ── Validation (2xxx) ──
  VALIDATION_FAILED: { code: 2001, httpStatus: 400, message: "Validation failed" },
  VALIDATION_MISSING_FIELD: { code: 2002, httpStatus: 400, message: "Required field is missing" },
  VALIDATION_INVALID_FORMAT: { code: 2003, httpStatus: 400, message: "Invalid data format" },
  VALIDATION_INVALID_ENUM: { code: 2004, httpStatus: 400, message: "Invalid enum value" },
  VALIDATION_RANGE_ERROR: { code: 2005, httpStatus: 400, message: "Value out of allowed range" },
  VALIDATION_DUPLICATE: { code: 2006, httpStatus: 409, message: "Duplicate entry" },
  VALIDATION_PAN_INVALID: { code: 2007, httpStatus: 400, message: "Invalid PAN number format" },
  VALIDATION_GST_INVALID: { code: 2008, httpStatus: 400, message: "Invalid GST number format" },
  VALIDATION_MAC_INVALID: { code: 2009, httpStatus: 400, message: "Invalid MAC address format" },
  VALIDATION_AADHAAR_INVALID: { code: 2010, httpStatus: 400, message: "Invalid Aadhaar number" },

  // ── Resource (3xxx) ──
  RESOURCE_NOT_FOUND: { code: 3001, httpStatus: 404, message: "Resource not found" },
  RESOURCE_ALREADY_EXISTS: { code: 3002, httpStatus: 409, message: "Resource already exists" },
  RESOURCE_DELETED: { code: 3003, httpStatus: 410, message: "Resource has been deleted" },
  RESOURCE_LOCKED: { code: 3004, httpStatus: 423, message: "Resource is locked" },

  // ── HR/Payroll (4xxx) ──
  HR_EMPLOYEE_NOT_FOUND: { code: 4001, httpStatus: 404, message: "Employee not found" },
  HR_SALARY_ALREADY_GENERATED: { code: 4002, httpStatus: 409, message: "Salary slip already exists for this period" },
  HR_EXPENSE_AMOUNT_EXCEEDED: { code: 4003, httpStatus: 400, message: "Expense amount exceeds policy limit" },
  HR_LEAVE_INSUFFICIENT_BALANCE: { code: 4004, httpStatus: 400, message: "Insufficient leave balance" },
  HR_LEAVE_OVERLAP: { code: 4005, httpStatus: 409, message: "Leave dates overlap with existing request" },
  HR_APPROVAL_NOT_PENDING: { code: 4006, httpStatus: 400, message: "Approval is not in pending state" },
  HR_SELF_APPROVAL: { code: 4007, httpStatus: 400, message: "Cannot approve own request" },
  HR_STATUTORY_CONFIG_MISSING: { code: 4008, httpStatus: 500, message: "Statutory configuration missing for this financial year" },
  HR_PF_CEILING_EXCEEDED: { code: 4009, httpStatus: 400, message: "PF contribution exceeds wage ceiling" },
  HR_GRATUITY_NOT_ELIGIBLE: { code: 4010, httpStatus: 400, message: "Employee not eligible for gratuity" },

  // ── IoT (5xxx) ──
  IOT_DEVICE_NOT_FOUND: { code: 5001, httpStatus: 404, message: "Device not found" },
  IOT_DEVICE_OFFLINE: { code: 5002, httpStatus: 503, message: "Device is offline" },
  IOT_MAC_DUPLICATE: { code: 5003, httpStatus: 409, message: "MAC address already registered" },
  IOT_FIRMWARE_DOWNGRADE: { code: 5004, httpStatus: 400, message: "Firmware downgrade not allowed" },
  IOT_TELEMETRY_INVALID: { code: 5005, httpStatus: 400, message: "Invalid telemetry payload" },
  IOT_HEARTBEAT_STALE: { code: 5006, httpStatus: 400, message: "Heartbeat data is stale" },
  IOT_COMMAND_FAILED: { code: 5007, httpStatus: 500, message: "Device command execution failed" },
  IOT_DEVICE_DECOMMISSIONED: { code: 5008, httpStatus: 400, message: "Device has been decommissioned" },

  // ── AI Orchestrator (6xxx) ──
  AI_RESOURCE_NOT_AVAILABLE: { code: 6001, httpStatus: 503, message: "No compute resource available" },
  AI_RESOURCE_ALREADY_ALLOCATED: { code: 6002, httpStatus: 409, message: "Resource already allocated" },
  AI_JOB_NOT_FOUND: { code: 6003, httpStatus: 404, message: "Training job not found" },
  AI_JOB_ALREADY_RUNNING: { code: 6004, httpStatus: 409, message: "Job is already running" },
  AI_JOB_CANNOT_CANCEL: { code: 6005, httpStatus: 400, message: "Job cannot be cancelled in current state" },
  AI_BOT_CONFIG_INVALID: { code: 6006, httpStatus: 400, message: "Trading bot configuration is invalid" },
  AI_BOT_RISK_LIMIT_EXCEEDED: { code: 6007, httpStatus: 400, message: "Trading bot risk limit exceeded" },
  AI_CHECKPOINT_NOT_FOUND: { code: 6008, httpStatus: 404, message: "Model checkpoint not found" },
  AI_INSUFFICIENT_VRAM: { code: 6009, httpStatus: 400, message: "Insufficient VRAM for requested model" },

  // ── Client/Invoice (7xxx) ──
  CLIENT_NOT_FOUND: { code: 7001, httpStatus: 404, message: "Client not found" },
  INVOICE_NOT_FOUND: { code: 7002, httpStatus: 404, message: "Invoice not found" },
  INVOICE_ALREADY_PAID: { code: 7003, httpStatus: 400, message: "Invoice is already fully paid" },
  INVOICE_OVERDUE: { code: 7004, httpStatus: 400, message: "Invoice is overdue" },
  LEAD_NOT_FOUND: { code: 7005, httpStatus: 404, message: "Lead not found" },
  LEAD_ALREADY_WON: { code: 7006, httpStatus: 400, message: "Lead is already in WON state" },

  // ── System (9xxx) ──
  SYSTEM_INTERNAL_ERROR: { code: 9001, httpStatus: 500, message: "Internal server error" },
  SYSTEM_DATABASE_ERROR: { code: 9002, httpStatus: 500, message: "Database operation failed" },
  SYSTEM_EXTERNAL_SERVICE: { code: 9003, httpStatus: 502, message: "External service unavailable" },
  SYSTEM_RATE_LIMITED: { code: 9004, httpStatus: 429, message: "Rate limit exceeded" },
  SYSTEM_MAINTENANCE: { code: 9005, httpStatus: 503, message: "System under maintenance" },
  SYSTEM_WEBSOCKET_ERROR: { code: 9006, httpStatus: 500, message: "WebSocket connection error" },
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

export interface ErrorCodeEntry {
  code: number;
  httpStatus: number;
  message: string;
}
