// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Circuit Breaker Pattern
// ══════════════════════════════════════════════════════════════════════════════

import { CircuitBreaker, CircuitState } from "../src/patterns/circuit-breaker";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: "test-service",
      failureThreshold: 3,
      cooldownMs: 1000,
      successThreshold: 2,
      timeoutMs: 5000,
    });
  });

  describe("Initial State", () => {
    it("should start in CLOSED state", () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it("should have zero metrics", () => {
      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.totalFailures).toBe(0);
      expect(metrics.tripCount).toBe(0);
    });
  });

  describe("Successful Operations", () => {
    it("should pass through successful operations", async () => {
      const result = await breaker.execute(async () => "success");
      expect(result).toBe("success");
      expect(breaker.getMetrics().totalRequests).toBe(1);
    });

    it("should remain CLOSED after successful operations", async () => {
      for (let i = 0; i < 10; i++) {
        await breaker.execute(async () => i);
      }
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe("Failure Handling", () => {
    const failingOp = async () => { throw new Error("Service down"); };

    it("should stay CLOSED below failure threshold", async () => {
      // Fail twice (threshold is 3)
      for (let i = 0; i < 2; i++) {
        await expect(breaker.execute(failingOp)).rejects.toThrow("Service down");
      }
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it("should transition to OPEN after reaching failure threshold", async () => {
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingOp)).rejects.toThrow();
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(breaker.getMetrics().tripCount).toBe(1);
    });

    it("should reject requests immediately when OPEN", async () => {
      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingOp)).rejects.toThrow();
      }

      // Next request should be rejected without calling the operation
      await expect(breaker.execute(async () => "should not reach")).rejects.toThrow(
        /Circuit breaker.*OPEN/
      );
    });

    it("should use fallback when OPEN and fallback provided", async () => {
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingOp)).rejects.toThrow();
      }

      const result = await breaker.execute(failingOp, () => "fallback-value");
      expect(result).toBe("fallback-value");
    });
  });

  describe("Recovery (HALF_OPEN)", () => {
    const failingOp = async () => { throw new Error("fail"); };

    it("should transition to HALF_OPEN after cooldown", async () => {
      // Create breaker with very short cooldown
      const fastBreaker = new CircuitBreaker({
        name: "fast",
        failureThreshold: 2,
        cooldownMs: 50,
        successThreshold: 1,
      });

      // Trip it
      for (let i = 0; i < 2; i++) {
        await expect(fastBreaker.execute(failingOp)).rejects.toThrow();
      }
      expect(fastBreaker.getState()).toBe(CircuitState.OPEN);

      // Wait for cooldown
      await new Promise(r => setTimeout(r, 60));

      expect(fastBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it("should close after successful probes in HALF_OPEN", async () => {
      const fastBreaker = new CircuitBreaker({
        name: "fast-recover",
        failureThreshold: 2,
        cooldownMs: 50,
        successThreshold: 2,
      });

      // Trip it
      for (let i = 0; i < 2; i++) {
        await expect(fastBreaker.execute(failingOp)).rejects.toThrow();
      }

      // Wait for cooldown
      await new Promise(r => setTimeout(r, 60));

      // Two successful probes should close the circuit
      await fastBreaker.execute(async () => "probe1");
      await fastBreaker.execute(async () => "probe2");

      expect(fastBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe("Manual Reset", () => {
    it("should reset to CLOSED state", async () => {
      const failingOp = async () => { throw new Error("fail"); };
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingOp)).rejects.toThrow();
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.reset();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe("Metrics", () => {
    it("should track failure rate correctly", async () => {
      await breaker.execute(async () => "ok");
      await breaker.execute(async () => "ok");
      await expect(breaker.execute(async () => { throw new Error("fail"); })).rejects.toThrow();

      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.totalFailures).toBe(1);
      expect(metrics.failureRate).toBe(33.33);
    });
  });
});
