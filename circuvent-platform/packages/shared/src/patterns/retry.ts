// ══════════════════════════════════════════════════════════════════════════════
// Circuvent Platform — Retry with Exponential Backoff
// Wraps unreliable operations with configurable retry logic.
// Supports jitter, max delay cap, and per-error retry decisions.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for the retry strategy.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (excluding the initial attempt) */
  maxRetries: number;
  /** Initial delay in milliseconds before the first retry */
  initialDelayMs: number;
  /** Multiplier applied to the delay after each retry (2 = double each time) */
  backoffMultiplier: number;
  /** Maximum delay cap in ms (prevents exponential explosion) */
  maxDelayMs: number;
  /** Whether to add random jitter (±25%) to prevent thundering herd */
  jitter: boolean;
  /** Optional predicate: return false to NOT retry for certain errors */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** Optional callback on each retry for logging */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

/** Default retry configuration suitable for most operations */
const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 200,
  backoffMultiplier: 2,
  maxDelayMs: 10000,
  jitter: true,
};

/**
 * Executes an async operation with exponential backoff retry logic.
 *
 * @param operation The async function to execute
 * @param config Retry configuration (partial — merges with defaults)
 * @returns The operation result if it eventually succeeds
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```ts
 * const data = await withRetry(
 *   () => fetch("https://api.external.com/data").then(r => r.json()),
 *   {
 *     maxRetries: 5,
 *     initialDelayMs: 500,
 *     onRetry: (err, attempt) => console.log(`Retry #${attempt}: ${err.message}`),
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config?: Partial<RetryConfig>,
): Promise<T> {
  const cfg: RetryConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error | undefined;
  let delay = cfg.initialDelayMs;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we've exhausted all retries
      if (attempt >= cfg.maxRetries) break;

      // Check if this error should be retried
      if (cfg.shouldRetry && !cfg.shouldRetry(lastError, attempt + 1)) break;

      // Calculate delay with optional jitter
      const jitteredDelay = cfg.jitter
        ? delay * (0.75 + Math.random() * 0.5) // ±25% jitter
        : delay;

      const actualDelay = Math.min(jitteredDelay, cfg.maxDelayMs);

      // Notify callback
      if (cfg.onRetry) {
        cfg.onRetry(lastError, attempt + 1, Math.round(actualDelay));
      }

      // Wait before retrying
      await sleep(actualDelay);

      // Increase delay for next attempt
      delay = Math.min(delay * cfg.backoffMultiplier, cfg.maxDelayMs);
    }
  }

  throw lastError || new Error("All retry attempts failed");
}

/**
 * Retry decorator for class methods.
 * Use as a higher-order function to wrap service methods.
 *
 * @example
 * ```ts
 * class MQTTClient {
 *   publish = retryable(
 *     async (topic: string, payload: string) => { ... },
 *     { maxRetries: 3, initialDelayMs: 1000 }
 *   );
 * }
 * ```
 */
export function retryable<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config?: Partial<RetryConfig>,
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => fn(...args), config);
}

/**
 * Utility: checks if an error is retryable (network errors, timeouts, 5xx).
 * Use as the `shouldRetry` predicate.
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  // Network errors
  if (message.includes("econnrefused") || message.includes("econnreset")) return true;
  if (message.includes("etimedout") || message.includes("timeout")) return true;
  if (message.includes("enotfound") || message.includes("network")) return true;
  // HTTP 5xx
  if (message.includes("503") || message.includes("502") || message.includes("500")) return true;
  // Deadlock
  if (message.includes("deadlock")) return true;
  return false;
}

/** Promise-based sleep utility */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
