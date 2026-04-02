// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Date Utilities
// Indian financial year, business days, holiday calendar,
// and payroll period calculations.
// ──────────────────────────────────────────────────────────────

/**
 * Get Indian Financial Year for a given date.
 * FY runs April 1 to March 31.
 */
export function getFinancialYear(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const fyStart = month < 3 ? year - 1 : year;
  return `${fyStart}-${fyStart + 1}`;
}

/**
 * Get quarter number within the financial year (1-4).
 */
export function getFYQuarter(date: Date = new Date()): number {
  const month = date.getMonth(); // 0-indexed
  const fyMonth = month >= 3 ? month - 3 : month + 9; // Apr=0, Mar=11
  return Math.floor(fyMonth / 3) + 1;
}

/**
 * Get start and end dates for a financial year.
 */
export function getFYRange(fy: string): { start: Date; end: Date } {
  const [startYear] = fy.split("-").map(Number);
  return {
    start: new Date(startYear, 3, 1), // April 1
    end: new Date(startYear + 1, 2, 31, 23, 59, 59), // March 31
  };
}

/**
 * Get start and end dates for a payroll month.
 */
export function getPayrollPeriod(month: number, year: number): { start: Date; end: Date; totalDays: number } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const totalDays = end.getDate();
  return { start, end, totalDays };
}

/**
 * Calculate business days between two dates (Mon-Fri).
 */
export function getBusinessDays(startDate: Date, endDate: Date, holidays: Date[] = []): number {
  let count = 0;
  const current = new Date(startDate);
  const holidaySet = new Set(holidays.map((h) => h.toISOString().split("T")[0]));

  while (current <= endDate) {
    const day = current.getDay();
    const dateStr = current.toISOString().split("T")[0];
    if (day !== 0 && day !== 6 && !holidaySet.has(dateStr)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Calculate calendar days between two dates (inclusive).
 */
export function getCalendarDays(startDate: Date, endDate: Date): number {
  return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Indian national holidays (2026, approximate).
 */
export function getIndianHolidays(year: number): { date: Date; name: string }[] {
  return [
    { date: new Date(year, 0, 26), name: "Republic Day" },
    { date: new Date(year, 2, 30), name: "Holi" },
    { date: new Date(year, 3, 14), name: "Ambedkar Jayanti" },
    { date: new Date(year, 4, 1), name: "May Day" },
    { date: new Date(year, 7, 15), name: "Independence Day" },
    { date: new Date(year, 9, 2), name: "Gandhi Jayanti" },
    { date: new Date(year, 9, 21), name: "Dussehra" },
    { date: new Date(year, 10, 1), name: "Kannada Rajyotsava" },
    { date: new Date(year, 10, 12), name: "Diwali" },
    { date: new Date(year, 11, 25), name: "Christmas" },
  ];
}

/**
 * Format date for Indian locale.
 */
export function formatDateIN(date: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric", month: "short", day: "numeric",
  }).format(new Date(date));
}

/**
 * Format date-time for Indian locale.
 */
export function formatDateTimeIN(date: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(date));
}

/**
 * Get month name from number.
 */
export function getMonthName(month: number): string {
  return new Date(2000, month - 1).toLocaleString("en", { month: "long" });
}

/**
 * Get short month name from number.
 */
export function getShortMonthName(month: number): string {
  return new Date(2000, month - 1).toLocaleString("en", { month: "short" });
}

/**
 * Check if a date falls within Indian FY.
 */
export function isInFY(date: Date, fy: string): boolean {
  const { start, end } = getFYRange(fy);
  return date >= start && date <= end;
}

/**
 * Get current payroll month and year.
 */
export function getCurrentPayrollPeriod(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

/**
 * Calculate age from date of birth.
 */
export function calculateAge(dob: Date, asOf: Date = new Date()): number {
  let age = asOf.getFullYear() - dob.getFullYear();
  const monthDiff = asOf.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/**
 * Get the next Nth business day from a date.
 */
export function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      added++;
    }
  }
  return result;
}
