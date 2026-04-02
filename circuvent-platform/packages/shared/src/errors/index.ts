// ══════════════════════════════════════════════════════════════════════════════
// Circuvent Platform — Application Error Hierarchy
// Structured error types for the entire platform. Every error has a numeric
// code, HTTP status mapping, and serializable structure.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Base application error. All domain and infrastructure errors extend this.
 * Provides structured error info suitable for logging, API responses, and monitoring.
 */
export class AppError extends Error {
  /** Numeric error code from the error catalog */
  public readonly code: number;
  /** HTTP status code for API responses */
  public readonly httpStatus: number;
  /** Whether this error is operational (expected) vs programmer error */
  public readonly isOperational: boolean;
  /** Additional context data for debugging */
  public readonly context?: Record<string, unknown>;
  /** ISO-8601 timestamp */
  public readonly timestamp: string;

  constructor(params: {
    message: string;
    code: number;
    httpStatus?: number;
    isOperational?: boolean;
    context?: Record<string, unknown>;
    cause?: Error;
  }) {
    super(params.message);
    this.name = this.constructor.name;
    this.code = params.code;
    this.httpStatus = params.httpStatus ?? 500;
    this.isOperational = params.isOperational ?? true;
    this.context = params.context;
    this.timestamp = new Date().toISOString();

    if (params.cause) {
      this.cause = params.cause;
    }

    // Maintains proper stack trace in V8
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serializes the error for API responses (excludes stack trace).
   */
  public toJSON(): Record<string, unknown> {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      timestamp: this.timestamp,
      ...(this.context ? { context: this.context } : {}),
    };
  }
}

// ── Domain Errors (Business Logic Violations) ────────────────────────────────

/**
 * Entity not found in the system.
 * HTTP 404
 */
export class NotFoundError extends AppError {
  constructor(entity: string, id: string, context?: Record<string, unknown>) {
    super({
      message: `${entity} with ID '${id}' not found`,
      code: 1001,
      httpStatus: 404,
      context: { entity, id, ...context },
    });
  }
}

/**
 * Business rule violation — the operation is not allowed in the current state.
 * HTTP 422
 */
export class DomainRuleError extends AppError {
  constructor(rule: string, details?: string, context?: Record<string, unknown>) {
    super({
      message: details ? `${rule}: ${details}` : rule,
      code: 1002,
      httpStatus: 422,
      context: { rule, ...context },
    });
  }
}

/**
 * Domain state machine transition that's not allowed.
 * HTTP 409
 */
export class InvalidStateTransitionError extends AppError {
  constructor(entity: string, from: string, to: string, context?: Record<string, unknown>) {
    super({
      message: `Cannot transition ${entity} from '${from}' to '${to}'`,
      code: 1003,
      httpStatus: 409,
      context: { entity, from, to, ...context },
    });
  }
}

/**
 * A uniqueness constraint was violated.
 * HTTP 409
 */
export class DuplicateError extends AppError {
  constructor(entity: string, field: string, value: string) {
    super({
      message: `${entity} with ${field} '${value}' already exists`,
      code: 1004,
      httpStatus: 409,
      context: { entity, field, value },
    });
  }
}

/**
 * Input validation failed.
 * HTTP 400
 */
export class ValidationError extends AppError {
  public readonly fields: Array<{ field: string; message: string }>;

  constructor(fields: Array<{ field: string; message: string }>) {
    super({
      message: `Validation failed: ${fields.map(f => f.message).join("; ")}`,
      code: 1005,
      httpStatus: 400,
      context: { fields },
    });
    this.fields = fields;
  }
}

/**
 * Concurrency conflict — optimistic locking detected a stale write.
 * HTTP 409
 */
export class ConcurrencyError extends AppError {
  constructor(entity: string, id: string) {
    super({
      message: `Concurrency conflict: ${entity} '${id}' was modified by another process`,
      code: 1006,
      httpStatus: 409,
      context: { entity, id },
    });
  }
}

/**
 * Accounting imbalance — debits don't equal credits.
 * HTTP 422
 */
