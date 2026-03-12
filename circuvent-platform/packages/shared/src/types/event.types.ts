// ══════════════════════════════════════════════════════════════════════════════
// Circuvent Platform — Domain Event Envelope
// Standard event structure for cross-module communication.
// Every domain event is wrapped in this envelope for routing,
// idempotency, and audit trail.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Unique identifier for deduplication. Combination of aggregate + sequence.
 */
export interface EventMetadata {
  /** Unique event ID (CUID) */
  readonly eventId: string;
  /** ISO-8601 timestamp of when the event was created */
  readonly timestamp: string;
  /** Correlation ID linking related events across services */
  readonly correlationId: string;
  /** ID of the user or system that triggered the event */
  readonly causedBy: string;
  /** Source service that emitted the event */
  readonly source: string;
  /** Monotonically increasing version for the aggregate */
  readonly version: number;
}

/**
 * Base domain event envelope. All domain events extend this.
 *
 * @template T The payload type specific to the event
 *
 * @example
 * ```ts
 * interface DeviceRegisteredPayload {
 *   deviceId: string;
 *   macAddress: string;
 *   firmwareVersion: string;
 * }
 *
 * type DeviceRegisteredEvent = DomainEvent<'DeviceRegistered', DeviceRegisteredPayload>;
 * ```
 */
export interface DomainEvent<
  TName extends string = string,
  TPayload = Record<string, unknown>
> {
  /** Discriminator — the event type name (e.g., 'DeviceRegistered') */
  readonly type: TName;
  /** The aggregate type this event belongs to (e.g., 'IoTDevice') */
  readonly aggregateType: string;
  /** The aggregate ID (e.g., the device's primary key) */
  readonly aggregateId: string;
  /** Event-specific data */
  readonly payload: TPayload;
  /** Routing and audit metadata */
  readonly metadata: EventMetadata;
}

/**
 * Creates a new domain event with auto-generated metadata.
 *
 * @param params Event creation parameters
 * @returns A fully formed DomainEvent
 */
export function createDomainEvent<TName extends string, TPayload>(params: {
  type: TName;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
  correlationId: string;
  causedBy: string;
  source: string;
  version?: number;
}): DomainEvent<TName, TPayload> {
  return {
    type: params.type,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    payload: params.payload,
    metadata: {
      eventId: generateEventId(),
      timestamp: new Date().toISOString(),
      correlationId: params.correlationId,
      causedBy: params.causedBy,
      source: params.source,
      version: params.version ?? 1,
    },
  };
}

/**
 * Type guard to check if an object is a valid DomainEvent.
 */
export function isDomainEvent(obj: unknown): obj is DomainEvent {
  if (typeof obj !== "object" || obj === null) return false;
  const e = obj as Record<string, unknown>;
  return (
    typeof e.type === "string" &&
    typeof e.aggregateType === "string" &&
    typeof e.aggregateId === "string" &&
    typeof e.payload === "object" &&
    typeof e.metadata === "object"
  );
}

/**
 * Handler function type for processing domain events.
 */
export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void>;

/**
 * Subscriber registration for the event bus.
 */
export interface EventSubscription {
  /** The event type to subscribe to (e.g., 'DeviceRegistered') */
  readonly eventType: string;
  /** The handler function */
  readonly handler: EventHandler;
  /** Optional: only process events from this source service */
  readonly sourceFilter?: string;
}

/** Simple CUID-like ID generator for events */
function generateEventId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `evt_${ts}_${rand}`;
}
