// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Rate Limiter Utilities
// Token-bucket and sliding-window rate limiters with in-memory
// storage, automatic cleanup, factory functions for common
// presets, and Express middleware adapter.
// ──────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export interface RateLimiterOptions {
  /** Maximum number of requests allowed in the window. */
  maxRequests: number;
  /** Time window in milliseconds. */
  windowMs: number;
  /** Message returned when rate limit is exceeded. */
  message?: string;
  /** Key extractor: defaults to IP address. */
  keyExtractor?: (req: Request) => string;
  /** Skip rate limiting for certain requests. */
  skip?: (req: Request) => boolean;
  /** Cleanup interval in milliseconds (default: 60s). */
  cleanupIntervalMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  limit: number;
}

// ══════════════════════════════════════════════════════════════
// Token Bucket Rate Limiter
// ══════════════════════════════════════════════════════════════

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Token Bucket algorithm: tokens are added at a constant rate,
 * and each request consumes one token. Allows short bursts up
 * to the bucket capacity.
 */
export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(
    maxTokens: number,
    windowMs: number,
    cleanupIntervalMs: number = 60_000
  ) {
    this.maxTokens = maxTokens;
    this.refillRate = maxTokens / windowMs;
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    // Allow GC if this object is otherwise unreachable
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  /**
   * Attempt to consume one token for the given key.
   */
  consume(key: string): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + elapsed * this.refillRate);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        retryAfterMs: 0,
        limit: this.maxTokens,
      };
    }

    const retryAfterMs = Math.ceil((1 - bucket.tokens) / this.refillRate);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
      limit: this.maxTokens,
    };
  }

  /** Reset a specific key's bucket. */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Remove stale entries that have fully refilled. */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      const elapsed = now - bucket.lastRefill;
      const refilled = bucket.tokens + elapsed * this.refillRate;
      if (refilled >= this.maxTokens) {
        this.buckets.delete(key);
      }
    }
  }

  /** Stop the cleanup interval. */
  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.buckets.clear();
  }
}

// ══════════════════════════════════════════════════════════════
// Sliding Window Rate Limiter
// ══════════════════════════════════════════════════════════════

interface SlidingWindowEntry {
  timestamps: number[];
}

/**
 * Sliding Window algorithm: tracks request timestamps within
 * a rolling window. More accurate than fixed-window counters
 * but uses more memory per key.
 */
export class SlidingWindowRateLimiter {
  private entries = new Map<string, SlidingWindowEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(
    maxRequests: number,
    windowMs: number,
    cleanupIntervalMs: number = 60_000
  ) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  /**
   * Check and record a request for the given key.
   */
  consume(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    let entry = this.entries.get(key);

    if (!entry) {
      entry = { timestamps: [] };
      this.entries.set(key, entry);
    }

    // Remove expired timestamps
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    if (entry.timestamps.length < this.maxRequests) {
      entry.timestamps.push(now);
      return {
        allowed: true,
        remaining: this.maxRequests - entry.timestamps.length,
        retryAfterMs: 0,
        limit: this.maxRequests,
      };
    }

    // Calculate when the earliest timestamp in the window will expire
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + this.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, retryAfterMs),
      limit: this.maxRequests,
    };
  }

  /** Reset a specific key. */
  reset(key: string): void {
    this.entries.delete(key);
  }

  /** Remove entries with no recent timestamps. */
  private cleanup(): void {
    const windowStart = Date.now() - this.windowMs;
    for (const [key, entry] of this.entries) {
      entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);
      if (entry.timestamps.length === 0) {
        this.entries.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.entries.clear();
  }
}

// ══════════════════════════════════════════════════════════════
// Factory Functions
// ══════════════════════════════════════════════════════════════

/**
 * Create a rate limiter middleware from options.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const limiter = new SlidingWindowRateLimiter(
    options.maxRequests,
    options.windowMs,
    options.cleanupIntervalMs
  );

  const keyFn = options.keyExtractor || ((req: Request) => req.ip || req.socket.remoteAddress || "unknown");
  const message = options.message || "Too many requests. Please try again later.";
  const skipFn = options.skip || (() => false);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (skipFn(req)) return next();

    const key = keyFn(req);
    const result = limiter.consume(key);

    res.setHeader("X-RateLimit-Limit", result.limit);
    res.setHeader("X-RateLimit-Remaining", result.remaining);

    if (!result.allowed) {
      res.setHeader("Retry-After", Math.ceil(result.retryAfterMs / 1000));
      res.status(429).json({ success: false, error: message });
      return;
    }

    next();
  };
}

/** Auth endpoints: 5 requests per 15 minutes. */
export function createAuthRateLimiter() {
  return createRateLimiter({
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
    message: "Too many authentication attempts. Please try again in 15 minutes.",
  });
}

/** General API endpoints: 1000 requests per 15 minutes. */
export function createAPIRateLimiter() {
  return createRateLimiter({
    maxRequests: 1000,
    windowMs: 15 * 60 * 1000,
    message: "API rate limit exceeded. Please slow down.",
  });
}

/** File upload endpoints: 50 requests per hour. */
export function createUploadRateLimiter() {
  return createRateLimiter({
    maxRequests: 50,
    windowMs: 60 * 60 * 1000,
    message: "Upload limit exceeded. Please try again later.",
  });
}

/** Password reset: 3 requests per hour. */
export function createPasswordResetRateLimiter() {
  return createRateLimiter({
    maxRequests: 3,
    windowMs: 60 * 60 * 1000,
    message: "Too many password reset requests. Please wait one hour.",
  });
}
