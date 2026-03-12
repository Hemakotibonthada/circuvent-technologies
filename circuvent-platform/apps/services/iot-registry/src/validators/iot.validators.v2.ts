// ──────────────────────────────────────────────────────────────
// IoT Registry — Comprehensive Zod Validators (Phase 2)
// Validates MAC, IP, firmware semver, heartbeat payloads,
// command dispatch, telemetry batches, and alert configs.
// ──────────────────────────────────────────────────────────────

import { z } from "zod";

const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

// ── Device Registration ──

export const registerDeviceSchemaV2 = z.object({
  deviceName: z.string().min(2, "Device name min 2 chars").max(200),
  macAddress: z.string().regex(macRegex, "Invalid MAC address (use XX:XX:XX:XX:XX:XX)"),
  ipAddress: z.string().regex(ipv4Regex, "Invalid IPv4 address").optional().or(z.literal("")),
  firmwareVersion: z.string().regex(semverRegex, "Firmware must be semver (e.g., 1.0.0)"),
  hardwareModel: z.string().max(200).optional(),
  projectId: z.string().cuid("Invalid project ID").optional().nullable(),
  location: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  metadata: z.record(z.unknown()).optional(),
}).refine(
  (data) => {
    if (data.ipAddress) {
      const parts = data.ipAddress.split(".").map(Number);
      return parts.every((p) => p >= 0 && p <= 255);
    }
    return true;
  },
  { message: "IPv4 octets must be 0-255", path: ["ipAddress"] }
);

// ── Device Update ──

export const updateDeviceSchemaV2 = z.object({
  deviceName: z.string().min(2).max(200).optional(),
  status: z.enum(["REGISTERED", "PROVISIONED", "ONLINE", "OFFLINE", "MAINTENANCE", "DECOMMISSIONED"]).optional(),
  ipAddress: z.string().regex(ipv4Regex, "Invalid IPv4").optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  projectId: z.string().cuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

// ── Firmware Update ──

export const firmwareUpdateSchemaV2 = z.object({
  toVersion: z.string().regex(semverRegex, "Target version must be semver"),
  notes: z.string().max(1000).optional(),
  forceUpdate: z.boolean().default(false),
  scheduledAt: z.string().datetime().optional(),
  rollbackVersion: z.string().regex(semverRegex).optional(),
});

// ── Heartbeat Ingestion ──

export const heartbeatSchema = z.object({
  deviceId: z.string().cuid("Invalid device ID"),
  cpuUsage: z.number().min(0).max(100, "CPU usage must be 0-100%").optional(),
  memoryUsage: z.number().min(0).max(100, "Memory usage must be 0-100%").optional(),
  diskUsage: z.number().min(0).max(100, "Disk usage must be 0-100%").optional(),
  temperature: z.number().min(-50, "Temperature below -50°C invalid").max(200, "Temperature above 200°C invalid").optional(),
  uptime: z.number().int().nonnegative().optional(),
  rssi: z.number().int().min(-120).max(0).optional(),
  batteryLevel: z.number().min(0).max(100).optional(),
  firmwareVersion: z.string().regex(semverRegex).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ── Telemetry Ingestion ──

export const telemetryEntrySchema = z.object({
  deviceId: z.string().cuid(),
  payload: z.record(z.unknown()).refine(
    (p) => JSON.stringify(p).length <= 65536,
    "Payload exceeds 64KB limit"
  ),
  logLevel: z.enum(["INFO", "WARN", "ERROR", "CRITICAL"]).default("INFO"),
  timestamp: z.string().datetime().optional(),
});

export const telemetryBatchSchema = z.object({
  entries: z.array(telemetryEntrySchema)
    .min(1, "At least 1 entry required")
    .max(100, "Maximum 100 entries per batch"),
});

// ── Device Command ──

export const deviceCommandSchema = z.object({
  deviceId: z.string().cuid(),
  command: z.enum(["RESTART", "OTA_UPDATE", "CONFIG_PUSH", "DIAGNOSTIC", "FACTORY_RESET", "LOG_DUMP"]),
  payload: z.record(z.unknown()).optional(),
  timeout: z.number().int().positive().max(3600, "Timeout max 1 hour").default(300),
}).refine(
  (data) => {
    if (data.command === "OTA_UPDATE") {
      const payload = data.payload as any;
      if (!payload?.targetVersion) return false;
    }
    return true;
  },
  { message: "OTA_UPDATE requires targetVersion in payload", path: ["payload"] }
).refine(
  (data) => {
    if (data.command === "CONFIG_PUSH") {
      const payload = data.payload as any;
      if (!payload || Object.keys(payload).length === 0) return false;
    }
    return true;
  },
  { message: "CONFIG_PUSH requires non-empty payload", path: ["payload"] }
);

// ── Command Acknowledgment ──

export const commandAckSchema = z.object({
  status: z.enum(["ACKNOWLEDGED", "COMPLETED", "FAILED"]),
  response: z.record(z.unknown()).optional(),
  errorMessage: z.string().max(2000).optional(),
}).refine(
  (data) => {
    if (data.status === "FAILED" && !data.errorMessage && !data.response) return false;
    return true;
  },
  { message: "FAILED status requires errorMessage or response", path: ["errorMessage"] }
);

// ── Alert Configuration ──

export const alertConfigSchema = z.object({
  deviceId: z.string().cuid(),
  thresholds: z.object({
    cpuWarning: z.number().min(0).max(100).default(80),
    cpuCritical: z.number().min(0).max(100).default(95),
    memoryWarning: z.number().min(0).max(100).default(85),
    memoryCritical: z.number().min(0).max(100).default(95),
    temperatureWarning: z.number().min(-50).max(200).default(70),
    temperatureCritical: z.number().min(-50).max(200).default(85),
    batteryWarning: z.number().min(0).max(100).default(20),
    batteryCritical: z.number().min(0).max(100).default(10),
  }),
  notifyOnCritical: z.boolean().default(true),
  notifyOnWarning: z.boolean().default(false),
  notifyUserIds: z.array(z.string().cuid()).max(10).default([]),
}).refine(
  (data) => {
    const t = data.thresholds;
    return t.cpuWarning < t.cpuCritical &&
           t.memoryWarning < t.memoryCritical &&
           t.temperatureWarning < t.temperatureCritical &&
           t.batteryWarning > t.batteryCritical;
  },
  { message: "Warning thresholds must be less severe than critical thresholds" }
);

// ── Fleet Query Parameters ──

export const fleetQuerySchema = z.object({
  status: z.enum(["REGISTERED", "PROVISIONED", "ONLINE", "OFFLINE", "MAINTENANCE", "DECOMMISSIONED"]).optional(),
  projectId: z.string().cuid().optional(),
  location: z.string().max(200).optional(),
  firmwareVersion: z.string().optional(),
  isHealthy: z.enum(["true", "false"]).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20),
  sortBy: z.enum(["createdAt", "deviceName", "deviceCode", "lastHeartbeat", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
