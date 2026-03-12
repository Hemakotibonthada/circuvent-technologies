// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Shared Formatters
// Comprehensive formatting utilities for currency (INR/USD),
// dates, relative time, durations, file sizes, employee codes,
// asset tags, invoice numbers, percentages, text manipulation,
// sensitive data masking, addresses, and more.
// ──────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export interface CurrencyFormatOptions {
  showSymbol?: boolean;
  decimals?: number;
  compact?: boolean; // "12.5L" instead of "12,50,000"
}

export type DateFormatStyle =
  | "short"       // 11/03/2026
  | "medium"      // Mar 11, 2026
  | "long"        // March 11, 2026
  | "full"        // Wednesday, March 11, 2026
  | "iso"         // 2026-03-11
  | "indian"      // 11-Mar-2026
  | "db"          // 2026-03-11
  | "time"        // 10:30 AM
  | "datetime"    // Mar 11, 2026 10:30 AM
  | "relative";   // 2 hours ago

export type MaskType = "pan" | "aadhaar" | "phone" | "email" | "bank_account";

export interface AddressComponents {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
}

// ══════════════════════════════════════════════════════════════
// Currency Formatting — INR (Indian Rupees)
// ══════════════════════════════════════════════════════════════

/**
 * Format amount in Indian Rupees using Indian number system (lakhs/crores).
 * e.g., 1234567 → "₹12,34,567"
 */
export function formatCurrencyINR(
  amount: number,
  options: CurrencyFormatOptions = {}
): string {
  const { showSymbol = true, decimals = 0, compact = false } = options;
  const symbol = showSymbol ? "₹" : "";
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  if (compact) {
    if (absAmount >= 10000000) {
      return `${sign}${symbol}${(absAmount / 10000000).toFixed(2)} Cr`;
    }
    if (absAmount >= 100000) {
      return `${sign}${symbol}${(absAmount / 100000).toFixed(2)} L`;
    }
    if (absAmount >= 1000) {
      return `${sign}${symbol}${(absAmount / 1000).toFixed(1)}K`;
    }
  }

  const parts = absAmount.toFixed(decimals).split(".");
  const intPart = parts[0];
  const decPart = parts[1];

  // Indian grouping: last 3 digits, then groups of 2
  let formatted: string;
  if (intPart.length <= 3) {
    formatted = intPart;
  } else {
    const last3 = intPart.slice(-3);
    const remaining = intPart.slice(0, -3);
    const grouped = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    formatted = grouped + "," + last3;
  }

  const result = decPart ? `${formatted}.${decPart}` : formatted;
  return `${sign}${symbol}${result}`;
}

// ══════════════════════════════════════════════════════════════
// Currency Formatting — USD (US Dollars)
// ══════════════════════════════════════════════════════════════

/**
 * Format amount in US Dollars.
 * e.g., 1234567.89 → "$1,234,567.89"
 */
export function formatCurrencyUSD(
  amount: number,
  options: CurrencyFormatOptions = {}
): string {
  const { showSymbol = true, decimals = 2, compact = false } = options;
  const symbol = showSymbol ? "$" : "";
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  if (compact) {
    if (absAmount >= 1000000000) {
      return `${sign}${symbol}${(absAmount / 1000000000).toFixed(2)}B`;
    }
    if (absAmount >= 1000000) {
      return `${sign}${symbol}${(absAmount / 1000000).toFixed(2)}M`;
    }
    if (absAmount >= 1000) {
      return `${sign}${symbol}${(absAmount / 1000).toFixed(1)}K`;
    }
  }

  const formatted = absAmount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${sign}${symbol}${formatted}`;
}

// ══════════════════════════════════════════════════════════════
// Date Formatting
// ══════════════════════════════════════════════════════════════

/**
 * Format a date in multiple styles.
 */
export function formatDate(date: Date | string, format: DateFormatStyle = "medium"): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Invalid date";

  switch (format) {
    case "short":
      return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });

    case "medium":
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

    case "long":
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

    case "full":
      return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    case "iso":
    case "db":
      return d.toISOString().split("T")[0];

    case "indian": {
      const day = String(d.getDate()).padStart(2, "0");
      const month = d.toLocaleDateString("en-IN", { month: "short" });
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    }

    case "time":
      return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

    case "datetime":
      return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}`;

    case "relative":
      return formatRelativeTime(d);

    default:
      return d.toLocaleDateString("en-IN");
  }
}

// ══════════════════════════════════════════════════════════════
// Relative Time Formatting
// ══════════════════════════════════════════════════════════════

/**
 * Format a date as relative time: "2 hours ago", "3 days ago", "in 5 minutes".
 */
