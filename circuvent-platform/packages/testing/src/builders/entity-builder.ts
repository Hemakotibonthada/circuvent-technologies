// ══════════════════════════════════════════════════════════════════════════════
// Testing Package — Fluent Entity Builder
// Type-safe builder pattern for constructing test entities.
// Uses method chaining for readable test setup.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generic fluent builder for test entity construction.
 *
 * @template T The type of the entity being built
 *
 * @example
 * ```ts
 * const device = new EntityBuilder<DeviceData>()
 *   .with("name", "Test Sensor")
 *   .with("macAddress", "AA:BB:CC:DD:EE:FF")
 *   .with("status", "ONLINE")
 *   .withDefaults({
 *     firmwareVersion: "2.0.0",
 *     hardwareModel: "ESP32",
 *   })
 *   .build();
 * ```
 */
export class EntityBuilder<T extends Record<string, unknown>> {
  private data: Partial<T> = {};
  private defaults: Partial<T> = {};

  /**
   * Sets a single property.
   */
  with<K extends keyof T>(key: K, value: T[K]): this {
    this.data[key] = value;
    return this;
  }

  /**
   * Sets multiple properties at once.
   */
  withDefaults(defaults: Partial<T>): this {
    this.defaults = { ...this.defaults, ...defaults };
    return this;
  }

  /**
   * Merges and builds the final object.
   * Explicit values override defaults.
   */
  build(): T {
    return { ...this.defaults, ...this.data } as T;
  }

  /**
   * Builds an array of N entities with optional per-item customization.
   */
  buildMany(count: number, customize?: (index: number) => Partial<T>): T[] {
    return Array.from({ length: count }, (_, i) => {
      const customizations = customize ? customize(i) : {};
      return { ...this.defaults, ...this.data, ...customizations } as T;
    });
  }

  /**
   * Creates a clone of this builder (for branching variations).
   */
  clone(): EntityBuilder<T> {
    const cloned = new EntityBuilder<T>();
    cloned.data = { ...this.data };
    cloned.defaults = { ...this.defaults };
    return cloned;
  }

  /**
   * Resets the builder for reuse.
   */
  reset(): this {
    this.data = {};
    return this;
  }
}

/**
 * Convenience function: creates a builder pre-loaded with defaults.
 */
export function buildEntity<T extends Record<string, unknown>>(defaults: Partial<T>): EntityBuilder<T> {
  return new EntityBuilder<T>().withDefaults(defaults);
}
