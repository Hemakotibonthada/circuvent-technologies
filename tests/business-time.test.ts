/**
 * Which day an order belongs to.
 *
 * Every daily figure in the console was bucketed by the server's clock. Node
 * on Vercel runs in UTC and the shop sells in India, so an order placed at
 * 02:00 IST was stamped 20:30Z the previous day and reported against it. The
 * totals still added up — they were simply attributed to the wrong day, which
 * is why nothing ever looked broken.
 *
 * These assertions are all about the 5.5-hour seam, because that is the only
 * place the old and new behaviour differ.
 */

import { businessDayKey, businessWeekdayHour, lastNBusinessDates, BUSINESS_TZ } from "@/lib/business-time";

describe("businessDayKey", () => {
  it("is the zone the business actually trades in", () => {
    expect(BUSINESS_TZ).toBe("Asia/Kolkata");
  });

  /*
   * The regression itself. 20:30Z on the 12th is 02:00 IST on the 13th, and
   * slicing the ISO string returns "2026-08-12" — a full day early.
   */
  it("puts a late-evening UTC instant on the following Indian day", () => {
    expect(businessDayKey("2026-08-12T20:30:00.000Z")).toBe("2026-08-13");
    expect("2026-08-12T20:30:00.000Z".slice(0, 10)).toBe("2026-08-12"); // what it used to do
  });

  it("holds the day either side of the seam", () => {
    // 18:29Z is 23:59 IST on the 12th; 18:30Z is 00:00 IST on the 13th.
    expect(businessDayKey("2026-08-12T18:29:59.000Z")).toBe("2026-08-12");
    expect(businessDayKey("2026-08-12T18:30:00.000Z")).toBe("2026-08-13");
  });

  it("agrees with the raw slice during Indian daytime, where there is no seam", () => {
    expect(businessDayKey("2026-08-12T06:00:00.000Z")).toBe("2026-08-12");
  });

  it("returns empty for something unparseable rather than a wrong day", () => {
    expect(businessDayKey("not-a-date")).toBe("");
    expect(businessDayKey("")).toBe("");
  });
});

describe("businessWeekdayHour", () => {
  /*
   * The heatmap read getDay()/getHours() on a UTC clock, so the evening peak
   * landed in the small hours and orders near midnight moved a whole weekday.
   */
  it("reports the Indian hour, not the UTC one", () => {
    // 2026-08-12 is a Wednesday. 20:30Z is 02:00 IST on Thursday the 13th.
    const at = businessWeekdayHour("2026-08-12T20:30:00.000Z")!;
    expect(at.hour).toBe(2);
    expect(at.weekday).toBe(4); // Thursday
  });

  it("keeps an evening order in the evening", () => {
    // 14:00Z is 19:30 IST, same day.
    const at = businessWeekdayHour("2026-08-12T14:00:00.000Z")!;
    expect(at.hour).toBe(19);
    expect(at.weekday).toBe(3); // Wednesday
  });

  it("reports midnight as hour 0, never 24", () => {
    const at = businessWeekdayHour("2026-08-12T18:30:00.000Z")!;
    expect(at.hour).toBe(0);
  });

  it("returns null rather than a default bucket for a bad timestamp", () => {
    expect(businessWeekdayHour("nonsense")).toBeNull();
  });
});

describe("lastNBusinessDates", () => {
  it("ends on today in India, not today in UTC", () => {
    // 21:00Z on the 12th is already the 13th in India.
    const days = lastNBusinessDates(3, new Date("2026-08-12T21:00:00.000Z"));
    expect(days[days.length - 1]).toBe("2026-08-13");
  });

  it("returns the requested number of consecutive days, oldest first", () => {
    const days = lastNBusinessDates(4, new Date("2026-08-12T06:00:00.000Z"));
    expect(days).toEqual(["2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12"]);
  });

  it("steps across a month boundary correctly", () => {
    const days = lastNBusinessDates(3, new Date("2026-09-01T06:00:00.000Z"));
    expect(days).toEqual(["2026-08-30", "2026-08-31", "2026-09-01"]);
  });

  /*
   * The two must agree, or a day appears in the axis with its orders filed
   * under a key that is not in it — which renders as a zero-revenue day beside
   * a double-counted one.
   */
  it("produces keys in the same shape businessDayKey does", () => {
    const [first] = lastNBusinessDates(1, new Date("2026-08-12T21:00:00.000Z"));
    expect(first).toBe(businessDayKey("2026-08-12T21:00:00.000Z"));
  });
});