export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Invalid date";

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const absDiffMs = Math.abs(diffMs);
  const isFuture = diffMs < 0;

  const seconds = Math.floor(absDiffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30.44);
  const years = Math.floor(days / 365.25);

  let label: string;

  if (seconds < 5) label = "just now";
  else if (seconds < 60) label = `${seconds} seconds`;
  else if (minutes === 1) label = "1 minute";
  else if (minutes < 60) label = `${minutes} minutes`;
  else if (hours === 1) label = "1 hour";
  else if (hours < 24) label = `${hours} hours`;
  else if (days === 1) label = "1 day";
  else if (days < 7) label = `${days} days`;
  else if (weeks === 1) label = "1 week";
  else if (weeks < 4) label = `${weeks} weeks`;
  else if (months === 1) label = "1 month";
  else if (months < 12) label = `${months} months`;
  else if (years === 1) label = "1 year";
  else label = `${years} years`;

  if (label === "just now") return label;
  return isFuture ? `in ${label}` : `${label} ago`;
}

// ══════════════════════════════════════════════════════════════
// Duration Formatting
// ══════════════════════════════════════════════════════════════

/**
 * Format duration in minutes to human readable format.
 * e.g., 150 → "2h 30m", 1500 → "1d 1h"
 */
export function formatDuration(minutes: number): string {
  if (minutes < 0) return "0m";
  if (minutes < 1) return "< 1m";

  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = Math.round(minutes % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 && days === 0) parts.push(`${mins}m`);

  return parts.join(" ") || "0m";
}

// ══════════════════════════════════════════════════════════════
// File Size Formatting
// ══════════════════════════════════════════════════════════════

/**
 * Format bytes to human readable file size.
 * e.g., 1536 → "1.5 KB", 1048576 → "1 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.min(i, units.length - 1);
  const value = bytes / Math.pow(k, index);

  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[index]}`;
}

// ══════════════════════════════════════════════════════════════
// Phone Number Formatting
// ══════════════════════════════════════════════════════════════

/**
 * Format Indian phone number as +91 XXXXX XXXXX.
 */