export class AccountingImbalanceError extends AppError {
  constructor(journalId: string, debitTotal: number, creditTotal: number) {
    super({
      message: `Journal '${journalId}' is unbalanced: debits=${debitTotal}, credits=${creditTotal}`,
      code: 1007,
      httpStatus: 422,
      context: { journalId, debitTotal, creditTotal },
    });
  }
}

// ── Infrastructure Errors ────────────────────────────────────────────────────

/**
 * Database connection or query error.
 * HTTP 503
 */
export class DatabaseError extends AppError {
  constructor(operation: string, cause?: Error) {
    super({
      message: `Database error during ${operation}`,
      code: 2001,
      httpStatus: 503,
      isOperational: false,
      context: { operation },
      cause,
    });
  }
}

/**
 * External service is unavailable (MQTT broker, payment gateway, etc.).
 * HTTP 502
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, cause?: Error) {
    super({
      message: `External service '${service}' is unavailable`,
      code: 2002,
      httpStatus: 502,
      context: { service },
      cause,
    });
  }
}

/**
 * Circuit breaker is open — requests are being rejected to prevent cascade.
 * HTTP 503
 */
export class CircuitOpenError extends AppError {
  constructor(service: string) {
    super({
      message: `Circuit breaker OPEN for '${service}' — requests blocked`,
      code: 2003,
      httpStatus: 503,
      context: { service },
    });
  }
}

/**
 * Rate limit exceeded.
 * HTTP 429
 */
export class RateLimitError extends AppError {
  constructor(limit: number, windowMs: number) {
    super({
      message: `Rate limit exceeded: ${limit} requests per ${windowMs}ms`,
      code: 2004,
      httpStatus: 429,
      context: { limit, windowMs },
    });
  }
}

// ── Auth Errors ──────────────────────────────────────────────────────────────

/**
 * Authentication failed — invalid credentials or expired token.
 * HTTP 401
 */
export class AuthenticationError extends AppError {
  constructor(reason: string = "Authentication required") {
    super({ message: reason, code: 3001, httpStatus: 401 });
  }
}

/**
 * Authorization failed — user doesn't have the required role/permission.
 * HTTP 403
 */
export class AuthorizationError extends AppError {
  constructor(action: string, resource: string) {
    super({
      message: `Not authorized to ${action} on ${resource}`,
      code: 3002,
      httpStatus: 403,
      context: { action, resource },
    });
  }
}

// ── Error Code Catalog ───────────────────────────────────────────────────────

/**
 * Centralized error code catalog. Maps numeric codes to descriptions.
 * Used for monitoring dashboards and error documentation.
 */
export const ERROR_CATALOG: Record<number, { name: string; description: string; severity: "low" | "medium" | "high" | "critical" }> = {
  // Domain (1xxx)
  1001: { name: "NOT_FOUND", description: "Entity not found", severity: "low" },
  1002: { name: "DOMAIN_RULE", description: "Business rule violation", severity: "medium" },
  1003: { name: "INVALID_TRANSITION", description: "Invalid state transition", severity: "medium" },
  1004: { name: "DUPLICATE", description: "Uniqueness constraint violated", severity: "low" },
  1005: { name: "VALIDATION", description: "Input validation failed", severity: "low" },
  1006: { name: "CONCURRENCY", description: "Optimistic lock conflict", severity: "medium" },
  1007: { name: "ACCOUNTING_IMBALANCE", description: "Debits != Credits", severity: "critical" },

  // Infrastructure (2xxx)
  2001: { name: "DATABASE", description: "Database operation failed", severity: "critical" },
  2002: { name: "EXTERNAL_SERVICE", description: "External service unavailable", severity: "high" },
  2003: { name: "CIRCUIT_OPEN", description: "Circuit breaker tripped", severity: "high" },
  2004: { name: "RATE_LIMIT", description: "Rate limit exceeded", severity: "medium" },

  // Auth (3xxx)
  3001: { name: "AUTHENTICATION", description: "Auth required or failed", severity: "medium" },
  3002: { name: "AUTHORIZATION", description: "Insufficient permissions", severity: "medium" },
};
