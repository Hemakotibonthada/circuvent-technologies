// ──────────────────────────────────────────────────────────────
// Correlation ID Middleware
// Propagates a correlation ID across service boundaries.
// If a parent service provides X-Correlation-Id, it is reused;
// otherwise the request ID is promoted to correlation ID.
// ──────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";

const CORRELATION_HEADER = "x-correlation-id";

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingCorrelation = req.headers[CORRELATION_HEADER] as string;
  const correlationId = existingCorrelation || (req as any).requestId || `corr_${Date.now()}`;

  (req as any).correlationId = correlationId;
  res.setHeader(CORRELATION_HEADER, correlationId);

  next();
}
