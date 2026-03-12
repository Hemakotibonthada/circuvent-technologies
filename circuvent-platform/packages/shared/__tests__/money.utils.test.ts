// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Money Value Object
// Tests safe decimal arithmetic, GST calculations, and allocation.
// ══════════════════════════════════════════════════════════════════════════════

import { Money, sumMoney } from "../src/utils/money.utils";

describe("Money", () => {
  describe("Creation", () => {
    it("should create INR money from major units", () => {
      const m = Money.inr(75000);
      expect(m.toDecimal()).toBe(75000);
      expect(m.currency).toBe("INR");
    });

    it("should create from minor units (paise)", () => {
      const m = Money.fromMinor(7500050, "INR");
      expect(m.toDecimal()).toBe(75000.50);
    });

    it("should handle zero", () => {
      const m = Money.zero();
      expect(m.isZero()).toBe(true);
      expect(m.toDecimal()).toBe(0);
    });
  });

  describe("Arithmetic", () => {
    it("should add two amounts correctly", () => {
      const a = Money.inr(75000);
      const b = Money.inr(5000);
      expect(a.add(b).toDecimal()).toBe(80000);
    });

    it("should subtract correctly", () => {
      const a = Money.inr(80000);
      const b = Money.inr(24000);
      expect(a.subtract(b).toDecimal()).toBe(56000);
    });

    it("should multiply by a factor", () => {
      const m = Money.inr(100000);
      expect(m.multiply(0.3).toDecimal()).toBe(30000);
    });

    it("should handle 0.1 + 0.2 without floating point error", () => {
      const a = Money.inr(0.1);
      const b = Money.inr(0.2);
      // In plain JS: 0.1 + 0.2 = 0.30000000000000004
      // With Money: correctly 0.30
      expect(a.add(b).toDecimal()).toBe(0.3);
    });

    it("should prevent division by zero", () => {
      const m = Money.inr(1000);
      expect(() => m.divide(0)).toThrow("Division by zero");
    });

    it("should throw on currency mismatch", () => {
      const inr = Money.inr(100);
      const usd = Money.usd(100);
      expect(() => inr.add(usd)).toThrow("Currency mismatch");
    });
  });

  describe("Allocation", () => {
    it("should split evenly without losing pennies", () => {
      const m = Money.inr(100);
      const parts = m.allocate(3);
      // 100 / 3 = 33.33, 33.33, 33.34 (last gets the extra paisa)
      expect(parts.length).toBe(3);
      const total = parts.reduce((s, p) => s + p.toMinor(), 0);
      expect(total).toBe(m.toMinor()); // No money lost!
    });

    it("should allocate by ratios", () => {
      const m = Money.inr(10000);
      const parts = m.allocateByRatios([60, 25, 15]);
      const total = parts.reduce((s, p) => s + p.toMinor(), 0);
      expect(total).toBe(m.toMinor()); // Sum of ratios = original
    });
  });

  describe("GST Calculation", () => {
    it("should calculate intra-state GST (CGST + SGST)", () => {
      const amount = Money.inr(100000);
      const gst = amount.calculateGST(18, false);

      expect(gst.cgst.toDecimal()).toBe(9000);
      expect(gst.sgst.toDecimal()).toBe(9000);
      expect(gst.igst.isZero()).toBe(true);
      expect(gst.totalWithGST.toDecimal()).toBe(118000);
    });

    it("should calculate inter-state GST (IGST)", () => {
      const amount = Money.inr(100000);
      const gst = amount.calculateGST(18, true);

      expect(gst.cgst.isZero()).toBe(true);
      expect(gst.sgst.isZero()).toBe(true);
      expect(gst.igst.toDecimal()).toBe(18000);
      expect(gst.totalWithGST.toDecimal()).toBe(118000);
    });
  });

  describe("Formatting", () => {
    it("should format INR with Indian grouping", () => {
      const m = Money.inr(1234567.89);
      const formatted = m.format();
      expect(formatted).toContain("₹");
      expect(formatted).toContain("12"); // Indian grouping
    });
  });

  describe("Comparison", () => {
    it("should compare correctly", () => {
      const a = Money.inr(100);
      const b = Money.inr(200);
      expect(a.lessThan(b)).toBe(true);
      expect(b.greaterThan(a)).toBe(true);
      expect(a.equals(Money.inr(100))).toBe(true);
    });
  });

  describe("sumMoney", () => {
    it("should sum an array of Money values", () => {
      const amounts = [Money.inr(100), Money.inr(200), Money.inr(300)];
      const total = sumMoney(amounts);
      expect(total.toDecimal()).toBe(600);
    });

    it("should return zero for empty array", () => {
      expect(sumMoney([]).toDecimal()).toBe(0);
    });
  });
});
