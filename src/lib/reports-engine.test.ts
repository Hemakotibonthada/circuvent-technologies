/**
 * Tests for the server report engine (reports.ts).
 *
 * store/inventory/admin-tax are mocked so a controlled dataset drives the
 * builders. The invariants under test are the ones the rebuild promised:
 *  - a totals row equals the sum of the rows it heads (the CSV/PDF depend on it)
 *  - GST is backed out of the real collected amount at each product's stored
 *    rate, not a flat 1.18 divisor
 *  - the P&L stops at gross profit and never invents a net-profit line
 *  - unmapped / cost-less items are surfaced in notes, never silently zeroed
 */
jest.mock("./store", () => ({
  listOrders: jest.fn(() => [] as unknown[]),
  listProducts: jest.fn(() => [] as unknown[]),
  listCustomers: jest.fn(() => [] as unknown[]),
  listReturns: jest.fn(() => [] as unknown[]),
  listTickets: jest.fn(() => [] as unknown[]),
  analytics: jest.fn(() => ({})),
}));
jest.mock("./inventory", () => ({
  listProductRows: jest.fn(() => [] as unknown[]),
  valuation: jest.fn(() => ({ byCategory: [], skuCount: 0, units: 0, cost: 0, retail: 0, potentialProfit: 0 })),
  reorderSuggestions: jest.fn(() => [] as unknown[]),
  deadStock: jest.fn(() => [] as unknown[]),
}));
jest.mock("./admin-tax", () => ({
  listHsnMappings: jest.fn(() => [] as unknown[]),
}));

import * as store from "./store";
import * as inventory from "./inventory";
import { buildReport, REPORT_IDS } from "./reports";
import { sumColumn, type ReportColumn, type Cell } from "./reports-format";

const mstore = store as unknown as Record<string, jest.Mock>;
const minv = inventory as unknown as Record<string, jest.Mock>;

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

interface OItem { id?: string; name: string; qty: number; price: number; lineTotal: number }
const order = (o: Partial<{ placedAt: string; status: string; paymentStatus: string; paymentMethod: string; total: number; subtotal: number; shipping: number; discount: number; couponCode: string; email: string; items: OItem[]; history: { status: string; at: string }[] }> = {}) => ({
  id: `o-${Math.random().toString(36).slice(2)}`,
  placedAt: o.placedAt ?? daysAgo(1),
  status: o.status ?? "delivered",
  paymentStatus: o.paymentStatus ?? "paid",
  paymentMethod: o.paymentMethod ?? "razorpay",
  total: o.total ?? 1180,
  subtotal: o.subtotal ?? (o.total ?? 1180),
  shipping: o.shipping ?? 0,
  discount: o.discount ?? 0,
  couponCode: o.couponCode ?? "",
  customer: { email: o.email ?? "a@example.com", name: "A" },
  items: o.items ?? [{ name: "Smart Plug", qty: 1, price: 1180, lineTotal: 1180 }],
  history: o.history ?? [],
});

const prodRow = (over: Partial<{ productId: string; name: string; slug: string; category: string; costPrice: number; gstPct: number; hsn: string; price: number; stock: number }> = {}) => ({
  productId: over.productId ?? "p1",
  name: over.name ?? "Smart Plug",
  slug: over.slug ?? "smart-plug",
  category: over.category ?? "Home",
  costPrice: over.costPrice ?? 600,
  gstPct: over.gstPct ?? 18,
  hsn: over.hsn ?? "85287100",
  price: over.price ?? 1180,
  stock: over.stock ?? 10,
});

beforeEach(() => {
  mstore.listProducts.mockReturnValue([{ name: "Smart Plug", category: "Home" }] as never);
  mstore.listCustomers.mockReturnValue([] as never);
  mstore.listReturns.mockReturnValue([] as never);
  mstore.listTickets.mockReturnValue([] as never);
  mstore.analytics.mockReturnValue({} as never);
  mstore.listOrders.mockReturnValue([] as never);
  minv.listProductRows.mockReturnValue([prodRow()] as never);
  minv.valuation.mockReturnValue({ byCategory: [], skuCount: 0, units: 0, cost: 0, retail: 0, potentialProfit: 0 } as never);
  minv.reorderSuggestions.mockReturnValue([] as never);
  minv.deadStock.mockReturnValue([] as never);
});
afterEach(() => jest.clearAllMocks());

/** For every column flagged total:true, the totals cell equals the column sum. */
function assertTotalsAreSums(columns: ReportColumn[], rows: Cell[][], totals: Cell[]) {
  columns.forEach((c, i) => {
    if (c.total && (c.type === "money" || c.type === "int")) {
      const expected = Math.round(sumColumn(rows, i));
      expect(totals[i]).toBe(expected);
    }
  });
}

