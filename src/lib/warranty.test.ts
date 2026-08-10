import { warrantyTerm, warrantyStart, addMonths, warrantyLabel, WARRANTY_MONTHS, type OrderLike } from "./warranty";

const iso = (s: string) => new Date(s).toISOString();
const at = (s: string) => iso(s);

const order = (o: Partial<OrderLike> = {}): OrderLike => ({
  orderNo: "CV-20260101-ABCDE",
  placedAt: at("2026-01-10T10:00:00Z"),
  status: "placed",
  history: [{ status: "placed", at: at("2026-01-10T10:00:00Z") }],
  ...o,
});

describe("addMonths", () => {
  it("adds whole months", () => {
    expect(addMonths(at("2026-01-10T00:00:00Z"), 6).slice(0, 10)).toBe("2026-07-10");
  });

  it("clamps to the end of the target month instead of overflowing into the next one", () => {
    // Date.setMonth turns 31 August + 6 months into 3 March. That is two days
    // of cover the policy does not grant, on an expiry date that would not
    // match the printed certificate.
    expect(addMonths(at("2026-08-31T00:00:00Z"), 6).slice(0, 10)).toBe("2027-02-28");
  });

  it("handles a leap year end-of-month correctly", () => {
    expect(addMonths(at("2027-08-31T00:00:00Z"), 6).slice(0, 10)).toBe("2028-02-29");
  });

  it("crosses a year boundary", () => {
    expect(addMonths(at("2026-10-15T00:00:00Z"), 6).slice(0, 10)).toBe("2027-04-15");
  });

  it("returns the input unchanged when it is not a date", () => {
    expect(addMonths("not-a-date", 6)).toBe("not-a-date");
  });
});

describe("warrantyStart — which event starts the clock", () => {
  it("starts at delivery, not at purchase", () => {
    // The whole point of the policy. Starting at checkout would silently
    // shorten every customer's cover by the shipping time.
    const o = order({
      status: "delivered",
      history: [
        { status: "placed", at: at("2026-01-10T10:00:00Z") },
        { status: "shipped", at: at("2026-01-12T10:00:00Z") },
        { status: "delivered", at: at("2026-01-20T10:00:00Z") },
      ],
    });
    const s = warrantyStart(o);
    expect(s?.basis).toBe("delivered");
    expect(s?.at.slice(0, 10)).toBe("2026-01-20");
  });

  it("uses the LAST delivery event, so a redelivery after a failed attempt wins", () => {
    const o = order({
      status: "delivered",
      history: [
        { status: "delivered", at: at("2026-01-20T10:00:00Z") },
        { status: "shipped", at: at("2026-01-22T10:00:00Z") },
        { status: "delivered", at: at("2026-01-25T10:00:00Z") },
      ],
    });
    expect(warrantyStart(o)?.at.slice(0, 10)).toBe("2026-01-25");
  });

  it("has not started for an order that is only shipped", () => {
    const o = order({
      status: "shipped",
      history: [
        { status: "placed", at: at("2026-01-10T10:00:00Z") },
        { status: "shipped", at: at("2026-01-12T10:00:00Z") },
      ],
    });
    // A shipped order falls back to the dispatch date rather than nothing,
    // because that is the closest defensible evidence — but it is labelled.
    expect(warrantyStart(o)?.basis).toBe("shipped");
  });

  it("returns null for an order that has only been placed", () => {
    expect(warrantyStart(order())).toBeNull();
  });

  it("falls back to updatedAt when the status says delivered but no event was written", () => {
    // Older order records, and any status set directly rather than through
    // updateOrder, have no delivery event to read.
    const o = order({ status: "delivered", updatedAt: at("2026-02-01T10:00:00Z"), history: [] });
    const s = warrantyStart(o);
    expect(s?.basis).toBe("delivered");
    expect(s?.at.slice(0, 10)).toBe("2026-02-01");
  });

  it("survives a missing history array", () => {
    expect(() => warrantyStart({ status: "placed" })).not.toThrow();
    expect(warrantyStart({ status: "placed" })).toBeNull();
  });
});

describe("warrantyTerm", () => {
  const delivered = (deliveredAt: string) =>
    order({
      status: "delivered",
      history: [
        { status: "placed", at: at("2026-01-10T10:00:00Z") },
        { status: "delivered", at: at(deliveredAt) },
      ],
    });

  it("runs six months from the delivery date", () => {
    const t = warrantyTerm(delivered("2026-01-20T10:00:00Z"), { now: new Date("2026-02-01T00:00:00Z").getTime() });
    expect(t.months).toBe(WARRANTY_MONTHS);
    expect(t.start?.slice(0, 10)).toBe("2026-01-20");
    expect(t.expiry?.slice(0, 10)).toBe("2026-07-20");
    expect(t.state).toBe("active");
  });

  it("does not invent an expiry date for an undelivered order", () => {
    // A document that prints a confident expiry for a parcel still in transit
    // is worse than one that says cover begins on delivery.
    const t = warrantyTerm(order());
    expect(t.state).toBe("not-started");
    expect(t.start).toBeNull();
    expect(t.expiry).toBeNull();
    expect(t.daysRemaining).toBeNull();
    expect(t.summary).toContain("begins on delivery");
  });

  it("reports expired once the term has passed", () => {
    const t = warrantyTerm(delivered("2026-01-20T10:00:00Z"), { now: new Date("2026-09-01T00:00:00Z").getTime() });
    expect(t.state).toBe("expired");
    expect(t.daysRemaining).toBe(0);
    expect(t.summary).toContain("expired");
  });

  it("flags the last 30 days as expiring so a reminder can go out", () => {
    const t = warrantyTerm(delivered("2026-01-20T10:00:00Z"), { now: new Date("2026-07-01T00:00:00Z").getTime() });
    expect(t.state).toBe("expiring");
    expect(t.daysRemaining).toBeLessThanOrEqual(30);
  });

  it("is active on the day before expiry and expired the day after", () => {
    const o = delivered("2026-01-20T00:00:00Z");
    const before = warrantyTerm(o, { now: new Date("2026-07-19T00:00:00Z").getTime() });
    const after = warrantyTerm(o, { now: new Date("2026-07-21T00:00:00Z").getTime() });
    expect(before.state).not.toBe("expired");
    expect(after.state).toBe("expired");
  });

  it("never reports a negative number of days remaining", () => {
    const t = warrantyTerm(delivered("2020-01-20T10:00:00Z"), { now: Date.now() });
    expect(t.daysRemaining).toBe(0);
  });

  it("names the basis in the summary so the date can be defended", () => {
    const t = warrantyTerm(delivered("2026-01-20T10:00:00Z"), { now: new Date("2026-02-01T00:00:00Z").getTime() });
    expect(t.summary).toContain("delivered");
  });

  it("honours a non-default term length", () => {
    const t = warrantyTerm(delivered("2026-01-20T10:00:00Z"), { months: 24, now: new Date("2026-02-01T00:00:00Z").getTime() });
    expect(t.expiry?.slice(0, 10)).toBe("2028-01-20");
  });
});

describe("warrantyLabel", () => {
  it("says cover starts on delivery rather than showing a count", () => {
    expect(warrantyLabel(warrantyTerm(order()))).toBe("Starts on delivery");
  });

  it("says expired once it is", () => {
    const o = order({ status: "delivered", history: [{ status: "delivered", at: at("2020-01-01T00:00:00Z") }] });
    expect(warrantyLabel(warrantyTerm(o))).toBe("Expired");
  });
});
