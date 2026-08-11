import { returnEligibility } from "@/lib/return-eligibility";
import { RETURN_DAYS } from "@/lib/shop-policy";

const DAY = 86_400_000;
const NOW = Date.parse("2026-03-20T12:00:00.000Z");

const delivered = (daysAgo: number) => ({
  orderNo: "CV-1",
  status: "delivered",
  placedAt: new Date(NOW - (daysAgo + 3) * DAY).toISOString(),
  updatedAt: new Date(NOW - daysAgo * DAY).toISOString(),
  history: [
    { status: "shipped", at: new Date(NOW - (daysAgo + 1) * DAY).toISOString() },
    { status: "delivered", at: new Date(NOW - daysAgo * DAY).toISOString() },
  ],
});

describe("returnEligibility", () => {
  it("allows a return inside the window and counts the days left", () => {
    const r = returnEligibility(delivered(2), { now: NOW });
    expect(r.state).toBe("eligible");
    expect(r.canRequest).toBe(true);
    expect(r.daysLeft).toBe(RETURN_DAYS - 2);
  });

  it("refuses once the window has closed, and says when it closed", () => {
    const r = returnEligibility(delivered(RETURN_DAYS + 1), { now: NOW });
    expect(r.state).toBe("window-closed");
    expect(r.canRequest).toBe(false);
    expect(r.reason).toMatch(/closed on/);
  });

  it("counts from the last delivery, so a redelivery restarts the window", () => {
    // A failed first attempt must not eat the customer's window.
    const order = {
      status: "delivered",
      history: [
        { status: "delivered", at: new Date(NOW - 30 * DAY).toISOString() },
        { status: "delivered", at: new Date(NOW - 1 * DAY).toISOString() },
      ],
    };
    expect(returnEligibility(order, { now: NOW }).state).toBe("eligible");
  });

  it("does not open the window while the parcel is still in transit", () => {
    // warrantyStart falls back to dispatch, which is right for a warranty but
    // would start a return clock on something the customer has not received.
    const shipped = { status: "shipped", history: [{ status: "shipped", at: new Date(NOW - 2 * DAY).toISOString() }] };
    const r = returnEligibility(shipped, { now: NOW });
    expect(r.state).toBe("not-delivered");
    expect(r.canRequest).toBe(false);
  });

  it("treats an order with no history at all as not yet delivered", () => {
    expect(returnEligibility({ status: "processing" }, { now: NOW }).state).toBe("not-delivered");
  });

  it("still works for an order marked delivered with no history event", () => {
    // Older records were given a status directly; updatedAt is the evidence.
    const legacy = { status: "delivered", updatedAt: new Date(NOW - 1 * DAY).toISOString() };
    expect(returnEligibility(legacy, { now: NOW }).state).toBe("eligible");
  });

  it("reports an existing request instead of offering another", () => {
    const r = returnEligibility(delivered(1), { now: NOW, existingStatus: "approved" });
    expect(r.state).toBe("already-requested");
    expect(r.canRequest).toBe(false);
    expect(r.reason).toMatch(/approved/);
  });

  it("lets a rejected request be replaced while the window is open", () => {
    const r = returnEligibility(delivered(1), { now: NOW, existingStatus: "rejected" });
    expect(r.state).toBe("eligible");
  });

  it("offers nothing on a cancelled order", () => {
    const r = returnEligibility({ ...delivered(1), status: "cancelled" }, { now: NOW });
    expect(r.state).toBe("cancelled");
  });

  it("never reports zero days left while the window is open", () => {
    // Eight hours remaining is "1 day", not "0 days".
    const r = returnEligibility(delivered(RETURN_DAYS - 0.3), { now: NOW });
    expect(r.canRequest).toBe(true);
    expect(r.daysLeft).toBe(1);
  });

  it("survives an unparseable delivery date rather than throwing", () => {
    const bad = { status: "delivered", history: [{ status: "delivered", at: "not-a-date" }] };
    expect(returnEligibility(bad, { now: NOW }).canRequest).toBe(false);
  });
});
