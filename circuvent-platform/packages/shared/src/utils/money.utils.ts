// ══════════════════════════════════════════════════════════════════════════════
// Circuvent Platform — Safe Money Arithmetic
// Prevents floating-point errors in financial calculations.
// All amounts are stored as integer "paise" (1 INR = 100 paise).
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Immutable Money value object.
 * Internally stores amounts as integer minor units to avoid
 * IEEE 754 floating-point rounding errors.
 *
 * @example
 * ```ts
 * const salary = Money.inr(75000);      // ₹75,000.00
 * const bonus = Money.inr(5000);        // ₹5,000.00
 * const total = salary.add(bonus);      // ₹80,000.00
 * const tax = total.multiply(0.3);      // ₹24,000.00
 * const net = total.subtract(tax);      // ₹56,000.00
 *
 * console.log(net.format());            // "₹56,000.00"
 * console.log(net.toDecimal());         // 56000
 * ```
 */
export class Money {
  /** Amount in minor units (paise for INR, cents for USD) */
  private readonly amount: number;
  /** ISO 4217 currency code */
  public readonly currency: string;
  /** Number of decimal places (2 for INR, USD, EUR) */
  private readonly precision: number;

  private constructor(amountMinor: number, currency: string, precision: number = 2) {
    if (!Number.isFinite(amountMinor)) {
      throw new Error(`Invalid money amount: ${amountMinor}`);
    }
    this.amount = Math.round(amountMinor);
    this.currency = currency;
    this.precision = precision;
  }

  // ── Factory Methods ─────────────────────────────────────────────────────

  /** Creates a Money instance from major units (e.g., 75000 → ₹75,000.00) */
  static fromMajor(amount: number, currency: string = "INR"): Money {
    return new Money(Math.round(amount * 100), currency);
  }

  /** Creates a Money instance from minor units (paise/cents) */
  static fromMinor(amountMinor: number, currency: string = "INR"): Money {
    return new Money(amountMinor, currency);
  }

  /** Shorthand for INR */
  static inr(amount: number): Money {
    return Money.fromMajor(amount, "INR");
  }

  /** Shorthand for USD */
  static usd(amount: number): Money {
    return Money.fromMajor(amount, "USD");
  }

  /** Zero value */
  static zero(currency: string = "INR"): Money {
    return new Money(0, currency);
  }

  /** Creates from a Prisma Decimal string/number */
  static fromDecimal(value: number | string | { toNumber(): number }, currency: string = "INR"): Money {
    const num = typeof value === "object" && "toNumber" in value
      ? value.toNumber()
      : Number(value);
    return Money.fromMajor(num, currency);
  }

  // ── Arithmetic ─────────────────────────────────────────────────────────

  /** Adds two Money values. Currencies must match. */
  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency, this.precision);
  }

  /** Subtracts another Money value. */
  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount - other.amount, this.currency, this.precision);
  }

  /** Multiplies by a scalar (e.g., tax rate). */
  multiply(factor: number): Money {
    return new Money(Math.round(this.amount * factor), this.currency, this.precision);
  }

  /** Divides by a scalar. */
  divide(divisor: number): Money {
    if (divisor === 0) throw new Error("Division by zero");
    return new Money(Math.round(this.amount / divisor), this.currency, this.precision);
  }

  /** Returns the absolute value. */
  abs(): Money {
    return new Money(Math.abs(this.amount), this.currency, this.precision);
  }

  /** Negates the amount. */
  negate(): Money {
    return new Money(-this.amount, this.currency, this.precision);
  }

  /**
   * Allocates money across N portions (e.g., splitting evenly).
   * Distributes remainders penny by penny to avoid rounding loss.
   *
   * @param portions Number of portions
   * @returns Array of Money values that sum exactly to the original
   */
  allocate(portions: number): Money[] {
    if (portions <= 0) throw new Error("Portions must be positive");
    const base = Math.floor(this.amount / portions);
    const remainder = this.amount - base * portions;
    return Array.from({ length: portions }, (_, i) =>
      new Money(base + (i < remainder ? 1 : 0), this.currency, this.precision)
    );
  }

  /**
   * Allocates by percentage ratios (e.g., [60, 25, 15]).
   * Handles rounding so the total always matches.
   */
  allocateByRatios(ratios: number[]): Money[] {
    const total = ratios.reduce((sum, r) => sum + r, 0);
    if (total === 0) throw new Error("Ratio total must be > 0");

    const allocated = ratios.map(r => Math.floor(this.amount * r / total));
    let remainder = this.amount - allocated.reduce((s, a) => s + a, 0);

    // Distribute remainder
    for (let i = 0; remainder > 0; i = (i + 1) % ratios.length) {
      allocated[i]++;
      remainder--;
    }

    return allocated.map(a => new Money(a, this.currency, this.precision));
  }

  // ── Comparison ─────────────────────────────────────────────────────────

  isZero(): boolean { return this.amount === 0; }
  isPositive(): boolean { return this.amount > 0; }
  isNegative(): boolean { return this.amount < 0; }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount > other.amount;
  }

  lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount < other.amount;
  }

  // ── Conversion ─────────────────────────────────────────────────────────

  /** Returns the amount in major units as a number (e.g., 75000.00) */
  toDecimal(): number {
    return this.amount / Math.pow(10, this.precision);
  }

  /** Returns the amount in minor units (paise/cents) */
  toMinor(): number {
    return this.amount;
  }

  /** Formats with currency symbol and locale grouping */
  format(locale: string = "en-IN"): string {
    const symbols: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
    const symbol = symbols[this.currency] || this.currency;
    const formatted = this.toDecimal().toLocaleString(locale, {
      minimumFractionDigits: this.precision,
      maximumFractionDigits: this.precision,
    });
    return `${symbol}${formatted}`;
  }

  /** For JSON serialization — returns decimal number */
  toJSON(): number {
    return this.toDecimal();
  }

  toString(): string {
    return `${this.currency} ${this.toDecimal().toFixed(this.precision)}`;
  }

  // ── GST Helpers (India-specific) ───────────────────────────────────────

  /**
   * Calculates GST components for an amount.
   * @param rate GST rate percentage (e.g., 18 for 18%)
   * @param isInterState true for IGST, false for CGST+SGST split
   */
  calculateGST(rate: number, isInterState: boolean = false): {
    baseAmount: Money;
    cgst: Money;
    sgst: Money;
    igst: Money;
    totalWithGST: Money;
  } {
    const gstAmount = this.multiply(rate / 100);
    if (isInterState) {
      return {
        baseAmount: this,
        cgst: Money.zero(this.currency),
        sgst: Money.zero(this.currency),
        igst: gstAmount,
        totalWithGST: this.add(gstAmount),
      };
    }
    const halfGST = gstAmount.divide(2);
    return {
      baseAmount: this,
      cgst: halfGST,
      sgst: halfGST,
      igst: Money.zero(this.currency),
      totalWithGST: this.add(gstAmount),
    };
  }

  // ── Internal ───────────────────────────────────────────────────────────

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }
}

/**
 * Sums an array of Money values.
 * @param amounts Array of Money values (must all be same currency)
 * @param currency Default currency for empty arrays
 */
export function sumMoney(amounts: Money[], currency: string = "INR"): Money {
  if (amounts.length === 0) return Money.zero(currency);
  return amounts.reduce((sum, m) => sum.add(m), Money.zero(amounts[0].currency));
}
