// ══════════════════════════════════════════════════════════════════════════════
// In-Memory Event Bus Adapter
// Lightweight implementation for development and unit testing.
// Events are dispatched synchronously within the process.
// Includes idempotency check, retry on failure, and dead-letter queue.
// ══════════════════════════════════════════════════════════════════════════════

import { EventBusPort, EventHandler, EventSubscription, DomainEvent } from "../ports/event-bus.port";

/**
 * In-memory event bus for development and testing.
 * Not suitable for production multi-instance deployments.
 *
 * Features:
 * - Synchronous dispatch within the Node.js process
 * - Idempotency via processed event ID set
 * - Dead-letter queue for failed events
 * - Metrics tracking
 *
 * @example
 * ```ts
 * const bus = new InMemoryEventBus();
 *
 * bus.subscribe("DeviceRegistered", async (event) => {
 *   console.log("New device:", event.payload);
 * }, "notification-service");
 *
 * await bus.publish(createDomainEvent({
 *   type: "DeviceRegistered",
 *   aggregateType: "IoTDevice",
 *   aggregateId: "dev-001",
 *   payload: { macAddress: "AA:BB:CC:DD:EE:FF" },
 *   correlationId: "req-123",
 *   causedBy: "user-001",
 *   source: "iot-registry",
 * }));
 * ```
 */
export class InMemoryEventBus extends EventBusPort {
  private subscriptions: Map<string, EventSubscription[]> = new Map();
  private processedIds: Set<string> = new Set();
  private deadLetters: DomainEvent[] = [];
  private metrics = {
    totalPublished: 0,
    totalDelivered: 0,
    totalFailed: 0,
  };

  /** Maximum processed IDs to keep (prevents memory leak) */
  private readonly maxProcessedIds: number;
  /** Maximum retries for a failed handler */
  private readonly maxRetries: number;

  constructor(options?: { maxProcessedIds?: number; maxRetries?: number }) {
    super();
    this.maxProcessedIds = options?.maxProcessedIds ?? 10_000;
    this.maxRetries = options?.maxRetries ?? 2;
  }

  /**
   * Publishes a single domain event to all matching subscribers.
   * Implements idempotency — duplicate events are silently ignored.
   */
  async publish(event: DomainEvent): Promise<void> {
    // Idempotency check
    if (this.processedIds.has(event.eventId)) {
      return; // Already processed — skip silently
    }

    this.metrics.totalPublished++;
    this.markProcessed(event.eventId);

    const subscribers = this.subscriptions.get(event.eventType) || [];

    for (const sub of subscribers) {
      let delivered = false;
      let lastError: Error | undefined;

      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          await sub.handler(event);
          delivered = true;
          this.metrics.totalDelivered++;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          // Wait a small amount before retry (50ms * attempt)
          if (attempt < this.maxRetries) {
            await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
          }
        }
      }

      if (!delivered) {
        this.metrics.totalFailed++;
        this.deadLetters.push(event);
        console.error(
          `[EventBus] Handler '${sub.subscriberName}' failed for event '${event.eventType}' ` +
          `(${event.eventId}): ${lastError?.message}`
        );
      }
    }
  }

  /**
   * Publishes multiple events sequentially.
   */
  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  /**
   * Registers a handler for a specific event type.
   */
  subscribe(eventType: string, handler: EventHandler, subscriberName: string): void {
    const existing = this.subscriptions.get(eventType) || [];
    existing.push({ eventType, handler, subscriberName });
    this.subscriptions.set(eventType, existing);
  }

  /**
   * Removes all subscriptions for a named subscriber.
   */
  unsubscribe(subscriberName: string): void {
    for (const [eventType, subs] of this.subscriptions.entries()) {
      const filtered = subs.filter(s => s.subscriberName !== subscriberName);
      if (filtered.length === 0) {
        this.subscriptions.delete(eventType);
      } else {
        this.subscriptions.set(eventType, filtered);
      }
    }
  }

  /**
   * Returns events that failed all retry attempts.
   */
  getDeadLetters(): DomainEvent[] {
    return [...this.deadLetters];
  }

  /**
   * Clears the dead-letter queue (after manual investigation).
   */
  clearDeadLetters(): void {
    this.deadLetters = [];
  }

  /**
   * Returns bus metrics for monitoring.
   */
  getMetrics() {
    return {
      ...this.metrics,
      deadLetterCount: this.deadLetters.length,
      subscriptionCount: Array.from(this.subscriptions.values())
        .reduce((sum, subs) => sum + subs.length, 0),
    };
  }

  /**
   * Resets all state. Use in tests only.
   */
  reset(): void {
    this.subscriptions.clear();
    this.processedIds.clear();
    this.deadLetters = [];
    this.metrics = { totalPublished: 0, totalDelivered: 0, totalFailed: 0 };
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private markProcessed(eventId: string): void {
    this.processedIds.add(eventId);
    // Prevent unbounded memory growth
    if (this.processedIds.size > this.maxProcessedIds) {
      const iterator = this.processedIds.values();
      // Remove oldest 20%
      const toRemove = Math.floor(this.maxProcessedIds * 0.2);
      for (let i = 0; i < toRemove; i++) {
        const val = iterator.next().value;
        if (val) this.processedIds.delete(val);
      }
    }
  }
}
