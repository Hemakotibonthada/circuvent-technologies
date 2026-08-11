import {
  deliveryWindow,
  estimateDelivery,
  formatWindow,
  isValidPincode,
  normalisePincode,
  zoneName,
} from "./delivery-estimate";

/**
 * The delivery estimate.
 *
 * This is the number a buyer decides on, so the failures worth testing are the
 * ones that produce a *plausible wrong answer* rather than an obvious one: a
 * date that lands on a Sunday, a next-day promise into a circle we do not
 * dispatch from, or cash-on-delivery offered where no courier carries it.
 */

describe("pincode validation", () => {
  it("accepts a real six-digit PIN", () => {
    expect(isValidPincode("500081")).toBe(true);
    expect(isValidPincode("110001")).toBe(true);
  });

  it("strips formatting people actually type", () => {
    expect(normalisePincode("500 081")).toBe("500081");
    expect(normalisePincode("500-081")).toBe("500081");
    expect(isValidPincode("500 081")).toBe(true);
  });

  it("rejects a leading zero", () => {
    // No Indian PIN starts with zero, so this catches a whole class of typo
    // without needing a lookup table.
    expect(isValidPincode("012345")).toBe(false);
  });

  it("rejects the wrong length", () => {
    expect(isValidPincode("50008")).toBe(false);
    expect(isValidPincode("5000811")).toBe(true); // truncated to 6 by normalise
    expect(isValidPincode("")).toBe(false);
  });
});

describe("zones", () => {
  it("recognises our own circle as the fastest", () => {
    const home = estimateDelivery("500081");
    const metro = estimateDelivery("560001");
    expect(home.minDays).toBeLessThan(metro.minDays);
    expect(home.express).toBe(true);
  });

  /*
   * Express is offered only where we dispatch from. Promising next-day into a
   * circle we do not is a promise made on a courier's behalf, and it is the
   * kind that gets broken quietly and refunded loudly.
   */
  it("offers express only in the home circle", () => {
    expect(estimateDelivery("500081").express).toBe(true);
    expect(estimateDelivery("110001").express).toBe(false);
    expect(estimateDelivery("781001").express).toBe(false);
  });

  it("is slower to hill states, islands and the north-east", () => {
    const metro = estimateDelivery("400001");
    for (const pin of ["190001", "171001", "781001", "737101"]) {
      const remote = estimateDelivery(pin);
      expect(remote.maxDays).toBeGreaterThan(metro.maxDays);
    }
  });

  it("falls back to a middle estimate for circles it does not know", () => {
    const other = estimateDelivery("824101"); // Bihar
    expect(other.ok).toBe(true);
    expect(other.minDays).toBeGreaterThanOrEqual(3);
    expect(other.zone).toBe("your area");
  });

  it("names the circle so the buyer can see it read the PIN correctly", () => {
    expect(zoneName("500081")).toMatch(/Hyderabad/);
    expect(zoneName("560001")).toMatch(/Bengaluru/);
    expect(zoneName("400001")).toMatch(/Mumbai/);
  });

  it("withholds cash on delivery where no courier carries it", () => {
    expect(estimateDelivery("744101").cod).toBe(false); // Andaman
    expect(estimateDelivery("500081").cod).toBe(true);
  });
});

describe("the delivery window", () => {
  /*
   * The bug this exists to prevent. Couriers do not deliver on Sunday, so an
   * estimate that lands on one is wrong by at least a day — and it is exactly
   * the kind of small inaccuracy that makes a buyer stop trusting every other
   * number on the page.
   */
  it("never lands on a Sunday", () => {
    // Walk a full week of start days so every weekday alignment is covered.
    for (let offset = 0; offset < 7; offset++) {
      const start = new Date(2026, 7, 3 + offset); // Aug 2026
      for (const pin of ["500081", "110001", "190001", "824101"]) {
        const { from, to } = deliveryWindow(estimateDelivery(pin), start);
        expect(from.getDay()).not.toBe(0);
        expect(to.getDay()).not.toBe(0);
      }
    }
  });

  it("counts Saturday as a working day", () => {
    // Most Indian couriers deliver on Saturday; excluding it would quote a day
    // longer than reality every single week.
    const friday = new Date(2026, 7, 7); // a Friday
    const { from } = deliveryWindow({ ...estimateDelivery("500081"), minDays: 1 }, friday);
    expect(from.getDay()).toBe(6);
  });

  it("returns a range that moves forward, never backward", () => {
    const est = estimateDelivery("560001");
    const { from, to } = deliveryWindow(est, new Date(2026, 7, 10));
    expect(to.getTime()).toBeGreaterThanOrEqual(from.getTime());
  });

  it("collapses to a single date when the window is one day", () => {
    // "Mon 5 Aug – Mon 5 Aug" reads as a bug to anyone who sees it.
    const est = { ...estimateDelivery("500081"), minDays: 2, maxDays: 2 };
    expect(formatWindow(est, new Date(2026, 7, 10))).not.toMatch(/–/);
  });

  it("produces nothing at all for an invalid PIN", () => {
    // An empty string, not "Invalid Date", which is what a naive formatter
    // renders and what a buyer would read as a broken shop.
    expect(formatWindow(estimateDelivery("abc"))).toBe("");
  });
});
