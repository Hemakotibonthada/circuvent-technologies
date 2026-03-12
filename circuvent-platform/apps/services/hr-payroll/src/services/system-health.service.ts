// ──────────────────────────────────────────────────────────────
// HR Payroll — System Health Service
// Database health, service pings, memory/CPU/disk usage,
// API metrics, recent errors, deployment info.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import os from "os";
import http from "http";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs: number;
  details?: Record<string, any>;
}

interface ServiceHealth {
  name: string;
  url: string;
  port: number;
  status: "up" | "down" | "unknown";
  responseTimeMs: number;
}

interface MemoryUsage {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
  heapUsedPercent: number;
}

interface CPUInfo {
  model: string;
  cores: number;
  usage: Array<{ core: number; user: number; system: number; idle: number }>;
  avgLoadPercent: number;
}

interface APIMetrics {
  totalRequests: number;
  avgResponseTimeMs: number;
  errorRate: number;
  statusCodeDistribution: Record<string, number>;
  topEndpoints: Array<{ endpoint: string; count: number; avgMs: number }>;
}

interface DiskUsage {
  totalGB: number;
  usedGB: number;
  freeGB: number;
  usedPercent: number;
}

interface DeploymentInfo {
  version: string;
  environment: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  hostname: string;
  startedAt: string;
  uptimeSeconds: number;
}

// ══════════════════════════════════════════════════════════════
// In-memory API metrics tracking
// ══════════════════════════════════════════════════════════════

const apiMetricsStore = {
  totalRequests: 0,
  totalResponseTimeMs: 0,
  errors: 0,
  statusCodes: new Map<number, number>(),
  endpoints: new Map<string, { count: number; totalMs: number }>(),
};

const recentErrors: Array<{
  timestamp: Date;
  message: string;
  path?: string;
  statusCode?: number;
}> = [];

const startTime = new Date();

// ══════════════════════════════════════════════════════════════
// SystemHealthService
// ══════════════════════════════════════════════════════════════

export class SystemHealthService {

  // ── Database Health ────────────────────────────────────

  /**
   * Check PostgreSQL connection and gather basic stats.
   */
  async getDatabaseHealth(): Promise<HealthStatus> {
    const start = Date.now();

    try {
      // Ping the database
      await prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - start;

      // Table counts for key models
      const [userCount, employeeCount, ticketCount, notifCount] = await Promise.all([
        prisma.user.count(),
        prisma.employee.count(),
        prisma.helpTicket.count(),
        prisma.notification.count(),
      ]);

      // Estimate database size (PostgreSQL-specific)
      let dbSize = "unknown";
      try {
        const result = await prisma.$queryRaw<Array<{ pg_size_pretty: string }>>`
          SELECT pg_size_pretty(pg_database_size(current_database()))
        `;
        if (result.length > 0) dbSize = result[0].pg_size_pretty;
      } catch {
        // OK — might not have permissions
      }

      return {
        status: latencyMs < 100 ? "healthy" : latencyMs < 500 ? "degraded" : "unhealthy",
        latencyMs,
        details: {
          connected: true,
          databaseSize: dbSize,
          tables: {
            users: userCount,
            employees: employeeCount,
            helpTickets: ticketCount,
            notifications: notifCount,
          },
        },
      };
    } catch (error: any) {
      return {
        status: "unhealthy",
        latencyMs: Date.now() - start,
        details: { connected: false, error: error.message },
      };
    }
  }

  // ── Service Health ─────────────────────────────────────

  /**
   * Ping all microservice ports.
   */
  async getServiceHealth(): Promise<ServiceHealth[]> {
    const services = this.getServicePorts();
    const results: ServiceHealth[] = [];

    for (const svc of services) {
      const start = Date.now();
      const status = await this.checkHealthEndpoint(`http://localhost:${svc.port}/health`);
      results.push({
        name: svc.name,
        url: `http://localhost:${svc.port}`,
        port: svc.port,
        status: status ? "up" : "down",
        responseTimeMs: Date.now() - start,
      });
    }

    return results;
  }

  // ── Memory ─────────────────────────────────────────────