describe("report engine — every report builds and totals equal the sum of rows", () => {
  beforeEach(() => {
    mstore.listOrders.mockReturnValue([
      order({ total: 1180, items: [{ id: "p1", name: "Smart Plug", qty: 1, price: 1180, lineTotal: 1180 }] }),
      order({ total: 2360, items: [{ id: "p1", name: "Smart Plug", qty: 2, price: 1180, lineTotal: 2360 }] }),
    ] as never);
  });

  it.each(REPORT_IDS)("builds %s with consistent totals", (type) => {
    const t = buildReport(type, 30);
    expect(t.id).toBe(type);
    expect(Array.isArray(t.rows)).toBe(true);
    expect(t.columns.length).toBeGreaterThan(0);
    expect(Array.isArray(t.notes)).toBe(true);
    if (t.totals && t.totals.length) assertTotalsAreSums(t.columns, t.rows, t.totals);
    for (const sec of t.sections ?? []) {
      if (sec.totals && sec.totals.length) assertTotalsAreSums(sec.columns, sec.rows, sec.totals);
    }
  });
});

describe("GST / tax report", () => {
  it("backs GST out of the real collected total at the product's stored rate (not a flat 1.18)", () => {
    // Two paid orders, both the same 18% product: collected 1180 + 2360 = 3540 incl.
    mstore.listOrders.mockReturnValue([
      order({ total: 1180, items: [{ id: "p1", name: "Smart Plug", qty: 1, price: 1180, lineTotal: 1180 }] }),
      order({ total: 2360, items: [{ id: "p1", name: "Smart Plug", qty: 2, price: 1180, lineTotal: 2360 }] }),
    ] as never);
    const t = buildReport("tax", 30);
    const invoiceIdx = t.columns.findIndex((c) => c.key === "invoice");
    const taxableIdx = t.columns.findIndex((c) => c.key === "taxable");
    const cgstIdx = t.columns.findIndex((c) => c.key === "cgst");
    const sgstIdx = t.columns.findIndex((c) => c.key === "sgst");
    const totalInvoice = sumColumn(t.rows, invoiceIdx);
    const totalTaxable = sumColumn(t.rows, taxableIdx);
    expect(totalInvoice).toBe(3540);
    // 3540 inclusive @18% → taxable 3000, tax 540
    expect(totalTaxable).toBe(3000);
    expect(sumColumn(t.rows, cgstIdx) + sumColumn(t.rows, sgstIdx)).toBe(540);
    // CGST and SGST each half of the 540 total tax
    expect(sumColumn(t.rows, cgstIdx)).toBe(270);
    expect(sumColumn(t.rows, sgstIdx)).toBe(270);
  });

  it("groups items with no GST rate on record under HSN — and flags them, never guessing a rate", () => {
    minv.listProductRows.mockReturnValue([prodRow({ productId: "p2", name: "Mystery", slug: "mystery", gstPct: 0, hsn: "" })] as never);
    mstore.listOrders.mockReturnValue([
      order({ total: 1000, items: [{ id: "p2", name: "Mystery", qty: 1, price: 1000, lineTotal: 1000 }] }),
    ] as never);
    const t = buildReport("tax", 30);
    const rateIdx = t.columns.findIndex((c) => c.key === "rate");
    // the only slab is at 0% (unknown), and a note calls it out
    expect(t.rows.every((r) => r[rateIdx] === 0)).toBe(true);
    expect(t.notes.some((n) => n.toLowerCase().includes("no hsn") || n.includes("—"))).toBe(true);
  });
});

describe("P&L report honesty", () => {
  it("omits a net-profit line and states why, stopping at gross profit after returns", () => {
    mstore.listOrders.mockReturnValue([
      order({ total: 1180, subtotal: 1180, items: [{ id: "p1", name: "Smart Plug", qty: 1, price: 1180, lineTotal: 1180 }] }),
    ] as never);
    const t = buildReport("pnl", 30);
    const labels = t.rows.map((r) => String(r[0]).toLowerCase());
    expect(labels.some((l) => l.includes("gross profit"))).toBe(true);
    expect(labels.some((l) => l.includes("net profit"))).toBe(false);
    expect(t.notes.some((n) => n.toLowerCase().includes("operating expenses"))).toBe(true);
  });

  it("flags units with no cost price instead of pricing COGS at zero silently", () => {
    minv.listProductRows.mockReturnValue([prodRow({ productId: "p3", name: "NoCost", slug: "nocost", costPrice: 0 })] as never);
    mstore.listOrders.mockReturnValue([
      order({ total: 1180, items: [{ id: "p3", name: "NoCost", qty: 1, price: 1180, lineTotal: 1180 }] }),
    ] as never);
    const t = buildReport("pnl", 30);
    expect(t.notes.some((n) => n.toLowerCase().includes("no cost price"))).toBe(true);
  });
});

describe("catalog", () => {
  it("exposes all 14 report types", () => {
    expect(REPORT_IDS).toHaveLength(14);
    expect(REPORT_IDS).toEqual(expect.arrayContaining([
      "sales", "products", "categories", "customers", "pnl", "tax", "payments",
      "refunds", "coupons", "discounts", "retention", "inventory", "reorder", "fulfilment",
    ]));
  });

  it("falls back to the sales report for an unknown type", () => {
    const t = buildReport("does-not-exist", 30);
    expect(t.id).toBe("sales");
  });
});
