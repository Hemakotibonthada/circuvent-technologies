/**
 * Tests for the report aggregations added in the Reports rebuild.
 *
 * store.ts uses top-level await (Jest's CJS transform can't load it), so the
 * module is mocked wholesale — the same pattern insights-range.test.ts uses.
 * These lock in the "every number is real" guarantee: each aggregation only
 * counts stored fields, respects the window, and never defaults an absent
 * figure (a refund with no amount, a stage with no timestamp) to a fake zero.
 */
jest.mock("./store", () => ({
  listOrders: jest.fn(() => [] as unknown[]),
  listProducts: jest.fn(() => [] as unknown[]),
  listCustomers: jest.fn(() => [] as unknown[]),
  listReturns: jest.fn(() => [] as unknown[]),
  listTickets: jest.fn(() => [] as unknown[]),
  analytics: jest.fn(() => ({})),
}));

import * as store from "./store";
import {
  paymentReconciliation, discountEffectiveness, customerRetention,
  acquisitionCohorts, fulfilmentSla, refundsReport,
} from "./insights";

const mocked = store as unknown as Record<string, jest.Mock>;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

interface OrderOpts {
  placedAt?: string; status?: string; paymentStatus?: string; paymentMethod?: string;
  total?: number; discount?: number; couponCode?: string; email?: string;
  items?: { name: string; qty: number; price: number; lineTotal: number }[];
  history?: { status: string; at: string }[];
}
const order = (o: OrderOpts = {}) => ({
  id: `o-${Math.random().toString(36).slice(2)}`,
  placedAt: o.placedAt ?? daysAgo(1),
  status: o.status ?? "delivered",
  paymentStatus: o.paymentStatus ?? "paid",
  paymentMethod: o.paymentMethod ?? "razorpay",
  total: o.total ?? 1000,
  subtotal: o.total ?? 1000,
  shipping: 0,
  discount: o.discount ?? 0,
  couponCode: o.couponCode ?? "",
  customer: { email: o.email ?? "a@example.com", name: "A" },
  items: o.items ?? [{ name: "Smart Plug", qty: 1, price: o.total ?? 1000, lineTotal: o.total ?? 1000 }],
  history: o.history ?? [],
});

beforeEach(() => {
  mocked.listProducts.mockReturnValue([{ name: "Smart Plug", category: "Home" }] as never);
  mocked.listCustomers.mockReturnValue([] as never);
  mocked.listReturns.mockReturnValue([] as never);
  mocked.listTickets.mockReturnValue([] as never);
  mocked.analytics.mockReturnValue({} as never);
  mocked.listOrders.mockReturnValue([] as never);
});
afterEach(() => jest.clearAllMocks());

describe("paymentReconciliation", () => {
  it("splits captured / pending / failed by method and never drops an order", () => {
    mocked.listOrders.mockReturnValue([
      order({ paymentMethod: "razorpay", paymentStatus: "paid", total: 1000 }),
      order({ paymentMethod: "cod", paymentStatus: "pending", total: 500 }),
      order({ paymentMethod: "razorpay", paymentStatus: "refunded", total: 300 }),
      order({ paymentMethod: "", paymentStatus: "paid", total: 200 }),
    ] as never);
    const rows = paymentReconciliation(30);
    const rz = rows.find((r) => r.method.includes("Razorpay"))!;
    expect(rz.orders).toBe(2);
    expect(rz.captured).toBe(1000);
    expect(rz.capturedOrders).toBe(1);
    expect(rz.failedOrders).toBe(1);
    const cod = rows.find((r) => r.method.includes("Cash"))!;
    expect(cod.pendingValue).toBe(500);
    expect(cod.pendingOrders).toBe(1);
    // an order with no method is bucketed, not lost
    const other = rows.find((r) => r.method === "other" || r.method === "Other")!;
    expect(other.captured).toBe(200);
    const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
    expect(totalOrders).toBe(4);
  });
});

describe("discountEffectiveness", () => {
  it("compares coupon vs non-coupon and returns null ROI when no discount was given", () => {
    mocked.listOrders.mockReturnValue([
      order({ couponCode: "SAVE", total: 900, discount: 100, items: [{ name: "x", qty: 2, price: 450, lineTotal: 900 }] }),
      order({ couponCode: "", total: 1000, discount: 0 }),
    ] as never);
    const d = discountEffectiveness(30);
    expect(d.withCoupon.revenue).toBe(900);
    expect(d.withCoupon.aov).toBe(900);
    expect(d.withoutCoupon.aov).toBe(1000);
    expect(d.aovLift).toBe(-100);
    expect(d.totalDiscount).toBe(100);
    expect(d.roi).toBe(9); // 900 / 100
  });

  it("reports ROI as null (not Infinity) when the coupon cohort gave no discount", () => {
    mocked.listOrders.mockReturnValue([
      order({ couponCode: "FREESHIP", total: 800, discount: 0 }),
    ] as never);
    expect(discountEffectiveness(30).roi).toBeNull();
  });
});

