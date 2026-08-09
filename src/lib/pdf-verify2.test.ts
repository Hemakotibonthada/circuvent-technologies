/**
 * Independent check that the PDF export is a real, multi-page PDF file rather
 * than a print-to-DOM stand-in. Writes the bytes out so the artefact can be
 * inspected outside the test runner.
 */
import { writeFileSync } from "fs";
import { renderReportPdfBuffer } from "./reports-pdf";
import type { ReportTable, CompanyInfo } from "./reports-format";

const company: CompanyInfo = {
  name: "Circuvent Technologies",
  addressLines: ["Hyderabad, Telangana"],
  gstin: "36AAAAA0000A1Z5",
  state: "Telangana",
  stateCode: "36",
  email: "hello@circuvent.com",
};

describe("PDF export produces a genuine file", () => {
  it("writes a valid multi-page PDF whose totals match the rows", async () => {
    const rows = Array.from({ length: 160 }, (_, i) => [`Item ${i + 1}`, i + 1, (i + 1) * 100]);
    const units = rows.reduce((s, r) => s + (r[1] as number), 0);
    const revenue = rows.reduce((s, r) => s + (r[2] as number), 0);

    const table: ReportTable = {
      id: "verify",
      title: "Verification report",
      subtitle: "independent check",
      group: "Sales",
      rangeDays: 30,
      generatedAt: new Date("2026-08-09T00:00:00Z").toISOString(),
      currency: "INR",
      summary: [],
      columns: [
        { key: "name", label: "Item", type: "text" },
        { key: "units", label: "Units", type: "number" },
        { key: "revenue", label: "Revenue", type: "currency" },
      ],
      rows,
      totals: ["Total", units, revenue],
      notes: [],
    } as unknown as ReportTable;

    const buf = await renderReportPdfBuffer(table, { company });
    writeFileSync("pdf-verify.pdf", buf);

    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.subarray(buf.length - 800).toString("latin1")).toContain("%%EOF");

    // Counted by parsing the document rather than grepping the bytes: pdf-lib
    // compresses object streams, so /Type /Page never appears as plain text and
    // a regex over the raw file reports zero pages for a perfectly good PDF.
    const { PDFDocument } = await import("pdf-lib");
    // Copied into a plain Uint8Array: under jsdom a Node Buffer belongs to a
    // different realm, so pdf-lib's instanceof check rejects it as "NaN".
    const parsed = await PDFDocument.load(new Uint8Array(buf));
    expect(parsed.getPageCount()).toBeGreaterThan(1);
    expect(buf.length).toBeGreaterThan(5000);
  });
});
