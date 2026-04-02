// ══════════════════════════════════════════════════════════════════════════════
// Circuvent Platform — Event Bus Package
// Domain event infrastructure: publish, subscribe, idempotency, dead-letter.
// Uses in-memory adapter for dev/test, pluggable for Redis/Kafka in prod.
// ══════════════════════════════════════════════════════════════════════════════

export { InMemoryEventBus } from "./adapters/in-memory.adapter";
export { EventBusPort } from "./ports/event-bus.port";
export type { EventHandler, EventSubscription } from "./ports/event-bus.port";
