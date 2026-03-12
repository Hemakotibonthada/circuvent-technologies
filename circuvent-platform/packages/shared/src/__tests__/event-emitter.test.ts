// ──────────────────────────────────────────────────────────────
// TypedEventEmitter — Test Suite
// Tests for on/off/once/emit, waitFor, pipe, filter,
// debounce, error handling, utilities.
// ──────────────────────────────────────────────────────────────

import { TypedEventEmitter } from "../utils/event-emitter";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface TestEvents {
  [key: string]: unknown;
  click: { x: number; y: number };
  submit: { formId: string; data: Record<string, string> };
  error: { code: number; message: string };
  count: number;
}

// ══════════════════════════════════════════════════════════════
// Basic on/off/emit
// ══════════════════════════════════════════════════════════════

describe("on / off / emit", () => {
  it("should register and trigger a handler", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const received: any[] = [];
    emitter.on("click", (payload) => { received.push(payload); });
    await emitter.emit("click", { x: 10, y: 20 });
    expect(received).toEqual([{ x: 10, y: 20 }]);
  });

  it("should register multiple handlers", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const a: number[] = [];
    const b: number[] = [];
    emitter.on("count", (n) => { a.push(n); });
    emitter.on("count", (n) => { b.push(n); });
    await emitter.emit("count", 42);
    expect(a).toEqual([42]);
    expect(b).toEqual([42]);
  });

  it("should remove a handler with off", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const received: number[] = [];
    const handler = (n: number) => { received.push(n); };
    emitter.on("count", handler);
    await emitter.emit("count", 1);
    emitter.off("count", handler);
    await emitter.emit("count", 2);
    expect(received).toEqual([1]);
  });

  it("should return false when emitting to no listeners", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const result = await emitter.emit("count", 1);
    expect(result).toBe(false);
  });

  it("should return true when emitting to listeners", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    emitter.on("count", () => {});
    const result = await emitter.emit("count", 1);
    expect(result).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// once
// ══════════════════════════════════════════════════════════════

describe("once", () => {
  it("should fire handler only once", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const received: number[] = [];
    emitter.once("count", (n) => { received.push(n); });
    await emitter.emit("count", 1);
    await emitter.emit("count", 2);
    expect(received).toEqual([1]);
  });
});

// ══════════════════════════════════════════════════════════════
// waitFor
// ══════════════════════════════════════════════════════════════

describe("waitFor", () => {
  it("should resolve when event is emitted", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const promise = emitter.waitFor("count", 5000);
    setTimeout(() => emitter.emit("count", 99), 10);
    const result = await promise;
    expect(result).toBe(99);
  });

  it("should reject on timeout", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    await expect(emitter.waitFor("count", 50)).rejects.toThrow("timed out");
  });
});

// ══════════════════════════════════════════════════════════════
// pipe
// ══════════════════════════════════════════════════════════════

describe("pipe", () => {
  it("should forward events to piped emitter", async () => {
    const source = new TypedEventEmitter<TestEvents>();
    const target = new TypedEventEmitter<TestEvents>();
    const received: number[] = [];

    target.on("count", (n) => { received.push(n); });
    source.pipe(target);
    await source.emit("count", 42);

    expect(received).toEqual([42]);
  });

  it("should support unpipe", async () => {
    const source = new TypedEventEmitter<TestEvents>();
    const target = new TypedEventEmitter<TestEvents>();
    const received: number[] = [];

    target.on("count", (n) => { received.push(n); });
    source.pipe(target);
    source.unpipe(target);
    await source.emit("count", 42);

    expect(received).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════
// filter
// ══════════════════════════════════════════════════════════════

describe("filter", () => {
  it("should only invoke handler when predicate is true", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const received: number[] = [];
    emitter.filter("count", (n) => n > 5, (n) => { received.push(n); });
    await emitter.emit("count", 3);
    await emitter.emit("count", 10);
    await emitter.emit("count", 1);
    expect(received).toEqual([10]);
  });
});

// ══════════════════════════════════════════════════════════════
// Utilities
// ══════════════════════════════════════════════════════════════

describe("Utilities", () => {
  it("should return listener count", () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    emitter.on("count", () => {});
    emitter.on("count", () => {});
    expect(emitter.listenerCount("count")).toBe(2);
    expect(emitter.listenerCount("click")).toBe(0);
  });

  it("should return event names", () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    emitter.on("count", () => {});
    emitter.on("click", () => {});
    expect(emitter.eventNames()).toEqual(expect.arrayContaining(["count", "click"]));
  });

  it("should remove all listeners for an event", () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    emitter.on("count", () => {});
    emitter.on("count", () => {});
    emitter.removeAllListeners("count");
    expect(emitter.listenerCount("count")).toBe(0);
  });

  it("should remove all listeners globally", () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    emitter.on("count", () => {});
    emitter.on("click", () => {});
    emitter.removeAllListeners();
    expect(emitter.eventNames().length).toBe(0);
  });

  it("should track emit history", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    emitter.on("count", () => {});
    await emitter.emit("count", 1);
    await emitter.emit("count", 2);
    const history = emitter.getHistory();
    expect(history.length).toBe(2);
    expect(history[0].payload).toBe(1);
  });

  it("should clear history", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    emitter.on("count", () => {});
    await emitter.emit("count", 1);
    emitter.clearHistory();
    expect(emitter.getHistory().length).toBe(0);
  });

  it("should destroy cleanly", () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    emitter.on("count", () => {});
    emitter.destroy();
    expect(emitter.eventNames().length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Error Handling
// ══════════════════════════════════════════════════════════════

describe("Error Handling", () => {
  it("should throw by default on handler error", async () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    emitter.on("count", () => { throw new Error("boom"); });
    await expect(emitter.emit("count", 1)).rejects.toThrow("boom");
  });

  it("should capture rejections when captureRejections is true", async () => {
    const emitter = new TypedEventEmitter<TestEvents>({ captureRejections: true });
    const spy = jest.spyOn(console, "error").mockImplementation();
    emitter.on("count", () => { throw new Error("captured"); });
    await emitter.emit("count", 1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
