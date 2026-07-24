// Standard wrapper for API route handlers.
//
// Gives every route: a correlation id, structured request/response/error logging,
// a consistent JSON error envelope, method guarding, and optional rate limiting —
// so individual routes stay small and behave uniformly. Dependency-free.
//
// Usage:
//   export const POST = withApi(async ({ req, json, fail, log }) => {
//     const body = await req.json();
//     if (!body.email) return fail("email required", 400);
//     log.info("did.thing");
//     return json({ ok: true });
//   }, { methods: ["POST"], rateLimit: "contact" });

import { NextResponse } from "next/server";
import { logger, type Logger } from "./logger";
import { rateLimit } from "./rate-limit";

export interface ApiContext {
  req: Request;
  requestId: string;
  ip: string;
  log: Logger;
  /** JSON success response helper. */
  json: (data: unknown, init?: number | ResponseInit) => NextResponse;
  /** JSON error response helper with a consistent envelope. */
  fail: (message: string, status?: number, extra?: Record<string, unknown>) => NextResponse;
}

export interface ApiOptions {
  /** Allowed HTTP methods; a mismatch returns 405. */
  methods?: string[];
  /** Rate-limit bucket key (see rate-limit.ts). Omit to disable. */
  rateLimit?: string;
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function makeRequestId(req: Request): string {
  return (
    req.headers.get("x-request-id") ||
    (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2))
  );
}

function jsonResponse(requestId: string, data: unknown, init?: number | ResponseInit): NextResponse {
  const resInit: ResponseInit = typeof init === "number" ? { status: init } : init ?? {};
  const res = NextResponse.json(data as object, resInit);
  res.headers.set("x-request-id", requestId);
  return res;
}

export function withApi(
  handler: (ctx: ApiContext) => Promise<Response> | Response,
  opts: ApiOptions = {}
) {
  return async (req: Request): Promise<Response> => {
    const requestId = makeRequestId(req);
    const ip = clientIp(req);
    const method = req.method.toUpperCase();
    const route = new URL(req.url).pathname;
    const log = logger.child({ requestId, route, method });

    const json = (data: unknown, init?: number | ResponseInit) => jsonResponse(requestId, data, init);
    const fail = (message: string, status = 400, extra?: Record<string, unknown>) => {
      if (status >= 500) log.error("request.failed", { status, message, ...extra });
      else log.warn("request.rejected", { status, message });
      return jsonResponse(requestId, { success: false, error: message, requestId, ...extra }, status);
    };

    try {
      if (opts.methods && !opts.methods.includes(method)) {
        return fail(`Method ${method} not allowed`, 405, { allow: opts.methods });
      }

      if (opts.rateLimit) {
        const { ok, retryAfter } = rateLimit(opts.rateLimit, ip);
        if (!ok) {
          const res = fail("Too many requests. Please try again shortly.", 429, { retryAfter });
          if (retryAfter) res.headers.set("Retry-After", String(retryAfter));
          return res;
        }
      }

      const started = Date.now();
      const res = await handler({ req, requestId, ip, log, json, fail });
      res.headers.set("x-request-id", requestId);
      log.info("request.completed", { status: res.status, ms: Date.now() - started });
      return res;
    } catch (err) {
      log.error("request.threw", {}, err);
      return fail("Internal server error", 500, {});
    }
  };
}

/**
 * Minimal, dependency-free body validation. `spec` maps each field to a rule.
 * Returns typed data or a list of errors — no external schema library needed.
 */
export type FieldRule = {
  type?: "string" | "number" | "boolean" | "email";
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validate<T extends Record<string, unknown>>(
  body: unknown,
  spec: Record<string, FieldRule>
): { ok: true; data: T } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const src = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  for (const [key, rule] of Object.entries(spec)) {
    const raw = src[key];
    const present = raw !== undefined && raw !== null && raw !== "";
    if (!present) {
      if (rule.required) errors[key] = `${key} is required.`;
      continue;
    }
    const type = rule.type ?? "string";
    if (type === "number") {
      const n = Number(raw);
      if (Number.isNaN(n)) { errors[key] = `${key} must be a number.`; continue; }
      if (rule.min !== undefined && n < rule.min) errors[key] = `${key} must be >= ${rule.min}.`;
      if (rule.max !== undefined && n > rule.max) errors[key] = `${key} must be <= ${rule.max}.`;
      data[key] = n;
    } else if (type === "boolean") {
      data[key] = Boolean(raw);
    } else {
      const s = String(raw);
      if (rule.min !== undefined && s.length < rule.min) errors[key] = `${key} must be at least ${rule.min} characters.`;
      if (rule.max !== undefined && s.length > rule.max) errors[key] = `${key} must be at most ${rule.max} characters.`;
      if (type === "email" && !EMAIL_RE.test(s)) errors[key] = `${key} must be a valid email.`;
      if (rule.pattern && !rule.pattern.test(s)) errors[key] = `${key} has an invalid format.`;
      data[key] = s;
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: data as T };
}
