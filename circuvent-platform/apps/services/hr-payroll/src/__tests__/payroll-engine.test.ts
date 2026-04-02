// ──────────────────────────────────────────────────────────────
// HR & Payroll — Payroll Automation Engine Test Suite
// Tests for salary breakdown, HRA, 80C/80D, TDS, professional
// tax, EPF/ESI, gratuity, leave encashment, and tax regime
// optimization.
// ──────────────────────────────────────────────────────────────

import { PayrollAutomationEngine } from "../engine/payroll-automation.engine";

describe("PayrollAutomationEngine", () => {
  // ────────────────────────────────────────────────────────────
  // Salary Breakdown
  // ────────────────────────────────────────────────────────────
  describe("calculateSalaryBreakdown", () => {
    it("should calculate correct CTC breakdown for ₹12 LPA", () => {
      const result = PayrollAutomationEngine.calculateSalaryBreakdown(1200000);
      expect(result.annualCTC).toBe(1200000);
      expect(result.monthlyCTC).toBe(100000);
      expect(result.basic).toBe(50000);              // 50%
      expect(result.hra).toBe(20000);                // 20%
      expect(result.da).toBe(10000);                 // 10%
      expect(result.specialAllowance).toBe(20000);   // 20%
    });

    it("should have grossSalary = basic + hra + da + special", () => {
      const result = PayrollAutomationEngine.calculateSalaryBreakdown(1200000);
      expect(result.grossSalary).toBe(
        result.basic + result.hra + result.da + result.specialAllowance
      );
    });

    it("should apply custom salary structure percentages", () => {
      const result = PayrollAutomationEngine.calculateSalaryBreakdown(600000, {
        basicPercent: 0.40,
        hraPercent: 0.25,
        daPercent: 0.15,
        specialPercent: 0.20,
      });
      expect(result.basic).toBe(20000);      // 40% of 50000
      expect(result.hra).toBe(12500);         // 25% of 50000
      expect(result.da).toBe(7500);           // 15% of 50000
      expect(result.specialAllowance).toBe(10000); // 20% of 50000
    });

    it("should calculate netSalary = gross - deductions", () => {
      const result = PayrollAutomationEngine.calculateSalaryBreakdown(1200000);
      expect(result.netSalary).toBe(
        result.grossSalary - result.totalDeductions
      );
    });

    it("should include EPF, ESI, PT, TDS in deductions", () => {
      const result = PayrollAutomationEngine.calculateSalaryBreakdown(1200000);
      expect(result.totalDeductions).toBe(
        result.epfEmployee + result.esiEmployee + result.professionalTax + result.tds
      );
    });

    it("should calculate employer cost", () => {
      const result = PayrollAutomationEngine.calculateSalaryBreakdown(1200000);
      expect(result.totalEmployerCost).toBe(
        result.grossSalary + result.epfEmployer + result.esiEmployer
      );
    });

    it("should handle low salary where ESI applies", () => {
      const result = PayrollAutomationEngine.calculateSalaryBreakdown(240000); // ₹20K/month
      expect(result.grossSalary).toBe(20000);
      expect(result.esiEmployee).toBeGreaterThan(0);
      expect(result.esiEmployer).toBeGreaterThan(0);
    });

    it("should apply zero ESI when gross > ₹21,000", () => {
      const result = PayrollAutomationEngine.calculateSalaryBreakdown(1200000);
      expect(result.grossSalary).toBeGreaterThan(21000);
      expect(result.esiEmployee).toBe(0);
      expect(result.esiEmployer).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // HRA Exemption
  // ────────────────────────────────────────────────────────────
  describe("calculateHRA", () => {
    it("should calculate HRA for metro city (50% of basic)", () => {
      const result = PayrollAutomationEngine.calculateHRA(50000, true, 20000, 20000);
      expect(result.section).toBe("Section 10(13A)");
      expect(result.exemptAmount).toBeGreaterThanOrEqual(0);
    });

    it("should calculate HRA for non-metro city (40% of basic)", () => {
      const result = PayrollAutomationEngine.calculateHRA(50000, false, 20000, 20000);
      expect(result.exemptAmount).toBeGreaterThanOrEqual(0);
    });

    it("should return minimum of three HRA components", () => {
      // For metro: 50% of 50000=25000, actual HRA=20000, rent-10% basic=20000-5000=15000
      const result = PayrollAutomationEngine.calculateHRA(50000, true, 20000, 20000);
      const annualExpected = Math.min(20000, 25000, 15000) * 12;
      expect(result.exemptAmount).toBe(annualExpected);
    });

    it("should return 0 when rent is less than 10% of basic", () => {
      const result = PayrollAutomationEngine.calculateHRA(50000, true, 3000, 20000);
      // rent - 10% basic = 3000 - 5000 = -2000, capped at 0
      expect(result.exemptAmount).toBe(0);
    });

    it("should handle zero rent", () => {
      const result = PayrollAutomationEngine.calculateHRA(50000, true, 0, 20000);
      expect(result.exemptAmount).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Section 80C
  // ────────────────────────────────────────────────────────────
  describe("calculateSection80C", () => {
    it("should apply 80C cap of ₹1.5 lakh", () => {
      const result = PayrollAutomationEngine.calculateSection80C({
        ppf: 100000,
        elss: 80000,
        lifeInsurance: 50000,
      });
      expect(result.maxAllowed).toBe(150000);
      expect(result.eligibleAmount).toBe(150000);
      expect(result.declaredAmount).toBe(230000);
    });

    it("should sum all investment types", () => {
      const result = PayrollAutomationEngine.calculateSection80C({
        ppf: 50000,
        elss: 30000,
        nsc: 10000,
        lifeInsurance: 15000,
        tuitionFees: 20000,
      });
      expect(result.declaredAmount).toBe(125000);
      expect(result.eligibleAmount).toBe(125000);
    });

    it("should handle no investments", () => {
      const result = PayrollAutomationEngine.calculateSection80C({});
      expect(result.declaredAmount).toBe(0);
      expect(result.eligibleAmount).toBe(0);
    });

    it("should include EPF in 80C computation", () => {
      const result = PayrollAutomationEngine.calculateSection80C({
        epfContribution: 72000,
        ppf: 50000,
      });
      expect(result.declaredAmount).toBe(122000);
      expect(result.eligibleAmount).toBe(122000);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Section 80D
  // ────────────────────────────────────────────────────────────
  describe("calculateSection80D", () => {
    it("should cap self premium at ₹25,000 for non-senior", () => {
      const result = PayrollAutomationEngine.calculateSection80D({
        selfPremium: 30000,
      });
      expect(result.eligibleAmount).toBe(25000);
    });

    it("should cap self premium at ₹50,000 for senior citizen", () => {
      const result = PayrollAutomationEngine.calculateSection80D({
        selfPremium: 60000,
        selfIsSenior: true,
      });
      expect(result.eligibleAmount).toBe(50000);
    });

    it("should add parents premium separately", () => {
      const result = PayrollAutomationEngine.calculateSection80D({
        selfPremium: 20000,
        parentsPremium: 25000,
      });
      expect(result.eligibleAmount).toBe(45000);
    });

    it("should include preventive checkup cap ₹5,000", () => {
      const result = PayrollAutomationEngine.calculateSection80D({
        selfPremium: 20000,
        preventiveCheckup: 10000,
      });
      expect(result.eligibleAmount).toBe(25000); // 20000 + 5000 (capped)
    });

    it("should handle no medical insurance", () => {
      const result = PayrollAutomationEngine.calculateSection80D({});
      expect(result.eligibleAmount).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // TDS Calculation
  // ────────────────────────────────────────────────────────────
  describe("calculateTDS", () => {
    it("should calculate TDS for new regime", () => {
      const result = PayrollAutomationEngine.calculateTDS(1200000, "NEW");
      expect(result.annualTax).toBeGreaterThanOrEqual(0);
      expect(result.monthlyTDS).toBeGreaterThanOrEqual(0);
      expect(result.effectiveRate).toBeGreaterThanOrEqual(0);
      expect(result.slabs).toBeInstanceOf(Array);
    });

    it("should calculate TDS for old regime", () => {
      const result = PayrollAutomationEngine.calculateTDS(1200000, "OLD");
      expect(result.annualTax).toBeGreaterThanOrEqual(0);
      expect(result.slabs).toBeInstanceOf(Array);
    });

    it("should apply new regime standard deduction of ₹75,000", () => {
      const income = 800000;
      const result = PayrollAutomationEngine.calculateTDS(income, "NEW");
      // Taxable = 800000 - 75000 = 725000
      // This is above rebate limit of 7L, so tax applies
      expect(result.annualTax).toBeGreaterThan(0);
    });

    it("should apply rebate under 87A for new regime", () => {
      const result = PayrollAutomationEngine.calculateTDS(700000, "NEW");
      // Taxable = 700000 - 75000 = 625000, which is <= 700000 rebate limit
      expect(result.annualTax).toBe(0);
    });

    it("should be 0 tax for income below exemption limit", () => {
      const result = PayrollAutomationEngine.calculateTDS(300000, "NEW");
      expect(result.annualTax).toBe(0);
      expect(result.monthlyTDS).toBe(0);
    });

    it("should have monthlyTDS = annualTax / 12", () => {
      const result = PayrollAutomationEngine.calculateTDS(2000000, "NEW");
      expect(result.monthlyTDS).toBe(Math.round(result.annualTax / 12));
    });

    it("should calculate effective rate correctly", () => {
      const income = 2000000;
      const result = PayrollAutomationEngine.calculateTDS(income, "NEW");
      const expectedRate = Math.round((result.annualTax / income) * 10000) / 100;
      expect(result.effectiveRate).toBe(expectedRate);
    });

    it("should have 0% effective rate for 0 income", () => {
      const result = PayrollAutomationEngine.calculateTDS(0, "NEW");
      expect(result.effectiveRate).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Professional Tax
  // ────────────────────────────────────────────────────────────
  describe("calculateProfessionalTax", () => {
    it("should return ₹200 for Karnataka above ₹15,000", () => {
      expect(PayrollAutomationEngine.calculateProfessionalTax("Karnataka", 50000)).toBe(200);
    });

    it("should return ₹0 for Karnataka below ₹15,000", () => {
      expect(PayrollAutomationEngine.calculateProfessionalTax("Karnataka", 12000)).toBe(0);
    });

    it("should return ₹0 for Delhi (no PT)", () => {
      expect(PayrollAutomationEngine.calculateProfessionalTax("Delhi", 100000)).toBe(0);
    });

    it("should return ₹200 for Maharashtra above ₹10,000", () => {
      expect(PayrollAutomationEngine.calculateProfessionalTax("Maharashtra", 25000)).toBe(200);
    });

    it("should return ₹175 for Maharashtra ₹7,501-₹10,000", () => {
      expect(PayrollAutomationEngine.calculateProfessionalTax("Maharashtra", 9000)).toBe(175);
    });

    it("should return ₹0 for Maharashtra below ₹7,500", () => {
      expect(PayrollAutomationEngine.calculateProfessionalTax("Maharashtra", 6000)).toBe(0);
    });

    it("should calculate Tamil Nadu progressive tax", () => {
      expect(PayrollAutomationEngine.calculateProfessionalTax("Tamil Nadu", 15000)).toBe(0);
      expect(PayrollAutomationEngine.calculateProfessionalTax("Tamil Nadu", 25000)).toBe(100);
      expect(PayrollAutomationEngine.calculateProfessionalTax("Tamil Nadu", 100000)).toBe(1095);
    });

    it("should return default ₹200 for unknown state", () => {
      expect(PayrollAutomationEngine.calculateProfessionalTax("UnknownState", 50000)).toBe(200);
    });
  });

  // ────────────────────────────────────────────────────────────
  // EPF Contributions
  // ────────────────────────────────────────────────────────────
  describe("calculateEPFContribution", () => {
    it("should calculate 12% employee contribution", () => {
      const result = PayrollAutomationEngine.calculateEPFContribution(50000, 5000);
      expect(result.employee).toBe(Math.round(55000 * 0.12));
    });

    it("should split employer contribution into EPF and EPS", () => {
      const result = PayrollAutomationEngine.calculateEPFContribution(50000, 5000);
      expect(result.employerEPF).toBeGreaterThan(0);
      expect(result.employerEPS).toBeGreaterThan(0);
      expect(result.employerEPF + result.employerEPS).toBe(result.employee);
    });

    it("should cap EPS ceiling at ₹15,000", () => {
      const result = PayrollAutomationEngine.calculateEPFContribution(50000, 5000);
      // EPS = 8.33% of min(55000, 15000) = 8.33% of 15000
      expect(result.employerEPS).toBe(Math.round(15000 * 0.0833));
    });

    it("should handle zero DA", () => {
      const result = PayrollAutomationEngine.calculateEPFContribution(30000);
      expect(result.employee).toBe(Math.round(30000 * 0.12));
    });

    it("should calculate total as employee + employer", () => {
      const result = PayrollAutomationEngine.calculateEPFContribution(30000, 5000);
      expect(result.total).toBe(result.employee + result.employerEPF + result.employerEPS);
    });
  });

  // ────────────────────────────────────────────────────────────
  // ESI Contributions
  // ────────────────────────────────────────────────────────────
  describe("calculateESIContribution", () => {
    it("should return applicable=false when gross > ₹21,000", () => {
      const result = PayrollAutomationEngine.calculateESIContribution(50000);
      expect(result.applicable).toBe(false);
      expect(result.employee).toBe(0);
      expect(result.employer).toBe(0);
    });

    it("should calculate 0.75% employee and 3.25% employer", () => {
      const result = PayrollAutomationEngine.calculateESIContribution(18000);
      expect(result.applicable).toBe(true);
      expect(result.employee).toBe(Math.round(18000 * 0.0075));
      expect(result.employer).toBe(Math.round(18000 * 0.0325));
    });

    it("should be applicable at exactly ₹21,000", () => {
      const result = PayrollAutomationEngine.calculateESIContribution(21000);
      expect(result.applicable).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Gratuity Calculation
  // ────────────────────────────────────────────────────────────
  describe("calculateGratuity", () => {
    it("should calculate gratuity for eligible employee", () => {
      const result = PayrollAutomationEngine.calculateGratuity(50000, 10);
      expect(result.eligible).toBe(true);
      expect(result.amount).toBe(Math.min(Math.round((50000 * 15 * 10) / 26), 2500000));
    });

    it("should return not eligible for < 5 years", () => {
      const result = PayrollAutomationEngine.calculateGratuity(50000, 3);
      expect(result.eligible).toBe(false);
      expect(result.amount).toBe(0);
    });

    it("should cap at ₹25 lakh maximum", () => {
      const result = PayrollAutomationEngine.calculateGratuity(200000, 30);
      expect(result.amount).toBeLessThanOrEqual(2500000);
      expect(result.cappedAmount).toBe(2500000);
    });

    it("should handle exactly 5 years", () => {
      const result = PayrollAutomationEngine.calculateGratuity(40000, 5);
      expect(result.eligible).toBe(true);
      expect(result.amount).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Leave Encashment
  // ────────────────────────────────────────────────────────────
  describe("calculateLeaveEncashment", () => {
    it("should calculate daily rate from basic + DA", () => {
      const result = PayrollAutomationEngine.calculateLeaveEncashment(60000, 30);
      expect(result.dailyRate).toBe(Math.round(60000 / 30));
      expect(result.encashableDays).toBe(30);
      expect(result.amount).toBe(result.dailyRate * 30);
    });

    it("should cap at max 300 encashable days", () => {
      const result = PayrollAutomationEngine.calculateLeaveEncashment(60000, 500);
      expect(result.encashableDays).toBe(300);
    });

    it("should use custom max encashable days", () => {
      const result = PayrollAutomationEngine.calculateLeaveEncashment(60000, 50, 40);
      expect(result.encashableDays).toBe(40);
    });

    it("should handle zero leave balance", () => {
      const result = PayrollAutomationEngine.calculateLeaveEncashment(60000, 0);
      expect(result.amount).toBe(0);
      expect(result.encashableDays).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // NPS (80CCD)
  // ────────────────────────────────────────────────────────────
  describe("calculateNPS", () => {
    it("should cap at ₹50,000", () => {
      const result = PayrollAutomationEngine.calculateNPS(80000);
      expect(result.maxAllowed).toBe(50000);
      expect(result.eligibleAmount).toBe(50000);
    });

    it("should allow full amount below cap", () => {
      const result = PayrollAutomationEngine.calculateNPS(30000);
      expect(result.eligibleAmount).toBe(30000);
    });

    it("should handle zero contribution", () => {
      const result = PayrollAutomationEngine.calculateNPS(0);
      expect(result.eligibleAmount).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // LTA
  // ────────────────────────────────────────────────────────────
  describe("calculateLTA", () => {
    it("should allow LTA claim within block limit", () => {
      const result = PayrollAutomationEngine.calculateLTA(50000, 0);
      expect(result.exemptAmount).toBe(50000);
    });

    it("should allow second claim in block", () => {
      const result = PayrollAutomationEngine.calculateLTA(50000, 1);
      expect(result.exemptAmount).toBe(50000);
    });

    it("should disallow third claim in block", () => {
      const result = PayrollAutomationEngine.calculateLTA(50000, 2);
      expect(result.exemptAmount).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Tax Regime Optimization
  // ────────────────────────────────────────────────────────────
  describe("optimizeTaxRegime", () => {
    it("should compare old and new regime", () => {
      const result = PayrollAutomationEngine.optimizeTaxRegime(1500000, {
        section80C: 150000,
        section80D: 25000,
      });
      expect(result.oldRegimeTax).toBeGreaterThanOrEqual(0);
      expect(result.newRegimeTax).toBeGreaterThanOrEqual(0);
      expect(result.recommendedRegime).toMatch(/^(OLD|NEW)$/);
    });

    it("should recommend regime with lower tax", () => {
      const result = PayrollAutomationEngine.optimizeTaxRegime(1500000, {
        section80C: 150000,
        section80D: 50000,
        hraExemption: 200000,
        nps: 50000,
      });
      if (result.oldRegimeTax <= result.newRegimeTax) {
        expect(result.recommendedRegime).toBe("OLD");
      } else {
        expect(result.recommendedRegime).toBe("NEW");
      }
    });

    it("should calculate savings as absolute difference", () => {
      const result = PayrollAutomationEngine.optimizeTaxRegime(2000000, {
        section80C: 150000,
      });
      expect(result.savings).toBe(Math.abs(result.oldRegimeTax - result.newRegimeTax));
    });

    it("should prefer new regime for low deductions", () => {
      const result = PayrollAutomationEngine.optimizeTaxRegime(1000000, {});
      // With no deductions, new regime is generally better
      expect(result.newRegimeTax).toBeLessThanOrEqual(result.oldRegimeTax);
    });

    it("should include slab breakdown for both regimes", () => {
      const result = PayrollAutomationEngine.optimizeTaxRegime(2000000);
      expect(result.oldRegimeDetails.slabs).toBeInstanceOf(Array);
      expect(result.newRegimeDetails.slabs).toBeInstanceOf(Array);
      expect(result.oldRegimeDetails.taxableIncome).toBeGreaterThan(0);
      expect(result.newRegimeDetails.taxableIncome).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // CTC Calculation
  // ────────────────────────────────────────────────────────────
  describe("calculateCTC", () => {
    it("should annualize monthly components", () => {
      const ctc = PayrollAutomationEngine.calculateCTC({
        basic: 50000,
        hra: 20000,
        da: 10000,
        specialAllowance: 20000,
      });
      expect(ctc).toBe(1200000); // 100000 * 12
    });

    it("should include employer contributions", () => {
      const ctc = PayrollAutomationEngine.calculateCTC({
        basic: 50000,
        hra: 20000,
        epfEmployer: 6000,
        esiEmployer: 0,
      });
      expect(ctc).toBe((50000 + 20000 + 6000) * 12);
    });

    it("should handle missing components as 0", () => {
      const ctc = PayrollAutomationEngine.calculateCTC({
        basic: 50000,
        hra: 20000,
      });
      expect(ctc).toBe(840000); // (50000 + 20000) * 12
    });
  });
});