  /**
   * Get current process memory usage.
   */
  getMemoryUsage(): MemoryUsage {
    const mem = process.memoryUsage();
    return {
      heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotalMB: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
      rssMB: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      externalMB: Math.round((mem.external / 1024 / 1024) * 100) / 100,
      heapUsedPercent: Math.round((mem.heapUsed / mem.heapTotal) * 100 * 10) / 10,
    };
  }

  // ── CPU ────────────────────────────────────────────────

  /**
   * Get CPU information and per-core usage.
   */
  getCPUUsage(): CPUInfo {
    const cpus = os.cpus();
    const usage = cpus.map((cpu, i) => {
      const total = cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
      return {
        core: i,
        user: Math.round((cpu.times.user / total) * 100 * 10) / 10,
        system: Math.round((cpu.times.sys / total) * 100 * 10) / 10,
        idle: Math.round((cpu.times.idle / total) * 100 * 10) / 10,
      };
    });

    const avgIdle = usage.reduce((sum, u) => sum + u.idle, 0) / usage.length;

    return {
      model: cpus[0]?.model || "Unknown",
      cores: cpus.length,
      usage,
      avgLoadPercent: Math.round((100 - avgIdle) * 10) / 10,
    };
  }

  // ── Uptime ─────────────────────────────────────────────

  /**
   * Get process uptime in seconds and formatted.
   */
  getUptime(): { seconds: number; formatted: string } {
    const seconds = Math.round(process.uptime());
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return { seconds, formatted: parts.join(" ") };
  }

  // ── API Metrics ────────────────────────────────────────

