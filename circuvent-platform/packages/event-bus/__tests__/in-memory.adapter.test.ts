// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — In-Memory Event Bus Adapter
// ══════════════════════════════════════════════════════════════════════════════

import { InMemoryEventBus } from "../src/adapters/in-memory.adapter";

function createEvent(type: string, aggregateId: string = "agg-001") {
  return {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    eventType: type,
    aggregateType: "TestAggregate",
    aggregateId,
    occurredAt: new Date(),
    payload: { data: "test" },
    metadata: {
      correlationId: "corr-001",
      causedBy: "user-001",
      source: "test-service",
    },
    version: 1,
  };
}

describe("InMemoryEventBus", () => {
  let bus: InMemoryEventBus;

  beforeEach(() => {
    bus = new InMemoryEventBus();
  });

  describe("Publish & Subscribe", () => {
    it("should deliver event to subscriber", async () => {
      const received: any[] = [];
      bus.subscribe("TestEvent", async (event) => { received.push(event); }, "test-handler");

      await bus.publish(createEvent("TestEvent"));

      expect(received.length).toBe(1);
      expect(received[0].eventType).toBe("TestEvent");
    });

    it("should deliver to multiple subscribers", async () => {
      let count = 0;
      bus.subscribe("TestEvent", async () => { count++; }, "handler-1");
      bus.subscribe("TestEvent", async () => { count++; }, "handler-2");

      await bus.publish(createEvent("TestEvent"));
      expect(count).toBe(2);
    });

    it("should not deliver to unsubscribed handlers", async () => {
      let called = false;
      bus.subscribe("OtherEvent", async () => { called = true; }, "handler");

      await bus.publish(createEvent("TestEvent"));
      expect(called).toBe(false);
    });
  });

  describe("Idempotency", () => {
    it("should ignore duplicate events (same eventId)", async () => {
      let count = 0;
      bus.subscribe("TestEvent", async () => { count++; }, "handler");

      const event = createEvent("TestEvent");
      await bus.publish(event);
      await bus.publish(event); // Same event again

      expect(count).toBe(1); // Only processed once
    });
  });

  describe("Error Handling & Dead Letters", () => {
    it("should send to dead-letter queue after retries", async () => {
      bus = new InMemoryEventBus({ maxRetries: 1 });
      bus.subscribe("TestEvent", async () => { throw new Error("Handler failed"); }, "bad-handler");

      await bus.publish(createEvent("TestEvent"));

      const deadLetters = bus.getDeadLetters();
      expect(deadLetters.length).toBe(1);
    });

    it("should track failed deliveries in metrics", async () => {
      bus = new InMemoryEventBus({ maxRetries: 0 });
      bus.subscribe("TestEvent", async () => { throw new Error("fail"); }, "handler");

      await bus.publish(createEvent("TestEvent"));

      const metrics = bus.getMetrics();
      expect(metrics.totalFailed).toBe(1);
    });
  });

  describe("Unsubscribe", () => {
    it("should remove all subscriptions for a subscriber", async () => {
      let count = 0;
      bus.subscribe("Event1", async () => { count++; }, "my-handler");
      bus.subscribe("Event2", async () => { count++; }, "my-handler");

      bus.unsubscribe("my-handler");

      await bus.publish(createEvent("Event1"));
      await bus.publish(createEvent("Event2"));

      expect(count).toBe(0);
    });
  });

  describe("Metrics", () => {
    it("should track publish and delivery counts", async () => {
      bus.subscribe("TestEvent", async () => {}, "handler");

      await bus.publish(createEvent("TestEvent"));
      await bus.publish(createEvent("TestEvent")); // Different eventId

      const metrics = bus.getMetrics();
      expect(metrics.totalPublished).toBe(2);
      expect(metrics.totalDelivered).toBe(2);
      expect(metrics.subscriptionCount).toBe(1);
    });
  });

  describe("PublishAll", () => {
    it("should publish multiple events", async () => {
      const received: string[] = [];
      bus.subscribe("EventA", async (e) => { received.push(e.eventType); }, "handler");
      bus.subscribe("EventB", async (e) => { received.push(e.eventType); }, "handler");

      await bus.publishAll([createEvent("EventA"), createEvent("EventB")]);

      expect(received).toEqual(["EventA", "EventB"]);
    });
  });

  describe("Reset", () => {
    it("should clear all state", async () => {
      bus.subscribe("TestEvent", async () => {}, "handler");
      await bus.publish(createEvent("TestEvent"));

      bus.reset();

      const metrics = bus.getMetrics();
      expect(metrics.totalPublished).toBe(0);
      expect(metrics.subscriptionCount).toBe(0);
      expect(bus.getDeadLetters().length).toBe(0);
    });
  });
});
