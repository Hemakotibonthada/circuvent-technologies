// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Typed Event Emitter
// Generic event system with on/off/once/emit, waitFor, pipe,
// filter, debounce, and typed event maps.
// ──────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

interface ListenerEntry<T = unknown> {
  handler: EventHandler<T>;
  once: boolean;
}

interface DebouncedEntry {
  timer: ReturnType<typeof setTimeout> | null;
  delay: number;
  handler: EventHandler<any>;
}

export interface EventEmitterOptions {
  maxListeners?: number;
  captureRejections?: boolean;
}

// ══════════════════════════════════════════════════════════════
// TypedEventEmitter
// ══════════════════════════════════════════════════════════════

export class TypedEventEmitter<TEvents extends Record<string, unknown> = Record<string, unknown>> {
  private listeners = new Map<keyof TEvents, ListenerEntry<any>[]>();
  private debouncedHandlers = new Map<string, DebouncedEntry>();
  private maxListeners: number;
  private captureRejections: boolean;
  private emitHistory: Array<{ event: keyof TEvents; payload: unknown; timestamp: number }> = [];
  private pipedEmitters: TypedEventEmitter<any>[] = [];

  constructor(options: EventEmitterOptions = {}) {
    this.maxListeners = options.maxListeners ?? 50;
    this.captureRejections = options.captureRejections ?? false;
  }

  // ── on ────────────────────────────────────────────────────

  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): this {
    const list = this.listeners.get(event) ?? [];
    if (list.length >= this.maxListeners) {
      console.warn(`[EventEmitter] Max listeners (${this.maxListeners}) reached for "${String(event)}"`);
    }
    list.push({ handler, once: false });
    this.listeners.set(event, list);
    return this;
  }

  // ── off ───────────────────────────────────────────────────

  off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): this {
    const list = this.listeners.get(event);
    if (!list) return this;
    this.listeners.set(
      event,
      list.filter((entry) => entry.handler !== handler),
    );
    return this;
  }

  // ── once ──────────────────────────────────────────────────

  once<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): this {
    const list = this.listeners.get(event) ?? [];
    list.push({ handler, once: true });
    this.listeners.set(event, list);
    return this;
  }

  // ── emit ──────────────────────────────────────────────────

  async emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): Promise<boolean> {
    this.emitHistory.push({ event, payload, timestamp: Date.now() });

    const list = this.listeners.get(event);
    if (!list || list.length === 0) {
      // Forward to piped emitters even if no local listeners
      for (const piped of this.pipedEmitters) {
        await piped.emit(event as any, payload);
      }
      return false;
    }

    const toRemove: ListenerEntry<any>[] = [];

    for (const entry of list) {
      try {
        await entry.handler(payload);
      } catch (err) {
        if (this.captureRejections) {
          console.error(`[EventEmitter] Error in handler for "${String(event)}":`, err);
        } else {
          throw err;
        }
      }
      if (entry.once) {
        toRemove.push(entry);
      }
    }

    if (toRemove.length > 0) {
      this.listeners.set(
        event,
        list.filter((e) => !toRemove.includes(e)),
      );
    }

    // Forward to piped emitters
    for (const piped of this.pipedEmitters) {
      await piped.emit(event as any, payload);
    }

    return true;
  }

  // ── waitFor ───────────────────────────────────────────────

  waitFor<K extends keyof TEvents>(event: K, timeoutMs = 30000): Promise<TEvents[K]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(event, handler);
        reject(new Error(`waitFor("${String(event)}") timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const handler: EventHandler<TEvents[K]> = (payload) => {
        clearTimeout(timer);
        resolve(payload);
      };

      this.once(event, handler);
    });
  }

  // ── pipe ──────────────────────────────────────────────────

  pipe(target: TypedEventEmitter<any>): this {
    if (!this.pipedEmitters.includes(target)) {
      this.pipedEmitters.push(target);
    }
    return this;
  }

  unpipe(target: TypedEventEmitter<any>): this {
    this.pipedEmitters = this.pipedEmitters.filter((e) => e !== target);
    return this;
  }

  // ── filter ────────────────────────────────────────────────

  filter<K extends keyof TEvents>(
    event: K,
    predicate: (payload: TEvents[K]) => boolean,
    handler: EventHandler<TEvents[K]>,
  ): this {
    const wrappedHandler: EventHandler<TEvents[K]> = (payload) => {
      if (predicate(payload)) {
        handler(payload);
      }
    };
    return this.on(event, wrappedHandler);
  }

  // ── debounce ──────────────────────────────────────────────

  debounce<K extends keyof TEvents>(
    event: K,
    handler: EventHandler<TEvents[K]>,
    delayMs: number,
  ): this {
    const key = `${String(event)}::${handler.toString().slice(0, 50)}`;

    const debouncedHandler: EventHandler<TEvents[K]> = (payload) => {
      const existing = this.debouncedHandlers.get(key);
      if (existing?.timer) {
        clearTimeout(existing.timer);
      }

      const timer = setTimeout(() => {
        handler(payload);
        this.debouncedHandlers.delete(key);
      }, delayMs);

      this.debouncedHandlers.set(key, { timer, delay: delayMs, handler });
    };

    return this.on(event, debouncedHandler);
  }

  // ── Utilities ─────────────────────────────────────────────

  listenerCount<K extends keyof TEvents>(event: K): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  eventNames(): (keyof TEvents)[] {
    return Array.from(this.listeners.keys());
  }

  removeAllListeners<K extends keyof TEvents>(event?: K): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  getHistory(limit = 50): Array<{ event: keyof TEvents; payload: unknown; timestamp: number }> {
    return this.emitHistory.slice(-limit);
  }

  clearHistory(): this {
    this.emitHistory = [];
    return this;
  }

  setMaxListeners(n: number): this {
    this.maxListeners = n;
    return this;
  }

  destroy(): void {
    this.listeners.clear();
    this.pipedEmitters = [];
    this.emitHistory = [];
    for (const entry of this.debouncedHandlers.values()) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.debouncedHandlers.clear();
  }
}
