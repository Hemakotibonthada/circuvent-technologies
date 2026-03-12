// ──────────────────────────────────────────────────────────────
// Device Repository — IoT device queries, fleet management,
// heartbeat analytics, and alert aggregation.
// ──────────────────────────────────────────────────────────────

import { BaseRepository, PaginationParams, PaginatedResult } from "../repository.base";

export class DeviceRepository extends BaseRepository<"ioTDevice"> {
  constructor() { super("ioTDevice"); }

  async findByMac(macAddress: string): Promise<any | null> {
    return this.model.findUnique({ where: { macAddress } });
  }

  async findByCode(deviceCode: string): Promise<any | null> {
    return this.model.findUnique({ where: { deviceCode } });
  }

  async findByStatus(status: string, pagination: PaginationParams): Promise<PaginatedResult<any>> {
    return this.findPaginated(pagination, { status }, {
      project: { select: { id: true, name: true, code: true } },
      registeredBy: { select: { firstName: true, lastName: true } },
      _count: { select: { firmwareHistory: true, telemetryLogs: true, heartbeats: true, alerts: true } },
    });
  }

  async findByProject(projectId: string): Promise<any[]> {
    return this.model.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { telemetryLogs: true, alerts: true } } },
    });
  }

  async findOfflineDevices(thresholdMs: number = 120000): Promise<any[]> {
    const threshold = new Date(Date.now() - thresholdMs);
    return this.model.findMany({
      where: {
        status: "ONLINE",
        OR: [
          { lastHeartbeat: { lt: threshold } },
          { lastHeartbeat: null },
        ],
      },
    });
  }

  async getFleetSummary(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byProject: { projectName: string | null; count: number }[];
    firmwareDistribution: { version: string; count: number }[];
  }> {
    const [total, byStatusRaw, byProjectRaw, firmwareRaw] = await Promise.all([
      this.count(),
      this.model.groupBy({ by: ["status"], _count: { id: true } }),
      this.prisma.$queryRaw`
        SELECT p."name" AS "projectName", COUNT(d."id")::int AS count
        FROM iot_devices d
        LEFT JOIN projects p ON d."projectId" = p."id"
        GROUP BY p."name"
        ORDER BY count DESC
      ` as Promise<any[]>,
      this.model.groupBy({ by: ["firmwareVersion"], _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    ]);

    return {
      total,
      byStatus: Object.fromEntries(byStatusRaw.map((s: any) => [s.status, s._count.id])),
      byProject: byProjectRaw.map((p: any) => ({ projectName: p.projectName || "Unassigned", count: p.count })),
      firmwareDistribution: firmwareRaw.map((f: any) => ({ version: f.firmwareVersion, count: f._count.id })),
    };
  }

  async getRecentAlerts(limit = 20): Promise<any[]> {
    return this.prisma.deviceAlert.findMany({
      where: { isResolved: false },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { device: { select: { deviceCode: true, deviceName: true, status: true } } },
    });
  }

  async getUptimeStats(deviceId: string, days = 7): Promise<{
    totalHeartbeats: number;
    healthyPercentage: number;
    avgCpu: number;
    avgMemory: number;
    avgTemperature: number;
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const heartbeats = await this.prisma.deviceHeartbeat.findMany({
      where: { deviceId, timestamp: { gte: since } },
      select: { cpuUsage: true, memoryUsage: true, temperature: true, isHealthy: true },
    });

    if (heartbeats.length === 0) {
      return { totalHeartbeats: 0, healthyPercentage: 0, avgCpu: 0, avgMemory: 0, avgTemperature: 0 };
    }

    const healthy = heartbeats.filter((h) => h.isHealthy).length;
    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : 0;

    return {
      totalHeartbeats: heartbeats.length,
      healthyPercentage: Math.round((healthy / heartbeats.length) * 100),
      avgCpu: avg(heartbeats.filter((h) => h.cpuUsage).map((h) => Number(h.cpuUsage))),
      avgMemory: avg(heartbeats.filter((h) => h.memoryUsage).map((h) => Number(h.memoryUsage))),
      avgTemperature: avg(heartbeats.filter((h) => h.temperature).map((h) => Number(h.temperature))),
    };
  }
}

export const deviceRepository = new DeviceRepository();
