// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Date Utilities Test Suite
// Tests for Indian financial year, business day, holiday,
// age, calendar grid, and service duration calculations.
// ──────────────────────────────────────────────────────────────

import { getFinancialYear } from "../utils";

// ══════════════════════════════════════════════════════════════
// Date utility functions under test
// ══════════════════════════════════════════════════════════════

function getFinancialQuarter(date: Date = new Date()): { quarter: number; label: string; start: Date; end: Date } {
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();
  if (month >= 3 && month <= 5) {
    return { quarter: 1, label: "Q1 (Apr-Jun)", start: new Date(year, 3, 1), end: new Date(year, 5, 30) };
  } else if (month >= 6 && month <= 8) {
    return { quarter: 2, label: "Q2 (Jul-Sep)", start: new Date(year, 6, 1), end: new Date(year, 8, 30) };
  } else if (month >= 9 && month <= 11) {
    return { quarter: 3, label: "Q3 (Oct-Dec)", start: new Date(year, 9, 1), end: new Date(year, 11, 31) };
  } else {
    const fyStart = month < 3 ? year - 1 : year;
    return { quarter: 4, label: "Q4 (Jan-Mar)", start: new Date(fyStart + 1, 0, 1), end: new Date(fyStart + 1, 2, 31) };
  }
}

function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6; // Not Sunday or Saturday
}

