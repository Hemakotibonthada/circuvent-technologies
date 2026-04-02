// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — GST Engine Service
// Tests forward/reverse charge, GSTR-3B generation, compliance validation.
// ══════════════════════════════════════════════════════════════════════════════

import { GSTEngineService } from "../../../src/domain/services/gst-engine.service";

describe("GSTEngineService", () => {
  let engine: GSTEngineService;

  beforeEach(() => {
    engine = new GSTEngineService();
  });

  describe("calculateGST", () => {
    it("should calculate intra-state GST (CGST + SGST)", () => {
      const result = engine.calculateGST({ amount: 100000, rate: 18, isInterState: false });
      expect(result.cgst.toMajor()).toBe(9000);
      expect(result.sgst.toMajor()).toBe(9000);
      expect(result.igst.isZero()).toBe(true);
      expect(result.totalGST.toMajor()).toBe(18000);
      expect(result.grandTotal.toMajor()).toBe(118000);
    });

    it("should calculate inter-state GST (IGST only)", () => {
      const result = engine.calculateGST({ amount: 100000, rate: 18, isInterState: true });
      expect(result.igst.toMajor()).toBe(18000);
      expect(result.cgst.isZero()).toBe(true);
      expect(result.sgst.isZero()).toBe(true);
      expect(result.grandTotal.toMajor()).toBe(118000);
    });

    it("should handle 0% GST (exempt)", () => {
      const result = engine.calculateGST({ amount: 50000, rate: 0 });
      expect(result.totalGST.isZero()).toBe(true);
      expect(result.grandTotal.toMajor()).toBe(50000);
    });

    it("should handle 28% GST slab", () => {
      const result = engine.calculateGST({ amount: 10000, rate: 28, isInterState: false });
      expect(result.cgst.toMajor()).toBe(1400);
      expect(result.sgst.toMajor()).toBe(1400);
      expect(result.totalGST.toMajor()).toBe(2800);
    });

    it("should lookup rate from HSN code", () => {
      const result = engine.calculateGST({ amount: 100000, hsnSacCode: "998314" }); // IT services
      expect(result.rate).toBe(18);
      expect(result.totalGST.toMajor()).toBe(18000);
    });
  });

  describe("extractGSTFromInclusive", () => {
    it("should extract GST from inclusive amount", () => {
      const result = engine.extractGSTFromInclusive({ inclusiveAmount: 118000, rate: 18 });
      expect(result.baseAmount.toMajor()).toBeCloseTo(100000, 0);
      expect(result.totalGST.toMajor()).toBeCloseTo(18000, 0);
    });

    it("should handle 5% inclusive", () => {
      const result = engine.extractGSTFromInclusive({ inclusiveAmount: 105000, rate: 5 });
      expect(result.baseAmount.toMajor()).toBeCloseTo(100000, 0);
    });
  });

  describe("lookupRate", () => {
    it("should return rate for known HSN code", () => {
      expect(engine.lookupRate("8542")).toBe(18); // Electronic ICs
      expect(engine.lookupRate("8536")).toBe(28); // Connectors
    });

    it("should return undefined for unknown code", () => {
      expect(engine.lookupRate("0000")).toBeUndefined();
    });
  });

  describe("generateGSTR3B", () => {
    it("should generate correct GSTR-3B summary", () => {
      const output = [
        engine.calculateGST({ amount: 100000, rate: 18, isInterState: false }),
        engine.calculateGST({ amount: 50000, rate: 18, isInterState: true }),
      ];
      const input = [
        engine.calculateGST({ amount: 30000, rate: 18, isInterState: false }),
      ];

      const summary = engine.generateGSTR3B(output, input, "March 2026");

      expect(summary.period).toBe("March 2026");
      // Output: CGST 9000 + 0 = 9000, SGST = 9000, IGST = 9000
      expect(summary.outputTax.cgst.toMajor()).toBe(9000);
      expect(summary.outputTax.igst.toMajor()).toBe(9000);
      // Input: CGST 2700, SGST 2700
      expect(summary.inputCredit.cgst.toMajor()).toBe(2700);
      // Net: CGST = 9000 - 2700 = 6300
      expect(summary.netLiability.cgst.toMajor()).toBe(6300);
      expect(summary.totalPayable.isPositive()).toBe(true);
    });
  });

  describe("validateForFiling", () => {
    it("should detect inter-state with CGST/SGST error", () => {
      const inv = {
        ...engine.calculateGST({ amount: 100000, rate: 18, isInterState: true }),
        cgst: (engine.calculateGST({ amount: 100000, rate: 18 })).cgst, // Wrong!
      };
      const result = engine.validateForFiling([inv]);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should warn about missing HSN code", () => {
      const inv = engine.calculateGST({ amount: 100000, rate: 18 }); // No HSN
      const result = engine.validateForFiling([inv]);
      expect(result.warnings.some(w => w.includes("HSN/SAC"))).toBe(true);
    });

    it("should pass valid invoices", () => {
      const inv = engine.calculateGST({ amount: 100000, rate: 18, isInterState: true, hsnSacCode: "998314" });
      const result = engine.validateForFiling([inv]);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });
});
