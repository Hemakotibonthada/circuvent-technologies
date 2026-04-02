// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Global Error Handler Middleware
// Catches all errors, normalizes to AppError format, logs
// to audit system, and returns structured JSON.
// ──────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { AppError } from "./app-error";

export interface ErrorLogEntry {
  timestamp: string;
  requestId?: string;
  method: string;
  path: string;
  errorCode: number;
  errorKey: string;
  message: string;
  stack?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
}

let errorLogger: ((entry: ErrorLogEntry) => void) | undefined;

export function setErrorLogger(logger: (entry: ErrorLogEntry) => void): void {
  errorLogger = logger;
}

export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req as any).requestId;

  if (AppError.isAppError(err)) {
    const logEntry: ErrorLogEntry = {
      timestamp: err.timestamp,
      requestId,
      method: req.method,
      path: req.path,
      errorCode: err.errorCode,
      errorKey: err.errorKey,
      message: err.message,
      userId: (req as any).user?.userId,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
    };

    if (err.httpStatus >= 500) {
      logEntry.stack = err.stack;
      console.error(`[ERROR ${err.errorCode}]`, err.message, err.context);
    }

    if (errorLogger) errorLogger(logEntry);

    res.status(err.httpStatus).json(err.toJSON());
    return;
  }

  // Unhandled / non-operational error
  const unhandled = new AppError(
    "SYSTEM_INTERNAL_ERROR",
    process.env.NODE_ENV === "production"
      ? "An unexpected error occurred"
      : err.message,
    undefined,
    requestId
  );

  const logEntry: ErrorLogEntry = {
    timestamp: unhandled.timestamp,
    requestId,
    method: req.method,
    path: req.path,
    errorCode: unhandled.errorCode,
    errorKey: unhandled.errorKey,
    message: err.message,
    stack: err.stack,
    userId: (req as any).user?.userId,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.headers["user-agent"],
  };

  console.error("[UNHANDLED ERROR]", err);
  if (errorLogger) errorLogger(logEntry);

  res.status(500).json(unhandled.toJSON());
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError("RESOURCE_NOT_FOUND", `Route not found: ${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
  }));
}
