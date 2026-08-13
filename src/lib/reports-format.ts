// Report data model + shared, dependency-free formatting.
//
// This module is deliberately isolated from the data layer: it imports nothing
// from `store`, `inventory` or `node:*`, so it is safe to import from BOTH the
// server report engine (reports.ts / reports-pdf.ts) and the client Reports
// panel. That single shared model is what guarantees a figure looks identical
// on screen, in the CSV and in the PDF — they all format the same raw numbers
// through the same functions rather than each rounding in its own way.
//
// Rows always carry RAW values (numbers stay numbers). Formatting is applied
// per column `type` at render time, so totals can be proven equal to the sum of
// the rows they head without fighting locale strings.

export type ColumnType = "text" | "int" | "number" | "money" | "percent" | "date";

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
  /** Explicit alignment; defaults to right for numeric types, left otherwise. */
  align?: "left" | "right" | "center";
  /** Include a summed (or otherwise supplied) total for this column. */
  total?: boolean;
  /** Relative width weight used by the PDF layout engine. */
  width?: number;
  /** Optional per-column footnote surfaced under the table. */
  note?: string;
}

export type Cell = string | number | null;

export interface ReportSection {
  title?: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Cell[][];
  /** Aligned to `columns`; a string is shown verbatim, a number is formatted. */
  totals?: Cell[];
}

export interface SummaryStat {
  label: string;
  /** Pre-formatted display value (already run through a formatter). */
  value: string;
  hint?: string;
  /** Optional signed delta vs the previous comparable window, in percent. */
  deltaPct?: number | null;
}

/**
 * Chart kinds a report may ask for.
 *
 * The first four were the whole vocabulary, which meant every report that
 * wanted something else got a bar chart and a title describing the chart it
 * did not have — the P&L was labelled "P&L waterfall" and rendered as plain
 * bars, so the bridge from revenue to gross profit was invisible.
 */
export type ChartKind =
  | "line"
  | "bar"
  | "hbar"
  | "donut"
  | "waterfall"
  | "combo"
  | "stacked"
  | "heatmap"
  | "funnel"
  | "none";

export interface ChartSpec {
  kind: ChartKind;
  /** Column key whose values label the x-axis / slices / heatmap rows. */
  labelKey: string;
  /**
   * Column keys plotted as series / values.
   *
   * Read differently per kind: one value for bar/hbar/donut/waterfall/funnel,
   * several stacked for `stacked`, all of them as the matrix for `heatmap`,
   * and for `combo` the first is drawn as bars and the second as a line.
   */
  valueKeys: string[];
  currency?: boolean;
  area?: boolean;
  /** Cap the number of points (top-N by first value key) for hbar/donut. */
  limit?: number;
  title?: string;
}

export interface ReportTable {
  id: string;
  title: string;
  subtitle: string;
  group: string;
  rangeDays: number;
  /** True when the figures are a point-in-time snapshot, not windowed. */
  snapshot?: boolean;
  generatedAt: string;
  currency: string;
  summary: SummaryStat[];
  columns: ReportColumn[];
  rows: Cell[][];
  totals: Cell[];
  /** Extra tables rendered after the main one (e.g. GST rate slabs, cohorts). */
  sections?: ReportSection[];
  chart?: ChartSpec;
  /** Provenance / data-availability caveats. Always shown, never fabricated. */
  notes: string[];
}

export interface ReportCatalogEntry {
  id: string;
  label: string;
  desc: string;
  group: string;
}

/** Ordered groups the report rail renders as sections. */
export const REPORT_GROUPS = ["Sales", "Finance", "Marketing", "Operations"] as const;

/**
 * The full report catalogue — static configuration, safe on the client so the
 * Reports panel can render its rail without a network round-trip. The server
 * engine (reports.ts) re-exports this and owns the matching builders.
 */
export const REPORT_CATALOG: ReportCatalogEntry[] = [
  { id: "sales", label: "Sales report", desc: "Daily orders, revenue, AOV and new customers", group: "Sales" },
  { id: "products", label: "Product performance", desc: "Units, orders, revenue and gross margin per product", group: "Sales" },
  { id: "categories", label: "Category report", desc: "Revenue and units by category", group: "Sales" },
  { id: "customers", label: "Customer report", desc: "Top customers by spend in the window", group: "Sales" },
  { id: "pnl", label: "Profit & Loss", desc: "Trading statement to gross profit after returns", group: "Finance" },
  { id: "tax", label: "GST / tax report", desc: "HSN-wise GST with CGST/SGST split", group: "Finance" },
  { id: "payments", label: "Payment reconciliation", desc: "Captured, pending and failed by method", group: "Finance" },
  { id: "refunds", label: "Refunds & returns", desc: "Returns, reasons and refunded value", group: "Finance" },
  { id: "coupons", label: "Coupon report", desc: "Usage and discount given per coupon", group: "Marketing" },
  { id: "discounts", label: "Discount effectiveness", desc: "Coupon vs non-coupon order value", group: "Marketing" },
  { id: "retention", label: "Cohort / retention", desc: "Monthly acquisition cohorts and retention", group: "Marketing" },
  { id: "inventory", label: "Inventory valuation", desc: "Stock value at cost and retail by category", group: "Operations" },
  { id: "reorder", label: "Low-stock / reorder", desc: "Products at or below reorder point", group: "Operations" },
  { id: "fulfilment", label: "Fulfilment SLA", desc: "Order stage timings from status history", group: "Operations" },
];

