// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Result Monad
// ══════════════════════════════════════════════════════════════════════════════

import { ok, err, tryCatch, tryCatchAsync, mapResult, flatMapResult, unwrap, unwrapOr, Result } from "../src/types/result.types";

describe("Result Monad", () => {
  describe("ok / err", () => {
    it("should create successful result", () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
    });

    it("should create error result", () => {
      const result = err("something failed");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("something failed");
    });
  });

  describe("tryCatch", () => {
    it("should wrap successful function", () => {
      const result = tryCatch(() => JSON.parse('{"a": 1}'));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual({ a: 1 });
    });

    it("should catch thrown errors", () => {
      const result = tryCatch(() => JSON.parse("invalid json!!!"));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeInstanceOf(Error);
    });
  });

  describe("tryCatchAsync", () => {
    it("should wrap async success", async () => {
      const result = await tryCatchAsync(async () => 42);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(42);
    });

    it("should catch async errors", async () => {
      const result = await tryCatchAsync(async () => { throw new Error("async fail"); });
      expect(result.ok).toBe(false);
    });
  });

  describe("mapResult", () => {
    it("should map Ok value", () => {
      const result = mapResult(ok(5), x => x * 2);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(10);
    });

    it("should pass through Err unchanged", () => {
      const result = mapResult(err("fail"), (x: number) => x * 2);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("fail");
    });
  });

  describe("flatMapResult", () => {
    const safeDivide = (a: number, b: number): Result<number, string> =>
      b === 0 ? err("division by zero") : ok(a / b);

    it("should chain successful operations", () => {
      const result = flatMapResult(ok(10), x => safeDivide(x, 2));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(5);
    });

    it("should short-circuit on error", () => {
      const result = flatMapResult(ok(10), x => safeDivide(x, 0));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("division by zero");
    });

    it("should not call fn on Err input", () => {
      const fn = jest.fn();
      flatMapResult(err("initial error"), fn);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("unwrap / unwrapOr", () => {
    it("should unwrap Ok value", () => {
      expect(unwrap(ok(42))).toBe(42);
    });

    it("should throw on unwrap Err", () => {
      expect(() => unwrap(err("fail"))).toThrow("Unwrap failed");
    });

    it("should return default on Err", () => {
      expect(unwrapOr(err("fail"), 0)).toBe(0);
    });

    it("should return value on Ok", () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });
  });
});
