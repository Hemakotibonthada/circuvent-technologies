// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Shared Utility Functions
// ──────────────────────────────────────────────────────────────

import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT } from "./constants";
import type { PaginationQuery, PaginationMeta, ApiResponse } from "./types";

/**
 * Generates a sequential code with prefix.
 * e.g., generateCode("PROJ", 5) => "PROJ-005"
 */
export function generateCode(prefix: string, sequence: number, pad = 3): string {
  return `${prefix}-${String(sequence).padStart(pad, "0")}`;
}

/**
 * Normalizes pagination query with sane defaults.
 */
export function normalizePagination(query: PaginationQuery): Required<PaginationQuery> {
  return {
    page: Math.max(1, query.page ?? DEFAULT_PAGE),
    limit: Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT)),
    sortBy: query.sortBy ?? "createdAt",
    sortOrder: query.sortOrder ?? "desc",
    search: query.search ?? "",
  };
}

/**
 * Builds pagination metadata from total count.
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
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
export function successResponse<T>(
  data: T,
  message?: string,
  meta?: PaginationMeta
): ApiResponse<T> {
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
export function errorResponse(error: string, message?: string): ApiResponse {
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
export function getFinancialYear(date: Date = new Date()): string {
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
export function isValidPAN(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
}

/**
 * Validates a MAC address format.
 */
export function isValidMAC(mac: string): boolean {
  return /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac);
}

/**
 * Redacts sensitive fields for logging.
 */
export function redactSensitiveFields<T extends Record<string, unknown>>(
  obj: T,
  fields: string[] = ["password", "passwordHash", "aadhaarNumber", "bankAccountNo", "token"]
): Partial<T> {
  const redacted = { ...obj };
  for (const field of fields) {
    if (field in redacted) {
      (redacted as Record<string, unknown>)[field] = "***REDACTED***";
    }
  }
  return redacted;
}