export function formatPhoneNumber(phone: string): string {
  let digits = phone.replace(/\D/g, "");

  // Remove country code if present
  if (digits.startsWith("91") && digits.length === 12) digits = digits.substring(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.substring(1);

  if (digits.length !== 10) return phone; // Return as-is if not 10 digits

  return `+91 ${digits.substring(0, 5)} ${digits.substring(5)}`;
}

// ══════════════════════════════════════════════════════════════
// Code Formatters
// ══════════════════════════════════════════════════════════════

/**
 * Format employee code.
 * e.g., 42 → "CIR-EMP-042"
 */
export function formatEmployeeCode(seq: number): string {
  return `CIR-EMP-${String(seq).padStart(3, "0")}`;
}

/**
 * Format asset tag.
 * e.g., ("LAPTOP", 42) → "CIR-LAP-042"
 */
export function formatAssetTag(category: string, seq: number): string {
  const categoryMap: Record<string, string> = {
    LAPTOP: "LAP",
    MONITOR: "MON",
    KEYBOARD: "KEY",
    MOUSE: "MOU",
    HEADSET: "HDS",
    PHONE: "PHN",
    FURNITURE: "FUR",
    SERVER: "SRV",
    PRINTER: "PRT",
    OTHER: "OTH",
  };

  const prefix = categoryMap[category.toUpperCase()] || category.substring(0, 3).toUpperCase();
  return `CIR-${prefix}-${String(seq).padStart(3, "0")}`;
}

/**
 * Format invoice number.
 * e.g., ("ACME", 42) → "INV-ACM-2026-042"
 */
export function formatInvoiceNumber(clientCode: string, seq: number): string {
  const year = new Date().getFullYear();
  const shortCode = clientCode.substring(0, 3).toUpperCase();
  return `INV-${shortCode}-${year}-${String(seq).padStart(3, "0")}`;
}

// ══════════════════════════════════════════════════════════════
// Percentage Formatting
// ══════════════════════════════════════════════════════════════

/**
 * Format a decimal value as a percentage.
 * e.g., (0.856, 1) → "85.6%", (42.5, 0) → "43%"
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  if (isNaN(value)) return "0%";

  // If the value is between -1 and 1, it's likely a ratio — convert to percentage
  const pctValue = Math.abs(value) <= 1 ? value * 100 : value;
  return `${pctValue.toFixed(decimals)}%`;
}

// ══════════════════════════════════════════════════════════════
// Ordinal Formatting
// ══════════════════════════════════════════════════════════════

/**
 * Format number as ordinal: 1st, 2nd, 3rd, 4th, 11th, 21st, etc.
 */
export function formatOrdinal(n: number): string {
  const abs = Math.abs(n);
  const lastTwo = abs % 100;
  const lastOne = abs % 10;

  let suffix: string;
  if (lastTwo >= 11 && lastTwo <= 13) {
    suffix = "th";
  } else if (lastOne === 1) {
    suffix = "st";
  } else if (lastOne === 2) {
    suffix = "nd";
  } else if (lastOne === 3) {
    suffix = "rd";
  } else {
    suffix = "th";
  }

  return `${n}${suffix}`;
}

// ══════════════════════════════════════════════════════════════
// Text Utilities
// ══════════════════════════════════════════════════════════════

/**
 * Truncate text to a maximum length with ellipsis.
 */
export function truncateText(text: string, maxLen: number, suffix: string = "..."): string {
  if (!text || text.length <= maxLen) return text || "";
  return text.substring(0, maxLen - suffix.length).trimEnd() + suffix;
}

/**
 * Mask sensitive data based on type.
 */
export function maskSensitiveData(text: string, type: MaskType): string {
  if (!text) return "";

  switch (type) {
    case "pan":
      // ABCDE1234F → ABCDE****F
      return text.length >= 10
        ? text.substring(0, 5) + "****" + text.substring(9)
        : "****";

    case "aadhaar":
      // 123456789012 → XXXX XXXX 9012
      return text.length >= 12
        ? "XXXX XXXX " + text.substring(8)
        : "XXXX XXXX ****";

    case "phone":
      // +91 98765 43210 → +91 XXXXX X3210
      const digits = text.replace(/\D/g, "");
      if (digits.length >= 10) {
        const last4 = digits.slice(-4);
        return `+91 XXXXX X${last4}`;
      }
      return "XXXXX XXXXX";

    case "email": {
      const [local, domain] = text.split("@");
      if (!domain) return "****@****";
      const maskedLocal = local.length > 2
        ? local[0] + "*".repeat(local.length - 2) + local[local.length - 1]
        : "**";
      return `${maskedLocal}@${domain}`;
    }

    case "bank_account":
      // 12345678901234 → XXXXXXXXXX1234
      return text.length >= 4
        ? "X".repeat(text.length - 4) + text.slice(-4)
        : "XXXX";

    default:
      return text;
  }
}

// ══════════════════════════════════════════════════════════════
// Address Formatting
// ══════════════════════════════════════════════════════════════

/**
 * Format address components into multi-line Indian address format.
 */
export function formatAddress(address: AddressComponents): string {
  const lines: string[] = [];

  if (address.line1) lines.push(address.line1);
  if (address.line2) lines.push(address.line2);

  const cityState = [address.city, address.state].filter(Boolean).join(", ");
  if (cityState) lines.push(cityState);

  if (address.pincode) {
    lines[lines.length - 1] = (lines[lines.length - 1] || "") + ` - ${address.pincode}`;
  }

  if (address.country && address.country !== "India") {
    lines.push(address.country);
  }

  return lines.join("\n");
}

// ══════════════════════════════════════════════════════════════
// Text Transform Utilities
// ══════════════════════════════════════════════════════════════

/**
 * Pluralize a word based on count.
 * e.g., ("item", 0) → "items", ("item", 1) → "item", ("item", 5) → "items"
 */
export function pluralize(word: string, count: number, pluralForm?: string): string {
  if (count === 1) return word;

  if (pluralForm) return pluralForm;

  // Common English pluralization rules
  if (word.endsWith("y") && !/[aeiou]y$/i.test(word)) {
    return word.slice(0, -1) + "ies";
  }
  if (word.endsWith("s") || word.endsWith("sh") || word.endsWith("ch") || word.endsWith("x") || word.endsWith("z")) {
    return word + "es";
  }
  if (word.endsWith("f")) {
    return word.slice(0, -1) + "ves";
  }
  if (word.endsWith("fe")) {
    return word.slice(0, -2) + "ves";
  }

  return word + "s";
}

/**
 * Capitalize the first letter of each word.
 */
export function capitalizeFirst(text: string): string {
  if (!text) return "";
  return text
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Convert text to URL-safe slug.
 * e.g., "Hello World! 123" → "hello-world-123"
 */
export function slugify(text: string): string {
  if (!text) return "";

  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")           // Replace spaces with hyphens
    .replace(/[^\w\-]+/g, "")       // Remove non-word chars (except hyphens)
    .replace(/\-\-+/g, "-")         // Replace multiple hyphens with single
    .replace(/^-+/, "")             // Trim leading hyphens
    .replace(/-+$/, "");            // Trim trailing hyphens
}
