// ──────────────────────────────────────────────────────────────
// Circuvent Platform — IoT System Constants
// Device monitoring thresholds, alert rules, telemetry
// retention, and protocol configurations.
// ──────────────────────────────────────────────────────────────

export const IOT_CONSTANTS = {
  // ── Heartbeat ──
  HEARTBEAT_INTERVAL_SECONDS: 30,
  HEARTBEAT_TIMEOUT_SECONDS: 120,          // Mark offline after 2 minutes
  HEARTBEAT_STALE_SECONDS: 300,            // Stale after 5 minutes
  HEARTBEAT_RETENTION_DAYS: 90,            // Keep heartbeat data for 90 days

  // ── Health Thresholds ──
  THRESHOLDS: {
    CPU: { WARNING: 80, CRITICAL: 95 },
    MEMORY: { WARNING: 85, CRITICAL: 95 },
    DISK: { WARNING: 85, CRITICAL: 95 },
    TEMPERATURE: { WARNING: 70, CRITICAL: 85 },
    BATTERY: { WARNING: 20, CRITICAL: 10 },
    RSSI: { WARNING: -70, CRITICAL: -80 },  // dBm
  },

  // ── Telemetry ──
  TELEMETRY_MAX_BATCH_SIZE: 100,
  TELEMETRY_RETENTION_DAYS: 365,           // 1 year
  TELEMETRY_INGESTION_RATE_LIMIT: 50,      // Per second per device
  TELEMETRY_MAX_PAYLOAD_BYTES: 65536,      // 64KB

  // ── Commands ──
  COMMAND_TIMEOUT_MINUTES: 30,
  VALID_COMMANDS: ["RESTART", "OTA_UPDATE", "CONFIG_PUSH", "DIAGNOSTIC", "FACTORY_RESET", "LOG_DUMP"] as const,
  COMMAND_REQUIRES_ADMIN: ["FACTORY_RESET"] as const,

  // ── Firmware ──
  FIRMWARE_MIN_VERSION: "1.0.0",
  FIRMWARE_DOWNGRADE_ALLOWED: false,

  // ── Alert Auto-Resolve ──
  ALERT_AUTO_RESOLVE: true,
  ALERT_RETENTION_DAYS: 180,

  // ── Fleet Limits ──
  MAX_DEVICES_PER_PROJECT: 500,
  MAX_TELEMETRY_ENTRIES_PER_QUERY: 1000,

  // ── WebSocket Channels ──
  WS_CHANNELS: {
    TELEMETRY: "iot:telemetry",
    HEARTBEAT: "iot:heartbeat",
    ALERTS: "iot:alerts",
    COMMANDS: "iot:commands",
  },
} as const;

export const DEVICE_STATUS_COLORS: Record<string, string> = {
  REGISTERED: "#a78bfa",    // purple
  PROVISIONED: "#22d3ee",   // cyan
  ONLINE: "#22c55e",        // green
  OFFLINE: "#ef4444",       // red
  MAINTENANCE: "#f59e0b",   // amber
  DECOMMISSIONED: "#64748b", // slate
};

export const ALERT_SEVERITY_PRIORITY: Record<string, number> = {
  CRITICAL: 1,
  WARNING: 2,
  INFO: 3,
};

export type ValidCommand = typeof IOT_CONSTANTS.VALID_COMMANDS[number];
