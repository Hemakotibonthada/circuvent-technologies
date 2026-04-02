// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Audit Middleware (ISO Compliance)
// Automatically captures write operations (POST, PUT, PATCH,
// DELETE) across all services and logs to the audit trail.
// Attaches to Express as a global middleware.
// ──────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { AuditRepository } from "./audit.repository";
import { AuditAction, AuditEntity } from "./audit.types";

interface AuditMiddlewareConfig {
  entity: AuditEntity;
  actionMap?: Partial<Record<string, AuditAction>>;
  captureBody?: boolean;
  captureResponse?: boolean;
  excludePaths?: string[];
}

const DEFAULT_METHOD_ACTION_MAP: Partial<Record<string, AuditAction>> = {
  POST: "CREATE",
  PUT: "UPDATE",
  PATCH: "UPDATE",
  DELETE: "DELETE",
};

/**
 * Creates audit middleware for a specific entity type.
 * Automatically logs all mutating HTTP operations.
 */
export function createAuditMiddleware(config: AuditMiddlewareConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip non-mutating methods
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }

    // Skip excluded paths
    if (config.excludePaths?.some((p) => req.path.includes(p))) {
      next();
      return;
    }

    const startTime = Date.now();
    const actionMap = config.actionMap || DEFAULT_METHOD_ACTION_MAP;
    const action = actionMap[req.method] || ("UPDATE" as AuditAction);

    // Capture original response.json to intercept response body
    const originalJson = res.json.bind(res);
    let responseBody: any = null;

    if (config.captureResponse) {
      res.json = function (body: any) {
        responseBody = body;
        return originalJson(body);
      };
    }

    res.on("finish", () => {
      // Only audit successful mutations (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const durationMs = Date.now() - startTime;
        const entityId = req.params.id || req.params.taskId || req.params.deviceId || req.params.employeeId;

        setImmediate(() => {
          AuditRepository.create({
            userId: (req as any).user?.userId,
            action,
            entity: config.entity,
            entityId,
            newValue: config.captureBody ? sanitizeBody(req.body) : undefined,
            ipAddress: req.ip || req.socket.remoteAddress,
            userAgent: req.headers["user-agent"],
            requestId: (req as any).requestId,
            correlationId: (req as any).correlationId,
            durationMs,
            metadata: {
              method: req.method,
              path: req.path,
              statusCode: res.statusCode,
              ...(responseBody?.data?.id ? { createdId: responseBody.data.id } : {}),
            },
          });
        });
      }
    });

    next();
  };
}

/**
 * Removes sensitive fields from request body before audit logging.
 */
function sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};

  const sanitized = { ...body };
  const sensitiveKeys = [
    "password", "passwordHash", "token", "refreshToken",
    "aadhaarNumber", "bankAccountNo", "secretKey", "apiKey",
    "creditCard", "cvv",
  ];

  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      sanitized[key] = "***REDACTED***";
    }
  }

  return sanitized;
}

/**
 * Per-route audit decorator for explicit audit logging.
 */
export function auditAction(entity: AuditEntity, action: AuditAction) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    setImmediate(() => {
      AuditRepository.create({
        userId: (req as any).user?.userId,
        action,
        entity,
        entityId: req.params.id,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
        requestId: (req as any).requestId,
        metadata: { method: req.method, path: req.path, query: req.query },
      });
    });
    next();
  };
}
