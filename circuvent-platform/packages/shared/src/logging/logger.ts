// ══════════════════════════════════════════════════════════════════════════════
// Circuvent Platform — Structured JSON Logger
// Production-grade logging with structured JSON output, log levels,
// correlation ID tracking, and performance timing.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Log severity levels ordered by priority.
 */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
}

/** String labels for each log level */
const LOG_LABELS: Record<LogLevel, string> = {
  [LogLevel.TRACE]: "TRACE",
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.FATAL]: "FATAL",
};

/**
 * Structured log entry format.
 * Designed for consumption by log aggregators (ELK, Datadog, CloudWatch).
 */
export interface LogEntry {
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Log level string */
  level: string;
  /** The log message */
  message: string;
  /** Service name (e.g., "hr-payroll", "iot-registry") */
  service: string;
  /** Correlation ID for distributed tracing */
  correlationId?: string;
  /** Request ID */
  requestId?: string;
  /** User ID if available */
  userId?: string;
  /** Duration in milliseconds (for performance logs) */
  durationMs?: number;
  /** Error details if present */
  error?: {
    name: string;
    message: string;
    code?: number;
    stack?: string;
  };
  /** Additional structured context */
  context?: Record<string, unknown>;
}

/**
 * Logger configuration.
 */
export interface LoggerConfig {
  /** Service name included in every log entry */
  service: string;
  /** Minimum log level (defaults to INFO in production, DEBUG in dev) */
  minLevel?: LogLevel;
  /** Whether to pretty-print JSON (dev mode) */
  pretty?: boolean;
  /** Whether to include stack traces in error logs */
  includeStacks?: boolean;
}

/**
 * Structured Logger class for the Circuvent Platform.
 *
 * @example
 * ```ts
 * const logger = new Logger({ service: "iot-registry" });
 *
 * logger.info("Device registered", { deviceId: "xyz", mac: "AA:BB:CC:DD:EE:FF" });
 * logger.error("Firmware update failed", new Error("CRC mismatch"), { deviceId: "xyz" });
 *
 * // Performance timing
 * const timer = logger.startTimer("processtelemetry");
 * await processTelemetry(payload);
 * timer.end({ deviceId: "xyz", readings: 42 });
 * ```
 */
export class Logger {
  private readonly config: Required<LoggerConfig>;

  constructor(config: LoggerConfig) {
    this.config = {
      minLevel: process.env.NODE_ENV === "production" ? LogLevel.INFO : LogLevel.DEBUG,
      pretty: process.env.NODE_ENV !== "production",
      includeStacks: process.env.NODE_ENV !== "production",
      ...config,
    };
  }

  /** Log at TRACE level */
  public trace(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, undefined, context);
  }

  /** Log at DEBUG level */
  public debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, undefined, context);
  }

  /** Log at INFO level */
  public info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, undefined, context);
  }

  /** Log at WARN level */
  public warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, undefined, context);
  }

  /** Log at ERROR level with optional Error object */
  public error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, error, context);
  }

  /** Log at FATAL level — system is going down */
  public fatal(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(LogLevel.FATAL, message, error, context);
  }

  /**
   * Creates a child logger with additional default context.
   * Useful for per-request or per-operation loggers.
   *
   * @returns A new Logger with merged context
   */
  public child(context: { correlationId?: string; requestId?: string; userId?: string }): ChildLogger {
    return new ChildLogger(this, context);
  }

  /**
   * Starts a performance timer. Call `.end()` on the returned object
   * to log the duration.
   *
   * @param operation Name of the operation being timed
   * @returns Timer object with `.end()` method
   */
  public startTimer(operation: string): { end: (context?: Record<string, unknown>) => void } {
    const start = process.hrtime.bigint();
    return {
      end: (context?: Record<string, unknown>) => {
        const elapsed = Number(process.hrtime.bigint() - start) / 1_000_000; // Convert ns to ms
        this.info(`${operation} completed`, {
          ...context,
          durationMs: Number(elapsed.toFixed(2)),
          operation,
        });
      },
    };
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  public log(
    level: LogLevel,
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
    meta?: { correlationId?: string; requestId?: string; userId?: string },
  ): void {
    if (level < this.config.minLevel) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LOG_LABELS[level],
      message,
      service: this.config.service,
      ...meta,
      ...(context?.durationMs !== undefined ? { durationMs: context.durationMs as number } : {}),
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        ...(this.config.includeStacks && error.stack ? { stack: error.stack } : {}),
        ...((error as any).code ? { code: (error as any).code } : {}),
      };
    }

    if (context) {
      const { durationMs, ...rest } = context;
      if (Object.keys(rest).length > 0) entry.context = rest;
    }

    const output = this.config.pretty
      ? JSON.stringify(entry, null, 2)
      : JSON.stringify(entry);

    if (level >= LogLevel.ERROR) {
      console.error(output);
    } else if (level >= LogLevel.WARN) {
      console.warn(output);
    } else {
      console.log(output);
    }
  }
}

/**
 * Child logger that inherits parent config and adds per-request context.
 */
class ChildLogger {
  constructor(
    private parent: Logger,
    private meta: { correlationId?: string; requestId?: string; userId?: string },
  ) {}

  public trace(msg: string, ctx?: Record<string, unknown>): void { this.parent.log(LogLevel.TRACE, msg, undefined, ctx, this.meta); }
  public debug(msg: string, ctx?: Record<string, unknown>): void { this.parent.log(LogLevel.DEBUG, msg, undefined, ctx, this.meta); }
  public info(msg: string, ctx?: Record<string, unknown>): void { this.parent.log(LogLevel.INFO, msg, undefined, ctx, this.meta); }
  public warn(msg: string, ctx?: Record<string, unknown>): void { this.parent.log(LogLevel.WARN, msg, undefined, ctx, this.meta); }
  public error(msg: string, err?: Error, ctx?: Record<string, unknown>): void { this.parent.log(LogLevel.ERROR, msg, err, ctx, this.meta); }
  public fatal(msg: string, err?: Error, ctx?: Record<string, unknown>): void { this.parent.log(LogLevel.FATAL, msg, err, ctx, this.meta); }
  public startTimer(operation: string) { return this.parent.startTimer(operation); }
}

/**
 * Singleton logger instances per service.
 * Call `createLogger` once at service startup.
 */
const loggers = new Map<string, Logger>();

/**
 * Creates or retrieves a Logger instance for a service.
 * @param service The service name
 */
export function createLogger(service: string): Logger {
  if (!loggers.has(service)) {
    loggers.set(service, new Logger({ service }));
  }
  return loggers.get(service)!;
}
