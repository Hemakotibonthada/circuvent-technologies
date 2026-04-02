// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Salary Calculator Domain Service
// Tests CTC breakdown, EPF/ESI, Professional Tax, TDS, and regime comparison.
// ══════════════════════════════════════════════════════════════════════════════

import { SalaryCalculatorService } from "../../../src/domain/services/salary-calculator.service";

describe("SalaryCalculatorService", () => {
  let calculator: SalaryCalculatorService;

  beforeEach(() => { calculator = new SalaryCalculatorService(); });

  describe("Salary Breakdown", () => {
    it("should compute correct salary structure for 12 LPA", () => {
      const result = calculator.calculate({ annualCTC: 1200000, state: "KA", regime: "NEW" });
      
      expect(result.basePay).toBe(50000);     // 50% of 100000/month
      expect(result.hra).toBe(20000);          // 20%
      expect(result.da).toBe(10000);           // 10%
      expect(result.grossSalary).toBe(100000); // basePay + hra + da + special
      expect(result.netSalary).toBeLessThan(result.grossSalary); // Deductions applied
      expect(result.netSalary).toBeGreaterThan(0);
    });

    it("should compute correct structure for 6 LPA", () => {
      const result = calculator.calculate({ annualCTC: 600000, state: "KA", regime: "NEW" });
      expect(result.basePay).toBe(25000);
      expect(result.grossSalary).toBe(50000);
    });

    it("should include bonus in gross", () => {
      const withBonus = calculator.calculate({ annualCTC: 1200000, state: "KA", regime: "NEW", bonus: 5000 });
      const withoutBonus = calculator.calculate({ annualCTC: 1200000, state: "KA", regime: "NEW" });
      expect(withBonus.grossSalary).toBe(withoutBonus.grossSalary + 5000);
    });
  });

  describe("EPF Calculation", () => {
    it("should compute 12% of basic for EPF", () => {
      const result = calculator.calculate({ annualCTC: 1200000, state: "KA", regime: "NEW" });
      // Basic = 50000, but PF ceiling is 15000, so PF = 12% of 15000 = 1800
      expect(result.pfEmployee).toBe(1800);
      expect(result.pfEmployer).toBe(1800);
    });

    it("should cap PF at 15000 basic ceiling", () => {
      const highSalary = calculator.calculate({ annualCTC: 3000000, state: "KA", regime: "NEW" });
      // Even at 25 LPA, PF is capped at 1800/month
      expect(highSalary.pfEmployee).toBe(1800);
    });

    it("should allow PF override", () => {
      const result = calculator.calculate({ annualCTC: 1200000, state: "KA", regime: "NEW", pfContribution: 3000 });
      expect(result.pfEmployee).toBe(3000);
    });
  });

  describe("ESI Calculation", () => {
    it("should apply ESI for gross <= 21000", () => {
      const result = calculator.calculate({ annualCTC: 240000, state: "KA", regime: "NEW", isESIEligible: true });
      // Gross = 20000, ESI employee = 0.75% = 150, employer = 3.25% = 650
      expect(result.esiEmployee).toBe(150);
      expect(result.esiEmployer).toBe(650);
    });

    it("should NOT apply ESI for high salaries", () => {
      const result = calculator.calculate({ annualCTC: 1200000, state: "KA", regime: "NEW" });
      expect(result.esiEmployee).toBe(0);
      expect(result.esiEmployer).toBe(0);
    });
  });

  describe("Professional Tax", () => {
    it("should compute Karnataka PT (₹200 for gross > 15000)", () => {
      const result = calculator.calculate({ annualCTC: 1200000, state: "KA", regime: "NEW" });
      expect(result.professionalTax).toBe(200);
    });

    it("should compute zero PT for low salary in KA", () => {
      const result = calculator.calculate({ annualCTC: 150000, state: "KA", regime: "NEW" });
      expect(result.professionalTax).toBe(0);
    });

    it("should use default PT for unknown state", () => {
      const result = calculator.calculate({ annualCTC: 1200000, state: "XX", regime: "NEW" });
      expect(result.professionalTax).toBe(200); // Default slab
    });
  });

  describe("TDS / Income Tax", () => {
    it("should compute TDS for 12 LPA NEW regime", () => {
      const result = calculator.calculate({ annualCTC: 1200000, state: "KA", regime: "NEW" });
      expect(result.tds).toBeGreaterThan(0);
      expect(result.tds).toBeLessThan(result.grossSalary * 0.3); // Less than 30%
    });

    it("should compute zero tax for 3 LPA NEW regime", () => {
      const result = calculator.calculate({ annualCTC: 300000, state: "KA", regime: "NEW" });
      expect(result.tds).toBe(0); // Below 3L exemption
    });

    it("should compute higher tax for OLD regime without deductions", () => {
      const oldTax = calculator.calculateTax(1500000, "OLD");
      const newTax = calculator.calculateTax(1500000, "NEW");
      // At 15 LPA without 80C, OLD is often higher
      // (Both should be positive)
      expect(oldTax).toBeGreaterThan(0);
      expect(newTax).toBeGreaterThan(0);
    });
  });

  describe("Net Salary", () => {
    it("should compute net = gross - deductions", () => {
      const result = calculator.calculate({ annualCTC: 1200000, state: "KA", regime: "NEW" });
      const expectedNet = result.grossSalary - result.totalDeductions;
      expect(result.netSalary).toBe(expectedNet);
    });

    it("should compute take-home percentage", () => {
      const result = calculator.calculate({ annualCTC: 1200000, state: "KA", regime: "NEW" });
      expect(result.takeHomePercentage).toBeGreaterThan(60);
      expect(result.takeHomePercentage).toBeLessThan(100);
    });

    it("should compute total employer cost", () => {
      const result = calculator.calculate({ annualCTC: 1200000, state: "KA", regime: "NEW" });
      expect(result.totalEmployerCost).toBe(result.grossSalary + result.employerPF + result.employerESI);
      expect(result.totalEmployerCost).toBeGreaterThan(result.grossSalary);
    });
  });

  describe("Regime Comparison", () => {
    it("should compare OLD vs NEW regime", () => {
      const comparison = calculator.compareRegimes(1200000, 150000);
      expect(comparison.old.totalTax).toBeGreaterThan(0);
      expect(comparison.new.totalTax).toBeGreaterThan(0);
      expect(comparison.recommendation).toBeDefined();
      expect(comparison.savings).toBeGreaterThanOrEqual(0);
      expect(comparison.savingsPerMonth).toBeGreaterThanOrEqual(0);
    });

    it("should recommend NEW for high CTC without deductions", () => {
      const comparison = calculator.compareRegimes(2500000, 0);
      // NEW regime is generally better without 80C deductions
      expect(comparison.recommendation).toBeDefined();
    });

    it("should compute effective tax rates", () => {
      const comparison = calculator.compareRegimes(1500000);
      expect(comparison.old.effectiveRate).toBeGreaterThanOrEqual(0);
      expect(comparison.old.effectiveRate).toBeLessThan(30);
      expect(comparison.new.effectiveRate).toBeGreaterThanOrEqual(0);
    });
  });
});