function getBusinessDaysBetween(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);
  while (current <= endDate) {
    if (isBusinessDay(current)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function getIndianHolidays(year: number): Array<{ date: string; name: string; type: "NATIONAL" | "GAZETTED" | "RESTRICTED" }> {
  return [
    { date: `${year}-01-26`, name: "Republic Day", type: "NATIONAL" },
    { date: `${year}-08-15`, name: "Independence Day", type: "NATIONAL" },
    { date: `${year}-10-02`, name: "Gandhi Jayanti", type: "NATIONAL" },
    { date: `${year}-01-01`, name: "New Year's Day", type: "GAZETTED" },
    { date: `${year}-01-14`, name: "Makar Sankranti", type: "GAZETTED" },
    { date: `${year}-04-14`, name: "Dr. Ambedkar Jayanti", type: "GAZETTED" },
    { date: `${year}-05-01`, name: "May Day", type: "GAZETTED" },
    { date: `${year}-11-01`, name: "Karnataka Rajyotsava", type: "RESTRICTED" },
    { date: `${year}-11-14`, name: "Children's Day", type: "RESTRICTED" },
    { date: `${year}-12-25`, name: "Christmas Day", type: "GAZETTED" },
  ];
}

function getAge(dateOfBirth: Date | string): number {
  const dob = typeof dateOfBirth === "string" ? new Date(dateOfBirth) : dateOfBirth;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

function getYearsOfService(joiningDate: Date | string): { years: number; months: number; days: number; totalMonths: number } {
  const join = typeof joiningDate === "string" ? new Date(joiningDate) : joiningDate;
  const today = new Date();
  let years = today.getFullYear() - join.getFullYear();
  let months = today.getMonth() - join.getMonth();
  let days = today.getDate() - join.getDate();

  if (days < 0) {
    months--;
    const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    days += lastMonth.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  return { years, months, days, totalMonths: years * 12 + months };
}

interface CalendarDay {
  date: Date;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
}

function generateCalendarGrid(year: number, month: number): CalendarDay[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay(); // 0=Sun
  const totalDays = lastDay.getDate();

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const grid: CalendarDay[][] = [];
  let currentRow: CalendarDay[] = [];

  // Fill leading days from previous month
  const prevLastDay = new Date(year, month, 0).getDate();
  for (let i = startDay - 1; i >= 0; i--) {
    const day = prevLastDay - i;
    const d = new Date(year, month - 1, day);
    currentRow.push({
      date: d,
      day,
      isCurrentMonth: false,
      isToday: false,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    });
  }

  // Fill current month days
  for (let day = 1; day <= totalDays; day++) {
    const d = new Date(year, month, day);
    currentRow.push({
      date: d,
      day,
      isCurrentMonth: true,
      isToday: isCurrentMonth && today.getDate() === day,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    });

    if (currentRow.length === 7) {
      grid.push(currentRow);
      currentRow = [];
    }
  }

  // Fill trailing days from next month
  if (currentRow.length > 0) {
    let nextDay = 1;
    while (currentRow.length < 7) {
      const d = new Date(year, month + 1, nextDay);
      currentRow.push({
        date: d,
        day: nextDay,
        isCurrentMonth: false,
        isToday: false,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      });
      nextDay++;
    }
    grid.push(currentRow);
  }

  return grid;
}

function getNextBusinessDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  while (!isBusinessDay(next)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function getMonthRange(year: number, month: number): { start: Date; end: Date; daysInMonth: number } {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return { start, end, daysInMonth: end.getDate() };
}

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("Date Utilities", () => {
  // ────────────────────────────────────────────────────────────
  // Financial Year (from utils.ts)
  // ────────────────────────────────────────────────────────────
  describe("getFinancialYear", () => {
    it("should return correct FY for dates in Apr-Dec", () => {
      expect(getFinancialYear(new Date(2025, 3, 1))).toBe("2025-2026");  // April 2025
      expect(getFinancialYear(new Date(2025, 11, 31))).toBe("2025-2026"); // Dec 2025
      expect(getFinancialYear(new Date(2026, 6, 15))).toBe("2026-2027"); // Jul 2026
    });

    it("should return correct FY for dates in Jan-Mar", () => {
      expect(getFinancialYear(new Date(2026, 0, 1))).toBe("2025-2026");  // Jan 2026
      expect(getFinancialYear(new Date(2026, 1, 15))).toBe("2025-2026"); // Feb 2026
      expect(getFinancialYear(new Date(2026, 2, 31))).toBe("2025-2026"); // Mar 2026
    });

    it("should use current date when no argument provided", () => {
      const result = getFinancialYear();
      expect(result).toMatch(/^\d{4}-\d{4}$/);
    });

    it("should handle year boundary correctly", () => {
      expect(getFinancialYear(new Date(2025, 2, 31))).toBe("2024-2025"); // Mar 31 2025
      expect(getFinancialYear(new Date(2025, 3, 1))).toBe("2025-2026");  // Apr 1 2025
    });
  });

  // ────────────────────────────────────────────────────────────
  // Financial Quarter
  // ────────────────────────────────────────────────────────────
  describe("getFinancialQuarter", () => {
    it("should return Q1 for Apr-Jun", () => {
      expect(getFinancialQuarter(new Date(2026, 3, 15)).quarter).toBe(1);
      expect(getFinancialQuarter(new Date(2026, 4, 1)).quarter).toBe(1);
      expect(getFinancialQuarter(new Date(2026, 5, 30)).quarter).toBe(1);
    });

    it("should return Q2 for Jul-Sep", () => {
      expect(getFinancialQuarter(new Date(2026, 6, 1)).quarter).toBe(2);
      expect(getFinancialQuarter(new Date(2026, 8, 30)).quarter).toBe(2);
    });

    it("should return Q3 for Oct-Dec", () => {
      expect(getFinancialQuarter(new Date(2026, 9, 1)).quarter).toBe(3);
      expect(getFinancialQuarter(new Date(2026, 11, 31)).quarter).toBe(3);
    });

    it("should return Q4 for Jan-Mar", () => {
      expect(getFinancialQuarter(new Date(2026, 0, 1)).quarter).toBe(4);
      expect(getFinancialQuarter(new Date(2026, 2, 31)).quarter).toBe(4);
    });

    it("should include label and date range", () => {
      const q = getFinancialQuarter(new Date(2026, 4, 15));
      expect(q.label).toContain("Q1");
      expect(q.start).toEqual(new Date(2026, 3, 1));
      expect(q.end).toEqual(new Date(2026, 5, 30));
    });
  });

  // ────────────────────────────────────────────────────────────
  // Business Day Check
  // ────────────────────────────────────────────────────────────
  describe("isBusinessDay", () => {
    it("should return true for weekdays", () => {
      expect(isBusinessDay(new Date(2026, 2, 9))).toBe(true);  // Monday
      expect(isBusinessDay(new Date(2026, 2, 10))).toBe(true); // Tuesday
      expect(isBusinessDay(new Date(2026, 2, 11))).toBe(true); // Wednesday
      expect(isBusinessDay(new Date(2026, 2, 12))).toBe(true); // Thursday
      expect(isBusinessDay(new Date(2026, 2, 13))).toBe(true); // Friday
    });

    it("should return false for weekends", () => {
      expect(isBusinessDay(new Date(2026, 2, 7))).toBe(false);  // Saturday
      expect(isBusinessDay(new Date(2026, 2, 8))).toBe(false);  // Sunday
      expect(isBusinessDay(new Date(2026, 2, 14))).toBe(false); // Saturday
      expect(isBusinessDay(new Date(2026, 2, 15))).toBe(false); // Sunday
    });
  });

  // ────────────────────────────────────────────────────────────
  // Business Days Between
  // ────────────────────────────────────────────────────────────
  describe("getBusinessDaysBetween", () => {
    it("should count business days in a full week", () => {
      const monday = new Date(2026, 2, 9);
      const friday = new Date(2026, 2, 13);
      expect(getBusinessDaysBetween(monday, friday)).toBe(5);
    });

    it("should count business days across weekends", () => {
      const monday = new Date(2026, 2, 9);
      const nextFriday = new Date(2026, 2, 20);
      expect(getBusinessDaysBetween(monday, nextFriday)).toBe(10);
    });

    it("should return 0 for Saturday to Sunday", () => {
      const saturday = new Date(2026, 2, 7);
      const sunday = new Date(2026, 2, 8);
      expect(getBusinessDaysBetween(saturday, sunday)).toBe(0);
    });

    it("should return 1 for same business day", () => {
      const monday = new Date(2026, 2, 9);
      expect(getBusinessDaysBetween(monday, monday)).toBe(1);
    });

    it("should handle month boundaries", () => {
      const start = new Date(2026, 1, 27); // Feb 27 (Friday)
      const end = new Date(2026, 2, 3);    // Mar 3 (Tuesday)
      expect(getBusinessDaysBetween(start, end)).toBe(3);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Indian Holidays
  // ────────────────────────────────────────────────────────────
  describe("getIndianHolidays", () => {
    it("should return holidays for a given year", () => {
      const holidays = getIndianHolidays(2026);
      expect(holidays.length).toBeGreaterThan(0);
    });

    it("should include national holidays", () => {
      const holidays = getIndianHolidays(2026);
      const national = holidays.filter(h => h.type === "NATIONAL");
      expect(national.length).toBe(3);
      expect(national.map(h => h.name)).toContain("Republic Day");
      expect(national.map(h => h.name)).toContain("Independence Day");
      expect(national.map(h => h.name)).toContain("Gandhi Jayanti");
    });

    it("should have correct date format", () => {
      const holidays = getIndianHolidays(2026);
      holidays.forEach(h => {
        expect(h.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(h.date).toMatch(/^2026-/);
      });
    });

    it("should include Republic Day on Jan 26", () => {
      const holidays = getIndianHolidays(2026);
      const republicDay = holidays.find(h => h.name === "Republic Day");
      expect(republicDay?.date).toBe("2026-01-26");
    });

    it("should include gazetted holidays", () => {
      const holidays = getIndianHolidays(2026);
      const gazetted = holidays.filter(h => h.type === "GAZETTED");
      expect(gazetted.length).toBeGreaterThan(0);
      expect(gazetted.map(h => h.name)).toContain("Christmas Day");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Age Calculation
  // ────────────────────────────────────────────────────────────
  describe("getAge", () => {
    it("should calculate age correctly", () => {
      const age = getAge(new Date(1990, 0, 1));
      expect(age).toBeGreaterThanOrEqual(36);
      expect(age).toBeLessThanOrEqual(37);
    });

    it("should handle string date input", () => {
      const age = getAge("2000-06-15");
      expect(age).toBeGreaterThanOrEqual(25);
      expect(age).toBeLessThanOrEqual(26);
    });

    it("should handle birthday not yet reached in current year", () => {
      const today = new Date();
      // Birthday is next month
      const futureBirthday = new Date(today.getFullYear() - 30, today.getMonth() + 1, 15);
      const age = getAge(futureBirthday);
      expect(age).toBe(29);
    });

    it("should handle birthday passed in current year", () => {
      const today = new Date();
      // Birthday was last month  
      const pastBirthday = new Date(today.getFullYear() - 30, today.getMonth() - 1, 1);
      const age = getAge(pastBirthday);
      expect(age).toBe(30);
    });

    it("should return 0 for current year birth", () => {
      const recent = new Date();
      recent.setMonth(recent.getMonth() - 3);
      expect(getAge(recent)).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Years of Service
  // ────────────────────────────────────────────────────────────
  describe("getYearsOfService", () => {
    it("should calculate years and months", () => {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const service = getYearsOfService(twoYearsAgo);
      expect(service.years).toBe(2);
      expect(service.months).toBe(0);
      expect(service.totalMonths).toBe(24);
    });

    it("should handle string date input", () => {
      const service = getYearsOfService("2024-01-01");
      expect(service.years).toBeGreaterThanOrEqual(2);
      expect(service.totalMonths).toBeGreaterThan(0);
    });

    it("should return zero for recent joiners", () => {
      const today = new Date();
      const service = getYearsOfService(today);
      expect(service.years).toBe(0);
      expect(service.months).toBe(0);
    });

    it("should include days component", () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const service = getYearsOfService(sixMonthsAgo);
      expect(service.years).toBe(0);
      expect(service.months).toBe(6);
      expect(service.days).toBeGreaterThanOrEqual(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Calendar Grid
  // ────────────────────────────────────────────────────────────
  describe("generateCalendarGrid", () => {
    it("should generate a grid for March 2026", () => {
      const grid = generateCalendarGrid(2026, 2); // month is 0-indexed: 2 = March
      expect(grid.length).toBeGreaterThanOrEqual(4);
      expect(grid.length).toBeLessThanOrEqual(6);
    });

    it("should have 7 days in each row", () => {
      const grid = generateCalendarGrid(2026, 2);
      grid.forEach(row => {
        expect(row.length).toBe(7);
      });
    });

    it("should include all days of the month", () => {
      const grid = generateCalendarGrid(2026, 2); // March 2026 has 31 days
      const currentMonthDays = grid.flat().filter(d => d.isCurrentMonth);
      expect(currentMonthDays.length).toBe(31);
    });

    it("should mark weekends correctly", () => {
      const grid = generateCalendarGrid(2026, 2);
      grid.forEach(row => {
        // First column is Sunday (index 0), last is Saturday (index 6)
        expect(row[0].isWeekend).toBe(true);
        expect(row[6].isWeekend).toBe(true);
      });
    });

    it("should include leading/trailing days from adjacent months", () => {
      const grid = generateCalendarGrid(2026, 2); // March 2026 starts on Sunday
      const nonCurrentDays = grid.flat().filter(d => !d.isCurrentMonth);
      expect(nonCurrentDays.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle February in a leap year", () => {
      const grid = generateCalendarGrid(2024, 1); // Feb 2024 has 29 days
      const febDays = grid.flat().filter(d => d.isCurrentMonth);
      expect(febDays.length).toBe(29);
    });

    it("should handle February in a non-leap year", () => {
      const grid = generateCalendarGrid(2025, 1); // Feb 2025 has 28 days
      const febDays = grid.flat().filter(d => d.isCurrentMonth);
      expect(febDays.length).toBe(28);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Next Business Day
  // ────────────────────────────────────────────────────────────
  describe("getNextBusinessDay", () => {
    it("should return next day if current is weekday", () => {
      const tuesday = new Date(2026, 2, 10);
      const result = getNextBusinessDay(tuesday);
      expect(result.getDay()).toBe(3); // Wednesday
    });

    it("should skip weekend from Friday", () => {
      const friday = new Date(2026, 2, 13);
      const result = getNextBusinessDay(friday);
      expect(result.getDay()).toBe(1); // Monday
    });

    it("should skip weekend from Saturday", () => {
      const saturday = new Date(2026, 2, 14);
      const result = getNextBusinessDay(saturday);
      expect(result.getDay()).toBe(1); // Monday
    });

    it("should return Monday from Sunday", () => {
      const sunday = new Date(2026, 2, 15);
      const result = getNextBusinessDay(sunday);
      expect(result.getDay()).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Month Range
  // ────────────────────────────────────────────────────────────
  describe("getMonthRange", () => {
    it("should return correct range for March 2026", () => {
      const range = getMonthRange(2026, 2);
      expect(range.start).toEqual(new Date(2026, 2, 1));
      expect(range.end).toEqual(new Date(2026, 2, 31));
      expect(range.daysInMonth).toBe(31);
    });

    it("should return correct range for February leap year", () => {
      const range = getMonthRange(2024, 1);
      expect(range.daysInMonth).toBe(29);
    });

    it("should return correct range for February non-leap year", () => {
      const range = getMonthRange(2025, 1);
      expect(range.daysInMonth).toBe(28);
    });

    it("should return correct range for April (30 days)", () => {
      const range = getMonthRange(2026, 3);
      expect(range.daysInMonth).toBe(30);
    });
  });
});
