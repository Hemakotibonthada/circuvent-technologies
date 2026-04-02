// ══════════════════════════════════════════════════════════════════════════════
// Event Bus Port — Abstract interface for domain event publishing/subscribing
// All adapters (in-memory, Redis, Kafka) implement this port.
// ══════════════════════════════════════════════════════════════════════════════

/** Domain event interface (mirrors @circuvent/shared DomainEvent) */
export interface DomainEvent<TName extends string = string, TPayload = unknown> {
  readonly eventId: string;
  readonly eventType: TName;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly occurredAt: Date;
  readonly payload: TPayload;
  readonly metadata?: Record<string, unknown>;
  readonly version?: number;
}

/**
 * Handler function for processing domain events.
 * Must be idempotent — the same event may be delivered more than once.
 */
export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void>;

/**
 * Subscription registration metadata.
 */
export interface EventSubscription {
  /** The event type to subscribe to (e.g., 'DeviceRegistered') */
  readonly eventType: string;
  /** Handler function */
  readonly handler: EventHandler;
  /** Subscriber name for logging/debugging */
  readonly subscriberName: string;
}

/**
 * Abstract port defining the event bus contract.
 * This is the "port" in the Hexagonal Architecture — the domain
 * depends on this interface, not on any concrete implementation.
 */
export abstract class EventBusPort {
  /**
   * Publishes a domain event to all registered subscribers.
   *
   * @param event The domain event to publish
   * @returns Promise that resolves when all handlers complete (or are enqueued)
   */
  abstract publish(event: DomainEvent): Promise<void>;

  /**
   * Publishes multiple events atomically (best-effort).
   *
   * @param events Array of domain events
   */
  abstract publishAll(events: DomainEvent[]): Promise<void>;

  /**
   * Subscribes a handler to a specific event type.
   *
   * @param eventType The event type string to subscribe to
   * @param handler The handler function
   * @param subscriberName Name for logging
   */
  abstract subscribe(eventType: string, handler: EventHandler, subscriberName: string): void;

  /**
   * Removes all subscriptions for a given subscriber.
   *
   * @param subscriberName The subscriber to unsubscribe
   */
  abstract unsubscribe(subscriberName: string): void;

  /**
   * Returns the dead-letter queue (events that failed processing).
   */
  abstract getDeadLetters(): DomainEvent[];

  /**
   * Returns event bus metrics for monitoring.
   */
  abstract getMetrics(): {
    totalPublished: number;
    totalDelivered: number;
    totalFailed: number;
    deadLetterCount: number;
    subscriptionCount: number;
  };
}
