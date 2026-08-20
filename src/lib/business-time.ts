/**
 * The timezone the business actually runs in.
 *
 * WHY THIS EXISTS
 *
 * Every daily figure in the admin console was bucketed by the server's own
 * clock. Node on Vercel runs in UTC; the shop prices in rupees, formats in
 * en-IN and sells in India. Those are 5 hours 30 minutes apart, so an order
 * placed at 02:00 on the 13th was stamped `2026-08-12T20:30:00Z` and counted
 * against the 12th — every order between midnight and 05:29 IST was reported
 * on the previous day, "today" was wrong for the first five and a half hours
 * of every day, and the weekday × hour heatmap sat 5.5 hours out, which also
 * moves orders into the wrong weekday near midnight.
 *
 * None of that shows up as an error. The totals still add up, they are simply
 * attributed to the wrong day, and the only symptom is a revenue figure that
 * disagrees with what somebody counted by hand.
 *
 * The zone is fixed rather than read from the server because the answer must
 * not change with where the code happens to run — the business day in Chennai
 * is the business day in Chennai whatever region served the request.
 */

export const BUSINESS_TZ = "Asia/Kolkata";

/**
 * `Intl.DateTimeFormat` is created once per call site rather than per row.
 * These run over every order in a window, and constructing a formatter is
 * expensive enough to show up on a 30-day report.
 */
const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TZ,
  weekday: "short",
  hour: "2-digit",
  hour12: false,
});

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * The business-day bucket for an instant, as `YYYY-MM-DD`.
 *
 * en-CA is used because its short date format is already ISO-shaped, which
 * avoids reassembling parts by hand.
 */
export function businessDayKey(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dayFmt.format(d);
}

/** Weekday (0 = Sunday) and hour (0–23) in the business timezone. */
export function businessWeekdayHour(iso: string | Date): { weekday: number; hour: number } | null {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  let weekday = 0;
  let hour = 0;
  for (const p of partsFmt.formatToParts(d)) {
    if (p.type === "weekday") weekday = WEEKDAYS[p.value] ?? 0;
    // "24" appears at midnight in some hour-cycle configurations; it means 0.
    if (p.type === "hour") hour = Number(p.value) % 24;
  }
  return { weekday, hour };
}

/**
 * The last `days` business days, oldest first, ending with today in the
 * business timezone.
 *
 * Stepped in whole days from the current business date rather than by
 * subtracting 24h from `now`: near a DST boundary those differ, and while
 * India has no DST, the same helper should not quietly break if this is ever
 * pointed at a zone that does.
 */
export function lastNBusinessDates(days: number, now: Date = new Date()): string[] {
  const todayKey = businessDayKey(now);
  const [y, m, d] = todayKey.split("-").map(Number);
  // Anchored at noon UTC so adding and subtracting days can never cross a day
  // boundary through rounding.
  const anchor = Date.UTC(y, m - 1, d, 12);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const t = new Date(anchor - i * 86_400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    out.push(`${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`);
  }
  return out;
}