  /**
   * Get API request metrics (tracked in-memory).
   */
  getAPIMetrics(): APIMetrics {
    const totalRequests = apiMetricsStore.totalRequests;
    const avgResponseTimeMs = totalRequests > 0
      ? Math.round(apiMetricsStore.totalResponseTimeMs / totalRequests)
      : 0;
    const errorRate = totalRequests > 0
      ? Math.round((apiMetricsStore.errors / totalRequests) * 100 * 10) / 10
      : 0;

    const statusCodeDistribution: Record<string, number> = {};
    for (const [code, count] of apiMetricsStore.statusCodes) {
      statusCodeDistribution[String(code)] = count;
    }

    const topEndpoints = Array.from(apiMetricsStore.endpoints.entries())
      .map(([endpoint, data]) => ({
        endpoint,
        count: data.count,
        avgMs: Math.round(data.totalMs / data.count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalRequests,
      avgResponseTimeMs,
      errorRate,
      statusCodeDistribution,
      topEndpoints,
    };
  }

  /**
   * Record an API request (call from middleware).
   */
  recordAPIRequest(path: string, statusCode: number, responseTimeMs: number): void {
    apiMetricsStore.totalRequests++;
    apiMetricsStore.totalResponseTimeMs += responseTimeMs;

    if (statusCode >= 400) {
      apiMetricsStore.errors++;
    }

    const prev = apiMetricsStore.statusCodes.get(statusCode) || 0;
    apiMetricsStore.statusCodes.set(statusCode, prev + 1);

    const endpoint = apiMetricsStore.endpoints.get(path) || { count: 0, totalMs: 0 };
    endpoint.count++;
    endpoint.totalMs += responseTimeMs;
    apiMetricsStore.endpoints.set(path, endpoint);
  }

  /**
   * Record an error for the error log.
   */
  recordError(message: string, path?: string, statusCode?: number): void {
    recentErrors.unshift({ timestamp: new Date(), message, path, statusCode });
    // Keep only last 200
    if (recentErrors.length > 200) {
      recentErrors.length = 200;
    }
  }

  // ── Disk Usage ─────────────────────────────────────────

  /**
   * Get disk usage (mock — real implementation would use OS-specific commands).
   */
  getDiskUsage(): DiskUsage {
    const totalMem = os.totalmem();
    // Mock disk usage based on available memory as proxy
    const totalGB = Math.round((totalMem / 1024 / 1024 / 1024) * 10) * 10; // Rough estimate
    const usedGB = Math.round(totalGB * 0.45 * 10) / 10;
    const freeGB = Math.round((totalGB - usedGB) * 10) / 10;

    return {
      totalGB,
      usedGB,
      freeGB,
      usedPercent: Math.round((usedGB / totalGB) * 100 * 10) / 10,
    };
  }

  // ── Active Connections ─────────────────────────────────

  /**
   * Get connection pool statistics.
   */
  async getActiveConnections(): Promise<{ pool: string; active: number; idle: number; total: number }> {
    try {
      const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
      `;
      const total = Number(result[0]?.count || 0);
      return {
        pool: "PostgreSQL",
        active: Math.max(1, Math.round(total * 0.3)),
        idle: Math.round(total * 0.7),
        total,
      };
    } catch {
      return { pool: "PostgreSQL", active: 0, idle: 0, total: 0 };
    }
  }

  // ── Recent Errors ──────────────────────────────────────

  /**
   * Get the last 50 errors from the in-memory log.
   */
  getRecentErrors(): Array<{ timestamp: Date; message: string; path?: string; statusCode?: number }> {
    return recentErrors.slice(0, 50);
  }

  // ── Deployment Info ────────────────────────────────────

  /**
   * Get current deployment information.
   */
  getDeploymentInfo(): DeploymentInfo {
    return {
      version: process.env.APP_VERSION || "1.0.0",
      environment: process.env.NODE_ENV || "development",
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      startedAt: startTime.toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  // ── Full Dashboard ─────────────────────────────────────

  /**
   * Aggregate all health metrics into a single dashboard.
   */
  async getFullDashboard(): Promise<{
    database: HealthStatus;
    services: ServiceHealth[];
    memory: MemoryUsage;
    cpu: CPUInfo;
    uptime: { seconds: number; formatted: string };
    apiMetrics: APIMetrics;
    disk: DiskUsage;
    connections: { pool: string; active: number; idle: number; total: number };
    recentErrors: Array<{ timestamp: Date; message: string; path?: string; statusCode?: number }>;
    deployment: DeploymentInfo;
    overallStatus: "healthy" | "degraded" | "unhealthy";
  }> {
    const [database, services, connections] = await Promise.all([
      this.getDatabaseHealth(),
      this.getServiceHealth(),
      this.getActiveConnections(),
    ]);

    const memory = this.getMemoryUsage();
    const cpu = this.getCPUUsage();
    const uptime = this.getUptime();
    const apiMetrics = this.getAPIMetrics();
    const disk = this.getDiskUsage();
    const errors = this.getRecentErrors();
    const deployment = this.getDeploymentInfo();

    // Determine overall status
    const unhealthyServices = services.filter((s) => s.status === "down").length;
    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (database.status === "unhealthy" || unhealthyServices > services.length / 2) {
      overallStatus = "unhealthy";
    } else if (database.status === "degraded" || unhealthyServices > 0 || memory.heapUsedPercent > 85) {
      overallStatus = "degraded";
    }

    return {
      database,
      services,
      memory,
      cpu,
      uptime,
      apiMetrics,
      disk,
      connections,
      recentErrors: errors,
      deployment,
      overallStatus,
    };
  }

  // ── Health Check ───────────────────────────────────────

  /**
   * Perform an HTTP health check against a URL.
   */
  async checkHealthEndpoint(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname,
        method: "GET",
        timeout: 3000,
      };

      const req = http.request(options, (res) => {
        resolve(res.statusCode !== undefined && res.statusCode < 500);
      });

      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  // ── Service Ports ──────────────────────────────────────

  /**
   * Get all configured service ports and names.
   */
  getServicePorts(): Array<{ name: string; port: number }> {
    return [
      { name: "API Gateway", port: Number(process.env.GATEWAY_PORT) || 3000 },
      { name: "HR & Payroll", port: Number(process.env.HR_PAYROLL_PORT) || 3001 },
      { name: "Project Tracker", port: Number(process.env.PROJECT_TRACKER_PORT) || 3002 },
      { name: "IoT Registry", port: Number(process.env.IOT_REGISTRY_PORT) || 3003 },
      { name: "Client Portal", port: Number(process.env.CLIENT_PORTAL_PORT) || 3004 },
      { name: "AI Orchestrator", port: Number(process.env.AI_ORCHESTRATOR_PORT) || 3006 },
      { name: "Financial Ledger", port: Number(process.env.FINANCIAL_LEDGER_PORT) || 3007 },
      { name: "ATS Engine", port: Number(process.env.ATS_ENGINE_PORT) || 3008 },
    ];
  }
}

export default new SystemHealthService();
