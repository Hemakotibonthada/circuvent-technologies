/**
 * Every chart spec must name columns that exist.
 *
 * ChartBlock resolves a spec's labelKey and valueKeys against the table's
 * columns and renders nothing when they do not resolve. So a typo, or a column
 * renamed later, produces a report with a silently missing chart — no error,
 * no gap, just a blade that looks slightly emptier than it should. This is the
 * only thing that would notice.
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

import { buildReport } from "./reports";
import { REPORT_IDS } from "./reports-format";

/** The kinds ChartBlock knows how to draw. A spec outside this set draws nothing. */
const RENDERABLE = new Set([
  "line",
  "bar",
  "hbar",
  "donut",
  "waterfall",
  "combo",
  "stacked",
  "heatmap",
  "funnel",
]);

describe.each(REPORT_IDS)("%s chart spec", (id) => {
  const table = buildReport(id, 90);
  const spec = table.chart;

  it("is a kind the panel can render", () => {
    if (!spec || spec.kind === "none") return;
    expect(RENDERABLE.has(spec.kind)).toBe(true);
  });

  it("names a label column that exists", () => {
    if (!spec || spec.kind === "none") return;
    const keys = table.columns.map((c) => c.key);
    expect(keys).toContain(spec.labelKey);
  });

  it("names value columns that exist", () => {
    if (!spec || spec.kind === "none") return;
    const keys = table.columns.map((c) => c.key);
    for (const k of spec.valueKeys) expect(keys).toContain(k);
  });

  it("gives combo two series, since one is bars and the other a line", () => {
    if (spec?.kind !== "combo") return;
    expect(spec.valueKeys.length).toBeGreaterThanOrEqual(2);
  });

  it("gives stacked at least two series, or it is just a bar chart", () => {
    if (spec?.kind !== "stacked") return;
    expect(spec.valueKeys.length).toBeGreaterThanOrEqual(2);
  });

  it("gives heatmap a matrix wider than one column", () => {
    if (spec?.kind !== "heatmap") return;
    expect(spec.valueKeys.length).toBeGreaterThanOrEqual(2);
  });
});

describe("the charts each report was given", () => {
  const specOf = (id: string) => buildReport(id, 90).chart;

  it("draws the P&L as a waterfall, which is what it was already called", () => {
    // It was titled "P&L waterfall" and rendered as plain bars, so the bridge
    // from revenue to gross profit — the entire point — was not shown.
    expect(specOf("pnl")?.kind).toBe("waterfall");
  });

  it("splits the tax chart into CGST and SGST", () => {
    // The report's own description is "HSN-wise GST with CGST/SGST split".
    const spec = specOf("tax");
    expect(spec?.kind).toBe("stacked");
    expect(spec?.valueKeys).toEqual(["cgst", "sgst"]);
  });

  it("draws retention as a cohort matrix, not a bar of intake", () => {
    // A bar of cohort sizes answers "how many arrived", which is not what a
    // retention report is for.
    const spec = specOf("retention");
    expect(spec?.kind).toBe("heatmap");
    expect(spec?.valueKeys[0]).toBe("m1");
  });

  it("shows sales revenue against orders rather than revenue alone", () => {
    expect(specOf("sales")?.kind).toBe("combo");
  });

  it("draws fulfilment stages as a funnel", () => {
    expect(specOf("fulfilment")?.kind).toBe("funnel");
  });
});

/*
 * Every window, not just the default.
 *
 * The retention matrix widens with the range, so a spec built for one window
 * can name columns another does not have. That is exactly how the heatmap was
 * written the first time — correct at 365 days, silently blank at 30.
 */
describe.each([7, 30, 90, 180, 365])("chart specs hold at %s days", (days) => {
  it.each(REPORT_IDS)("%s", (id) => {
    const table = buildReport(id, days);
    const spec = table.chart;
    if (!spec || spec.kind === "none") return;

    const keys = table.columns.map((c) => c.key);
    expect(keys).toContain(spec.labelKey);
    for (const k of spec.valueKeys) expect(keys).toContain(k);
    expect(spec.valueKeys.length).toBeGreaterThan(0);
  });
});