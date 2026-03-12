// ══════════════════════════════════════════════════════════════════════════════
// Circuvent Platform — Circuit Breaker Pattern
// Prevents cascade failures by wrapping calls to external/unreliable services.
// States: CLOSED → OPEN → HALF_OPEN → CLOSED
//
// When a service fails repeatedly, the circuit "opens" and immediately rejects
// requests for a cooldown period. After cooldown, it allows a probe request
// (HALF_OPEN). If that succeeds, the circuit closes again.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Circuit breaker states following the standard state machine.
 */
export enum CircuitState {
  /** Normal operation — requests flow through */
  CLOSED = "CLOSED",
  /** Failures exceeded threshold — requests are immediately rejected */
  OPEN = "OPEN",
  /** Cooldown expired — allowing a single probe request */
  HALF_OPEN = "HALF_OPEN",
}

/**
 * Configuration for the circuit breaker.
 */
export interface CircuitBreakerConfig {
  /** Name for logging/metrics (e.g., "iot-mqtt-broker") */
  name: string;
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms before transitioning from OPEN → HALF_OPEN */
  cooldownMs: number;
  /** Number of successful probes needed to close the circuit from HALF_OPEN */
  successThreshold: number;
  /** Optional: timeout for each operation in ms */
  timeoutMs?: number;
  /** Optional: callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState, name: string) => void;
}

/**
 * Circuit Breaker implementation for resilient service calls.
 *
 * @example
 * ```ts
 * const breaker = new CircuitBreaker({
 *   name: "mqtt-broker",
 *   failureThreshold: 5,
 *   cooldownMs: 30000,
 *   successThreshold: 2,
 * });
 *
 * // Wrap unreliable calls
 * const result = await breaker.execute(() => mqttClient.publish(topic, payload));
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly config: Required<CircuitBreakerConfig>;

  /** Total number of times this breaker has tripped open */
  public tripCount: number = 0;
  /** Total requests processed */
  public totalRequests: number = 0;
  /** Total failures recorded */
  public totalFailures: number = 0;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      timeoutMs: 10000,
      onStateChange: () => {},
      ...config,
    };
  }

  /**
   * Returns the current state of the circuit.
   */
  public getState(): CircuitState {
    this.checkCooldown();
    return this.state;
  }

  /**
   * Returns operational metrics for monitoring dashboards.
   */
  public getMetrics(): {
    name: string;
    state: CircuitState;
    failureCount: number;
    successCount: number;
    tripCount: number;
    totalRequests: number;
    totalFailures: number;
    failureRate: number;
  } {
    return {
      name: this.config.name,
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      tripCount: this.tripCount,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      failureRate: this.totalRequests > 0
        ? Number((this.totalFailures / this.totalRequests * 100).toFixed(2))
        : 0,
    };
  }

  /**
   * Execute an operation through the circuit breaker.
   *
   * @param operation The async function to execute
   * @param fallback Optional fallback if circuit is open
   * @returns The operation result or fallback value
   * @throws CircuitOpenError if circuit is open and no fallback provided
   */
  public async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => T | Promise<T>,
  ): Promise<T> {
    this.totalRequests++;

    // Check if we should transition from OPEN → HALF_OPEN
    this.checkCooldown();

    // If circuit is OPEN, reject immediately
    if (this.state === CircuitState.OPEN) {
      if (fallback) return fallback();
      throw new Error(
        `Circuit breaker '${this.config.name}' is OPEN — request rejected. ` +
        `Will retry after cooldown (${this.config.cooldownMs}ms).`
      );
    }

    try {
      // Execute with optional timeout
      const result = await this.withTimeout(operation);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Manually reset the circuit breaker to CLOSED state.
   * Use in admin/operations endpoints.
   */
  public reset(): void {
    const oldState = this.state;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    if (oldState !== CircuitState.CLOSED) {
      this.config.onStateChange(oldState, CircuitState.CLOSED, this.config.name);
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else {
      // Reset failure count on success in CLOSED state
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.totalFailures++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Probe failed — reopen
      this.transitionTo(CircuitState.OPEN);
      this.successCount = 0;
    } else if (this.failureCount >= this.config.failureThreshold) {
      // Threshold exceeded — trip the breaker
      this.transitionTo(CircuitState.OPEN);
      this.tripCount++;
    }
  }

  private checkCooldown(): void {
    if (
      this.state === CircuitState.OPEN &&
      Date.now() - this.lastFailureTime >= this.config.cooldownMs
    ) {
      this.transitionTo(CircuitState.HALF_OPEN);
      this.successCount = 0;
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.config.onStateChange(oldState, newState, this.config.name);
  }

  private async withTimeout<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.config.timeoutMs) return operation();

    return Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timed out after ${this.config.timeoutMs}ms`)),
          this.config.timeoutMs,
        ),
      ),
    ]);
  }
}
