// ──────────────────────────────────────────────────────────────
// HR & Payroll — Compliance Service Test Suite
// Tests for Indian labour law compliance checks including
// minimum wages, overtime, PF/ESI, gratuity, maternity, and
// bonus eligibility.
// ──────────────────────────────────────────────────────────────

import {
  checkMinimumWage,
  checkOvertimeCompliance,
  checkLeaveCompliance,
  checkPFCompliance,
  checkESICompliance,
  checkGratuityEligibility,
  checkMaternityBenefits,
  checkShopActCompliance,
  checkBonusEligibility,
  getStateMinimumWages,
} from "../services/compliance.service";

describe("ComplianceService", () => {
  // ────────────────────────────────────────────────────────────
  // Minimum Wage Checks
  // ────────────────────────────────────────────────────────────
  describe("checkMinimumWage", () => {
    it("should PASS when salary meets Karnataka minimum wage", () => {
      const result = checkMinimumWage("Karnataka", 25000);
      expect(result.status).toBe("PASS");
      expect(result.act).toContain("Minimum Wages Act");
      expect(result.details?.surplus).toBeGreaterThan(0);
    });

    it("should PASS when salary meets Delhi minimum wage", () => {
      const result = checkMinimumWage("Delhi", 20000);
      expect(result.status).toBe("PASS");
      expect(result.details?.minimumWage).toBe(19500);
    });

    it("should FAIL when salary is below state minimum", () => {
      const result = checkMinimumWage("Delhi", 10000);
      expect(result.status).toBe("FAIL");
      expect(result.details?.deficit).toBeGreaterThan(0);
    });

    it("should FAIL when salary is below Bihar minimum", () => {
      const result = checkMinimumWage("Bihar", 5000);
      expect(result.status).toBe("FAIL");
      expect(result.details?.deficit).toBe(9620 - 5000);
    });

    it("should PASS when salary equals exact minimum", () => {
      const result = checkMinimumWage("Karnataka", 13936);
      expect(result.status).toBe("PASS");
    });

    it("should WARNING for unknown state", () => {
      const result = checkMinimumWage("UnknownState", 15000);
      expect(result.status).toBe("WARNING");
      expect(result.message).toContain("not available");
    });

    it("should include state name in message", () => {
      const result = checkMinimumWage("Maharashtra", 20000);
      expect(result.message).toContain("Maharashtra");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Overtime Compliance
  // ────────────────────────────────────────────────────────────
  describe("checkOvertimeCompliance", () => {
    it("should PASS when weekly hours are within limits", () => {
      const result = checkOvertimeCompliance(40, "FULL_TIME", 20);
      expect(result.status).toBe("PASS");
      expect(result.details?.weeklyHours).toBe(40);
    });

    it("should PASS at exactly 48 hours", () => {
      const result = checkOvertimeCompliance(48, "FULL_TIME", 30);
      expect(result.status).toBe("PASS");
    });

    it("should FAIL when weekly hours exceed 48", () => {
      const result = checkOvertimeCompliance(55, "FULL_TIME", 20);
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("exceed");
    });

    it("should FAIL when quarterly OT exceeds 50 hours", () => {
      const result = checkOvertimeCompliance(45, "FULL_TIME", 60);
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("Quarterly OT");
    });

    it("should FAIL for both violations", () => {
      const result = checkOvertimeCompliance(55, "FULL_TIME", 60);
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("Weekly hours");
      expect(result.message).toContain("Quarterly OT");
    });

    it("should handle INTERN type", () => {
      const result = checkOvertimeCompliance(40, "INTERN");
      expect(result.status).toBe("PASS");
    });

    it("should FAIL for intern exceeding hours", () => {
      const result = checkOvertimeCompliance(52, "INTERN");
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("Intern");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Leave Compliance
  // ────────────────────────────────────────────────────────────
  describe("checkLeaveCompliance", () => {
    it("should PASS with adequate leave entitlements", () => {
      const result = checkLeaveCompliance({ earnedLeave: 15, casualLeave: 12, sickLeave: 12 });
      expect(result.status).toBe("PASS");
    });

    it("should PASS at exact minimum", () => {
      const result = checkLeaveCompliance({ earnedLeave: 12, casualLeave: 12, sickLeave: 12 });
      expect(result.status).toBe("PASS");
    });

    it("should FAIL when earned leave is below minimum", () => {
      const result = checkLeaveCompliance({ earnedLeave: 8, casualLeave: 12, sickLeave: 12 });
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("Earned leave");
    });

    it("should FAIL for all leaves below minimum", () => {
      const result = checkLeaveCompliance({ earnedLeave: 5, casualLeave: 5, sickLeave: 5 });
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("Earned leave");
      expect(result.message).toContain("Casual leave");
      expect(result.message).toContain("Sick leave");
    });
  });

  // ────────────────────────────────────────────────────────────
  // PF Compliance
  // ────────────────────────────────────────────────────────────
  describe("checkPFCompliance", () => {
    it("should PASS with correct 12% PF deduction", () => {
      const basic = 25000;
      const da = 5000;
      const expected = Math.round((basic + da) * 0.12);
      const result = checkPFCompliance(basic, da, expected);
      expect(result.status).toBe("PASS");
    });

    it("should PASS with slightly above minimum (within 5% tolerance)", () => {
      const basic = 25000;
      const da = 0;
      const expected = Math.round(basic * 0.12);
      const slightlyAbove = Math.round(expected * 0.96);
      const result = checkPFCompliance(basic, 0, slightlyAbove);
      expect(result.status).toBe("PASS");
    });

    it("should FAIL when PF deduction is too low", () => {
      const basic = 25000;
      const result = checkPFCompliance(basic, 0, 1000);
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("less than required");
    });

    it("should FAIL when no PF deduction is made", () => {
      const result = checkPFCompliance(30000, 5000, 0);
      expect(result.status).toBe("FAIL");
    });

    it("should calculate PF on basic + DA", () => {
      const basic = 20000;
      const da = 5000;
      const result = checkPFCompliance(basic, da, 3000);
      expect(result.details?.pfWage).toBe(25000);
      expect(result.details?.expectedContribution).toBe(3000);
    });
  });

  // ────────────────────────────────────────────────────────────
  // ESI Compliance
  // ────────────────────────────────────────────────────────────
  describe("checkESICompliance", () => {
    it("should mark ESI as not applicable when gross > ₹21,000", () => {
      const result = checkESICompliance(50000);
      expect(result.status).toBe("PASS");
      expect(result.details?.applicable).toBe(false);
    });

    it("should PASS with correct ESI deduction", () => {
      const gross = 18000;
      const expectedESI = Math.round(gross * 0.0075);
      const result = checkESICompliance(gross, expectedESI);
      expect(result.status).toBe("PASS");
      expect(result.details?.applicable).toBe(true);
    });

    it("should FAIL when ESI deduction is too low", () => {
      const result = checkESICompliance(18000, 50);
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("below required");
    });

    it("should handle salary at exact ₹21,000 ceiling", () => {
      const result = checkESICompliance(21000, Math.round(21000 * 0.0075));
      expect(result.status).toBe("PASS");
      expect(result.details?.applicable).toBe(true);
    });

    it("should mark ESI not applicable at ₹21,001", () => {
      const result = checkESICompliance(21001);
      expect(result.status).toBe("PASS");
      expect(result.details?.applicable).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Gratuity Eligibility
  // ────────────────────────────────────────────────────────────
  describe("checkGratuityEligibility", () => {
    it("should be eligible after 5 years", () => {
      const result = checkGratuityEligibility(5, 30000);
      expect(result.status).toBe("PASS");
      expect(result.details?.isEligible).toBe(true);
    });

    it("should calculate correct gratuity amount", () => {
      const result = checkGratuityEligibility(10, 50000);
      const expected = Math.round((50000 * 15 * 10) / 26);
      expect(result.details?.estimatedGratuity).toBe(Math.min(expected, 2500000));
    });

    it("should WARNING when not yet eligible", () => {
      const result = checkGratuityEligibility(3, 30000);
      expect(result.status).toBe("WARNING");
      expect(result.details?.isEligible).toBe(false);
      expect(result.message).toContain("2 more years");
    });

    it("should not exceed ₹25 lakh cap", () => {
      const result = checkGratuityEligibility(30, 200000);
      expect(result.details?.estimatedGratuity).toBeLessThanOrEqual(2500000);
    });

    it("should be eligible at exactly 5 years", () => {
      const result = checkGratuityEligibility(5, 40000);
      expect(result.status).toBe("PASS");
      expect(result.details?.isEligible).toBe(true);
    });

    it("should handle 0 years of service", () => {
      const result = checkGratuityEligibility(0);
      expect(result.status).toBe("WARNING");
      expect(result.message).toContain("5 more years");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Maternity Benefits
  // ────────────────────────────────────────────────────────────
  describe("checkMaternityBenefits", () => {
    it("should not be applicable for male employees", () => {
      const result = checkMaternityBenefits({ gender: "MALE", childCount: 0 });
      expect(result.status).toBe("PASS");
      expect(result.details?.applicable).toBe(false);
    });

    it("should entitle 26 weeks for first child", () => {
      const result = checkMaternityBenefits({ gender: "FEMALE", childCount: 0 });
      expect(result.status).toBe("PASS");
      expect(result.details?.entitledWeeks).toBe(26);
    });

    it("should entitle 26 weeks for second child", () => {
      const result = checkMaternityBenefits({ gender: "FEMALE", childCount: 1 });
      expect(result.details?.entitledWeeks).toBe(26);
    });

    it("should entitle 12 weeks for third child", () => {
      const result = checkMaternityBenefits({ gender: "FEMALE", childCount: 2 });
      expect(result.details?.entitledWeeks).toBe(12);
    });

    it("should indicate if currently pregnant", () => {
      const result = checkMaternityBenefits({ gender: "FEMALE", isPregnant: true, childCount: 0 });
      expect(result.message).toContain("currently applicable");
      expect(result.details?.isPregnant).toBe(true);
    });

    it("should handle gender 'F' as female", () => {
      const result = checkMaternityBenefits({ gender: "F", childCount: 0 });
      expect(result.details?.applicable).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Shop Act Compliance
  // ────────────────────────────────────────────────────────────
  describe("checkShopActCompliance", () => {
    it("should PASS with compliant working hours", () => {
      const result = checkShopActCompliance(8, 40, 2);
      expect(result.status).toBe("PASS");
    });

    it("should FAIL when daily hours exceed 9", () => {
      const result = checkShopActCompliance(12, 40, 1);
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("Daily hours");
    });

    it("should FAIL when weekly hours exceed 48", () => {
      const result = checkShopActCompliance(9, 55, 1);
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("Weekly hours");
    });

    it("should FAIL when no rest day is provided", () => {
      const result = checkShopActCompliance(8, 40, 0);
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("Rest days");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Bonus Eligibility
  // ────────────────────────────────────────────────────────────
  describe("checkBonusEligibility", () => {
    it("should PASS when salary exceeds bonus ceiling", () => {
      const result = checkBonusEligibility(25000, 2);
      expect(result.status).toBe("PASS");
      expect(result.details?.applicable).toBe(false);
    });

    it("should PASS when bonus meets minimum 8.33%", () => {
      const salary = 15000;
      const minBonus = Math.round(salary * 12 * 0.0833);
      const result = checkBonusEligibility(salary, 1, minBonus);
      expect(result.status).toBe("PASS");
    });

    it("should FAIL when bonus is below minimum", () => {
      const result = checkBonusEligibility(15000, 1, 1000);
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("below statutory minimum");
    });

    it("should WARNING for short service period", () => {
      const result = checkBonusEligibility(15000, 0.05, 0);
      expect(result.status).toBe("WARNING");
      expect(result.message).toContain("less than 30 days");
    });
  });

  // ────────────────────────────────────────────────────────────
  // State Minimum Wages Data
  // ────────────────────────────────────────────────────────────
  describe("getStateMinimumWages", () => {
    it("should return data for all major states", () => {
      const wages = getStateMinimumWages();
      expect(Object.keys(wages).length).toBeGreaterThanOrEqual(25);
      expect(wages["Karnataka"]).toBeDefined();
      expect(wages["Delhi"]).toBeDefined();
      expect(wages["Maharashtra"]).toBeDefined();
    });

    it("should have monthly and daily wages", () => {
      const wages = getStateMinimumWages();
      Object.values(wages).forEach((w: any) => {
        expect(w.daily).toBeGreaterThan(0);
        expect(w.monthly).toBeGreaterThan(0);
        expect(w.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    it("should return Delhi as highest minimum wage", () => {
      const wages = getStateMinimumWages();
      const delhiWage = wages["Delhi"].monthly;
      Object.entries(wages).forEach(([state, w]: [string, any]) => {
        expect(delhiWage).toBeGreaterThanOrEqual(w.monthly);
      });
    });

    it("should not return a reference to internal data", () => {
      const wages1 = getStateMinimumWages();
      const wages2 = getStateMinimumWages();
      expect(wages1).not.toBe(wages2);
    });
  });
});
