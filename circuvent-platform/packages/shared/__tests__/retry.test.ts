// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Retry with Exponential Backoff
// ══════════════════════════════════════════════════════════════════════════════

import { withRetry, isRetryableError, retryable } from "../src/patterns/retry";

describe("withRetry", () => {
  it("should succeed on first try", async () => {
    const result = await withRetry(async () => "success");
    expect(result).toBe("success");
  });

  it("should retry on failure and eventually succeed", async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      if (attempts < 3) throw new Error("Not yet");
      return "finally";
    }, { maxRetries: 5, initialDelayMs: 10, jitter: false });

    expect(result).toBe("finally");
    expect(attempts).toBe(3);
  });

  it("should throw after exhausting retries", async () => {
    await expect(withRetry(
      async () => { throw new Error("Always fails"); },
      { maxRetries: 2, initialDelayMs: 10 }
    )).rejects.toThrow("Always fails");
  });

  it("should respect shouldRetry predicate", async () => {
    let attempts = 0;
    await expect(withRetry(
      async () => { attempts++; throw new Error("Non-retryable"); },
      { maxRetries: 5, initialDelayMs: 10, shouldRetry: () => false }
    )).rejects.toThrow();

    expect(attempts).toBe(1); // Should not retry
  });

  it("should call onRetry callback", async () => {
    const retries: number[] = [];
    let attempts = 0;

    await withRetry(
      async () => { attempts++; if (attempts < 3) throw new Error("fail"); return "ok"; },
      { maxRetries: 5, initialDelayMs: 10, jitter: false, onRetry: (_err, attempt) => retries.push(attempt) }
    );

    expect(retries).toEqual([1, 2]);
  });

  it("should use exponential backoff (timing)", async () => {
    const start = Date.now();
    await expect(withRetry(
      async () => { throw new Error("fail"); },
      { maxRetries: 2, initialDelayMs: 50, backoffMultiplier: 2, jitter: false, maxDelayMs: 10000 }
    )).rejects.toThrow();

    const elapsed = Date.now() - start;
    // Should have waited at least 50 + 100 = 150ms (with some tolerance)
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });
});

describe("isRetryableError", () => {
  it("should identify network errors as retryable", () => {
    expect(isRetryableError(new Error("ECONNREFUSED"))).toBe(true);
    expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryableError(new Error("ETIMEDOUT"))).toBe(true);
  });

  it("should identify HTTP 5xx as retryable", () => {
    expect(isRetryableError(new Error("503 Service Unavailable"))).toBe(true);
    expect(isRetryableError(new Error("502 Bad Gateway"))).toBe(true);
  });

  it("should NOT retry validation errors", () => {
    expect(isRetryableError(new Error("Validation failed: email required"))).toBe(false);
  });
});

describe("retryable (decorator)", () => {
  it("should wrap a function with retry logic", async () => {
    let attempts = 0;
    const unreliable = retryable(
      async (x: number) => { attempts++; if (attempts < 2) throw new Error("fail"); return x * 2; },
      { maxRetries: 3, initialDelayMs: 10 }
    );

    const result = await unreliable(5);
    expect(result).toBe(10);
    expect(attempts).toBe(2);
  });
});
