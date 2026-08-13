/**
 * @jest-environment node
 *
 * Every report the Reports panel lists, through the routes the panel calls.
 *
 * The panel builds its list from REPORT_CATALOG, so a report can be offered in
 * the sidebar while its builder, its CSV or its PDF fails — and the only
 * symptom is a blade that stays empty or a download that never arrives.
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

let allowed = true;
jest.mock("@/lib/admin-auth", () => ({
  guard: () => (allowed ? { email: "ops@circuvent.com", role: "owner" } : null),
}));

import { GET as getData } from "@/app/api/admin/reports/data/route";
import { GET as getCsv } from "@/app/api/admin/reports/csv/route";
import { GET as getCatalog } from "@/app/api/admin/reports/catalog/route";
import { GET as getPdf } from "@/app/api/admin/reports/pdf/route";
import { REPORT_IDS } from "@/lib/reports-format";

const req = (path: string, qs: string) =>
  new Request(`https://circuvent.com/api/admin/reports/${path}${qs}`);

beforeEach(() => {
  allowed = true;
});

describe("every report in the catalog", () => {
  it("has at least the fourteen the panel groups into four sections", () => {
    expect(REPORT_IDS.length).toBeGreaterThanOrEqual(14);
  });

  it.each(REPORT_IDS)("builds %s as data", async (id) => {
    const res = await getData(req("data", `?type=${id}&range=30`));
    expect(res.status).toBe(200);

    const body = await res.json();
    const table = body.table;
    expect(table).toBeDefined();
    /* A table with no columns renders as an empty blade, which is what a
       broken report looks like from the outside. */
    expect(Array.isArray(table.columns)).toBe(true);
    expect(table.columns.length).toBeGreaterThan(0);
    expect(Array.isArray(table.rows)).toBe(true);
    expect(typeof table.title).toBe("string");
    expect(table.title.length).toBeGreaterThan(0);
  });

  it.each(REPORT_IDS)("builds %s as CSV", async (id) => {
    const res = await getCsv(req("csv", `?type=${id}&range=30`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("csv");

    const csv = await res.text();
    expect(csv.split(/\r?\n/)[0].length).toBeGreaterThan(0);
  });
});

describe("every report as a PDF", () => {
  it.each(REPORT_IDS)("renders %s", async (id) => {
    const res = await getPdf(req("pdf", `?type=${id}&range=30`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");

    const bytes = new Uint8Array(await res.arrayBuffer());
    /* %PDF- — a zero-byte or HTML error body downloads as a file the reader
       refuses to open, which is indistinguishable from a broken button. */
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(500);
  });
});

describe("the catalog the sidebar is built from", () => {
  it("is served", async () => {
    const res = await getCatalog(req("catalog", ""));
    expect(res.status).toBe(200);

    const body = await res.json();
    const ids = (body.reports ?? body.catalog ?? []).map((r: { id: string }) => r.id);
    // Every advertised report must be buildable, or the sidebar offers a blade
    // that cannot fill.
    for (const id of ids) expect(REPORT_IDS).toContain(id);
  });
});

describe("guards", () => {
  it("refuses without an admin session", async () => {
    allowed = false;
    expect((await getData(req("data", "?type=sales&range=30"))).status).toBe(403);
    expect((await getCsv(req("csv", "?type=sales&range=30"))).status).toBe(403);
  });
});
