// ──────────────────────────────────────────────────────────────
// IoT Registry — Heartbeat Monitoring Service
// Monitors device health through periodic heartbeats,
// detects offline devices, evaluates thresholds, creates
// alerts, and provides aggregated health dashboards.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

const OFFLINE_THRESHOLD_MS = 120_000; // 2 minutes without heartbeat = offline
const STALE_THRESHOLD_MS = 300_000;   // 5 minutes = stale

const THRESHOLDS = {
  CPU_WARNING: 80, CPU_CRITICAL: 95,
  MEMORY_WARNING: 85, MEMORY_CRITICAL: 95,
  DISK_WARNING: 85, DISK_CRITICAL: 95,
  TEMPERATURE_WARNING: 70, TEMPERATURE_CRITICAL: 85,
  BATTERY_WARNING: 20, BATTERY_CRITICAL: 10,
};

export interface HeartbeatData {
  deviceId: string;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  temperature?: number;
  uptime?: number;
  rssi?: number;
  batteryLevel?: number;
  firmwareVersion?: string;
  metadata?: Record<string, unknown>;
}

export class HeartbeatService {
  /**
   * Process an incoming heartbeat from a device.
   */
  static async processHeartbeat(data: HeartbeatData): Promise<{
    stored: boolean;
    alerts: { type: string; severity: string; message: string }[];
    resolved: string[];
  }> {
    // Verify device exists
    const device = await prisma.ioTDevice.findUnique({ where: { id: data.deviceId } });
    if (!device) throw new Error("Device not found");
    if (device.status === "DECOMMISSIONED") throw new Error("Device is decommissioned");

    // Store heartbeat
    const alerts = this.evaluateThresholds(data);
    const isHealthy = alerts.length === 0;

    await prisma.deviceHeartbeat.create({
      data: {
        deviceId: data.deviceId,
        cpuUsage: data.cpuUsage,
        memoryUsage: data.memoryUsage,
        diskUsage: data.diskUsage,
        temperature: data.temperature,
        uptime: data.uptime,
        rssi: data.rssi,
        batteryLevel: data.batteryLevel,
        isHealthy,
        metadata: data.metadata as any,
      },
    });

    // Update device status to ONLINE
    await prisma.ioTDevice.update({
      where: { id: data.deviceId },
      data: {
        lastHeartbeat: new Date(),
        status: "ONLINE",
        ...(data.firmwareVersion ? { firmwareVersion: data.firmwareVersion } : {}),
      },
    });

    // Create new alerts
    const createdAlerts: { type: string; severity: string; message: string }[] = [];
    for (const alert of alerts) {
      const existing = await prisma.deviceAlert.findFirst({
        where: { deviceId: data.deviceId, alertType: alert.type, isResolved: false },
      });

      if (!existing) {
        await prisma.deviceAlert.create({
          data: {
            deviceId: data.deviceId,
            alertType: alert.type,
            severity: alert.severity,
            message: alert.message,
            threshold: alert.threshold,
            actualValue: alert.actualValue,
          },
        });
        createdAlerts.push(alert);
      }
    }

    // Auto-resolve conditions that are no longer triggered
    const resolved: string[] = [];
    const activeAlerts = await prisma.deviceAlert.findMany({
      where: { deviceId: data.deviceId, isResolved: false },
    });

    for (const active of activeAlerts) {
      const stillTriggered = alerts.some((a) => a.type === active.alertType);
      if (!stillTriggered) {
        await prisma.deviceAlert.update({
          where: { id: active.id },
          data: { isResolved: true, resolvedAt: new Date(), resolvedBy: "SYSTEM_AUTO" },
        });
        resolved.push(active.alertType);
      }
    }

    return { stored: true, alerts: createdAlerts, resolved };
  }

