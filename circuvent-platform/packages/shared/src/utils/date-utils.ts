// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Date Utilities (Extended)
// Comprehensive date utilities for Indian business context:
// financial year, quarters, business days, Indian holidays,
// age/tenure calculations, calendar grid generation, and
// timezone helpers.
// ──────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export interface MonthRange {
  start: Date;
  end: Date;
  totalDays: number;
}

export interface YearsOfServiceResult {
  years: number;
  months: number;
  days: number;
  totalMonths: number;
  totalDays: number;
  label: string;
}

export interface CalendarDay {
  date: Date;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
}

export interface DateRangeLabel {
  label: string;
  dayCount: number;
  includesWeekend: boolean;
}

export interface IndianHoliday {
  date: Date;
  name: string;
  type: "NATIONAL" | "REGIONAL" | "RESTRICTED";
}

// ══════════════════════════════════════════════════════════════
// Financial Year Utilities
// ══════════════════════════════════════════════════════════════

/**
 * Get Indian Financial Year string for a given date.
 * FY runs April 1 to March 31.
 * e.g., Jan 2026 → "FY 2025-26", Jul 2025 → "FY 2025-26"
 */
export function getFinancialYear(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const fyStart = month < 3 ? year - 1 : year;
  const fyEndShort = String(fyStart + 1).slice(-2);
  return `FY ${fyStart}-${fyEndShort}`;
}

/**
 * Get financial quarter (Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar).
 */
export function getFinancialQuarter(date: Date = new Date()): string {
  const month = date.getMonth(); // 0-indexed
  // Map calendar month to FY quarter
  if (month >= 3 && month <= 5) return "Q1";
  if (month >= 6 && month <= 8) return "Q2";
  if (month >= 9 && month <= 11) return "Q3";
  return "Q4"; // Jan-Mar
}

/**
 * Get Financial Year start and end dates.
 */
export function getFinancialYearRange(date: Date = new Date()): { start: Date; end: Date } {
  const year = date.getFullYear();
  const month = date.getMonth();
  const fyStart = month < 3 ? year - 1 : year;
  return {
    start: new Date(fyStart, 3, 1, 0, 0, 0, 0),         // April 1
    end: new Date(fyStart + 1, 2, 31, 23, 59, 59, 999),  // March 31
  };
}

/**
 * Get the financial quarter's date range.
 */
export function getFinancialQuarterRange(date: Date = new Date()): { start: Date; end: Date; quarter: string } {
  const quarter = getFinancialQuarter(date);
  const year = date.getFullYear();
  const month = date.getMonth();
  const fyStart = month < 3 ? year - 1 : year;

  const quarterRanges: Record<string, { start: Date; end: Date }> = {
    Q1: { start: new Date(fyStart, 3, 1), end: new Date(fyStart, 5, 30, 23, 59, 59, 999) },
    Q2: { start: new Date(fyStart, 6, 1), end: new Date(fyStart, 8, 30, 23, 59, 59, 999) },
    Q3: { start: new Date(fyStart, 9, 1), end: new Date(fyStart, 11, 31, 23, 59, 59, 999) },
    Q4: { start: new Date(fyStart + 1, 0, 1), end: new Date(fyStart + 1, 2, 31, 23, 59, 59, 999) },
  };

  return { ...quarterRanges[quarter], quarter };
}

// ══════════════════════════════════════════════════════════════
// Week Utilities
// ══════════════════════════════════════════════════════════════

/**
 * Get Monday-based week start for a given date.
 */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get week end (Sunday) for a given date.
 */
export function getWeekEnd(date: Date = new Date()): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Get week number within the year (ISO 8601).
 */
export function getWeekNumber(date: Date = new Date()): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  return Math.round(((d.getTime() - yearStart.getTime()) / 86400000 - 3 + ((yearStart.getDay() + 6) % 7)) / 7) + 1;
}

// ══════════════════════════════════════════════════════════════
// Month Utilities
// ══════════════════════════════════════════════════════════════

/**
 * Get start and end dates for a specific month.
 */
export function getMonthStartEnd(year: number, month: number): MonthRange {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const totalDays = end.getDate();
  return { start, end, totalDays };
}

