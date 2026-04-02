// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Audit Logger
// Records all CRUD operations and auth events for compliance.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { Request, Response, NextFunction } from "express";
import { redactSensitiveFields } from "@circuvent/shared";

const prisma = new PrismaClient();

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "LOGIN_FAILED"
  | "EXPORT"
  | "APPROVE"
  | "REJECT"
  | "PAYMENT";

export interface AuditEntry {
  userId?: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Creates an audit log entry in the database.
 */
export async function createAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        oldValue: entry.oldValue
          ? (redactSensitiveFields(entry.oldValue as Record<string, unknown>) as any)
          : undefined,
        newValue: entry.newValue
          ? (redactSensitiveFields(entry.newValue as Record<string, unknown>) as any)
          : undefined,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        metadata: entry.metadata as any,
      },
    });
  } catch (error) {
    // Audit logging should never break the main flow
    console.error("[AUDIT] Failed to write audit log:", error);
  }
}

/**
 * Express middleware that automatically logs request metadata.
 * Attach after authentication middleware to capture userId.
 */
export function auditMiddleware(entity: string, action: AuditAction) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // Fire-and-forget audit log (non-blocking)
    setImmediate(() => {
      createAuditLog({
        userId: (req as any).user?.userId,
        action,
        entity,
        entityId: req.params.id,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
        metadata: {
          method: req.method,
          path: req.path,
          query: req.query,
        },
      });
    });

    next();
  };
}

/**
 * Queries audit logs with filtering and pagination.
 */
export async function queryAuditLogs(filters: {
  userId?: string;
  entity?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}) {
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (filters.userId) where.userId = filters.userId;
  if (filters.entity) where.entity = filters.entity;
  if (filters.action) where.action = filters.action;
  if (filters.startDate || filters.endDate) {
    where.createdAt = {
      ...(filters.startDate ? { gte: filters.startDate } : {}),
      ...(filters.endDate ? { lte: filters.endDate } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export default { createAuditLog, auditMiddleware, queryAuditLogs };