  /**
   * Scan for devices that have gone offline (no heartbeat within threshold).
   */
  static async detectOfflineDevices(): Promise<{
    newlyOffline: string[];
    totalOffline: number;
  }> {
    const threshold = new Date(Date.now() - OFFLINE_THRESHOLD_MS);

    // Find devices that were ONLINE but haven't sent a heartbeat
    const onlineDevices = await prisma.ioTDevice.findMany({
      where: {
        status: "ONLINE",
        OR: [
          { lastHeartbeat: { lt: threshold } },
          { lastHeartbeat: null },
        ],
      },
      select: { id: true, deviceCode: true, deviceName: true },
    });

    const newlyOffline: string[] = [];

    for (const device of onlineDevices) {
      await prisma.ioTDevice.update({
        where: { id: device.id },
        data: { status: "OFFLINE" },
      });

      // Create OFFLINE alert
      await prisma.deviceAlert.create({
        data: {
          deviceId: device.id,
          alertType: "OFFLINE",
          severity: "CRITICAL",
          message: `Device ${device.deviceName} (${device.deviceCode}) went offline`,
          threshold: `No heartbeat for ${OFFLINE_THRESHOLD_MS / 1000}s`,
          actualValue: "No heartbeat received",
        },
      });

      newlyOffline.push(device.deviceCode);
    }

    const totalOffline = await prisma.ioTDevice.count({ where: { status: "OFFLINE" } });

    return { newlyOffline, totalOffline };
  }

  /**
   * Get heartbeat history for a device.
   */
  static async getHistory(deviceId: string, params: {
    hours?: number;
    limit?: number;
  }): Promise<any[]> {
    const since = new Date(Date.now() - (params.hours || 24) * 60 * 60 * 1000);

    return prisma.deviceHeartbeat.findMany({
      where: { deviceId, timestamp: { gte: since } },
      orderBy: { timestamp: "desc" },
      take: params.limit || 200,
    });
  }

