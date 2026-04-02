// ──────────────────────────────────────────────────────────────
// Response Time Middleware
// Measures and attaches X-Response-Time header to every response.
// Also logs slow requests (>2s) for performance monitoring.
// ──────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";

const SLOW_REQUEST_THRESHOLD_MS = 2000;

export function responseTimeMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = process.hrtime.bigint();

  // Override writeHead to add response time header before it's sent
  const originalWriteHead = res.writeHead.bind(res);
  (res as any).writeHead = function(statusCode: number, ...args: any[]) {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000;
    res.setHeader("X-Response-Time", `${durationMs.toFixed(2)}ms`);
    return originalWriteHead(statusCode, ...args);
  };

  res.on("finish", () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000;

    if (durationMs > SLOW_REQUEST_THRESHOLD_MS) {
      console.warn(
        `[SLOW REQUEST] ${req.method} ${req.path} took ${durationMs.toFixed(2)}ms`,
        {
          requestId: (req as any).requestId,
          statusCode: res.statusCode,
          userId: (req as any).user?.userId,
        }
      );
    }
  });

  next();
}
