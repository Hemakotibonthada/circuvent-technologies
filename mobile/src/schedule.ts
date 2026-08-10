/*
 * Which days a timed automation runs on.
 *
 * The control plane has always accepted a `days` filter on a time trigger, and
 * the console has always offered it. The app ignored it in both directions: it
 * could not create "weekdays at 7am", and — worse — it described one created on
 * the web as "At 07:00 IST", flatly, as though it ran every day. Somebody
 * reading the app would have been told the wrong thing about their own house.
 *
 * 0 is Sunday, matching the trigger's own numbering and JavaScript's getDay.
 * Evaluated by the server in IST, not the phone's zone, which is why every
 * label here says so.
 */

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const WEEKDAYS = [1, 2, 3, 4, 5];
export const WEEKEND = [0, 6];

/** Sorted, de-duplicated and dropped if it means "every day". */
export function normaliseDays(days: number[] | undefined | null): number[] | undefined {
  if (!days || !days.length) return undefined;
  const clean = [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (!clean.length) return undefined;
  // All seven is every day, which the trigger expresses by omitting the field.
  // Storing it explicitly would work, but then two identical schedules compare
  // unequal and the summary has to special-case a list of every day.
  return clean.length === 7 ? undefined : clean;
}

/**
 * How to say a day filter out loud.
 *
 * "Every day" rather than nothing, because the absence of a qualifier is
 * exactly what used to be misleading.
 */
export function daysLabel(days: number[] | undefined | null): string {
  const clean = normaliseDays(days);
  if (!clean) return "Every day";
  if (clean.length === 5 && WEEKDAYS.every((d) => clean.includes(d))) return "Weekdays";
  if (clean.length === 2 && WEEKEND.every((d) => clean.includes(d))) return "Weekends";
  return clean.map((d) => DAY_NAMES[d]).join(", ");
}

/** The whole trigger in a sentence: "At 07:00 IST · Weekdays". */
export function timeTriggerSummary(at: string | undefined, days: number[] | undefined | null): string {
  return `At ${at || "--:--"} IST · ${daysLabel(days)}`;
}

/** Toggles one day, keeping the result normalised. */
export function toggleDay(days: number[] | undefined, day: number): number[] {
  const current = normaliseDays(days) ?? [0, 1, 2, 3, 4, 5, 6];
  return current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b);
}
