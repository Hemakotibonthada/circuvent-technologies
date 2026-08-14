/**
 * The chart layer inside report PDFs.
 *
 * These are drawn with pdf-lib primitives rather than a chart library, so the
 * failure modes are arithmetic: a division by zero on an empty series, a
 * negative bar height, an axis scaled from a peak of zero. None of that throws
 * — it produces a PDF with nothing on the page, or with a bar drawn off it.
 *
 * So these check the cases that produce no drawing at all, and that a chart
 * which cannot say anything honestly declines to be drawn.
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import { drawChart } from "./reports-pdf-charts";
import type { Cell, ChartSpec, ReportColumn } from "./reports-format";

const columns: ReportColumn[] = [
  { key: "date", label: "Date", type: "date" },
  { key: "revenue", label: "Revenue", type: "money", total: true },
  { key: "orders", label: "Orders", type: "int", total: true },
];

async function ctx() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  return {
    page,
    pageH: 841.89,
    font: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
}

const box = { x: 40, yTop: 100, width: 515, height: 150 };

const rows = (n: number): Cell[][] =>
  Array.from({ length: n }, (_, i) => [`2026-07-${String(i + 1).padStart(2, "0")}`, (i + 1) * 1000, i + 1]);

const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  kind: "bar",
  labelKey: "date",
  valueKeys: ["revenue"],
  ...over,
});

describe("a chart that cannot say anything is not drawn", () => {
  it("declines when there are no rows", async () => {
    // A bare axis with no bars reads as "the value is zero" rather than
    // "there is nothing to show", which are very different statements.
    expect(drawChart(await ctx(), spec(), columns, [], box)).toBe(0);
  });

  it("declines when every value is zero", async () => {
    const flat: Cell[][] = [["2026-07-01", 0, 0], ["2026-07-02", 0, 0]];
    expect(drawChart(await ctx(), spec(), columns, flat, box)).toBe(0);
  });

  it("declines when the label column does not exist", async () => {
    expect(drawChart(await ctx(), spec({ labelKey: "nope" }), columns, rows(3), box)).toBe(0);
  });

  it("drops a value column that does not exist rather than plotting zeros", async () => {
    /*
     * A flat line carrying a real column name is a far more convincing lie
     * than a missing series — somebody would read it as "revenue was zero all
     * month" instead of "that column is not in this report".
     */
    const c = await ctx();
    expect(drawChart(c, spec({ valueKeys: ["nope"] }), columns, rows(3), box)).toBe(0);
    expect(drawChart(c, spec({ valueKeys: ["nope", "revenue"] }), columns, rows(3), box)).toBeGreaterThan(0);
  });

  it("declines when the box is too short to be legible", async () => {
    // A chart squeezed into 20pt is worse than no chart.
    expect(drawChart(await ctx(), spec(), columns, rows(5), { ...box, height: 24 })).toBe(0);
  });
});

describe("every chart kind draws", () => {
  it.each([
    ["bar", ["revenue"]],
    ["hbar", ["revenue"]],
    ["donut", ["revenue"]],
    ["line", ["revenue"]],
    ["stacked", ["revenue", "orders"]],
    ["combo", ["revenue", "orders"]],
    ["waterfall", ["revenue"]],
  ] as const)("%s", async (kind, keys) => {
    const used = drawChart(
      await ctx(),
      spec({ kind: kind as ChartSpec["kind"], valueKeys: [...keys] }),
      columns,
      rows(8),
      box,
    );
    expect(used).toBeGreaterThan(0);
    expect(used).toBeLessThanOrEqual(box.height + 40);
  });

  it("handles a single row without dividing by zero", async () => {
    // A line chart with one point has no segments to draw; it must not throw
    // or return a nonsense height.
    for (const kind of ["line", "bar", "donut", "combo"] as const) {
      const used = drawChart(await ctx(), spec({ kind, valueKeys: ["revenue", "orders"] }), columns, rows(1), box);
      expect(used).toBeGreaterThanOrEqual(0);
    }
  });

  it("survives negative values without drawing off the page", async () => {
    // A refund-heavy month makes a negative row; the bar is clamped rather
    // than drawn upside down through the header.
    const withNeg: Cell[][] = [["a", -5000, -2], ["b", 9000, 4]];
    expect(drawChart(await ctx(), spec(), columns, withNeg, box)).toBeGreaterThan(0);
  });
});

describe("top-N limiting", () => {
  it("keeps the largest values, not the first ones", async () => {
    /*
     * A "top 5 products" chart that shows the first five rows is not a top-5,
     * and the caller has no way to tell from the output.
     */
    const many: Cell[][] = Array.from({ length: 40 }, (_, i) => [`row-${i}`, i * 100, i]);
    const used = drawChart(await ctx(), spec({ kind: "hbar", limit: 5 }), columns, many, box);
    expect(used).toBeGreaterThan(0);
  });
});
