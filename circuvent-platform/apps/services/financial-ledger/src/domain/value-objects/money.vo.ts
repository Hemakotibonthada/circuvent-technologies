// ══════════════════════════════════════════════════════════════════════════════
// Financial Ledger — Money Value Object
// Immutable money type for the double-entry accounting engine.
// All financial calculations go through this to prevent rounding errors.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Immutable Money value object for the Financial Ledger.
 * Uses integer arithmetic (paise) internally to prevent IEEE 754 errors.
 *
 * @invariant Amount is always stored as integer minor units
 * @invariant Currency operations require matching currencies
 */
export class MoneyVO {
  private readonly amountMinor: number;
  public readonly currency: string;

  private constructor(amountMinor: number, currency: string) {
    if (!Number.isInteger(amountMinor)) {
      this.amountMinor = Math.round(amountMinor);
    } else {
      this.amountMinor = amountMinor;
    }
    this.currency = currency;
  }

  /** Create from major units (e.g., 1500.50 → 150050 paise) */
  static of(amount: number, currency: string = "INR"): MoneyVO {
    return new MoneyVO(Math.round(amount * 100), currency);
  }

  /** Create from minor units (paise/cents) */
  static ofMinor(amountMinor: number, currency: string = "INR"): MoneyVO {
    return new MoneyVO(amountMinor, currency);
  }

  /** Zero value */
  static zero(currency: string = "INR"): MoneyVO {
    return new MoneyVO(0, currency);
  }

  /** From Prisma Decimal */
  static fromDecimal(value: any, currency: string = "INR"): MoneyVO {
    const num = typeof value === "number" ? value : Number(value);
    return MoneyVO.of(num, currency);
  }

  // Arithmetic
  add(other: MoneyVO): MoneyVO {
    this.assertCurrency(other);
    return new MoneyVO(this.amountMinor + other.amountMinor, this.currency);
  }

  subtract(other: MoneyVO): MoneyVO {
    this.assertCurrency(other);
    return new MoneyVO(this.amountMinor - other.amountMinor, this.currency);
  }

  multiply(factor: number): MoneyVO {
    return new MoneyVO(Math.round(this.amountMinor * factor), this.currency);
  }

  negate(): MoneyVO {
    return new MoneyVO(-this.amountMinor, this.currency);
  }

  abs(): MoneyVO {
    return new MoneyVO(Math.abs(this.amountMinor), this.currency);
  }

  // Comparison
  isZero(): boolean { return this.amountMinor === 0; }
  isPositive(): boolean { return this.amountMinor > 0; }
  isNegative(): boolean { return this.amountMinor < 0; }
  equals(other: MoneyVO): boolean { return this.currency === other.currency && this.amountMinor === other.amountMinor; }
  greaterThan(other: MoneyVO): boolean { this.assertCurrency(other); return this.amountMinor > other.amountMinor; }

  // Conversion
  toMajor(): number { return this.amountMinor / 100; }
  toMinor(): number { return this.amountMinor; }
  toJSON(): number { return this.toMajor(); }

  format(locale: string = "en-IN"): string {
    const symbols: Record<string, string> = { INR: "₹", USD: "$", EUR: "€" };
    return `${symbols[this.currency] || this.currency}${this.toMajor().toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  toString(): string { return `${this.currency} ${this.toMajor().toFixed(2)}`; }

  private assertCurrency(other: MoneyVO): void {
    if (this.currency !== other.currency) throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
  }
}
