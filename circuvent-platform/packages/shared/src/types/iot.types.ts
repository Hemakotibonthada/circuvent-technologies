// ──────────────────────────────────────────────────────────────
// Circuvent Platform — IoT Domain Types
// Device telemetry, heartbeat, commands, alerts.
// ──────────────────────────────────────────────────────────────

export interface HeartbeatPayload {
  deviceId: string;
  timestamp: string;
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

export interface HeartbeatEvaluation {
  isHealthy: boolean;
  alerts: AlertTrigger[];
}

export interface AlertTrigger {
  alertType: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  message: string;
  threshold: string;
  actualValue: string;
}

export const HEARTBEAT_THRESHOLDS = {
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
  HEARTBEAT_TIMEOUT_SECONDS: 120,
  HEARTBEAT_STALE_SECONDS: 300,
} as const;

export interface DeviceCommandPayload {
  command: "RESTART" | "OTA_UPDATE" | "CONFIG_PUSH" | "DIAGNOSTIC" | "FACTORY_RESET" | "LOG_DUMP";
  payload?: Record<string, unknown>;
  timeout?: number;
}

export interface TelemetryBatchEntry {
  deviceId: string;
  payload: Record<string, unknown>;
  logLevel: "INFO" | "WARN" | "ERROR" | "CRITICAL";
  timestamp?: string;
}

export interface DeviceDashboardSummary {
  total: number;
  online: number;
  offline: number;
  maintenance: number;
  registered: number;
  decommissioned: number;
  onlinePercentage: number;
  averageCpuUsage: number;
  averageMemoryUsage: number;
  criticalAlerts: number;
  devicesNeedingAttention: string[];
}

export interface WebSocketMessage<T = unknown> {
  channel: string;
  event: string;
  data: T;
  timestamp: string;
  deviceId?: string;
  requestId?: string;
}

export type WSChannel = "iot:telemetry" | "iot:heartbeat" | "iot:alerts" | "iot:commands" | "notifications" | "gpu:monitor";

export interface WSSubscription {
  channel: WSChannel;
  filters?: Record<string, string>;
}
