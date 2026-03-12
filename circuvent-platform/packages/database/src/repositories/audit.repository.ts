// ──────────────────────────────────────────────────────────────
// Audit Log Repository — extends BaseRepository with audit-
// specific queries, compliance reporting, data retention,
// and aggregation for ISO compliance dashboards.
// ──────────────────────────────────────────────────────────────

import { BaseRepository, PaginationParams, PaginatedResult } from "../repository.base";

export class AuditLogRepository extends BaseRepository<"auditLog"> {
  constructor() { super("auditLog"); }

  async findByEntity(entity: string, entityId: string): Promise<any[]> {
    return this.model.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
      },
    });
  }

  async findByUser(userId: string, pagination: PaginationParams): Promise<PaginatedResult<any>> {
    return this.findPaginated(pagination, { userId }, {
      user: { select: { email: true, firstName: true, lastName: true, role: true } },
    });
  }

  async findByAction(action: string, pagination: PaginationParams): Promise<PaginatedResult<any>> {
    return this.findPaginated(pagination, { action });
  }

  async findByDateRange(startDate: Date, endDate: Date, pagination: PaginationParams): Promise<PaginatedResult<any>> {
    return this.findPaginated(pagination, {
      createdAt: { gte: startDate, lte: endDate },
    }, {
      user: { select: { email: true, firstName: true, lastName: true, role: true } },
    });
  }

  async getActivitySummary(days = 30): Promise<{
    totalEvents: number;
    uniqueUsers: number;
    byAction: Record<string, number>;
    byEntity: Record<string, number>;
    byDay: { date: string; count: number }[];
    topUsers: { userId: string; email: string; count: number }[];
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totalEvents, byAction, byEntity, byDay, topUsers] = await Promise.all([
      this.model.count({ where: { createdAt: { gte: since } } }),
      this.model.groupBy({
        by: ["action"],
        where: { createdAt: { gte: since } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),
      this.model.groupBy({
        by: ["entity"],
        where: { createdAt: { gte: since } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),
      this.prisma.$queryRaw`
        SELECT DATE(created_at) as date, COUNT(*)::int as count
        FROM audit_logs
        WHERE created_at >= ${since}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT ${days}
      ` as Promise<any[]>,
      this.model.groupBy({
        by: ["userId"],
        where: { createdAt: { gte: since }, userId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 20,
      }),
    ]);

    // Fetch emails for top users
    const userIds = topUsers.filter((u: any) => u.userId).map((u: any) => u.userId);
    const users = userIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.email]));

    const uniqueUserIds = new Set(topUsers.map((u: any) => u.userId).filter(Boolean));

    return {
      totalEvents,
      uniqueUsers: uniqueUserIds.size,
      byAction: Object.fromEntries(byAction.map((a: any) => [a.action, a._count.id])),
      byEntity: Object.fromEntries(byEntity.map((e: any) => [e.entity, e._count.id])),
      byDay: (byDay as any[]).map((d) => ({ date: String(d.date).split("T")[0], count: d.count })),
      topUsers: topUsers
        .filter((u: any) => u.userId)
        .map((u: any) => ({
          userId: u.userId,
          email: userMap.get(u.userId) || "unknown",
          count: u._count.id,
        })),
    };
  }

  async getComplianceReport(startDate: Date, endDate: Date): Promise<{
    period: { from: string; to: string };
    totalEvents: number;
    writeOperations: number;
    loginEvents: number;
    failedLogins: number;
    dataExports: number;
    configChanges: number;
    byModule: Record<string, number>;
    securityEvents: { action: string; count: number }[];
    highRiskActions: any[];
  }> {
    const where = { createdAt: { gte: startDate, lte: endDate } };

    const [
      totalEvents,
      writeOps,
      logins,
      failedLogins,
      exports,
      configChanges,
      byModule,
      securityEvents,
      highRiskActions,
    ] = await Promise.all([
      this.model.count({ where }),
      this.model.count({ where: { ...where, action: { in: ["CREATE", "UPDATE", "DELETE"] } } }),
      this.model.count({ where: { ...where, action: "LOGIN" } }),
      this.model.count({ where: { ...where, action: "LOGIN_FAILED" } }),
      this.model.count({ where: { ...where, action: "EXPORT" } }),
      this.model.count({ where: { ...where, action: "CONFIG_CHANGE" } }),
      this.model.groupBy({
        by: ["entity"],
        where,
        _count: { id: true },
      }),
      this.model.groupBy({
        by: ["action"],
        where: {
          ...where,
          action: { in: ["LOGIN", "LOGIN_FAILED", "PASSWORD_CHANGED", "SESSION_INVALIDATE", "ROLE_CHANGE", "CONFIG_CHANGE"] },
        },
        _count: { id: true },
      }),
      this.model.findMany({
        where: {
          ...where,
          action: { in: ["DELETE", "CONFIG_CHANGE", "ROLE_CHANGE", "FACTORY_RESET", "SESSION_INVALIDATE"] },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          user: { select: { email: true, firstName: true, lastName: true, role: true } },
        },
      }),
    ]);

    return {
      period: { from: startDate.toISOString().split("T")[0], to: endDate.toISOString().split("T")[0] },
      totalEvents,
      writeOperations: writeOps,
      loginEvents: logins,
      failedLogins,
      dataExports: exports,
      configChanges,
      byModule: Object.fromEntries(byModule.map((m: any) => [m.entity, m._count.id])),
      securityEvents: securityEvents.map((s: any) => ({ action: s.action, count: s._count.id })),
      highRiskActions,
    };
  }

  async purgeOldLogs(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.model.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }

  async getSecurityAlerts(hours = 24): Promise<{
    failedLoginAttempts: number;
    suspiciousIPs: { ip: string; count: number }[];
    afterHoursActivity: number;
    bulkDeletes: any[];
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [failedLogins, suspiciousIPs, bulkDeletes] = await Promise.all([
      this.model.count({ where: { action: "LOGIN_FAILED", createdAt: { gte: since } } }),
      this.prisma.$queryRaw`
        SELECT ip_address as ip, COUNT(*)::int as count
        FROM audit_logs
        WHERE action = 'LOGIN_FAILED' AND created_at >= ${since}
        AND ip_address IS NOT NULL
        GROUP BY ip_address
        HAVING COUNT(*) >= 3
        ORDER BY count DESC
        LIMIT 20
      ` as Promise<any[]>,
      this.model.findMany({
        where: { action: "DELETE", createdAt: { gte: since } },
        include: { user: { select: { email: true } } },
        take: 20,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // After-hours: 10 PM to 6 AM IST
    const afterHoursActivity = await this.prisma.$queryRaw`
      SELECT COUNT(*)::int as count
      FROM audit_logs
      WHERE created_at >= ${since}
      AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata') NOT BETWEEN 6 AND 22
    ` as any[];

    return {
      failedLoginAttempts: failedLogins,
      suspiciousIPs: suspiciousIPs as any[],
      afterHoursActivity: afterHoursActivity[0]?.count || 0,
      bulkDeletes,
    };
  }
}

export const auditLogRepository = new AuditLogRepository();