describe("customerRetention", () => {
  it("classes a customer with an earlier lifetime order as returning, not new", () => {
    mocked.listOrders.mockReturnValue([
      order({ email: "x@a.com", placedAt: daysAgo(200), total: 500 }), // outside window, lifetime only
      order({ email: "x@a.com", placedAt: daysAgo(1), total: 500 }),   // in window
      order({ email: "y@a.com", placedAt: daysAgo(1), total: 700 }),   // first-ever, in window
    ] as never);
    const r = customerRetention(30);
    expect(r.customers).toBe(2);
    expect(r.newCustomers).toBe(1);      // y
    expect(r.returningCustomers).toBe(1); // x
    expect(r.repeatCustomers).toBe(1);    // x has 2 lifetime orders
    expect(r.oneTimeCustomers).toBe(1);   // y
    expect(r.repeatRatePct).toBe(50);
  });

  it("returns null rates for an empty window rather than 0%", () => {
    mocked.listOrders.mockReturnValue([] as never);
    const r = customerRetention(30);
    expect(r.customers).toBe(0);
    expect(r.repeatRatePct).toBeNull();
    expect(r.avgOrdersPerCustomer).toBeNull();
  });
});

describe("acquisitionCohorts", () => {
  it("returns the requested number of monthly cohorts and buckets first orders", () => {
    mocked.listOrders.mockReturnValue([
      order({ email: "a@a.com", placedAt: hoursAgo(2) }),
      order({ email: "b@a.com", placedAt: hoursAgo(3) }),
      order({ email: "a@a.com", placedAt: hoursAgo(1) }), // second order, same customer
    ] as never);
    const cohorts = acquisitionCohorts(6);
    expect(cohorts).toHaveLength(6);
    const current = cohorts[cohorts.length - 1];
    expect(current.size).toBe(2); // a and b acquired this month
    expect(current.retainedPct).toHaveLength(6);
  });
});

describe("fulfilmentSla", () => {
  it("measures stage timings from history and excludes stages missing a timestamp", () => {
    mocked.listOrders.mockReturnValue([
      order({ status: "delivered", placedAt: hoursAgo(48), history: [
        { status: "shipped", at: hoursAgo(24) },
        { status: "delivered", at: hoursAgo(12) },
      ] }),
      order({ status: "shipped", placedAt: hoursAgo(50), history: [
        { status: "shipped", at: hoursAgo(20) },
      ] }),
    ] as never);
    const sla = fulfilmentSla(30);
    expect(sla.orders).toBe(2);
    const processing = sla.stages.find((s) => s.key === "processing")!;
    expect(processing.count).toBe(2);
    expect(processing.avgHours).toBe(27); // (24 + 30) / 2
    const delivery = sla.stages.find((s) => s.key === "delivery")!;
    expect(delivery.count).toBe(1);       // only the delivered order qualifies
    expect(delivery.avgHours).toBe(12);
    const e2e = sla.stages.find((s) => s.key === "endToEnd")!;
    expect(e2e.count).toBe(1);
    expect(e2e.avgHours).toBe(36);
    expect(sla.deliveredRatePct).toBe(50);
  });

  it("reports null (not 0h) for a stage no order ever recorded", () => {
    mocked.listOrders.mockReturnValue([
      order({ status: "placed", placedAt: hoursAgo(5), history: [] }),
    ] as never);
    const sla = fulfilmentSla(30);
    expect(sla.stages.every((s) => s.avgHours === null)).toBe(true);
  });
});

describe("refundsReport", () => {
  it("counts only refunds with a keyed amount toward refund value", () => {
    mocked.listOrders.mockReturnValue([
      order({ placedAt: daysAgo(1) }), order({ placedAt: daysAgo(1) }),
      order({ placedAt: daysAgo(1) }), order({ placedAt: daysAgo(1) }),
    ] as never);
    mocked.listReturns.mockReturnValue([
      { id: "r1", createdAt: daysAgo(1), status: "refunded", refundAmount: 500, reason: "Damaged" },
      { id: "r2", createdAt: daysAgo(1), status: "requested", reason: "Damaged" }, // no refundAmount
      { id: "r3", createdAt: daysAgo(200), status: "refunded", refundAmount: 999, reason: "Old" }, // out of window
    ] as never);
    const r = refundsReport(30);
    expect(r.total).toBe(2);              // r3 excluded
    expect(r.refundedCount).toBe(1);
    expect(r.refundValue).toBe(500);      // r2's missing amount is NOT counted as 0-that-settles
    expect(r.refundAmountKnown).toBe(1);
    const damaged = r.byReason.find((x) => x.reason === "Damaged")!;
    expect(damaged.count).toBe(2);
    expect(damaged.refundValue).toBe(500);
    expect(r.returnRatePct).toBe(50);     // 2 returns / 4 orders
  });
});
