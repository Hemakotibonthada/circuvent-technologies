// Lightweight structured logger — dependency-free, works in both the Node and
// Edge runtimes. Emits single-line JSON in production (machine-parseable for
// log aggregators) and readable text in development.
//
// Usage:
//   import { logger } from "@/lib/logger";
//   logger.info("order.created", { orderNo, total });
//   logger.error("payment.failed", { orderNo }, err);
//   const log = logger.child({ requestId, route }); log.warn("rate.limited");

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const MIN_LEVEL: Level =
  (process.env.LOG_LEVEL as Level) ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

const isProd = process.env.NODE_ENV === "production";

type Fields = Record<string, unknown>;

function serializeError(err: unknown): Fields {
  if (err instanceof Error) {
    return { errName: err.name, errMessage: err.message, stack: isProd ? undefined : err.stack };
  }
  if (err === undefined) return {};
  return { err: String(err) };
}

function emit(level: Level, ctx: Fields, msg: string, fields?: Fields, err?: unknown) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const record: Fields = {
    level,
    time: new Date().toISOString(),
    msg,
    ...ctx,
    ...fields,
    ...serializeError(err),
  };

  const line = isProd ? JSON.stringify(record) : formatDev(level, msg, record);
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(line);
}

function formatDev(level: Level, msg: string, record: Fields): string {
  const { level: _l, time: _t, msg: _m, ...rest } = record;
  void _l; void _t; void _m;
  const extras = Object.keys(rest).length ? " " + JSON.stringify(rest) : "";
  return `[${level.toUpperCase()}] ${msg}${extras}`;
}

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields, err?: unknown): void;
  child(ctx: Fields): Logger;
}

function make(ctx: Fields): Logger {
  return {
    debug: (msg, fields) => emit("debug", ctx, msg, fields),
    info: (msg, fields) => emit("info", ctx, msg, fields),
    warn: (msg, fields) => emit("warn", ctx, msg, fields),
    error: (msg, fields, err) => emit("error", ctx, msg, fields, err),
    child: (extra) => make({ ...ctx, ...extra }),
  };
}

export const logger = make({});
