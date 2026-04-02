// ──────────────────────────────────────────────────────────────
// Shared IoT Validators — reusable validation schemas
// for IoT payloads used across services and WebSocket.
// ──────────────────────────────────────────────────────────────

import { z } from "zod";

const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

export const macAddressSchema = z.string()
  .regex(macRegex, "Invalid MAC address format (XX:XX:XX:XX:XX:XX)")
  .transform((v) => v.toUpperCase().replace(/-/g, ":"));

export const firmwareVersionSchema = z.string()
  .regex(semverRegex, "Invalid firmware version (use semver: X.Y.Z)");

export const deviceStatusSchema = z.enum([
  "REGISTERED", "PROVISIONED", "ONLINE", "OFFLINE", "MAINTENANCE", "DECOMMISSIONED",
]);

export const telemetryLogLevelSchema = z.enum(["INFO", "WARN", "ERROR", "CRITICAL"]);

export const deviceCommandTypeSchema = z.enum([
  "RESTART", "OTA_UPDATE", "CONFIG_PUSH", "DIAGNOSTIC", "FACTORY_RESET", "LOG_DUMP",
]);

export const heartbeatMetricsSchema = z.object({
  cpuUsage: z.number().min(0).max(100).optional(),
  memoryUsage: z.number().min(0).max(100).optional(),
  diskUsage: z.number().min(0).max(100).optional(),
  temperature: z.number().min(-50).max(200).optional(),
  uptime: z.number().int().nonnegative().optional(),
  rssi: z.number().int().min(-120).max(0).optional(),
  batteryLevel: z.number().min(0).max(100).optional(),
});

export const alertSeveritySchema = z.enum(["INFO", "WARNING", "CRITICAL"]);

export const alertTypeSchema = z.enum([
  "OFFLINE", "HIGH_CPU", "MEMORY_CRITICAL", "HIGH_MEMORY",
  "HIGH_TEMP", "LOW_BATTERY", "DISK_FULL", "FIRMWARE_OUTDATED", "CUSTOM",
]);

export const deviceSearchParamsSchema = z.object({
  search: z.string().max(200).optional(),
  status: deviceStatusSchema.optional(),
  projectId: z.string().cuid().optional(),
  location: z.string().max(200).optional(),
  firmwareVersion: firmwareVersionSchema.optional(),
  hasAlerts: z.enum(["true", "false"]).optional(),
  isHealthy: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20),
  sortBy: z.enum(["createdAt", "deviceName", "deviceCode", "lastHeartbeat", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const telemetryQuerySchema = z.object({
  deviceId: z.string().cuid(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  logLevel: telemetryLogLevelSchema.optional(),
  limit: z.coerce.number().int().positive().max(1000).default(100),
  aggregation: z.enum(["none", "minute", "hour", "day"]).default("none"),
});

export const alertQuerySchema = z.object({
  deviceId: z.string().cuid().optional(),
  severity: alertSeveritySchema.optional(),
  alertType: alertTypeSchema.optional(),
  isResolved: z.enum(["true", "false"]).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const websocketAuthSchema = z.object({
  token: z.string().min(1, "Token required"),
  channels: z.array(z.string()).min(1).max(10).optional(),
});

export const wsMessageSchema = z.object({
  type: z.enum(["subscribe", "unsubscribe", "publish", "ping", "pong"]),
  channel: z.string().max(100).optional(),
  data: z.unknown().optional(),
  filters: z.record(z.string()).optional(),
});
