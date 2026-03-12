// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Money Value Object (Financial Ledger)
// Tests immutability, arithmetic, GST, and formatting.
// ══════════════════════════════════════════════════════════════════════════════

import { MoneyVO } from "../../../src/domain/value-objects/money.vo";

describe("MoneyVO", () => {
  describe("Creation", () => {
    it("should create from major units", () => {
      const m = MoneyVO.of(75000);
      expect(m.toMajor()).toBe(75000);
      expect(m.currency).toBe("INR");
    });

    it("should create from minor units", () => {
      const m = MoneyVO.ofMinor(7500050);
      expect(m.toMajor()).toBe(75000.50);
    });

    it("should create zero value", () => {
      const m = MoneyVO.zero();
      expect(m.isZero()).toBe(true);
      expect(m.toMajor()).toBe(0);
    });
  });

  describe("Arithmetic", () => {
    it("should add correctly", () => {
      expect(MoneyVO.of(100).add(MoneyVO.of(200)).toMajor()).toBe(300);
    });

    it("should subtract correctly", () => {
      expect(MoneyVO.of(500).subtract(MoneyVO.of(200)).toMajor()).toBe(300);
    });

    it("should multiply correctly", () => {
      expect(MoneyVO.of(1000).multiply(0.18).toMajor()).toBe(180);
    });

    it("should negate correctly", () => {
      expect(MoneyVO.of(100).negate().toMajor()).toBe(-100);
      expect(MoneyVO.of(100).negate().isNegative()).toBe(true);
    });

    it("should handle 0.1 + 0.2 without floating-point error", () => {
      const result = MoneyVO.of(0.1).add(MoneyVO.of(0.2));
      expect(result.toMajor()).toBe(0.3);
    });

    it("should throw on currency mismatch", () => {
      expect(() => MoneyVO.of(100, "INR").add(MoneyVO.of(50, "USD"))).toThrow("Currency mismatch");
    });
  });

  describe("Comparison", () => {
    it("should detect positive", () => expect(MoneyVO.of(100).isPositive()).toBe(true));
    it("should detect negative", () => expect(MoneyVO.of(-50).isNegative()).toBe(true));
    it("should detect zero", () => expect(MoneyVO.zero().isZero()).toBe(true));
    it("should compare greater", () => expect(MoneyVO.of(200).greaterThan(MoneyVO.of(100))).toBe(true));
    it("should detect equality", () => expect(MoneyVO.of(100).equals(MoneyVO.of(100))).toBe(true));
  });

  describe("Formatting", () => {
    it("should format with currency symbol", () => {
      const formatted = MoneyVO.of(75000).format();
      expect(formatted).toContain("₹");
    });

    it("should format USD", () => {
      const formatted = MoneyVO.of(1000, "USD").format("en-US");
      expect(formatted).toContain("$");
    });

    it("should serialize to JSON as number", () => {
      expect(MoneyVO.of(100).toJSON()).toBe(100);
    });
  });
});
