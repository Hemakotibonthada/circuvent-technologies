// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Application Error Class
// Typed, serializable error with error code, HTTP status,
// and optional context for debugging.
// ──────────────────────────────────────────────────────────────

import { ErrorCodes, ErrorCode, ErrorCodeEntry } from "./error-codes";

export class AppError extends Error {
  public readonly errorCode: number;
  public readonly httpStatus: number;
  public readonly errorKey: ErrorCode;
  public readonly context?: Record<string, unknown>;
  public readonly isOperational: boolean;
  public readonly timestamp: string;
  public readonly requestId?: string;

  constructor(
    errorKey: ErrorCode,
    overrideMessage?: string,
    context?: Record<string, unknown>,
    requestId?: string
  ) {
    const entry: ErrorCodeEntry = ErrorCodes[errorKey];
    super(overrideMessage || entry.message);

    this.errorKey = errorKey;
    this.errorCode = entry.code;
    this.httpStatus = entry.httpStatus;
    this.context = context;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();
    this.requestId = requestId;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      success: false,
      error: {
        code: this.errorCode,
        key: this.errorKey,
        message: this.message,
        ...(this.context ? { context: this.context } : {}),
        ...(this.requestId ? { requestId: this.requestId } : {}),
      },
      timestamp: this.timestamp,
    };
  }

  static fromPrismaError(error: any, requestId?: string): AppError {
    if (error?.code === "P2002") {
      const target = error.meta?.target;
      return new AppError(
        "RESOURCE_ALREADY_EXISTS",
        `Duplicate value for: ${Array.isArray(target) ? target.join(", ") : target}`,
        { prismaCode: error.code, target },
        requestId
      );
    }

    if (error?.code === "P2025") {
      return new AppError(
        "RESOURCE_NOT_FOUND",
        error.meta?.cause || "Record not found",
        { prismaCode: error.code },
        requestId
      );
    }

    if (error?.code === "P2003") {
      return new AppError(
        "VALIDATION_FAILED",
        `Foreign key constraint failed: ${error.meta?.field_name}`,
        { prismaCode: error.code, field: error.meta?.field_name },
        requestId
      );
    }

    return new AppError(
      "SYSTEM_DATABASE_ERROR",
      `Database error: ${error?.message || "Unknown"}`,
      { prismaCode: error?.code },
      requestId
    );
  }

  static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
  }
}
