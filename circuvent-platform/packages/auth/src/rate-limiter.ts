// ──────────────────────────────────────────────────────────────
// In-Memory Rate Limiter (per-user, per-IP)
// Provides configurable rate limiting without Redis dependency.
// For production, swap with a Redis-backed implementation.
// ──────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyExtractor: (req: Request) => string;
  message?: string;
}

class RateLimiterStore {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  get(key: string): RateLimitEntry | undefined {
    const entry = this.store.get(key);
    if (entry && entry.resetAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  increment(key: string, windowMs: number): RateLimitEntry {
    const existing = this.get(key);
    if (existing) {
      existing.count++;
      return existing;
    }

    const entry: RateLimitEntry = {
      count: 1,
      resetAt: Date.now() + windowMs,
    };
    this.store.set(key, entry);
    return entry;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt < now) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

const globalStore = new RateLimiterStore();

export function createRateLimiter(config: RateLimitConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = config.keyExtractor(req);
    const entry = globalStore.increment(key, config.windowMs);

    res.setHeader("X-RateLimit-Limit", config.maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, config.maxRequests - entry.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > config.maxRequests) {
      res.status(429).json({
        success: false,
        error: {
          code: 9004,
          message: config.message || "Rate limit exceeded. Try again later.",
          retryAfterMs: entry.resetAt - Date.now(),
        },
      });
      return;
    }

    next();
  };
}

// Pre-configured limiters
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
  keyExtractor: (req) => `auth:${req.ip}`,
  message: "Too many login attempts. Please try again in 15 minutes.",
});

export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 120,
  keyExtractor: (req) => `api:${(req as any).user?.userId || req.ip}`,
});

export const telemetryRateLimiter = createRateLimiter({
  windowMs: 1000, // 1 second
  maxRequests: 50,
  keyExtractor: (req) => `telemetry:${req.ip}`,
  message: "Telemetry ingestion rate exceeded.",
});