/**
 * Get the number of days in a specific month.
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// ══════════════════════════════════════════════════════════════
// Business Day Calculations
// ══════════════════════════════════════════════════════════════

/**
 * Check if a date is a business day (not weekend, not holiday).
 */
export function isBusinessDay(date: Date, holidays?: Date[]): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false; // Weekend

  if (holidays && holidays.length > 0) {
    const dateStr = formatDateForDB(date);
    return !holidays.some(h => formatDateForDB(h) === dateStr);
  }

  return true;
}

/**
 * Count business days between two dates (inclusive).
 */
export function getBusinessDaysBetween(start: Date, end: Date, holidays?: Date[]): number {
  let count = 0;
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(0, 0, 0, 0);

  const holidaySet = new Set(
    (holidays || []).map(h => formatDateForDB(h))
  );

  while (current <= endDate) {
    const day = current.getDay();
    const dateStr = formatDateForDB(current);

    if (day !== 0 && day !== 6 && !holidaySet.has(dateStr)) {
      count++;
    }

    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Add N business days to a date, skipping weekends and holidays.
 */
export function addBusinessDays(date: Date, days: number, holidays?: Date[]): Date {
  const result = new Date(date);
  const direction = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);

  const holidaySet = new Set(
    (holidays || []).map(h => formatDateForDB(h))
  );

  while (remaining > 0) {
    result.setDate(result.getDate() + direction);
    const day = result.getDay();
    const dateStr = formatDateForDB(result);

    if (day !== 0 && day !== 6 && !holidaySet.has(dateStr)) {
      remaining--;
    }
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// Indian Holiday Calendar
// ══════════════════════════════════════════════════════════════

/**
 * Get standard Indian public holidays for a given year.
 * Includes national, major regional, and restricted holidays.
 */
export function getIndianHolidays(year: number): IndianHoliday[] {
  return [
    // National Holidays (Gazetted)
    { date: new Date(year, 0, 1), name: "New Year's Day", type: "RESTRICTED" },
    { date: new Date(year, 0, 14), name: "Makar Sankranti / Pongal", type: "REGIONAL" },
    { date: new Date(year, 0, 26), name: "Republic Day", type: "NATIONAL" },
    { date: new Date(year, 2, 14), name: "Holi", type: "NATIONAL" },
    { date: new Date(year, 2, 29), name: "Good Friday", type: "RESTRICTED" },
    { date: new Date(year, 3, 14), name: "Dr. Ambedkar Jayanti", type: "NATIONAL" },
    { date: new Date(year, 3, 21), name: "Ram Navami", type: "RESTRICTED" },
    { date: new Date(year, 4, 1), name: "May Day / Labour Day", type: "REGIONAL" },
    { date: new Date(year, 4, 12), name: "Buddha Purnima", type: "RESTRICTED" },
    { date: new Date(year, 5, 17), name: "Eid ul-Fitr", type: "RESTRICTED" },
    { date: new Date(year, 7, 15), name: "Independence Day", type: "NATIONAL" },
    { date: new Date(year, 7, 26), name: "Janmashtami", type: "RESTRICTED" },
    { date: new Date(year, 8, 5), name: "Ganesh Chaturthi", type: "REGIONAL" },
    { date: new Date(year, 9, 2), name: "Mahatma Gandhi Jayanti", type: "NATIONAL" },
    { date: new Date(year, 9, 12), name: "Dussehra / Vijayadashami", type: "NATIONAL" },
    { date: new Date(year, 9, 31), name: "Halloween", type: "RESTRICTED" },
    { date: new Date(year, 10, 1), name: "Kannada Rajyotsava", type: "REGIONAL" },
    { date: new Date(year, 10, 2), name: "Diwali", type: "NATIONAL" },
    { date: new Date(year, 10, 3), name: "Diwali (Padwa)", type: "RESTRICTED" },
    { date: new Date(year, 10, 15), name: "Guru Nanak Jayanti", type: "RESTRICTED" },
    { date: new Date(year, 11, 25), name: "Christmas", type: "NATIONAL" },
  ];
}

// ══════════════════════════════════════════════════════════════
// Year & Leap Year
// ══════════════════════════════════════════════════════════════

/**
 * Check if a year is a leap year.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

// ══════════════════════════════════════════════════════════════
// Age & Tenure Calculations
// ══════════════════════════════════════════════════════════════

/**
 * Calculate age from date of birth.
 */
export function getAge(dob: Date | string): number {
  const birthDate = new Date(dob);
  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

/**
 * Calculate precise years of service from joining date.
 * Returns years, months, days, and a label like "3 years, 4 months".
 */
export function getYearsOfService(joiningDate: Date | string): YearsOfServiceResult {
  const start = new Date(joiningDate);
  const today = new Date();

  let years = today.getFullYear() - start.getFullYear();
  let months = today.getMonth() - start.getMonth();
  let days = today.getDate() - start.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    days += prevMonth.getDate();
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  const totalDays = Math.floor(
    (today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );
  const totalMonths = years * 12 + months;

  // Build label
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  if (parts.length === 0) parts.push(`${days} ${days === 1 ? "day" : "days"}`);

  return {
    years,
    months,
    days,
    totalMonths,
    totalDays,
    label: parts.join(", "),
  };
}

// ══════════════════════════════════════════════════════════════
// Date Formatting & Parsing
// ══════════════════════════════════════════════════════════════

/**
 * Format date for database storage (ISO 8601: YYYY-MM-DD).
 */
export function formatDateForDB(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse an ISO date string from database to a Date object.
 */
export function parseDateFromDB(dateStr: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return date;
}

/**
 * Format date with timezone (IST — UTC+5:30).
 */
export function formatDateIST(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ══════════════════════════════════════════════════════════════
// Timezone
// ══════════════════════════════════════════════════════════════

/**
 * Get IST timezone offset in minutes (+330 for UTC+5:30).
 */
export function getTimeZoneOffset(): number {
  return 330; // IST = UTC + 5:30 = 330 minutes
}

/**
 * Convert a UTC date to IST.
 */
export function toIST(date: Date): Date {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  return new Date(utc + 330 * 60000);
}

/**
 * Convert an IST date to UTC.
 */
export function toUTC(istDate: Date): Date {
  return new Date(istDate.getTime() - 330 * 60000 - istDate.getTimezoneOffset() * 60000);
}

// ══════════════════════════════════════════════════════════════
// Date Comparison
// ══════════════════════════════════════════════════════════════

/**
 * Check if a date is today.
 */
export function isToday(date: Date | string): boolean {
  const d = new Date(date);
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

/**
 * Check if a date is within the current week (Monday-Sunday).
 */
export function isThisWeek(date: Date | string): boolean {
  const d = new Date(date);
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd();
  return d >= weekStart && d <= weekEnd;
}

/**
 * Check if a date is within the current month.
 */
export function isThisMonth(date: Date | string): boolean {
  const d = new Date(date);
  const today = new Date();
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
}

/**
 * Check if a date is within the current financial year.
 */
export function isThisFinancialYear(date: Date | string): boolean {
  const d = new Date(date);
  const { start, end } = getFinancialYearRange();
  return d >= start && d <= end;
}

// ══════════════════════════════════════════════════════════════
// Date Range Label
// ══════════════════════════════════════════════════════════════

/**
 * Generate a human-readable label for a date range.
 * e.g., "Jan 1 - Jan 7, 2026", "Dec 28, 2025 - Jan 3, 2026"
 */
export function getDateRangeLabel(start: Date | string, end: Date | string): DateRangeLabel {
  const s = new Date(start);
  const e = new Date(end);
  const dayCount = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // Check if range includes a weekend
  let includesWeekend = false;
  const current = new Date(s);
  while (current <= e) {
    const day = current.getDay();
    if (day === 0 || day === 6) {
      includesWeekend = true;
      break;
    }
    current.setDate(current.getDate() + 1);
  }

  const startMonth = s.toLocaleString("en-IN", { month: "short" });
  const endMonth = e.toLocaleString("en-IN", { month: "short" });
  const startDay = s.getDate();
  const endDay = e.getDate();
  const startYear = s.getFullYear();
  const endYear = e.getFullYear();

  let label: string;

  if (startYear === endYear) {
    if (s.getMonth() === e.getMonth()) {
      label = `${startMonth} ${startDay} - ${endDay}, ${startYear}`;
    } else {
      label = `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${startYear}`;
    }
  } else {
    label = `${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`;
  }

  return { label, dayCount, includesWeekend };
}

// ══════════════════════════════════════════════════════════════
// Calendar Grid Generation
// ══════════════════════════════════════════════════════════════

/**
 * Generate a 6x7 calendar grid for a given month.
 * Each row is a week (Mon-Sun), padding with prev/next month days.
 */
export function generateCalendarGrid(year: number, month: number): CalendarDay[][] {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get holidays for this month
  const holidays = getIndianHolidays(year);
  const holidayMap = new Map<string, string>();
  for (const h of holidays) {
    if (h.date.getMonth() === month - 1) {
      holidayMap.set(formatDateForDB(h.date), h.name);
    }
  }

  // Day of week for the 1st (0=Sun, 1=Mon, etc.)
  // Convert to Monday-based (0=Mon, ..., 6=Sun)
  let startDayOfWeek = firstDay.getDay();
  startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  // Previous month padding
  const prevMonth = new Date(year, month - 1, 0);
  const prevMonthDays = prevMonth.getDate();

  const grid: CalendarDay[][] = [];
  let currentDate = 1;
  let nextMonthDate = 1;

  for (let week = 0; week < 6; week++) {
    const row: CalendarDay[] = [];

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const cellIndex = week * 7 + dayOfWeek;

      if (cellIndex < startDayOfWeek) {
        // Previous month
        const prevDay = prevMonthDays - startDayOfWeek + cellIndex + 1;
        const date = new Date(year, month - 2, prevDay);
        row.push({
          date,
          day: prevDay,
          isCurrentMonth: false,
          isToday: false,
          isWeekend: dayOfWeek >= 5,
          isHoliday: false,
        });
      } else if (currentDate <= daysInMonth) {
        // Current month
        const date = new Date(year, month - 1, currentDate);
        const dateStr = formatDateForDB(date);
        const holidayName = holidayMap.get(dateStr);

        row.push({
          date,
          day: currentDate,
          isCurrentMonth: true,
          isToday: date.getTime() === today.getTime(),
          isWeekend: dayOfWeek >= 5,
          isHoliday: !!holidayName,
          holidayName,
        });
        currentDate++;
      } else {
        // Next month
        const date = new Date(year, month, nextMonthDate);
        row.push({
          date,
          day: nextMonthDate,
          isCurrentMonth: false,
          isToday: false,
          isWeekend: dayOfWeek >= 5,
          isHoliday: false,
        });
        nextMonthDate++;
      }
    }

    grid.push(row);

    // Stop generating rows if we've passed the last day and completed the week
    if (currentDate > daysInMonth && week >= 3) {
      // Check if we need the next row
      const lastRowHasCurrentMonth = row.some(d => d.isCurrentMonth);
      if (!lastRowHasCurrentMonth) break;
    }
  }

  return grid;
}

// ══════════════════════════════════════════════════════════════
// Payroll Period Helpers
// ══════════════════════════════════════════════════════════════

/**
 * Get the payroll cut-off date for a given month.
 * Typically salary is processed on the 25th for the current month.
 */
export function getPayrollCutoff(year: number, month: number): Date {
  return new Date(year, month - 1, 25, 23, 59, 59, 999);
}

/**
 * Get all months in a financial year as an array.
 * Returns [{month: 4, year: 2025}, ..., {month: 3, year: 2026}]
 */
export function getFinancialYearMonths(fyStartYear: number): Array<{ month: number; year: number; label: string }> {
  const months: Array<{ month: number; year: number; label: string }> = [];
  for (let i = 0; i < 12; i++) {
    const month = ((3 + i) % 12) + 1; // Start from April
    const year = i < 9 ? fyStartYear : fyStartYear + 1;
    const label = new Date(year, month - 1).toLocaleString("en-IN", { month: "short", year: "numeric" });
    months.push({ month, year, label });
  }
  return months;
}

/**
 * Get the next working day from a given date.
 */
export function getNextWorkingDay(date: Date, holidays?: Date[]): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + 1);

  while (!isBusinessDay(result, holidays)) {
    result.setDate(result.getDate() + 1);
  }

  return result;
}
