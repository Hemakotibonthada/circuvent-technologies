// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Audit Repository
// Handles audit log persistence and querying with proper
// indexes and efficient pagination for compliance exports.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { AuditEntry, AuditQueryParams, AuditLogResponse } from "./audit.types";

const prisma = new PrismaClient();

const SENSITIVE_FIELDS = [
  "password", "passwordHash", "aadhaarNumber", "bankAccountNo",
  "token", "refreshToken", "secretKey", "apiKey",
];

function redactFields(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...obj };
  for (const field of SENSITIVE_FIELDS) {
    if (field in redacted) {
      redacted[field] = "***REDACTED***";
    }
  }
  return redacted;
}

export class AuditRepository {
  static async create(entry: AuditEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          oldValue: entry.oldValue ? redactFields(entry.oldValue) as any : undefined,
          newValue: entry.newValue ? redactFields(entry.newValue) as any : undefined,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          metadata: {
            ...(entry.metadata || {}),
            requestId: entry.requestId,
            correlationId: entry.correlationId,
            durationMs: entry.durationMs,
          } as any,
        },
      });
    } catch (error) {
      console.error("[AUDIT REPOSITORY] Failed to write audit log:", error);
    }
  }

  static async createBatch(entries: AuditEntry[]): Promise<number> {
    try {
      const result = await prisma.auditLog.createMany({
        data: entries.map((entry) => ({
          userId: entry.userId,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          oldValue: entry.oldValue ? redactFields(entry.oldValue) as any : undefined,
          newValue: entry.newValue ? redactFields(entry.newValue) as any : undefined,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          metadata: {
            ...(entry.metadata || {}),
            requestId: entry.requestId,
            correlationId: entry.correlationId,
          } as any,
        })),
      });
      return result.count;
    } catch (error) {
      console.error("[AUDIT REPOSITORY] Batch write failed:", error);
      return 0;
    }
  }

  static async query(params: AuditQueryParams): Promise<{
    logs: AuditLogResponse[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (params.userId) where.userId = params.userId;
    if (params.entity) where.entity = params.entity;
    if (params.action) where.action = params.action;
    if (params.entityId) where.entityId = params.entityId;
    if (params.startDate || params.endDate) {
      where.createdAt = {
        ...(params.startDate ? { gte: params.startDate } : {}),
        ...(params.endDate ? { lte: params.endDate } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: params.sortOrder || "desc" },
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
      logs: logs as unknown as AuditLogResponse[],
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getEntityHistory(entity: string, entityId: string): Promise<AuditLogResponse[]> {
    const logs = await prisma.auditLog.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
      },
    });
    return logs as unknown as AuditLogResponse[];
  }

  static async getUserActivityLog(userId: string, days = 30): Promise<AuditLogResponse[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const logs = await prisma.auditLog.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return logs as unknown as AuditLogResponse[];
  }

  static async getComplianceReport(startDate: Date, endDate: Date): Promise<{
    totalEvents: number;
    byAction: Record<string, number>;
    byEntity: Record<string, number>;
    byUser: { userId: string; count: number }[];
  }> {
    const where = { createdAt: { gte: startDate, lte: endDate } };

    const [totalEvents, byAction, byEntity, byUser] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({ by: ["action"], where, _count: { id: true } }),
      prisma.auditLog.groupBy({ by: ["entity"], where, _count: { id: true } }),
      prisma.auditLog.groupBy({
        by: ["userId"],
        where: { ...where, userId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 50,
      }),
    ]);

    return {
      totalEvents,
      byAction: Object.fromEntries(byAction.map((a) => [a.action, a._count.id])),
      byEntity: Object.fromEntries(byEntity.map((e) => [e.entity, e._count.id])),
      byUser: byUser
        .filter((u) => u.userId)
        .map((u) => ({ userId: u.userId!, count: u._count.id })),
    };
  }
}
