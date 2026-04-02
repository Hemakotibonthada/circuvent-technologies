// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Currency Utilities
// Multi-currency formatting, conversion, and INR display
// with Indian number system (lakhs, crores).
// ──────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹", USD: "$", EUR: "€", GBP: "£",
  AED: "د.إ", SGD: "S$", JPY: "¥", AUD: "A$", CAD: "C$",
};

const CURRENCY_DECIMALS: Record<string, number> = {
  INR: 0, USD: 2, EUR: 2, GBP: 2,
  AED: 2, SGD: 2, JPY: 0, AUD: 2, CAD: 2,
};

/**
 * Format currency amount with proper symbol and locale.
 */
export function formatCurrency(amount: number, currency = "INR"): string {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;

  if (currency === "INR") {
    return `₹${formatIndianNumber(amount, decimals)}`;
  }

  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  return `${symbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Format number in Indian numbering system (lakhs, crores).
 * e.g., 12,34,567.89
 */
export function formatIndianNumber(num: number, decimals = 0): string {
  const parts = num.toFixed(decimals).split(".");
  const intPart = parts[0];
  const decPart = parts[1];

  // Indian grouping: last 3, then groups of 2
  const sign = intPart.startsWith("-") ? "-" : "";
  const abs = intPart.replace("-", "");

  if (abs.length <= 3) {
    return sign + abs + (decPart ? "." + decPart : "");
  }

  const last3 = abs.slice(-3);
  const remaining = abs.slice(0, -3);
  const grouped = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ",");

  return sign + grouped + "," + last3 + (decPart ? "." + decPart : "");
}

/**
 * Convert amount to Indian word representation.
 * e.g., 1234567 → "12.35 Lakhs"
 */
export function toIndianWords(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  if (abs >= 10000000) {
    return `${sign}${(abs / 10000000).toFixed(2)} Crores`;
  }
  if (abs >= 100000) {
    return `${sign}${(abs / 100000).toFixed(2)} Lakhs`;
  }
  if (abs >= 1000) {
    return `${sign}${(abs / 1000).toFixed(1)}K`;
  }
  return `${sign}${abs}`;
}

/**
 * Simple currency conversion.
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rate: number
): { originalAmount: number; convertedAmount: number; rate: number } {
  if (fromCurrency === toCurrency) {
    return { originalAmount: amount, convertedAmount: amount, rate: 1 };
  }
  return {
    originalAmount: amount,
    convertedAmount: Math.round(amount * rate * 100) / 100,
    rate,
  };
}

/**
 * Get currency display name.
 */
export function getCurrencyName(code: string): string {
  const names: Record<string, string> = {
    INR: "Indian Rupee", USD: "US Dollar", EUR: "Euro", GBP: "British Pound",
    AED: "UAE Dirham", SGD: "Singapore Dollar", JPY: "Japanese Yen",
    AUD: "Australian Dollar", CAD: "Canadian Dollar",
  };
  return names[code] || code;
}

/**
 * Parse a currency string to number (handles Indian format).
 * e.g., "₹12,34,567.89" → 1234567.89
 */
export function parseCurrencyString(value: string): number {
  const cleaned = value.replace(/[₹$€£,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Calculate percentage change between two amounts.
 */
export function percentageChange(oldValue: number, newValue: number): {
  change: number;
  percentage: number;
  direction: "up" | "down" | "unchanged";
} {
  if (oldValue === 0) {
    return { change: newValue, percentage: newValue > 0 ? 100 : 0, direction: newValue > 0 ? "up" : "unchanged" };
  }
  const change = newValue - oldValue;
  const percentage = Math.round((change / Math.abs(oldValue)) * 10000) / 100;
  return {
    change,
    percentage,
    direction: change > 0 ? "up" : change < 0 ? "down" : "unchanged",
  };
}
