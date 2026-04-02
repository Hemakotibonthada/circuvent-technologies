// ──────────────────────────────────────────────────────────────
// Circuvent Platform — System Constants
// Application-wide configuration defaults, limits, and
// feature flags.
// ──────────────────────────────────────────────────────────────

export const SYSTEM_CONSTANTS = {
  // ── Application ──
  APP_NAME: "Circuvent Technologies Platform",
  APP_VERSION: "2.0.0",
  APP_PHASE: "Phase 2 — Enterprise",

  // ── Pagination ──
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 200,
  MAX_EXPORT_LIMIT: 10000,

  // ── JWT ──
  JWT_ACCESS_EXPIRY: "15m",
  JWT_REFRESH_EXPIRY: "7d",
  JWT_SESSION_EXPIRY_DAYS: 7,

  // ── Rate Limiting ──
  AUTH_RATE_LIMIT: 10,                     // attempts per 15 min
  API_RATE_LIMIT: 120,                     // requests per minute
  TELEMETRY_RATE_LIMIT: 50,               // per second

  // ── File Limits ──
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,   // 10 MB
  MAX_PDF_SIZE_BYTES: 5 * 1024 * 1024,     // 5 MB
  ALLOWED_FILE_TYPES: ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/csv", "application/zip"],

  // ── Code Prefixes ──
  PREFIXES: {
    EMPLOYEE: "CIR-EMP",
    PROJECT: "PROJ",
    INVOICE: "INV",
    EXPENSE: "EXP",
    DEVICE: "DEV",
    TRAINING_JOB: "TJ",
    TRADING_BOT: "TB",
    RESOURCE: "RES",
  },

  // ── Service Ports ──
  PORTS: {
    GATEWAY: 3000,
    PROJECT_TRACKER: 3001,
    IOT_REGISTRY: 3002,
    HR_PAYROLL: 3003,
    CLIENT_PORTAL: 3004,
    WEB_DASHBOARD: 3005,
    AI_ORCHESTRATOR: 3006,
  },

  // ── Time Zones ──
  DEFAULT_TIMEZONE: "Asia/Kolkata",
  UTC_OFFSET: "+05:30",

  // ── Currencies ──
  BASE_CURRENCY: "INR",
  SUPPORTED_CURRENCIES: ["INR", "USD", "EUR", "GBP", "AED", "SGD", "JPY", "AUD", "CAD"] as const,

  // ── Feature Flags ──
  FEATURES: {
    WEBSOCKET_ENABLED: true,
    PDF_GENERATION_ENABLED: true,
    AI_ORCHESTRATOR_ENABLED: true,
    MULTI_CURRENCY_ENABLED: true,
    AUTO_ESCALATION_ENABLED: true,
    RND_AUTO_TAGGING_ENABLED: true,
    HEARTBEAT_MONITORING_ENABLED: true,
    AUDIT_LOGGING_ENABLED: true,
  },

  // ── Audit ──
  AUDIT_RETENTION_DAYS: 730,               // 2 years
  AUDIT_EXPORT_MAX_RECORDS: 50000,

  // ── Notification ──
  MAX_NOTIFICATIONS_PER_USER: 500,
  NOTIFICATION_CLEANUP_DAYS: 90,
} as const;

export type SupportedCurrency = typeof SYSTEM_CONSTANTS.SUPPORTED_CURRENCIES[number];
export type ServicePort = typeof SYSTEM_CONSTANTS.PORTS[keyof typeof SYSTEM_CONSTANTS.PORTS];
