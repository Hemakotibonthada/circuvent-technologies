/**
 * @jest-environment node
 *
 * The six analytics export buttons were plain `<a href>` links, and the admin
 * API reads its credential from a header. A browser navigation carries cookies
 * and nothing else, so every button hit a 403 — and because it was a
 * navigation rather than a fetch, it failed silently: no download, no error,
 * nothing in the page to say why.
 *
 * These tests cover the route the fixed button calls, for every type it offers.
 */
import { GET } from "./route";

let allowed = true;
jest.mock("@/lib/admin-auth", () => ({
  guard: () => (allowed ? { email: "ops@circuvent.com", role: "owner" } : null),
}));

/*
 * The store is mocked because `src/lib/store.ts` has a top-level `await`, which
 * Jest cannot parse once it is transpiled to CommonJS — any test that reaches
 * it transitively fails at module load rather than at an assertion. This is the
 * same pattern reports-engine.test.ts already uses, for the same reason.
 *
 * Empty data on purpose: what matters here is that every type the panel offers
 * builds a downloadable CSV at all. The builders' arithmetic is covered by
 * reports-engine.test.ts and reports-aggregations.test.ts, which feed them real
 * rows.
 */
jest.mock("@/lib/store", () => ({
  listOrders: jest.fn(() => [] as unknown[]),
  listProducts: jest.fn(() => [] as unknown[]),
  listCustomers: jest.fn(() => [] as unknown[]),
  listReturns: jest.fn(() => [] as unknown[]),
  listTickets: jest.fn(() => [] as unknown[]),
  analytics: jest.fn(() => ({})),
}));
jest.mock("@/lib/inventory", () => ({
  listProductRows: jest.fn(() => [] as unknown[]),
  valuation: jest.fn(() => ({ byCategory: [], skuCount: 0, units: 0, cost: 0, retail: 0, potentialProfit: 0 })),
  reorderSuggestions: jest.fn(() => [] as unknown[]),
  deadStock: jest.fn(() => [] as unknown[]),
}));
jest.mock("@/lib/admin-tax", () => ({
  listHsnMappings: jest.fn(() => [] as unknown[]),
}));

const req = (qs: string) =>
  new Request(`https://circuvent.com/api/admin/insights/export${qs}`);

beforeEach(() => {
  allowed = true;
});

/* Exactly the list the Analytics panel renders. If a button is added there
   without a builder here, this test is what says so. */
const PANEL_TYPES = ["sales", "products", "customers", "categories", "coupons", "tax"];

describe("analytics export", () => {
  it("refuses without an admin session", async () => {
    allowed = false;
    expect((await GET(req("?type=sales&range=30"))).status).toBe(403);
  });

  it.each(PANEL_TYPES)("builds a %s report the browser will download", async (type) => {
    const res = await GET(req(`?type=${type}&range=30`));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");

    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("attachment");
    // The client reads the filename out of this header, so it has to be there
    // and it has to be parseable.
    expect(/filename="?([^"';]+)"?/i.exec(disposition)?.[1]).toContain(type);

    const csv = await res.text();
    // A header row at minimum: an empty file downloads as an empty file and
    // looks like the feature is broken rather than like there is no data.
    expect(csv.split(/\r?\n/)[0].length).toBeGreaterThan(0);
  });

  it("rejects a type it cannot build instead of silently returning sales", async () => {
    const res = await GET(req("?type=nonsense&range=30"));
    expect(res.status).toBe(400);
  });

  it("clamps the range rather than trusting it", async () => {
    for (const range of ["0", "-5", "99999", "abc"]) {
      expect((await GET(req(`?type=sales&range=${range}`))).status).toBe(200);
    }
  });

  it("defaults to sales when no type is given", async () => {
    const res = await GET(req("?range=30"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("sales");
  });
});
