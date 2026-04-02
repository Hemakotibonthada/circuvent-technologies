// ══════════════════════════════════════════════════════════════════════════════
// Circuvent Platform — Bulkhead Pattern
// Limits concurrent access to a shared resource, preventing one consumer
// from starving others. Named after ship bulkheads that isolate flooding.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Bulkhead configuration.
 */
export interface BulkheadConfig {
  /** Name for logging */
  name: string;
  /** Maximum concurrent executions */
  maxConcurrent: number;
  /** Maximum queue size (waiting requests) */
  maxQueue: number;
  /** Timeout for queued requests in ms */
  queueTimeoutMs: number;
}

/**
 * Bulkhead metrics for monitoring.
 */
export interface BulkheadMetrics {
  name: string;
  activeCount: number;
  queuedCount: number;
  maxConcurrent: number;
  maxQueue: number;
  totalExecuted: number;
  totalRejected: number;
  totalTimedOut: number;
}

/**
 * Bulkhead Pattern — concurrency isolation for shared resources.
 *
 * Use when you need to limit how many concurrent requests can access
 * an external system (database, MQTT broker, GPU cluster, etc.) to
 * prevent resource exhaustion.
 *
 * @example
 * ```ts
 * const bulkhead = new Bulkhead({
 *   name: "mqtt-publisher",
 *   maxConcurrent: 10,
 *   maxQueue: 50,
 *   queueTimeoutMs: 5000,
 * });
 *
 * // Only 10 concurrent MQTT publishes, rest queue up to 50
 * await bulkhead.execute(() => mqttClient.publish(topic, data));
 * ```
 */
export class Bulkhead {
  private activeCount: number = 0;
  private queue: Array<{
    resolve: (value: void) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  private totalExecuted: number = 0;
  private totalRejected: number = 0;
  private totalTimedOut: number = 0;
  private readonly config: BulkheadConfig;

  constructor(config: BulkheadConfig) {
    this.config = config;
  }

  /**
   * Executes an async operation within the bulkhead's concurrency limit.
   * If the limit is reached, the request is queued.
   * If the queue is full, the request is immediately rejected.
   *
   * @param operation The async function to execute
   * @returns The operation's result
   * @throws Error if the queue is full or request times out
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if we can execute immediately
    if (this.activeCount < this.config.maxConcurrent) {
      return this.executeNow(operation);
    }

    // Check if queue is full
    if (this.queue.length >= this.config.maxQueue) {
      this.totalRejected++;
      throw new Error(
        `Bulkhead '${this.config.name}' rejected: ` +
        `${this.activeCount} active, ${this.queue.length} queued (max queue: ${this.config.maxQueue})`
      );
    }

    // Queue the request
    await this.enqueue();

    // After dequeue, execute
    return this.executeNow(operation);
  }

  /**
   * Returns current metrics for monitoring dashboards.
   */
  getMetrics(): BulkheadMetrics {
    return {
      name: this.config.name,
      activeCount: this.activeCount,
      queuedCount: this.queue.length,
      maxConcurrent: this.config.maxConcurrent,
      maxQueue: this.config.maxQueue,
      totalExecuted: this.totalExecuted,
      totalRejected: this.totalRejected,
      totalTimedOut: this.totalTimedOut,
    };
  }

  /**
   * Drains the queue (rejects all waiting requests).
   * Use during graceful shutdown.
   */
  drain(): void {
    for (const entry of this.queue) {
      clearTimeout(entry.timer);
      entry.reject(new Error(`Bulkhead '${this.config.name}' drained — request cancelled`));
    }
    this.queue = [];
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async executeNow<T>(operation: () => Promise<T>): Promise<T> {
    this.activeCount++;
    try {
      const result = await operation();
      this.totalExecuted++;
      return result;
    } finally {
      this.activeCount--;
      this.dequeueNext();
    }
  }

  private enqueue(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove from queue on timeout
        const idx = this.queue.findIndex(e => e.resolve === resolve);
        if (idx !== -1) this.queue.splice(idx, 1);
        this.totalTimedOut++;
        reject(new Error(
          `Bulkhead '${this.config.name}' queue timeout after ${this.config.queueTimeoutMs}ms`
        ));
      }, this.config.queueTimeoutMs);

      this.queue.push({ resolve, reject, timer });
    });
  }

  private dequeueNext(): void {
    if (this.queue.length === 0) return;
    if (this.activeCount >= this.config.maxConcurrent) return;

    const next = this.queue.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve();
    }
  }
}
