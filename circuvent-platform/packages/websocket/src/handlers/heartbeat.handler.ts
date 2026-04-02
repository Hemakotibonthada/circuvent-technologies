// ──────────────────────────────────────────────────────────────
// Heartbeat Handler
// Processes device heartbeat messages received via WebSocket,
// evaluates health thresholds, triggers alerts.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { CircuventWSServer, AuthenticatedSocket } from "../ws.server";

const prisma = new PrismaClient();

const THRESHOLDS = {
  CPU_WARNING: 80,
  CPU_CRITICAL: 95,
  MEMORY_WARNING: 85,
  MEMORY_CRITICAL: 95,
  DISK_WARNING: 85,
  DISK_CRITICAL: 95,
  TEMPERATURE_WARNING: 70,
  TEMPERATURE_CRITICAL: 85,
  BATTERY_WARNING: 20,
  BATTERY_CRITICAL: 10,
};

interface HeartbeatData {
  deviceId: string;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  temperature?: number;
  uptime?: number;
  rssi?: number;
  batteryLevel?: number;
  metadata?: Record<string, unknown>;
}

interface AlertInfo {
  alertType: string;
  severity: "WARNING" | "CRITICAL";
  message: string;
  threshold: string;
  actualValue: string;
}

export function registerHeartbeatHandler(wsServer: CircuventWSServer): void {
  wsServer.onChannel("iot:heartbeat", async (_socket: AuthenticatedSocket, data: unknown) => {
    const heartbeat = data as HeartbeatData;
    if (!heartbeat.deviceId) return;

    try {
      // 1. Store heartbeat
      await prisma.deviceHeartbeat.create({
        data: {
          deviceId: heartbeat.deviceId,
          cpuUsage: heartbeat.cpuUsage,
          memoryUsage: heartbeat.memoryUsage,
          diskUsage: heartbeat.diskUsage,
          temperature: heartbeat.temperature,
          uptime: heartbeat.uptime,
          rssi: heartbeat.rssi,
          batteryLevel: heartbeat.batteryLevel,
          isHealthy: evaluateHealth(heartbeat).length === 0,
          metadata: heartbeat.metadata as any,
        },
      });

      // 2. Update device status
      await prisma.ioTDevice.update({
        where: { id: heartbeat.deviceId },
        data: { lastHeartbeat: new Date(), status: "ONLINE" },
      });

      // 3. Evaluate thresholds and create alerts
      const alerts = evaluateHealth(heartbeat);
      for (const alert of alerts) {
        const existingAlert = await prisma.deviceAlert.findFirst({
          where: {
            deviceId: heartbeat.deviceId,
            alertType: alert.alertType,
            isResolved: false,
          },
        });

        if (!existingAlert) {
          await prisma.deviceAlert.create({
            data: {
              deviceId: heartbeat.deviceId,
              alertType: alert.alertType,
              severity: alert.severity,
              message: alert.message,
              threshold: alert.threshold,
              actualValue: alert.actualValue,
            },
          });

          // Broadcast alert to subscribers
          wsServer.broadcast("iot:alerts", "new_alert", {
            deviceId: heartbeat.deviceId,
            ...alert,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // 4. Auto-resolve alerts that are no longer triggered
      const activeAlerts = await prisma.deviceAlert.findMany({
        where: { deviceId: heartbeat.deviceId, isResolved: false },
      });

      for (const active of activeAlerts) {
        const stillTriggered = alerts.some((a) => a.alertType === active.alertType);
        if (!stillTriggered) {
          await prisma.deviceAlert.update({
            where: { id: active.id },
            data: { isResolved: true, resolvedAt: new Date(), resolvedBy: "SYSTEM_AUTO" },
          });

          wsServer.broadcast("iot:alerts", "alert_resolved", {
            deviceId: heartbeat.deviceId,
            alertId: active.id,
            alertType: active.alertType,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // 5. Broadcast heartbeat to monitoring subscribers
      wsServer.broadcast("iot:heartbeat", "heartbeat_received", {
        deviceId: heartbeat.deviceId,
        isHealthy: alerts.length === 0,
        alertCount: alerts.length,
        metrics: {
          cpuUsage: heartbeat.cpuUsage,
          memoryUsage: heartbeat.memoryUsage,
          temperature: heartbeat.temperature,
          batteryLevel: heartbeat.batteryLevel,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[HEARTBEAT] Processing error:", error);
    }
  });
}

function evaluateHealth(heartbeat: HeartbeatData): AlertInfo[] {
  const alerts: AlertInfo[] = [];

  if (heartbeat.cpuUsage !== undefined) {
    if (heartbeat.cpuUsage >= THRESHOLDS.CPU_CRITICAL) {
      alerts.push({ alertType: "HIGH_CPU", severity: "CRITICAL", message: `CPU usage critical: ${heartbeat.cpuUsage}%`, threshold: `>= ${THRESHOLDS.CPU_CRITICAL}%`, actualValue: `${heartbeat.cpuUsage}%` });
    } else if (heartbeat.cpuUsage >= THRESHOLDS.CPU_WARNING) {
      alerts.push({ alertType: "HIGH_CPU", severity: "WARNING", message: `CPU usage high: ${heartbeat.cpuUsage}%`, threshold: `>= ${THRESHOLDS.CPU_WARNING}%`, actualValue: `${heartbeat.cpuUsage}%` });
    }
  }

  if (heartbeat.memoryUsage !== undefined) {
    if (heartbeat.memoryUsage >= THRESHOLDS.MEMORY_CRITICAL) {
      alerts.push({ alertType: "MEMORY_CRITICAL", severity: "CRITICAL", message: `Memory usage critical: ${heartbeat.memoryUsage}%`, threshold: `>= ${THRESHOLDS.MEMORY_CRITICAL}%`, actualValue: `${heartbeat.memoryUsage}%` });
    } else if (heartbeat.memoryUsage >= THRESHOLDS.MEMORY_WARNING) {
      alerts.push({ alertType: "HIGH_MEMORY", severity: "WARNING", message: `Memory usage high: ${heartbeat.memoryUsage}%`, threshold: `>= ${THRESHOLDS.MEMORY_WARNING}%`, actualValue: `${heartbeat.memoryUsage}%` });
    }
  }

  if (heartbeat.temperature !== undefined) {
    if (heartbeat.temperature >= THRESHOLDS.TEMPERATURE_CRITICAL) {
      alerts.push({ alertType: "HIGH_TEMP", severity: "CRITICAL", message: `Temperature critical: ${heartbeat.temperature}°C`, threshold: `>= ${THRESHOLDS.TEMPERATURE_CRITICAL}°C`, actualValue: `${heartbeat.temperature}°C` });
    } else if (heartbeat.temperature >= THRESHOLDS.TEMPERATURE_WARNING) {
      alerts.push({ alertType: "HIGH_TEMP", severity: "WARNING", message: `Temperature high: ${heartbeat.temperature}°C`, threshold: `>= ${THRESHOLDS.TEMPERATURE_WARNING}°C`, actualValue: `${heartbeat.temperature}°C` });
    }
  }

  if (heartbeat.batteryLevel !== undefined) {
    if (heartbeat.batteryLevel <= THRESHOLDS.BATTERY_CRITICAL) {
      alerts.push({ alertType: "LOW_BATTERY", severity: "CRITICAL", message: `Battery critical: ${heartbeat.batteryLevel}%`, threshold: `<= ${THRESHOLDS.BATTERY_CRITICAL}%`, actualValue: `${heartbeat.batteryLevel}%` });
    } else if (heartbeat.batteryLevel <= THRESHOLDS.BATTERY_WARNING) {
      alerts.push({ alertType: "LOW_BATTERY", severity: "WARNING", message: `Battery low: ${heartbeat.batteryLevel}%`, threshold: `<= ${THRESHOLDS.BATTERY_WARNING}%`, actualValue: `${heartbeat.batteryLevel}%` });
    }
  }

  if (heartbeat.diskUsage !== undefined && heartbeat.diskUsage >= THRESHOLDS.DISK_CRITICAL) {
    alerts.push({ alertType: "DISK_FULL", severity: "CRITICAL", message: `Disk usage critical: ${heartbeat.diskUsage}%`, threshold: `>= ${THRESHOLDS.DISK_CRITICAL}%`, actualValue: `${heartbeat.diskUsage}%` });
  }

  return alerts;
}
