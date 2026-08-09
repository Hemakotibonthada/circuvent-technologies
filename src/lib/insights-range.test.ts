/**
 * store.ts uses top-level await, which Jest's CJS transform cannot load, so the
 * module is replaced wholesale rather than spied on. That also keeps these
 * tests about the aggregation and nothing else.
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
  categorySales, topProducts, topCustomers, couponUsage, ordersByStatus,
  hourlyHeatmap, newVsReturning, paymentSplit, dashboard,
} from "./insights";

const mocked = store as unknown as Record<string, jest.Mock>;

/**
 * The reports page has a range control (7d / 30d / 90d / 180d / 365d).
 *
 * Only the KPI strip and the time series ever read it. Every breakdown called
 * listOrders() directly and returned all-time totals, so the same page showed
 * "revenue this week: 0" beside a category chart totalling ₹4.3 lakh — verified
 * against production, where categorySales came back byte-identical for 7, 30
 * and 365 days.
 *
 * That is not a rounding disagreement. Whichever number someone acts on, one of
 * them was answering a question nobody asked under a label saying otherwise,
 * and nothing on the screen said which. These tests exist so a breakdown cannot
 * silently go back to ignoring the window.
 */

const iso = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};

const order = (daysAgo: number, o: Partial<Record<string, unknown>> = {}) => ({
  id: `o${daysAgo}-${Math.round(Number(o.total) || 0)}`,
  placedAt: iso(daysAgo),
  status: "delivered",
  paymentStatus: "paid",
  paymentMethod: "razorpay",
  total: 1000,
  discount: 0,
  couponCode: "",
  customer: { email: "a@example.com", name: "A" },
  items: [{ name: "Circuvent Smart Plug", qty: 1, price: 1000, lineTotal: 1000 }],
  ...o,
});

beforeEach(() => {
  mocked.listProducts.mockReturnValue([
    { name: "Circuvent Smart Plug", category: "Home Automation" },
  ] as never);
  mocked.listCustomers.mockReturnValue([] as never);
  mocked.listReturns.mockReturnValue([] as never);
  mocked.listTickets.mockReturnValue([] as never);
  mocked.analytics.mockReturnValue({} as never);
  mocked.listOrders.mockReturnValue([
    order(1),                                              // inside every window
    order(200, { total: 5000, items: [{ name: "Circuvent Smart Plug", qty: 5, price: 1000, lineTotal: 5000 }] }),
  ] as never);
});

afterEach(() => jest.clearAllMocks());

describe("breakdowns respect the selected range", () => {
  it("categorySales excludes orders outside the window", () => {
    const wk = categorySales(7);
    const yr = categorySales(365);
    expect(wk.reduce((s, c) => s + c.revenue, 0)).toBe(1000);
    expect(yr.reduce((s, c) => s + c.revenue, 0)).toBe(6000);
    // The exact failure seen in production: identical output for both.
    expect(wk).not.toEqual(yr);
  });

  it("topProducts counts only units sold in the window", () => {
    expect(topProducts(10, 7)[0].qty).toBe(1);
    expect(topProducts(10, 365)[0].qty).toBe(6);
  });

  it("topCustomers spends only what was spent in the window", () => {
    // This read customer.spend, a lifetime total on the record, so "top
    // customers this week" ranked people who bought nothing that week.
    expect(topCustomers(10, 7)[0].spend).toBe(1000);
    expect(topCustomers(10, 365)[0].spend).toBe(6000);
  });

  it("ordersByStatus, paymentSplit and the heatmap all narrow too", () => {
    expect(Object.values(ordersByStatus(7)).reduce((a, b) => a + b, 0)).toBe(1);
    expect(Object.values(ordersByStatus(365)).reduce((a, b) => a + b, 0)).toBe(2);
    expect(paymentSplit(7)[0].orders).toBe(1);
    expect(paymentSplit(365)[0].orders).toBe(2);
    const flat = (g: number[][]) => g.flat().reduce((a, b) => a + b, 0);
    expect(flat(hourlyHeatmap(7).grid)).toBe(1);
    expect(flat(hourlyHeatmap(365).grid)).toBe(2);
  });

  it("couponUsage counts only redemptions in the window", () => {
    mocked.listOrders.mockReturnValue([
      order(1, { couponCode: "NEW10", discount: 100 }),
      order(200, { couponCode: "OLD50", discount: 500 }),
    ] as never);
    expect(couponUsage(7).map((c) => c.code)).toEqual(["NEW10"]);
    expect(couponUsage(365).map((c) => c.code).sort()).toEqual(["NEW10", "OLD50"]);
  });

  it("a customer with an earlier order is returning, not new", () => {
    // Counting orders inside the window and calling one-order customers "new"
    // labels a three-year customer who ordered once this week as new.
    mocked.listOrders.mockReturnValue([
      order(200, { customer: { email: "old@example.com", name: "Old" } }),
      order(1, { customer: { email: "old@example.com", name: "Old" } }),
      order(1, { customer: { email: "new@example.com", name: "New" } }),
    ] as never);
    expect(newVsReturning(7)).toEqual({ new: 1, returning: 1 });
  });

  it("dashboard passes the range to every section", () => {
    const wk = dashboard(7);
    const yr = dashboard(365);
    expect(wk.categorySales).not.toEqual(yr.categorySales);
    expect(wk.topProducts).not.toEqual(yr.topProducts);
    expect(wk.ordersByStatus).not.toEqual(yr.ordersByStatus);
    expect(wk.heatmap.grid).not.toEqual(yr.heatmap.grid);
  });

  it("the KPI revenue and the category total agree for the same window", () => {
    // The contradiction a user actually sees: two numbers on one page,
    // computed over different spans, both unlabelled.
    const d = dashboard(365);
    const catTotal = d.categorySales.reduce((s, c) => s + c.revenue, 0);
    expect(catTotal).toBe(d.kpis.revenue.value);
  });
});
