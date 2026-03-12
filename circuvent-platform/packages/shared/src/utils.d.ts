import type { PaginationQuery, PaginationMeta, ApiResponse } from "./types";
/**
 * Generates a sequential code with prefix.
 * e.g., generateCode("PROJ", 5) => "PROJ-005"
 */
export declare function generateCode(prefix: string, sequence: number, pad?: number): string;
/**
 * Normalizes pagination query with sane defaults.
 */
export declare function normalizePagination(query: PaginationQuery): Required<PaginationQuery>;
/**
 * Builds pagination metadata from total count.
 */
export declare function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta;
/**
 * Wraps data in a standard API response.
 */
export declare function successResponse<T>(data: T, message?: string, meta?: PaginationMeta): ApiResponse<T>;
/**
 * Creates a standard error response.
 */
export declare function errorResponse(error: string, message?: string): ApiResponse;
/**
 * Generates a financial year string from a date.
 * e.g., March 2026 => "2025-2026"
 */
export declare function getFinancialYear(date?: Date): string;
/**
 * Validates an Indian PAN number format.
 */
export declare function isValidPAN(pan: string): boolean;
/**
 * Validates a MAC address format.
 */
export declare function isValidMAC(mac: string): boolean;
/**
 * Redacts sensitive fields for logging.
 */
export declare function redactSensitiveFields<T extends Record<string, unknown>>(obj: T, fields?: string[]): Partial<T>;
//# sourceMappingURL=utils.d.ts.map