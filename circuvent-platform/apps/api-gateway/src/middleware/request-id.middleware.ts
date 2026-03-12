// ──────────────────────────────────────────────────────────────
// Request ID Middleware
// Generates a unique X-Request-Id for every incoming request.
// Enables end-to-end tracing across all microservices.
// ──────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const REQUEST_ID_HEADER = "x-request-id";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.headers[REQUEST_ID_HEADER] as string;
  const requestId = existingId || `req_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;

  (req as any).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
