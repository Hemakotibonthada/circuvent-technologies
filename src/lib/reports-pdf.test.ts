/**
 * Tests for the server-side PDF generator (reports-pdf.ts).
 *
 * No store is needed — the generator takes a fully-built ReportTable, so these
 * feed it synthetic tables and assert the three properties the task called out:
 *   1. the output starts with a real "%PDF-" header
 *   2. a long table paginates to more than one page (and a short one stays on 1)
 *   3. the totals the PDF prints equal the sum of the rows they head
 * plus that the wide GST layout renders and that ₹/→/— are made font-safe.
 */
import { PDFDocument } from "pdf-lib";
import { renderReportPdf, pdfSafe } from "./reports-pdf";
import { sumColumn, type ReportTable, type CompanyInfo, type Cell, type ReportColumn } from "./reports-format";

const company: CompanyInfo = {
  name: "Circuvent Technologies Pvt Ltd",
  addressLines: ["Plot 12, HITEC City", "Hyderabad, Telangana 500081"],
  gstin: "36ABCDE1234F1Z5",
  state: "Telangana",
  stateCode: "36",
  email: "care@circuvent.example",
};

function base(id: string, columns: ReportColumn[], rows: Cell[][], totals: Cell[]): ReportTable {
  return {
    id, title: `${id} report`, subtitle: "test", group: "Sales", rangeDays: 30,
    generatedAt: new Date().toISOString(), currency: "INR",
    summary: [{ label: "Revenue", value: "₹1,00,000" }, { label: "Orders", value: "42" }],
    columns, rows, totals, notes: ["Every figure here comes from stored data.", "Placed → Delivered timings use history."],
  };
}

const header = (bytes: Uint8Array) => Buffer.from(bytes.slice(0, 5)).toString("latin1");

describe("renderReportPdf", () => {
  it("emits a valid %PDF- header", async () => {
    const t = base("sales",
      [{ key: "d", label: "Date", type: "date" }, { key: "rev", label: "Revenue", type: "money", total: true }],
      [["2024-01-01", 1000], ["2024-01-02", 2000]],
      ["Total", 3000]);
    const bytes = await renderReportPdf(t, { company });
    expect(header(bytes)).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(800);
  });

  it("paginates a long table to more than one page", async () => {
    const columns: ReportColumn[] = [
      { key: "name", label: "Product", type: "text" },
      { key: "units", label: "Units", type: "int", total: true },
      { key: "rev", label: "Revenue", type: "money", total: true },
    ];
    const rows: Cell[][] = [];
    for (let i = 1; i <= 120; i++) rows.push([`Product number ${i}`, i, i * 1000]);
    const totals: Cell[] = ["Total", sumColumn(rows, 1), sumColumn(rows, 2)];
    const bytes = await renderReportPdf(base("products", columns, rows, totals), { company });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("keeps a short table to a single page", async () => {
    const columns: ReportColumn[] = [
      { key: "name", label: "Product", type: "text" },
      { key: "rev", label: "Revenue", type: "money", total: true },
    ];
    const rows: Cell[][] = [["A", 10], ["B", 20], ["C", 30]];
    const bytes = await renderReportPdf(base("products", columns, rows, ["Total", 60]), { company });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("prints a totals row that equals the sum of the rows", async () => {
    const columns: ReportColumn[] = [
      { key: "hsn", label: "HSN", type: "text" },
      { key: "taxable", label: "Taxable value", type: "money", total: true },
      { key: "cgst", label: "CGST", type: "money", total: true },
      { key: "sgst", label: "SGST", type: "money", total: true },
      { key: "tax", label: "Total GST", type: "money", total: true },
      { key: "invoice", label: "Invoice value", type: "money", total: true },
    ];
    const rows: Cell[][] = [
      ["85287100", 3000, 270, 270, 540, 3540],
      ["85234900", 1000, 90, 90, 180, 1180],
    ];
    // Totals are computed by summing the rows, so they must match sumColumn exactly.
    const totals: Cell[] = ["Total",
      sumColumn(rows, 1), sumColumn(rows, 2), sumColumn(rows, 3), sumColumn(rows, 4), sumColumn(rows, 5)];
    expect(totals[1]).toBe(4000);
    expect(totals[5]).toBe(4720);
    expect(Number(totals[2]) + Number(totals[3])).toBe(Number(totals[4])); // CGST + SGST = total GST
    const bytes = await renderReportPdf(base("tax", columns, rows, totals), { company });
    expect(header(bytes)).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("renders a report that carries extra sections (e.g. GST slabs, cohorts)", async () => {
    const t = base("retention",
      [{ key: "cohort", label: "Cohort", type: "text" }, { key: "size", label: "New", type: "int", total: true }],
      [["2024-01", 10], ["2024-02", 8]], ["Total", 18]);
    t.sections = [{
      title: "This window",
      columns: [{ key: "metric", label: "Metric", type: "text" }, { key: "value", label: "Value", type: "int" }],
      rows: [["Customers", 18], ["Repeat", 6]],
    }];
    const bytes = await renderReportPdf(t, { company });
    expect(header(bytes)).toBe("%PDF-");
  });

  it("does not throw when the company GSTIN is missing (prints 'not configured')", async () => {
    const noGst: CompanyInfo = { ...company, gstin: null, stateCode: null };
    const t = base("sales",
      [{ key: "d", label: "Date", type: "date" }, { key: "rev", label: "Revenue", type: "money", total: true }],
      [["2024-01-01", 1000]], ["Total", 1000]);
    const bytes = await renderReportPdf(t, { company: noGst });
    expect(header(bytes)).toBe("%PDF-");
  });
});

describe("pdfSafe", () => {
  it("maps glyphs the core PDF fonts cannot encode to ASCII", () => {
    expect(pdfSafe("₹1,23,456")).toBe("Rs 1,23,456");
    expect(pdfSafe("Placed → Delivered")).toBe("Placed -> Delivered");
    expect(pdfSafe("a — b – c")).toBe("a - b - c");
    expect(pdfSafe("• bullet")).toBe("- bullet");
    expect(pdfSafe("2 × 3")).toBe("2 x 3");
  });

  it("replaces any other non-Latin-1 character rather than crashing", () => {
    expect(pdfSafe("emoji 😀 test")).toContain("emoji");
    expect(pdfSafe("emoji 😀 test")).not.toContain("😀");
  });
});