export const REPORT_IDS: string[] = REPORT_CATALOG.map((r) => r.id);

export function isReportId(x: string): boolean {
  return REPORT_IDS.includes(x);
}

/** Company identity for report/PDF headers (configuration, not a metric). */
export interface CompanyInfo {
  name: string;
  addressLines: string[];
  gstin: string | null;
  state: string;
  stateCode: string | null;
  email: string;
}

// --------------------------------------------------------------- formatting -

/** Groups an integer in the Indian system (…,##,##,###). */
export function indianGroup(n: number): string {
  const sign = n < 0 ? "-" : "";
  const s = Math.abs(Math.round(n)).toString();
  if (s.length <= 3) return sign + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return sign + rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

function fixed(n: number, dp: number): string {
  return (Math.round(n * 10 ** dp) / 10 ** dp).toFixed(dp);
}

export interface FormatOpts {
  /** ASCII-only output for PDF (no ₹ glyph, which core PDF fonts can't encode). */
  ascii?: boolean;
  /** Currency prefix override. */
  currencySymbol?: string;
}

/**
 * Formats one raw cell for display according to its column type.
 *
 * `null`/blank renders as an em dash so an absent figure is visibly absent
 * rather than shown as a real 0 — the difference between "no cost on record"
 * and "cost is zero" is exactly what this report set exists to preserve.
 */
export function formatCell(value: Cell, type: ColumnType, opts: FormatOpts = {}): string {
  if (value === null || value === undefined || value === "") {
    return type === "text" || type === "date" ? "" : "—";
  }
  const rupee = opts.currencySymbol ?? (opts.ascii ? "Rs " : "₹");
  switch (type) {
    case "money": {
      const n = Number(value);
      if (!isFinite(n)) return String(value);
      return (n < 0 ? "-" : "") + rupee + indianGroup(Math.abs(n));
    }
    case "int": {
      const n = Number(value);
      return isFinite(n) ? indianGroup(n) : String(value);
    }
    case "number": {
      const n = Number(value);
      if (!isFinite(n)) return String(value);
      return Number.isInteger(n) ? indianGroup(n) : fixedGroup(n);
    }
    case "percent": {
      const n = Number(value);
      return isFinite(n) ? fixed(n, 1) + "%" : String(value);
    }
    case "date":
    case "text":
    default:
      return String(value);
  }
}

/** Indian-grouped number with up to two decimals (drops trailing zeros). */
function fixedGroup(n: number): string {
  const whole = Math.trunc(Math.abs(n));
  const frac = fixed(Math.abs(n) - whole, 2).slice(2).replace(/0+$/, "");
  const sign = n < 0 ? "-" : "";
  return sign + indianGroup(whole) + (frac ? "." + frac : "");
}

/** True when a column holds numbers (drives default alignment + summing). */
export function isNumericType(type: ColumnType): boolean {
  return type === "int" || type === "number" || type === "money" || type === "percent";
}

export function columnAlign(col: ReportColumn): "left" | "right" | "center" {
  return col.align ?? (isNumericType(col.type) ? "right" : "left");
}

// ------------------------------------------------------------------- CSV ----

function csvEsc(v: Cell): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialises one section (raw numeric values, ideal for spreadsheets). */
function sectionCsv(columns: ReportColumn[], rows: Cell[][], totals?: Cell[]): string {
  const lines: string[] = [];
  lines.push(columns.map((c) => csvEsc(c.label)).join(","));
  for (const r of rows) lines.push(r.map((c) => csvEsc(c)).join(","));
  if (totals && totals.some((t) => t !== null && t !== undefined && t !== "")) {
    lines.push(totals.map((c) => csvEsc(c)).join(","));
  }
  return lines.join("\r\n");
}

/**
 * Serialises a whole report to CSV: a title banner, the summary strip, the main
 * table with its totals row, then any extra sections — each separated by a
 * blank line so a spreadsheet import keeps them apart.
 */
export function reportToCsv(table: ReportTable): string {
  const blocks: string[] = [];
  blocks.push(`${table.title} — ${table.subtitle}`);
  blocks.push(`Generated,${new Date(table.generatedAt).toISOString()}`);
  if (table.summary.length) {
    blocks.push("");
    blocks.push("Summary");
    blocks.push(table.summary.map((s) => csvEsc(s.label)).join(","));
    blocks.push(table.summary.map((s) => csvEsc(s.value)).join(","));
  }
  blocks.push("");
  blocks.push(sectionCsv(table.columns, table.rows, table.totals));
  for (const sec of table.sections ?? []) {
    blocks.push("");
    if (sec.title) blocks.push(sec.title);
    blocks.push(sectionCsv(sec.columns, sec.rows, sec.totals));
  }
  if (table.notes.length) {
    blocks.push("");
    blocks.push("Notes");
    for (const n of table.notes) blocks.push(csvEsc(n));
  }
  return blocks.join("\r\n");
}

/** Sums a numeric column across rows, ignoring null/blank cells. */
export function sumColumn(rows: Cell[][], index: number): number {
  let s = 0;
  for (const r of rows) {
    const v = r[index];
    if (typeof v === "number" && isFinite(v)) s += v;
  }
  return s;
}

// ------------------------------------------------------------------ HTML ----

function htmlEsc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlSection(columns: ReportColumn[], rows: Cell[][], totals: Cell[] | undefined): string {
  const th = columns
    .map((c) => `<th style="text-align:${columnAlign(c)};padding:6px 8px;border-bottom:2px solid #cbd5e1;font-size:12px;color:#475569;">${htmlEsc(c.label)}</th>`)
    .join("");
  const body = rows
    .map((r, ri) => {
      const bg = ri % 2 ? "#f8fafc" : "#ffffff";
      const tds = columns
        .map((c, ci) => {
          const v = r[ci] ?? null;
          const disp = typeof v === "number" ? htmlEsc(formatCell(v, c.type)) : v === null ? formatCell(null, c.type) : htmlEsc(String(v));
          return `<td style="text-align:${columnAlign(c)};padding:5px 8px;border-bottom:1px solid #eef2f7;font-size:12px;color:#0f172a;">${disp}</td>`;
        })
        .join("");
      return `<tr style="background:${bg};">${tds}</tr>`;
    })
    .join("");
  let totalRow = "";
  if (totals && totals.some((t) => t !== null && t !== undefined && t !== "")) {
    const tds = columns
      .map((c, ci) => {
        const v = totals[ci] ?? null;
        const disp = v === null || v === "" ? "" : typeof v === "number" ? formatCell(v, c.type) : String(v);
        return `<td style="text-align:${columnAlign(c)};padding:6px 8px;border-top:2px solid #2563eb;font-size:12px;font-weight:700;color:#0f172a;">${htmlEsc(disp)}</td>`;
      })
      .join("");
    totalRow = `<tr style="background:#eff6ff;">${tds}</tr>`;
  }
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0 4px;"><thead><tr>${th}</tr></thead><tbody>${body}${totalRow}</tbody></table>`;
}

/**
 * Renders a report to a self-contained HTML fragment for emails/preview.
 *
 * Uses the same `formatCell` as the UI and PDF, so an emailed figure matches
 * exactly what is on screen. Inline styles only, for email-client safety.
 */
export function reportToHtml(table: ReportTable, company?: { name: string }): string {
  const chips = table.summary
    .map(
      (s) =>
        `<div style="display:inline-block;min-width:120px;margin:0 10px 10px 0;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
          <div style="font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:#64748b;">${htmlEsc(s.label)}</div>
          <div style="font-size:17px;font-weight:700;color:#0f172a;margin-top:2px;">${htmlEsc(s.value)}</div>
          ${s.hint ? `<div style="font-size:10px;color:#94a3b8;margin-top:1px;">${htmlEsc(s.hint)}</div>` : ""}
        </div>`,
    )
    .join("");
  const sections = (table.sections ?? [])
    .map(
      (sec) =>
        `${sec.title ? `<h3 style="font-size:14px;color:#0f172a;margin:16px 0 2px;">${htmlEsc(sec.title)}</h3>` : ""}
         ${sec.subtitle ? `<div style="font-size:12px;color:#64748b;margin-bottom:2px;">${htmlEsc(sec.subtitle)}</div>` : ""}
         ${htmlSection(sec.columns, sec.rows, sec.totals)}`,
    )
    .join("");
  const notes = table.notes.length
    ? `<div style="margin-top:14px;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
        <div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.04em;">Notes</div>
        <ul style="margin:6px 0 0;padding-left:18px;color:#78350f;font-size:11px;">${table.notes.map((n) => `<li style="margin:2px 0;">${htmlEsc(n)}</li>`).join("")}</ul>
      </div>`
    : "";
  const rangeLabel = table.snapshot ? "As-at snapshot" : `Last ${table.rangeDays} days`;
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:760px;margin:0 auto;color:#0f172a;">
    ${company?.name ? `<div style="font-size:13px;font-weight:700;color:#1e293b;">${htmlEsc(company.name)}</div>` : ""}
    <h2 style="font-size:20px;margin:2px 0 0;">${htmlEsc(table.title)}</h2>
    <div style="font-size:12px;color:#64748b;margin:2px 0 12px;">${htmlEsc(table.subtitle)} · ${htmlEsc(rangeLabel)} · Generated ${htmlEsc(new Date(table.generatedAt).toLocaleString("en-IN"))}</div>
    <div>${chips}</div>
    ${htmlSection(table.columns, table.rows, table.totals)}
    ${sections}
    ${notes}
  </div>`;
}
