// ──────────────────────────────────────────────────────────────
// IoT Registry — Validation Schemas
// ──────────────────────────────────────────────────────────────

import { z } from "zod";

const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

export const registerDeviceSchema = z.object({
  deviceName: z.string().min(1, "Device name is required").max(200),
  macAddress: z.string().regex(macRegex, "Invalid MAC address (use XX:XX:XX:XX:XX:XX format)"),
  ipAddress: z.string().optional(),
  firmwareVersion: z.string().min(1, "Firmware version is required").max(50),
  hardwareModel: z.string().max(200).optional(),
  projectId: z.string().cuid().optional().nullable(),
  location: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
});

export const updateDeviceSchema = registerDeviceSchema.partial().extend({
  status: z.enum(["REGISTERED", "PROVISIONED", "ONLINE", "OFFLINE", "MAINTENANCE", "DECOMMISSIONED"]).optional(),
});

export const firmwareUpdateSchema = z.object({
  toVersion: z.string().min(1, "Target version is required"),
  notes: z.string().max(1000).optional(),
});

export const telemetrySchema = z.object({
  deviceId: z.string().cuid(),
  payload: z.record(z.any()),
  logLevel: z.enum(["INFO", "WARN", "ERROR", "CRITICAL"]).default("INFO"),
});

export const batchTelemetrySchema = z.object({
  entries: z.array(telemetrySchema).min(1).max(100),
});
