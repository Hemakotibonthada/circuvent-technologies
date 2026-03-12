// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Formatters Test Suite
// Tests for all currency, date, file, text, and data formatting
// functions with edge cases and locale considerations.
// ──────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// Formatter functions under test
// ══════════════════════════════════════════════════════════════

function formatCurrencyINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatCurrencyUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date | string, style: "short" | "long" | "iso" = "short"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "Invalid Date";
  if (style === "iso") return d.toISOString().split("T")[0];
  if (style === "long") return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}mo ago`;
  return `${Math.floor(diffDay / 365)}y ago`;
}

function formatDuration(minutes: number): string {
  if (minutes < 0) return "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size % 1 === 0 ? size : size.toFixed(1)} ${units[i]}`;
}

function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  if (cleaned.length === 12 && cleaned.startsWith("91")) return `+91 ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
  return phone;
}

function maskSensitiveData(value: string, visibleChars: number = 4, maskChar: string = "*"): string {
  if (value.length <= visibleChars) return value;
  const masked = maskChar.repeat(value.length - visibleChars);
  return masked + value.slice(-visibleChars);
}

function truncateText(text: string, maxLength: number, suffix: string = "..."): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length) + suffix;
}

function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 1) return `1 ${singular}`;
  return `${count} ${plural || singular + "s"}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

function formatOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("Formatters", () => {
  // ────────────────────────────────────────────────────────────
  // Indian Currency
  // ────────────────────────────────────────────────────────────
  describe("formatCurrencyINR", () => {
    it("should format standard amounts with ₹ symbol", () => {
      const result = formatCurrencyINR(50000);
      expect(result).toContain("₹");
      expect(result).toContain("50,000");
    });

    it("should format lakh amounts with Indian grouping", () => {
      const result = formatCurrencyINR(1250000);
      expect(result).toContain("12,50,000");
    });

    it("should format crore amounts correctly", () => {
      const result = formatCurrencyINR(75000000);
      expect(result).toContain("7,50,00,000");
    });

    it("should handle zero", () => {
      const result = formatCurrencyINR(0);
      expect(result).toContain("₹");
      expect(result).toContain("0");
    });

    it("should handle negative amounts", () => {
      const result = formatCurrencyINR(-5000);
      expect(result).toContain("5,000");
    });

    it("should handle decimal amounts", () => {
      const result = formatCurrencyINR(1234.56);
      expect(result).toContain("1,234.56");
    });
  });

  // ────────────────────────────────────────────────────────────
  // USD Currency
  // ────────────────────────────────────────────────────────────
  describe("formatCurrencyUSD", () => {
    it("should format with $ symbol", () => {
      const result = formatCurrencyUSD(1000);
      expect(result).toContain("$");
      expect(result).toContain("1,000.00");
    });

    it("should format zero", () => {
      expect(formatCurrencyUSD(0)).toContain("$0.00");
    });

    it("should always show 2 decimal places", () => {
      expect(formatCurrencyUSD(99)).toContain("99.00");
      expect(formatCurrencyUSD(99.1)).toContain("99.10");
    });

    it("should handle large amounts", () => {
      const result = formatCurrencyUSD(1234567.89);
      expect(result).toContain("1,234,567.89");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Date Formatting
  // ────────────────────────────────────────────────────────────
  describe("formatDate", () => {
    const testDate = new Date(2026, 2, 11); // March 11, 2026

    it("should format in short style by default", () => {
      const result = formatDate(testDate, "short");
      expect(result).toMatch(/11/);
      expect(result).toMatch(/03|3/);
      expect(result).toMatch(/2026/);
    });

    it("should format in long style", () => {
      const result = formatDate(testDate, "long");
      expect(result).toContain("March");
      expect(result).toContain("2026");
    });

    it("should format in ISO style", () => {
      const result = formatDate(testDate, "iso");
      expect(result).toBe("2026-03-11");
    });

    it("should handle string date input", () => {
      const result = formatDate("2026-03-11", "iso");
      expect(result).toBe("2026-03-11");
    });

    it("should return 'Invalid Date' for invalid input", () => {
      expect(formatDate("not-a-date")).toBe("Invalid Date");
      expect(formatDate("")).toBe("Invalid Date");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Relative Time
  // ────────────────────────────────────────────────────────────
  describe("formatRelativeTime", () => {
    it("should return 'just now' for recent times", () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe("just now");
    });

    it("should return minutes ago", () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinAgo)).toBe("5m ago");
    });

    it("should return hours ago", () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      expect(formatRelativeTime(threeHoursAgo)).toBe("3h ago");
    });

    it("should return days ago", () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoDaysAgo)).toBe("2d ago");
    });

    it("should return weeks ago", () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoWeeksAgo)).toBe("2w ago");
    });

    it("should return months ago", () => {
      const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(threeMonthsAgo)).toBe("3mo ago");
    });

    it("should return years ago", () => {
      const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoYearsAgo)).toBe("2y ago");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Duration
  // ────────────────────────────────────────────────────────────
  describe("formatDuration", () => {
    it("should format minutes", () => {
      expect(formatDuration(45)).toBe("45m");
      expect(formatDuration(1)).toBe("1m");
    });

    it("should format hours and minutes", () => {
      expect(formatDuration(90)).toBe("1h 30m");
      expect(formatDuration(125)).toBe("2h 5m");
    });

    it("should format exact hours without minutes", () => {
      expect(formatDuration(120)).toBe("2h");
      expect(formatDuration(60)).toBe("1h");
    });

    it("should format days and hours", () => {
      expect(formatDuration(1500)).toBe("1d 1h");
      expect(formatDuration(2880)).toBe("2d");
    });

    it("should handle zero", () => {
      expect(formatDuration(0)).toBe("0m");
    });

    it("should handle negative values", () => {
      expect(formatDuration(-10)).toBe("0m");
    });
  });

  // ────────────────────────────────────────────────────────────
  // File Size
  // ────────────────────────────────────────────────────────────
  describe("formatFileSize", () => {
    it("should format bytes", () => {
      expect(formatFileSize(500)).toBe("500 B");
      expect(formatFileSize(0)).toBe("0 B");
    });

    it("should format kilobytes", () => {
      expect(formatFileSize(1024)).toBe("1 KB");
      expect(formatFileSize(1536)).toBe("1.5 KB");
    });

    it("should format megabytes", () => {
      expect(formatFileSize(1048576)).toBe("1 MB");
      expect(formatFileSize(5242880)).toBe("5 MB");
    });

    it("should format gigabytes", () => {
      expect(formatFileSize(1073741824)).toBe("1 GB");
    });

    it("should handle negative values", () => {
      expect(formatFileSize(-100)).toBe("0 B");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Phone Number
  // ────────────────────────────────────────────────────────────
  describe("formatPhoneNumber", () => {
    it("should format 10-digit number with +91", () => {
      expect(formatPhoneNumber("9876543210")).toBe("+91 98765 43210");
    });

    it("should format 12-digit number starting with 91", () => {
      expect(formatPhoneNumber("919876543210")).toBe("+91 98765 43210");
    });

    it("should return original for unrecognized formats", () => {
      expect(formatPhoneNumber("12345")).toBe("12345");
      expect(formatPhoneNumber("+1 555 123 4567")).toBe("+1 555 123 4567");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Mask Sensitive Data
  // ────────────────────────────────────────────────────────────
  describe("maskSensitiveData", () => {
    it("should mask with last 4 visible by default", () => {
      expect(maskSensitiveData("1234567890")).toBe("******7890");
    });

    it("should mask Aadhaar numbers", () => {
      expect(maskSensitiveData("234567890123")).toBe("********0123");
    });

    it("should mask with custom visible chars", () => {
      expect(maskSensitiveData("ABCDE1234F", 2)).toBe("********4F");
    });

    it("should use custom mask character", () => {
      expect(maskSensitiveData("1234567890", 4, "X")).toBe("XXXXXX7890");
    });

    it("should return original if shorter than visible chars", () => {
      expect(maskSensitiveData("ABC", 4)).toBe("ABC");
      expect(maskSensitiveData("AB", 4)).toBe("AB");
    });

    it("should handle empty string", () => {
      expect(maskSensitiveData("")).toBe("");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Truncate Text
  // ────────────────────────────────────────────────────────────
  describe("truncateText", () => {
    it("should truncate long text with ellipsis", () => {
      expect(truncateText("Hello World, this is a long text", 15)).toBe("Hello World,...");
    });

    it("should not modify text shorter than max", () => {
      expect(truncateText("Short", 20)).toBe("Short");
    });

    it("should handle exact length", () => {
      expect(truncateText("12345", 5)).toBe("12345");
    });

    it("should use custom suffix", () => {
      expect(truncateText("Hello World Long Text", 12, " →")).toBe("Hello Worl →");
    });

    it("should handle empty string", () => {
      expect(truncateText("", 10)).toBe("");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Pluralize
  // ────────────────────────────────────────────────────────────
  describe("pluralize", () => {
    it("should return singular for 1", () => {
      expect(pluralize(1, "item")).toBe("1 item");
      expect(pluralize(1, "employee")).toBe("1 employee");
    });

    it("should return plural for > 1", () => {
      expect(pluralize(5, "item")).toBe("5 items");
      expect(pluralize(100, "project")).toBe("100 projects");
    });

    it("should return plural for 0", () => {
      expect(pluralize(0, "item")).toBe("0 items");
    });

    it("should use custom plural", () => {
      expect(pluralize(2, "person", "people")).toBe("2 people");
      expect(pluralize(3, "child", "children")).toBe("3 children");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Slugify
  // ────────────────────────────────────────────────────────────
  describe("slugify", () => {
    it("should convert text to slug", () => {
      expect(slugify("Hello World")).toBe("hello-world");
      expect(slugify("My Project Name")).toBe("my-project-name");
    });

    it("should remove special characters", () => {
      expect(slugify("Hello, World!")).toBe("hello-world");
      expect(slugify("Price: $100")).toBe("price-100");
    });

    it("should handle multiple spaces and underscores", () => {
      expect(slugify("multiple   spaces")).toBe("multiple-spaces");
      expect(slugify("with_underscores")).toBe("with-underscores");
    });

    it("should trim leading/trailing hyphens", () => {
      expect(slugify("--hello--")).toBe("hello");
    });

    it("should handle empty string", () => {
      expect(slugify("")).toBe("");
    });

    it("should handle already slugified text", () => {
      expect(slugify("already-slugified")).toBe("already-slugified");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Percentage
  // ────────────────────────────────────────────────────────────
  describe("formatPercentage", () => {
    it("should format with 1 decimal by default", () => {
      expect(formatPercentage(75.5)).toBe("75.5%");
      expect(formatPercentage(100)).toBe("100.0%");
    });

    it("should format with custom decimals", () => {
      expect(formatPercentage(33.333, 2)).toBe("33.33%");
      expect(formatPercentage(50, 0)).toBe("50%");
    });

    it("should handle zero", () => {
      expect(formatPercentage(0)).toBe("0.0%");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Ordinal
  // ────────────────────────────────────────────────────────────
  describe("formatOrdinal", () => {
    it("should format 1st, 2nd, 3rd correctly", () => {
      expect(formatOrdinal(1)).toBe("1st");
      expect(formatOrdinal(2)).toBe("2nd");
      expect(formatOrdinal(3)).toBe("3rd");
    });

    it("should format teens with 'th'", () => {
      expect(formatOrdinal(11)).toBe("11th");
      expect(formatOrdinal(12)).toBe("12th");
      expect(formatOrdinal(13)).toBe("13th");
    });

    it("should format other numbers", () => {
      expect(formatOrdinal(4)).toBe("4th");
      expect(formatOrdinal(21)).toBe("21st");
      expect(formatOrdinal(22)).toBe("22nd");
      expect(formatOrdinal(23)).toBe("23rd");
      expect(formatOrdinal(100)).toBe("100th");
    });
  });
});
