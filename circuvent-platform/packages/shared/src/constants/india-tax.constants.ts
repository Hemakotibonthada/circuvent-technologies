// ──────────────────────────────────────────────────────────────
// Circuvent Platform — India Statutory Constants
// Complete reference for EPF, ESI, TDS, PT, Gratuity rates,
// GST slabs, TAN requirements, and compliance deadlines.
// ──────────────────────────────────────────────────────────────

// ═══ EPF / EPS / EDLI Constants ═══

export const EPF_CONSTANTS = {
  EMPLOYEE_CONTRIBUTION_RATE: 0.12,         // 12% of basic + DA
  EMPLOYER_EPF_TOTAL_RATE: 0.12,           // 12% total employer
  EMPLOYER_EPS_RATE: 0.0833,               // 8.33% to EPS
  EMPLOYER_EPF_RATE: 0.0367,               // 3.67% to EPF (12% - 8.33%)
  WAGE_CEILING: 15000,                      // ₹15,000 per month
  ADMIN_CHARGES_RATE: 0.005,               // 0.50%
  EDLI_CONTRIBUTION_RATE: 0.005,           // 0.50%
  EDLI_ADMIN_CHARGES_RATE: 0,             // Waived since 2018
  EPS_MAX_PENSIONABLE_SALARY: 15000,
  MIN_CONTRIBUTION: 1,                     // Minimum ₹1 contribution
  VOLUNTARY_PF_MAX_RATE: 1.0,             // Can contribute up to 100%
  EPF_INTEREST_RATE_FY2526: 0.081,         // 8.1% for FY 2025-26
} as const;

// ═══ ESI Constants ═══

export const ESI_CONSTANTS = {
  EMPLOYEE_RATE: 0.0075,                   // 0.75%
  EMPLOYER_RATE: 0.0325,                   // 3.25%
  WAGE_CEILING: 21000,                     // ₹21,000 gross per month
  CONTRIBUTION_PERIOD_1: { start: "April", end: "September", benefitStart: "January" },
  CONTRIBUTION_PERIOD_2: { start: "October", end: "March", benefitStart: "July" },
  SICKNESS_BENEFIT_RATE: 0.70,            // 70% of average daily wages
  DISABILITY_BENEFIT_RATE: 0.90,          // 90% of average daily wages
} as const;

// ═══ TDS (Income Tax) Constants — FY 2025-26 ═══

export const TDS_CONSTANTS = {
  NEW_REGIME: {
    SLABS: [
      { min: 0,       max: 400000,   rate: 0,    label: "Nil" },
      { min: 400001,  max: 800000,   rate: 0.05, label: "5%" },
      { min: 800001,  max: 1200000,  rate: 0.10, label: "10%" },
      { min: 1200001, max: 1600000,  rate: 0.15, label: "15%" },
      { min: 1600001, max: 2000000,  rate: 0.20, label: "20%" },
      { min: 2000001, max: 2400000,  rate: 0.25, label: "25%" },
      { min: 2400001, max: Infinity, rate: 0.30, label: "30%" },
    ],
    STANDARD_DEDUCTION: 75000,
    REBATE_LIMIT: 700000,                  // Section 87A
    REBATE_AMOUNT: 25000,
  },
  OLD_REGIME: {
    SLABS: [
      { min: 0,       max: 250000,   rate: 0,    label: "Nil" },
      { min: 250001,  max: 500000,   rate: 0.05, label: "5%" },
      { min: 500001,  max: 1000000,  rate: 0.20, label: "20%" },
      { min: 1000001, max: Infinity, rate: 0.30, label: "30%" },
    ],
    STANDARD_DEDUCTION: 50000,
    REBATE_LIMIT: 500000,
    REBATE_AMOUNT: 12500,
  },
  CESS_RATE: 0.04,                         // Health & Education Cess 4%
  SURCHARGE_SLABS: [
    { min: 0,        max: 5000000,   rate: 0 },
    { min: 5000001,  max: 10000000,  rate: 0.10 },
    { min: 10000001, max: 20000000,  rate: 0.15 },
    { min: 20000001, max: 50000000,  rate: 0.25 },
    { min: 50000001, max: Infinity,  rate: 0.37 },
  ],
  NEW_REGIME_SURCHARGE_CAP: 0.25,         // Capped at 25% for new regime
  SECTION_80C_MAX: 150000,
  SECTION_80D_MAX_SELF: 25000,
  SECTION_80D_MAX_SENIOR: 50000,
  SECTION_80D_MAX_PARENTS: 25000,
  SECTION_80D_MAX_PARENTS_SENIOR: 50000,
  SECTION_24_HOME_LOAN_MAX: 200000,
  SECTION_80CCD_NPS_MAX: 50000,
  SECTION_80E_EDUCATION_LOAN: Infinity,    // Full interest deductible
  SECTION_80G_DONATION: 0.50,             // 50% of donation
  SECTION_80TTA_SAVINGS_MAX: 10000,
  HRA_EXEMPTION_RATES: {
    METRO: 0.50,                           // 50% of basic for metro cities
    NON_METRO: 0.40,                       // 40% of basic for non-metro
  },
} as const;