  /**
   * Get aggregated health metrics for all devices.
   */
  static async getHealthDashboard(): Promise<{
    totalDevices: number;
    online: number;
    offline: number;
    healthy: number;
    unhealthy: number;
    averageMetrics: {
      avgCpu: number;
      avgMemory: number;
      avgTemperature: number;
    };
    criticalAlerts: number;
    warningAlerts: number;
    devicesNeedingAttention: any[];
  }> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [
      totalDevices, online, offline,
      recentHeartbeats,
      criticalAlerts, warningAlerts,
      unhealthyDevices,
    ] = await Promise.all([
      prisma.ioTDevice.count(),
      prisma.ioTDevice.count({ where: { status: "ONLINE" } }),
      prisma.ioTDevice.count({ where: { status: "OFFLINE" } }),
      prisma.deviceHeartbeat.findMany({
        where: { timestamp: { gte: oneHourAgo } },
        select: { cpuUsage: true, memoryUsage: true, temperature: true, deviceId: true },
        distinct: ["deviceId"],
        orderBy: { timestamp: "desc" },
      }),
      prisma.deviceAlert.count({ where: { severity: "CRITICAL", isResolved: false } }),
      prisma.deviceAlert.count({ where: { severity: "WARNING", isResolved: false } }),
      prisma.deviceAlert.findMany({
        where: { isResolved: false, severity: "CRITICAL" },
        include: { device: { select: { deviceCode: true, deviceName: true, status: true } } },
        take: 10,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Calculate averages
    const cpuValues = recentHeartbeats.filter((h) => h.cpuUsage).map((h) => Number(h.cpuUsage));
    const memValues = recentHeartbeats.filter((h) => h.memoryUsage).map((h) => Number(h.memoryUsage));
    const tempValues = recentHeartbeats.filter((h) => h.temperature).map((h) => Number(h.temperature));

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : 0;

    const healthyCount = recentHeartbeats.filter((h) => {
      const cpu = Number(h.cpuUsage || 0);
      const mem = Number(h.memoryUsage || 0);
      return cpu < THRESHOLDS.CPU_WARNING && mem < THRESHOLDS.MEMORY_WARNING;
    }).length;

    return {
      totalDevices, online, offline,
      healthy: healthyCount,
      unhealthy: recentHeartbeats.length - healthyCount,
      averageMetrics: { avgCpu: avg(cpuValues), avgMemory: avg(memValues), avgTemperature: avg(tempValues) },
      criticalAlerts, warningAlerts,
      devicesNeedingAttention: unhealthyDevices.map((a) => ({
        alertId: a.id,
        deviceCode: a.device.deviceCode,
        deviceName: a.device.deviceName,
        alertType: a.alertType,
        severity: a.severity,
        message: a.message,
        since: a.createdAt,
      })),
    };
  }

  /**
   * Get alerts for a device with optional filtering.
   */
  static async getAlerts(deviceId: string, params: {
    resolved?: boolean;
    severity?: string;
    limit?: number;
  }): Promise<any[]> {
    const where: any = { deviceId };
    if (params.resolved !== undefined) where.isResolved = params.resolved;
    if (params.severity) where.severity = params.severity;

    return prisma.deviceAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params.limit || 50,
    });
  }

  /**
   * Manually resolve an alert.
   */
  static async resolveAlert(alertId: string, resolvedBy: string): Promise<any> {
    const alert = await prisma.deviceAlert.update({
      where: { id: alertId },
      data: { isResolved: true, resolvedAt: new Date(), resolvedBy },
    });

    await createAuditLog({
      userId: resolvedBy,
      action: "UPDATE",
      entity: "DeviceAlert",
      entityId: alertId,
      newValue: { isResolved: true },
    });

    return alert;
  }

  private static evaluateThresholds(data: HeartbeatData): { type: string; severity: string; message: string; threshold: string; actualValue: string }[] {
    const alerts: { type: string; severity: string; message: string; threshold: string; actualValue: string }[] = [];

    if (data.cpuUsage !== undefined) {
      if (data.cpuUsage >= THRESHOLDS.CPU_CRITICAL) {
        alerts.push({ type: "HIGH_CPU", severity: "CRITICAL", message: `CPU usage critical: ${data.cpuUsage}%`, threshold: `>= ${THRESHOLDS.CPU_CRITICAL}%`, actualValue: `${data.cpuUsage}%` });
      } else if (data.cpuUsage >= THRESHOLDS.CPU_WARNING) {
        alerts.push({ type: "HIGH_CPU", severity: "WARNING", message: `CPU usage high: ${data.cpuUsage}%`, threshold: `>= ${THRESHOLDS.CPU_WARNING}%`, actualValue: `${data.cpuUsage}%` });
      }
    }

    if (data.memoryUsage !== undefined) {
      if (data.memoryUsage >= THRESHOLDS.MEMORY_CRITICAL) {
        alerts.push({ type: "MEMORY_CRITICAL", severity: "CRITICAL", message: `Memory critical: ${data.memoryUsage}%`, threshold: `>= ${THRESHOLDS.MEMORY_CRITICAL}%`, actualValue: `${data.memoryUsage}%` });
      } else if (data.memoryUsage >= THRESHOLDS.MEMORY_WARNING) {
        alerts.push({ type: "HIGH_MEMORY", severity: "WARNING", message: `Memory high: ${data.memoryUsage}%`, threshold: `>= ${THRESHOLDS.MEMORY_WARNING}%`, actualValue: `${data.memoryUsage}%` });
      }
    }

    if (data.temperature !== undefined && data.temperature >= THRESHOLDS.TEMPERATURE_CRITICAL) {
      alerts.push({ type: "HIGH_TEMP", severity: "CRITICAL", message: `Temperature critical: ${data.temperature}°C`, threshold: `>= ${THRESHOLDS.TEMPERATURE_CRITICAL}°C`, actualValue: `${data.temperature}°C` });
    }

    if (data.batteryLevel !== undefined && data.batteryLevel <= THRESHOLDS.BATTERY_CRITICAL) {
      alerts.push({ type: "LOW_BATTERY", severity: "CRITICAL", message: `Battery critical: ${data.batteryLevel}%`, threshold: `<= ${THRESHOLDS.BATTERY_CRITICAL}%`, actualValue: `${data.batteryLevel}%` });
    }

    return alerts;
  }
}
