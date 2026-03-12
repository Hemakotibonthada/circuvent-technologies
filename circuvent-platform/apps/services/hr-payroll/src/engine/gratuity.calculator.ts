// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Gratuity Calculator
// Per Payment of Gratuity Act, 1972:
//   Gratuity = (15 × Last drawn salary × Years of service) / 26
//   Minimum 5 years of continuous service required.
//   Maximum tax-exempt gratuity: ₹25,00,000 (as of 2025).
// ──────────────────────────────────────────────────────────────

export interface GratuityConfig {
  minYearsOfService: number;  // 5
  maxExemptAmount: number;    // 25,00,000
  numerator: number;          // 15 (days per year)
  denominator: number;        // 26 (working days per month)
}

export interface GratuityResult {
  isEligible: boolean;
  yearsOfService: number;
  completedYears: number;
  lastDrawnBasic: number;
  lastDrawnDA: number;
  computedGratuity: number;
  exemptGratuity: number;
  taxableGratuity: number;
  reason?: string;
}

const DEFAULT_GRATUITY_CONFIG: GratuityConfig = {
  minYearsOfService: 5,
  maxExemptAmount: 2500000,
  numerator: 15,
  denominator: 26,
};

export function calculateGratuity(
  lastBasicSalary: number,
  lastDA: number,
  dateOfJoining: Date,
  dateOfLeaving: Date = new Date(),
  config: Partial<GratuityConfig> = {}
): GratuityResult {
  const cfg = { ...DEFAULT_GRATUITY_CONFIG, ...config };

  // Calculate years of service
  const msInService = dateOfLeaving.getTime() - dateOfJoining.getTime();
  const yearsOfService = msInService / (1000 * 60 * 60 * 24 * 365.25);

  // Completed years: if > 6 months in last year, round up
  const fullYears = Math.floor(yearsOfService);
  const remainingMonths = (yearsOfService - fullYears) * 12;
  const completedYears = remainingMonths >= 6 ? fullYears + 1 : fullYears;

  // Eligibility check
  if (completedYears < cfg.minYearsOfService) {
    return {
      isEligible: false,
      yearsOfService: Math.round(yearsOfService * 100) / 100,
      completedYears,
      lastDrawnBasic: lastBasicSalary,
      lastDrawnDA: lastDA,
      computedGratuity: 0,
      exemptGratuity: 0,
      taxableGratuity: 0,
      reason: `Minimum ${cfg.minYearsOfService} years of service required. Current: ${completedYears} years.`,
    };
  }

  // Gratuity = (15 * Last drawn salary * Years) / 26
  const lastDrawnSalary = lastBasicSalary + lastDA;
  const computedGratuity = Math.round(
    (cfg.numerator * lastDrawnSalary * completedYears) / cfg.denominator
  );

  // Tax exemption capped at ₹25,00,000
  const exemptGratuity = Math.min(computedGratuity, cfg.maxExemptAmount);
  const taxableGratuity = Math.max(0, computedGratuity - exemptGratuity);

  return {
    isEligible: true,
    yearsOfService: Math.round(yearsOfService * 100) / 100,
    completedYears,
    lastDrawnBasic: lastBasicSalary,
    lastDrawnDA: lastDA,
    computedGratuity,
    exemptGratuity,
    taxableGratuity,
  };
}
