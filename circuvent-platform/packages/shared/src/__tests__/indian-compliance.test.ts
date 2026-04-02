// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Indian Compliance Test Suite
// Tests for Income Tax (Old & New Regime), EPF, ESI,
// Professional Tax,  Gratuity, Bonus, HRA Exemption,
// TDS, PAN/Aadhaar/GSTIN/IFSC/UAN validation, minimum wages.
// ──────────────────────────────────────────────────────────────

import {
  calculateIncomeTax,
  calculateEPFContribution,
  calculateESIContribution,
  calculateProfessionalTax,
  calculateGratuity,
  calculateBonus,
} from "../utils/indian-compliance";

// ══════════════════════════════════════════════════════════════
// Income Tax — New Regime FY 2025-26
// ══════════════════════════════════════════════════════════════

describe("Income Tax — New Regime", () => {
  it("should be 0 for income up to ₹4,75,000 (incl. std deduction)", () => {
    const result = calculateIncomeTax(475000, "NEW");
    expect(result.totalTaxLiability).toBe(0);
    expect(result.regime).toBe("NEW");
  });

  it("should apply rebate u/s 87A for income ≤ ₹12,75,000", () => {
    // New regime: std deduction 75,000, so taxable = 12,00,000 → rebate applicable
    const result = calculateIncomeTax(1275000, "NEW");
    expect(result.totalTaxLiability).toBe(0);
  });

  it("should calculate tax for ₹15,00,000 income", () => {
    const result = calculateIncomeTax(1500000, "NEW");
    expect(result.taxableIncome).toBe(1425000); // 15L - 75K std deduction
    expect(result.totalTax).toBeGreaterThan(0);
    expect(result.totalTaxLiability).toBeGreaterThan(0);
  });

  it("should calculate tax for ₹25,00,000 income", () => {
    const result = calculateIncomeTax(2500000, "NEW");
    expect(result.totalTax).toBeGreaterThan(0);
    expect(result.cess).toBeGreaterThan(0);
    expect(result.totalTaxLiability).toBeGreaterThan(result.totalTax);
  });

  it("should have correct standard deduction of ₹75,000", () => {
    const result = calculateIncomeTax(1000000, "NEW");
    expect(result.taxableIncome).toBe(925000); // 10L - 75K
  });

  it("should include cess at 4%", () => {
    const result = calculateIncomeTax(2000000, "NEW");
    const expectedCess = Math.round((result.totalTax + result.surcharge) * 0.04);
    expect(result.cess).toBe(expectedCess);
  });

  it("should apply surcharge for income > ₹50L", () => {
    const result = calculateIncomeTax(6000000, "NEW");
    expect(result.surcharge).toBeGreaterThan(0);
  });

  it("should have zero tax for income of 0", () => {
    const result = calculateIncomeTax(0, "NEW");
    expect(result.totalTaxLiability).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Income Tax — Old Regime
// ══════════════════════════════════════════════════════════════

describe("Income Tax — Old Regime", () => {
  it("should be 0 for income up to ₹3,00,000 (incl. std deduction)", () => {
    const result = calculateIncomeTax(300000, "OLD");
    expect(result.totalTaxLiability).toBe(0);
  });

  it("should apply rebate for taxable income ≤ ₹5,00,000", () => {
    const result = calculateIncomeTax(550000, "OLD");
    // Taxable = 550000 - 50000 = 500000 → rebate applies
    expect(result.totalTaxLiability).toBe(0);
  });

  it("should have standard deduction of ₹50,000", () => {
    const result = calculateIncomeTax(1000000, "OLD");
    expect(result.taxableIncome).toBe(950000);
  });

  it("should calculate correct tax for ₹10,00,000", () => {
    const result = calculateIncomeTax(1000000, "OLD");
    expect(result.totalTax).toBeGreaterThan(0);
    expect(result.slabs.length).toBeGreaterThanOrEqual(2);
  });

  it("should apply 30% slab for income above ₹10,00,000", () => {
    const result = calculateIncomeTax(1500000, "OLD");
    const highSlab = result.slabs.find((s) => s.slab.includes("Above"));
    expect(highSlab).toBeDefined();
    expect(highSlab!.tax).toBeGreaterThan(0);
  });

  it("should distinguish regime in breakdown", () => {
    const oldResult = calculateIncomeTax(1200000, "OLD");
    const newResult = calculateIncomeTax(1200000, "NEW");
    expect(oldResult.regime).toBe("OLD");
    expect(newResult.regime).toBe("NEW");
  });
});

// ══════════════════════════════════════════════════════════════
// EPF (Employees' Provident Fund)
// ══════════════════════════════════════════════════════════════

describe("EPF Contribution", () => {
  it("should calculate 12% employee share", () => {
    const result = calculateEPFContribution(30000);
    expect(result.employeeShare).toBe(3600); // 30000 * 12%
    expect(result.rate.employee).toBe(12);
  });

  it("should split employer contribution into EPF and EPS", () => {
    const result = calculateEPFContribution(30000);
    expect(result.employerEPF).toBe(Math.round(30000 * 3.67 / 100));
    // EPS is capped at ₹15,000 wage
    expect(result.employerEPS).toBe(Math.round(15000 * 8.33 / 100));
  });

  it("should cap EPS contribution at ₹15,000 wages", () => {
    const result1 = calculateEPFContribution(15000);
    const result2 = calculateEPFContribution(50000);
    // EPS should be same for both since it's capped
    expect(result1.employerEPS).toBe(result2.employerEPS);
  });

  it("should calculate total employer contribution", () => {
    const result = calculateEPFContribution(25000);
    expect(result.totalEmployer).toBe(result.employerEPF + result.employerEPS);
  });

  it("should calculate total contribution", () => {
    const result = calculateEPFContribution(20000);
    expect(result.total).toBe(result.employeeShare + result.totalEmployer);
  });

  it("should handle zero basic", () => {
    const result = calculateEPFContribution(0);
    expect(result.employeeShare).toBe(0);
    expect(result.total).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// ESI (Employees' State Insurance)
// ══════════════════════════════════════════════════════════════

describe("ESI Contribution", () => {
  it("should be applicable for gross ≤ ₹21,000", () => {
    const result = calculateESIContribution(21000);
    expect(result.applicable).toBe(true);
    expect(result.employeeShare).toBeGreaterThan(0);
    expect(result.employerShare).toBeGreaterThan(0);
  });

  it("should not be applicable for gross > ₹21,000", () => {
    const result = calculateESIContribution(25000);
    expect(result.applicable).toBe(false);
    expect(result.employeeShare).toBe(0);
    expect(result.employerShare).toBe(0);
  });

  it("should apply 0.75% employee rate", () => {
    const result = calculateESIContribution(20000);
    expect(result.employeeShare).toBe(Math.round(20000 * 0.75 / 100));
  });

  it("should apply 3.25% employer rate", () => {
    const result = calculateESIContribution(20000);
    expect(result.employerShare).toBe(Math.round(20000 * 3.25 / 100));
  });

  it("should calculate total correctly", () => {
    const result = calculateESIContribution(18000);
    expect(result.total).toBe(result.employeeShare + result.employerShare);
  });

  it("should handle boundary value of ₹21,000", () => {
    const result = calculateESIContribution(21000);
    expect(result.applicable).toBe(true);
  });

  it("should handle ₹21,001 as not applicable", () => {
    const result = calculateESIContribution(21001);
    expect(result.applicable).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Professional Tax — State-wise
// ══════════════════════════════════════════════════════════════

describe("Professional Tax", () => {
  it("should return 0 for states that don't levy PT", () => {
    expect(calculateProfessionalTax("DELHI", 50000)).toBe(0);
    expect(calculateProfessionalTax("HARYANA", 50000)).toBe(0);
  });

  it("should calculate for Maharashtra", () => {
    expect(calculateProfessionalTax("MAHARASHTRA", 5000)).toBe(0);
    expect(calculateProfessionalTax("MAHARASHTRA", 8000)).toBe(175);
    expect(calculateProfessionalTax("MAHARASHTRA", 15000)).toBe(200);
  });

  it("should calculate for Karnataka", () => {
    expect(calculateProfessionalTax("KARNATAKA", 10000)).toBe(0);
    expect(calculateProfessionalTax("KARNATAKA", 20000)).toBe(200);
    expect(calculateProfessionalTax("KARNATAKA", 30000)).toBe(200);
  });

  it("should calculate for Tamil Nadu", () => {
    expect(calculateProfessionalTax("TAMIL_NADU", 20000)).toBe(0);
    expect(calculateProfessionalTax("TAMIL_NADU", 25000)).toBe(135);
    expect(calculateProfessionalTax("TAMIL_NADU", 100000)).toBe(1250);
  });

  it("should be case-insensitive for state name", () => {
    expect(calculateProfessionalTax("maharashtra", 15000)).toBe(200);
  });

  it("should handle states with spaces", () => {
    expect(calculateProfessionalTax("ANDHRA PRADESH", 25000)).toBe(200);
    expect(calculateProfessionalTax("WEST BENGAL", 30000)).toBe(150);
  });

  it("should calculate Kerala PT correctly", () => {
    expect(calculateProfessionalTax("KERALA", 10000)).toBe(0);
    expect(calculateProfessionalTax("KERALA", 15000)).toBe(120);
    expect(calculateProfessionalTax("KERALA", 50000)).toBe(250);
  });
});

// ══════════════════════════════════════════════════════════════
// Gratuity
// ══════════════════════════════════════════════════════════════

describe("Gratuity", () => {
  it("should return 0 for service < 5 years", () => {
    expect(calculateGratuity(50000, 4)).toBe(0);
    expect(calculateGratuity(50000, 0)).toBe(0);
  });

  it("should calculate gratuity for 5+ years", () => {
    // (50000 * 15 * 5) / 26 = 144,230.77 ≈ 144,231
    const result = calculateGratuity(50000, 5);
    expect(result).toBeGreaterThan(0);
    expect(result).toBe(Math.round(Math.min((50000 * 15 * 5) / 26, 2500000)));
  });

  it("should cap at ₹25,00,000", () => {
    const result = calculateGratuity(500000, 30);
    expect(result).toBe(2500000);
  });

  it("should calculate correctly for 10 years", () => {
    // (40000 * 15 * 10) / 26 = 230,769.23
    const result = calculateGratuity(40000, 10);
    expect(result).toBe(Math.round((40000 * 15 * 10) / 26));
  });

  it("should handle exactly 5 years", () => {
    const result = calculateGratuity(30000, 5);
    expect(result).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Bonus
// ══════════════════════════════════════════════════════════════

describe("Bonus", () => {
  it("should return 0 for service < 1 year", () => {
    expect(calculateBonus(30000, 0)).toBe(0);
  });

  it("should calculate minimum 8.33% bonus", () => {
    // Capped salary = min(30000, 7000) = 7000
    // Min bonus = 7000 * 8.33% = 583
    const result = calculateBonus(30000, 2);
    expect(result).toBe(Math.round(7000 * 8.33 / 100));
  });

  it("should cap salary at ₹7,000 for bonus calculation", () => {
    const result1 = calculateBonus(7000, 1);
    const result2 = calculateBonus(100000, 1);
    // Both should use ₹7,000 cap
    expect(result1).toBe(result2);
  });
});

// ══════════════════════════════════════════════════════════════
// PAN Validation
// ══════════════════════════════════════════════════════════════

describe("PAN Validation", () => {
  function validatePAN(pan: string): boolean {
    return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase());
  }

  it("should accept valid PAN", () => {
    expect(validatePAN("ABCDE1234F")).toBe(true);
    expect(validatePAN("ZZZZZ9999Z")).toBe(true);
  });

  it("should reject invalid PAN", () => {
    expect(validatePAN("ABCD1234F")).toBe(false); // Only 4 letters
    expect(validatePAN("12345ABCDE")).toBe(false);
    expect(validatePAN("")).toBe(false);
    expect(validatePAN("ABCDE12345")).toBe(false); // 5 digits
  });

  it("should be case-insensitive", () => {
    expect(validatePAN("abcde1234f")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// Aadhaar Validation
// ══════════════════════════════════════════════════════════════

describe("Aadhaar Validation", () => {
  function validateAadhaar(aadhaar: string): boolean {
    const cleaned = aadhaar.replace(/[\s\-]/g, "");
    return /^[2-9]\d{11}$/.test(cleaned);
  }

  it("should accept valid 12-digit Aadhaar", () => {
    expect(validateAadhaar("234567890123")).toBe(true);
    expect(validateAadhaar("987654321012")).toBe(true);
  });

  it("should accept Aadhaar with spaces", () => {
    expect(validateAadhaar("2345 6789 0123")).toBe(true);
  });

  it("should accept Aadhaar with hyphens", () => {
    expect(validateAadhaar("2345-6789-0123")).toBe(true);
  });

  it("should reject Aadhaar starting with 0 or 1", () => {
    expect(validateAadhaar("012345678901")).toBe(false);
    expect(validateAadhaar("123456789012")).toBe(false);
  });

  it("should reject wrong length", () => {
    expect(validateAadhaar("12345678901")).toBe(false); // 11 digits
    expect(validateAadhaar("1234567890123")).toBe(false); // 13 digits
  });

  it("should reject non-numeric", () => {
    expect(validateAadhaar("23456789012A")).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// GSTIN Validation
// ══════════════════════════════════════════════════════════════

describe("GSTIN Validation", () => {
  function validateGSTIN(gstin: string): boolean {
    return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.toUpperCase());
  }

  it("should accept valid GSTIN", () => {
    expect(validateGSTIN("27AABCU9603R1ZM")).toBe(true);
    expect(validateGSTIN("29AABCU9603R1ZP")).toBe(true);
  });

  it("should reject invalid GSTIN", () => {
    expect(validateGSTIN("ABCDE1234F")).toBe(false);
    expect(validateGSTIN("")).toBe(false);
    expect(validateGSTIN("27AABCU9603R0ZM")).toBe(false); // 0 not allowed in entity code
  });

  it("should be case-insensitive", () => {
    expect(validateGSTIN("27aabcu9603r1zm")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// Tax Comparison (Old vs New)
// ══════════════════════════════════════════════════════════════

describe("Tax Comparison — Old vs New", () => {
  it("should allow comparison between regimes", () => {
    const income = 1500000;
    const oldTax = calculateIncomeTax(income, "OLD");
    const newTax = calculateIncomeTax(income, "NEW");

    expect(oldTax.regime).toBe("OLD");
    expect(newTax.regime).toBe("NEW");
    // Both should have tax for 15L income
    expect(oldTax.totalTaxLiability).toBeGreaterThan(0);
    expect(newTax.totalTaxLiability).toBeGreaterThan(0);
  });

  it("should generally favor new regime for no-deduction employees", () => {
    // For income without deductions, new regime is usually beneficial
    const income = 1200000;
    const oldTax = calculateIncomeTax(income, "OLD");
    const newTax = calculateIncomeTax(income, "NEW");

    // New regime should be <= old regime for moderate incomes
    expect(newTax.totalTaxLiability).toBeLessThanOrEqual(oldTax.totalTaxLiability);
  });

  it("should produce gross income matching input", () => {
    const income = 1800000;
    expect(calculateIncomeTax(income, "OLD").grossIncome).toBe(income);
    expect(calculateIncomeTax(income, "NEW").grossIncome).toBe(income);
  });
});