// ═══ Professional Tax State-wise ═══

export const PT_CONSTANTS = {
  MAX_ANNUAL: 2500,                        // Maximum ₹2,500 per year (constitutional limit)
  STATES_WITH_PT: [
    "Karnataka", "Maharashtra", "West Bengal", "Tamil Nadu",
    "Andhra Pradesh", "Telangana", "Gujarat", "Madhya Pradesh",
    "Odisha", "Kerala", "Assam", "Meghalaya", "Tripura",
    "Manipur", "Mizoram", "Sikkim", "Jharkhand", "Chhattisgarh",
  ],
  STATES_WITHOUT_PT: [
    "Delhi", "Uttar Pradesh", "Rajasthan", "Uttarakhand",
    "Haryana", "Himachal Pradesh", "Punjab", "Bihar",
    "Jammu and Kashmir", "Ladakh", "Goa",
  ],
  FEBRUARY_ADJUSTMENT_STATES: ["Karnataka", "Maharashtra"],
} as const;

// ═══ Gratuity Constants ═══

export const GRATUITY_CONSTANTS = {
  MIN_YEARS_OF_SERVICE: 5,
  FORMULA_NUMERATOR: 15,                   // 15 days
  FORMULA_DENOMINATOR: 26,                 // 26 working days
  MAX_EXEMPT_AMOUNT: 2500000,              // ₹25,00,000
  CALCULATION: "(15 × Last drawn salary × Years of service) / 26",
  ROUNDING_RULE: "6 months and above counts as 1 full year",
} as const;

// ═══ GST Constants ═══

export const GST_CONSTANTS = {
  RATES: [0, 5, 12, 18, 28] as const,
  DEFAULT_RATE: 18,
  COMPOSITION_LIMIT: 15000000,             // ₹1.5 crore
  REGISTRATION_THRESHOLD: 2000000,         // ₹20 lakh (₹10 lakh for special states)
  SPECIAL_STATE_THRESHOLD: 1000000,
  INVOICE_LIMIT_B2C: 250000,               // E-invoice mandatory above ₹5 crore
  E_INVOICE_THRESHOLD: 50000000,
  RETURN_DUE_DATES: {
    GSTR1: 11,                              // 11th of next month
    GSTR3B: 20,                             // 20th of next month
    GSTR9: "31st December",                 // Annual return
  },
  HSN_CODE_MANDATORY_ABOVE: 50000000,     // ₹5 crore turnover
} as const;

// ═══ Compliance Calendar (Monthly) ═══

export const COMPLIANCE_DEADLINES = {
  EPF_PAYMENT: 15,                         // 15th of next month
  ESI_PAYMENT: 15,                         // 15th of next month
  TDS_DEPOSIT: 7,                          // 7th of next month
  GSTR1_FILING: 11,
  GSTR3B_FILING: 20,
  PROFESSIONAL_TAX_PAYMENT: 15,           // Varies by state
  TDS_QUARTERLY_RETURN: {                  // 24Q / 26Q
    Q1: "July 31",
    Q2: "October 31",
    Q3: "January 31",
    Q4: "May 31",
  },
  FORM_16_ISSUANCE: "June 15",
  ANNUAL_RETURN_GSTR9: "December 31",
  ITR_FILING: "July 31",
  TAX_AUDIT_REPORT: "September 30",
} as const;

// ═══ Leave Policy (default) ═══

export const LEAVE_POLICY = {
  CASUAL_LEAVE: { annual: 12, carryForward: false, maxAccumulation: 12, encashable: false },
  SICK_LEAVE: { annual: 12, carryForward: true, maxAccumulation: 36, encashable: false },
  EARNED_LEAVE: { annual: 15, carryForward: true, maxAccumulation: 45, encashable: true },
  MATERNITY_LEAVE: { annual: 182, carryForward: false, maxAccumulation: 182, encashable: false }, // 26 weeks
  PATERNITY_LEAVE: { annual: 15, carryForward: false, maxAccumulation: 15, encashable: false },
  COMPENSATORY_OFF: { annual: 0, carryForward: true, maxAccumulation: 10, encashable: false },
  BEREAVEMENT_LEAVE: { annual: 5, carryForward: false, maxAccumulation: 5, encashable: false },
  MARRIAGE_LEAVE: { annual: 5, carryForward: false, maxAccumulation: 5, encashable: false },
} as const;

// ═══ Salary Structure Ratios ═══

export const SALARY_STRUCTURE = {
  BASIC_PERCENTAGE: 0.50,                  // 50% of CTC
  HRA_PERCENTAGE: 0.20,                   // 20% of CTC
  DA_PERCENTAGE: 0.10,                    // 10% of CTC
  SPECIAL_ALLOWANCE_PERCENTAGE: 0.20,     // 20% of CTC
  DEFAULT_CURRENCY: "INR",
  PF_EMPLOYER_CONTRIBUTION_IN_CTC: true,
  GRATUITY_IN_CTC: false,
  BONUS_PERCENTAGE: 0.0833,               // 8.33% minimum bonus (Bonus Act)
} as const;
