import {
  DAY_NAMES,
  daysLabel,
  normaliseDays,
  timeTriggerSummary,
  toggleDay,
} from "../mobile/src/schedule";

/*
 * The app ignored the `days` filter on a time trigger in both directions: it
 * could not create "weekdays at 7am", and it described one made on the web as
 * "At 07:00 IST" with no qualifier at all — telling somebody their timer ran
 * every day when it did not.
 */

describe("saying which days a timer runs", () => {
  it("says every day rather than saying nothing, which is what misled people", () => {
    expect(daysLabel(undefined)).toBe("Every day");
    expect(daysLabel([])).toBe("Every day");
  });

  it("recognises the two sets people actually mean", () => {
    expect(daysLabel([1, 2, 3, 4, 5])).toBe("Weekdays");
    expect(daysLabel([0, 6])).toBe("Weekends");
  });

  it("lists anything else in week order, whatever order it was given in", () => {
    expect(daysLabel([3, 1])).toBe("Mon, Wed");
    expect(daysLabel([6, 0, 3])).toBe("Sun, Wed, Sat");
  });

  it("starts the week on Sunday, matching the trigger's own numbering", () => {
    expect(DAY_NAMES[0]).toBe("Sun");
    expect(DAY_NAMES[6]).toBe("Sat");
  });
});

describe("normalising a day filter", () => {
  it("drops duplicates and sorts", () => {
    expect(normaliseDays([3, 1, 3])).toEqual([1, 3]);
  });

  /*
   * All seven is "every day", which the trigger expresses by omitting the
   * field. Keeping it explicit would make two identical schedules compare
   * unequal.
   */
  it("treats all seven days as no filter at all", () => {
    expect(normaliseDays([0, 1, 2, 3, 4, 5, 6])).toBeUndefined();
  });

  it("discards values that are not days", () => {
    expect(normaliseDays([1, 9, -2, 2.5] as number[])).toEqual([1]);
    expect(normaliseDays([99])).toBeUndefined();
  });
});

describe("the summary shown against a saved automation", () => {
  it("carries the time and the days together", () => {
    expect(timeTriggerSummary("07:00", [1, 2, 3, 4, 5])).toBe("At 07:00 IST · Weekdays");
    expect(timeTriggerSummary("22:30", undefined)).toBe("At 22:30 IST · Every day");
  });

  it("does not pretend to know a time it was not given", () => {
    expect(timeTriggerSummary(undefined, undefined)).toContain("--:--");
  });
});

describe("toggling a day", () => {
  /*
   * No filter means every day, so the first tap has to remove one rather than
   * add one — otherwise unticking Sunday on an everyday timer would silently
   * produce a Sunday-only timer.
   */
  it("treats an unfiltered timer as all seven when the first day is unticked", () => {
    expect(toggleDay(undefined, 0)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("adds a day back", () => {
    expect(toggleDay([1, 2], 5)).toEqual([1, 2, 5]);
  });

  it("removes one that was set", () => {
    expect(toggleDay([1, 2, 5], 2)).toEqual([1, 5]);
  });
});
