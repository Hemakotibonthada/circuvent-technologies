// Circuvent — server-side PDF report generator (pdf-lib).
//
// Replaces the old `window.print()` export, which handed the browser a DOM and
// hoped for the best, with a real, deterministic PDF produced from the report's
// RAW data: a company header, the report title/range/timestamp, a summary
// strip, one or more paginated tables with the column header re-drawn on every
// page, a bold totals row, extra sections (GST rate slabs, cohort grids, the
// P&L statement), provenance notes, and a "Page X of Y" footer on each page.
//
// It is a pure-JS dependency (pdf-lib) with no headless browser, so it runs on
// Vercel's default serverless runtime. Money is rendered through
// formatCell(value, "money", { ascii: true }) → "Rs 1,23,456", because the core
// PDF fonts use WinAnsi encoding and cannot draw the ₹ (U+20B9) glyph; every
// string drawn is additionally run through `pdfSafe` so a stray ₹, →, — or any
// other non-WinAnsi character can never crash the generator mid-document.
//
// SERVER ONLY (returns bytes). Takes a fully-built ReportTable plus the
// company header, so it imports only pdf-lib + the client-safe format model and
// never pulls in the store — which keeps it trivially unit-testable.

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import { drawChart } from "./reports-pdf-charts";
import { reportLogoBytes } from "./report-logo";
import {
  type ReportTable, type ReportColumn, type ReportSection, type Cell,
  type SummaryStat, type CompanyInfo,
  formatCell, columnAlign, isNumericType,
} from "./reports-format";

// ------------------------------------------------------------- constants ----

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 40;

const FS = {
  company: 15,
  title: 16,
  subtitle: 9,
  meta: 8.5,
  summaryLabel: 7,
  summaryValue: 11,
  sectionTitle: 10.5,
  th: 8.5,
  td: 8.5,
  notes: 7.6,
  footer: 8,
};

const INK = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.42, 0.45, 0.5);
const FAINT = rgb(0.6, 0.63, 0.68);
const RULE = rgb(0.82, 0.84, 0.88);
const HEADER_BG = rgb(0.16, 0.19, 0.26);
const HEADER_INK = rgb(1, 1, 1);
const ZEBRA = rgb(0.965, 0.97, 0.98);
const TOTAL_BG = rgb(0.9, 0.93, 0.98);
const ACCENT = rgb(0.15, 0.39, 0.92);
const NEG = rgb(0.75, 0.16, 0.16);

export interface PdfRenderOptions {
  company: CompanyInfo;
  /** Force orientation; by default wide tables auto-switch to landscape. */
  orientation?: "portrait" | "landscape" | "auto";
}

// ---------------------------------------------------------------- helpers ---

/**
 * Makes an arbitrary string safe for the WinAnsi-encoded core fonts.
 *
 * The report data legitimately contains ₹, →, —, • and curly quotes (Indian
 * currency summaries, "Placed → Delivered" SLA labels, note bullets). None of
 * those can be encoded by Helvetica, so rather than let pdf-lib throw we map the
 * known ones to ASCII and replace anything else outside the printable Latin-1
 * range with "?". Money cells are already ASCII via formatCell(ascii), so this
 * is a belt-and-braces final pass.
 */
export function pdfSafe(input: string): string {
  if (!input) return "";
  let s = input
    .replace(/\u20B9/g, "Rs ")
    .replace(/\u2192/g, "->")
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\u00D7/g, "x")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");
  // Anything still above the Latin-1 printable range can't be trusted to encode.
  s = s.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
  return s;
}

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  pageW: number;
  pageH: number;
  pages: PDFPage[];
  page: PDFPage;
  y: number; // distance from the top of the page to the cursor
  title: string;
  company: CompanyInfo;
  /** Embedded once per document. Undefined only if the PNG could not be read. */
  logo?: PDFImage;
}

function newPage(ctx: Ctx): void {
  const page = ctx.doc.addPage([ctx.pageW, ctx.pageH]);
  ctx.pages.push(page);
  ctx.page = page;
  ctx.y = MARGIN;
}

function bottomLimit(ctx: Ctx): number {
  return ctx.pageH - MARGIN - 26; // leave room for the footer band
}

/** Draws left-anchored text using top-origin coordinates. */
function text(ctx: Ctx, s: string, x: number, size: number, font: PDFFont, color: RGB): void {
  ctx.page.drawText(pdfSafe(s), { x, y: ctx.pageH - ctx.y - size, size, font, color });
}

function textAt(ctx: Ctx, s: string, x: number, yTop: number, size: number, font: PDFFont, color: RGB): void {
  ctx.page.drawText(pdfSafe(s), { x, y: ctx.pageH - yTop - size, size, font, color });
}

function widthOf(ctx: Ctx, s: string, size: number, font: PDFFont): number {
  return font.widthOfTextAtSize(pdfSafe(s), size);
}

/** Truncates a string with a trailing ".." so it fits `maxW` at `size`. */
function ellipsize(ctx: Ctx, s: string, size: number, font: PDFFont, maxW: number): string {
  const safe = pdfSafe(s);
  if (font.widthOfTextAtSize(safe, size) <= maxW) return safe;
  let lo = 0, hi = safe.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(safe.slice(0, mid) + "..", size) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return (safe.slice(0, lo).trimEnd() || safe.slice(0, 1)) + "..";
}

/** Wraps text into lines no wider than `maxW`. */
function wrap(ctx: Ctx, s: string, size: number, font: PDFFont, maxW: number): string[] {
  const words = pdfSafe(s).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const trial = line ? line + " " + w : w;
    if (font.widthOfTextAtSize(trial, size) <= maxW || !line) line = trial;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function hrule(ctx: Ctx, yTop: number, color: RGB = RULE, thickness = 0.75): void {
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.pageH - yTop },
    end: { x: ctx.pageW - MARGIN, y: ctx.pageH - yTop },
    thickness,
    color,
  });
}

// ----------------------------------------------------------------- header ---

function drawHeader(ctx: Ctx, table: ReportTable): void {
  const co = ctx.company;
  const rightX = ctx.pageW - MARGIN;

  /*
   * The mark, then the company block indented past it.
   *
   * `ctx.logo` is undefined only if the PNG failed to embed, in which case the
   * text falls back to the left margin rather than leaving a hole where the
   * logo should be — a header with a gap looks broken, where a header without
   * a logo just looks plain.
   */
  const LOGO = 34;
  const textX = ctx.logo ? MARGIN + LOGO + 10 : MARGIN;
  if (ctx.logo) {
    ctx.page.drawImage(ctx.logo, {
      x: MARGIN,
      y: ctx.pageH - ctx.y - LOGO + 2,
      width: LOGO,
      height: LOGO,
    });
  }

  // Company block (left).
  textAt(ctx, co.name, textX, ctx.y, FS.company, ctx.bold, INK);
  let yy = ctx.y + FS.company + 4;
  for (const line of co.addressLines) {
    textAt(ctx, line, textX, yy, FS.meta, ctx.font, MUTED);
    yy += FS.meta + 2;
  }
  const gstLine = co.gstin ? `GSTIN: ${co.gstin}  ·  State: ${co.state}${co.stateCode ? " (" + co.stateCode + ")" : ""}` : "GSTIN: not configured";
  textAt(ctx, gstLine, textX, yy, FS.meta, ctx.font, MUTED);
  yy += FS.meta + 2;
  textAt(ctx, co.email, textX, yy, FS.meta, ctx.font, MUTED);

  // Document label (right).
  const tag = "REPORT";
  textAt(ctx, tag, rightX - widthOf(ctx, tag, FS.meta, ctx.bold), ctx.y, FS.meta, ctx.bold, ACCENT);
  const gen = `Generated ${new Date(table.generatedAt).toLocaleString("en-IN")}`;
  textAt(ctx, gen, rightX - widthOf(ctx, gen, FS.meta, ctx.font), ctx.y + FS.meta + 3, FS.meta, ctx.font, MUTED);
  const rangeLabel = table.snapshot ? "As-at snapshot" : `Range: last ${table.rangeDays} days`;
  textAt(ctx, rangeLabel, rightX - widthOf(ctx, rangeLabel, FS.meta, ctx.font), ctx.y + 2 * (FS.meta + 3), FS.meta, ctx.font, MUTED);

  ctx.y = yy + FS.meta + 8;
  hrule(ctx, ctx.y);
  ctx.y += 12;

  // Report title + subtitle.
  text(ctx, table.title, MARGIN, FS.title, ctx.bold, INK);
  ctx.y += FS.title + 3;
  if (table.subtitle) {
    text(ctx, table.subtitle, MARGIN, FS.subtitle, ctx.font, MUTED);
    ctx.y += FS.subtitle + 4;
  }
  ctx.y += 6;
}

// ---------------------------------------------------------------- summary ---

function drawSummary(ctx: Ctx, summary: SummaryStat[]): void {
  if (!summary.length) return;
  /*
   * Balance the rows rather than filling each one to a fixed width.
   *
   * A fixed four-across left five stats as four cards and one stranded
   * underneath at full width, which reads as an afterthought rather than a
   * figure. Working out the row count first and then dividing the stats
   * between those rows gives 5 across, or 3 and 3 for six, and never a lonely
   * card.
   */
  const maxCols = 5;
  const rows = Math.ceil(summary.length / maxCols);
  const cols = Math.ceil(summary.length / rows);
  const gap = 8;
  const cardW = (ctx.pageW - 2 * MARGIN - gap * (cols - 1)) / cols;
  const cardH = 40;
  for (let r = 0; r < rows; r++) {
    ensureSpace(ctx, cardH + 6, undefined);
    const rowTop = ctx.y;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= summary.length) break;
      const s = summary[idx];
      const x = MARGIN + c * (cardW + gap);
      ctx.page.drawRectangle({
        x, y: ctx.pageH - rowTop - cardH, width: cardW, height: cardH,
        color: rgb(0.97, 0.975, 0.985), borderColor: RULE, borderWidth: 0.5,
      });
      textAt(ctx, s.label.toUpperCase(), x + 8, rowTop + 8, FS.summaryLabel, ctx.bold, MUTED);
      textAt(ctx, ellipsize(ctx, s.value, FS.summaryValue, ctx.bold, cardW - 16), x + 8, rowTop + 19, FS.summaryValue, ctx.bold, INK);
      if (s.hint) textAt(ctx, ellipsize(ctx, s.hint, FS.summaryLabel, ctx.font, cardW - 16), x + 8, rowTop + 31, FS.summaryLabel, ctx.font, FAINT);
    }
    ctx.y = rowTop + cardH + 6;
  }
  ctx.y += 6;
}

// ------------------------------------------------------------------ table ---

interface Layout {
  x: number[];   // left edge of each column
  w: number[];   // width of each column
}

function defaultWeight(col: ReportColumn): number {
  if (col.width && col.width > 0) return col.width;
  switch (col.type) {
    case "text": return 2.4;
    case "date": return 1.3;
    case "money": return 1.35;
    case "number": return 1.05;
    case "int": return 0.9;
    case "percent": return 0.85;
    default: return 1;
  }
}

function computeLayout(ctx: Ctx, columns: ReportColumn[]): Layout {
  const avail = ctx.pageW - 2 * MARGIN;
  const weights = columns.map(defaultWeight);

  /*
   * Never allocate a column less than its own header needs.
   *
   * Widths were shared out purely by column type, so a short type with a long
   * name lost: "New customers" is an `int`, the narrowest weight there is, and
   * its header came out as "New custom..". A truncated header is worse than a
   * truncated value — the value is at least recoverable from context, whereas a
   * clipped heading leaves the whole column unreadable.
   *
   * Columns that need more than their share are pinned to their minimum and the
   * rest is shared among the columns with slack. Repeated because satisfying one
   * column can push another below its own minimum.
   */
  const minW = columns.map((c) => widthOf(ctx, c.label, FS.th, ctx.bold) + 2 * CELL_PAD + 2);
  const w = new Array<number>(columns.length).fill(0);
  const pinned = new Array<boolean>(columns.length).fill(false);

  // If the headers alone cannot fit, pinning would overflow the page. Fall back
  // to pure proportional and let ellipsize do what it can.
  const minTotal = minW.reduce((a, b) => a + b, 0);
  if (minTotal > avail) {
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < columns.length; i++) w[i] = (weights[i] / sum) * avail;
  } else {
    for (let pass = 0; pass < columns.length; pass++) {
      const freeW = avail - minW.reduce((a, m, i) => a + (pinned[i] ? m : 0), 0);
      const freeWeight = weights.reduce((a, wt, i) => a + (pinned[i] ? 0 : wt), 0) || 1;
      let changed = false;
      for (let i = 0; i < columns.length; i++) {
        if (pinned[i]) { w[i] = minW[i]; continue; }
        const share = (weights[i] / freeWeight) * freeW;
        if (share < minW[i]) { pinned[i] = true; w[i] = minW[i]; changed = true; }
        else w[i] = share;
      }
      if (!changed) break;
    }
  }

  const x: number[] = [];
  let cur = MARGIN;
  for (const cw of w) { x.push(cur); cur += cw; }
  return { x, w };
}

const ROW_H = 15;
const CELL_PAD = 5;

function drawTableHeader(ctx: Ctx, columns: ReportColumn[], layout: Layout): void {
  const top = ctx.y;
  ctx.page.drawRectangle({
    x: MARGIN, y: ctx.pageH - top - ROW_H, width: ctx.pageW - 2 * MARGIN, height: ROW_H, color: HEADER_BG,
  });
  columns.forEach((col, i) => {
    const align = columnAlign(col);
    const label = ellipsize(ctx, col.label, FS.th, ctx.bold, layout.w[i] - 2 * CELL_PAD);
    const tw = widthOf(ctx, label, FS.th, ctx.bold);
    let tx = layout.x[i] + CELL_PAD;
    if (align === "right") tx = layout.x[i] + layout.w[i] - CELL_PAD - tw;
    else if (align === "center") tx = layout.x[i] + (layout.w[i] - tw) / 2;
    textAt(ctx, label, tx, top + 4.5, FS.th, ctx.bold, HEADER_INK);
  });
  ctx.y = top + ROW_H;
}

function drawCellText(ctx: Ctx, raw: string, col: ReportColumn, layout: Layout, i: number, yTop: number, color: RGB): void {
  const align = columnAlign(col);
  const s = ellipsize(ctx, raw, FS.td, ctx.font, layout.w[i] - 2 * CELL_PAD);
  const tw = widthOf(ctx, s, FS.td, ctx.font);
  let tx = layout.x[i] + CELL_PAD;
  if (align === "right") tx = layout.x[i] + layout.w[i] - CELL_PAD - tw;
  else if (align === "center") tx = layout.x[i] + (layout.w[i] - tw) / 2;
  textAt(ctx, s, tx, yTop + 4, FS.td, ctx.font, color);
}

function cellDisplay(value: Cell, col: ReportColumn): string {
  if (typeof value === "number") return formatCell(value, col.type, { ascii: true });
  if (value === null || value === undefined) return formatCell(null, col.type, { ascii: true });
  // Pre-formatted string override (e.g. a totals label) — show verbatim.
  return String(value);
}

/**
 * Ensures at least `need` points remain before the footer; if not, starts a new
 * page. When a table is mid-flight, `repeatHeader` re-draws the column header on
 * the fresh page so every page is self-describing.
 */
function ensureSpace(ctx: Ctx, need: number, repeatHeader?: () => void): void {
  if (ctx.y + need <= bottomLimit(ctx)) return;
  newPage(ctx);
  if (repeatHeader) repeatHeader();
}

interface TableStyle {
  zebra?: boolean;
  /** Colour negative money cells red (used by the P&L statement). */
  signedMoney?: boolean;
}

function drawTable(
  ctx: Ctx,
  columns: ReportColumn[],
  rows: Cell[][],
  totals: Cell[] | undefined,
  style: TableStyle = {},
): void {
  const layout = computeLayout(ctx, columns);
  ensureSpace(ctx, ROW_H * 2, undefined);
  drawTableHeader(ctx, columns, layout);
  const repeat = () => drawTableHeader(ctx, columns, layout);

  rows.forEach((row, r) => {
    ensureSpace(ctx, ROW_H, repeat);
    const top = ctx.y;
    if (style.zebra && r % 2 === 1) {
      ctx.page.drawRectangle({ x: MARGIN, y: ctx.pageH - top - ROW_H, width: ctx.pageW - 2 * MARGIN, height: ROW_H, color: ZEBRA });
    }
    columns.forEach((col, i) => {
      const value = row[i] ?? null;
      let color = INK;
      if (style.signedMoney && col.type === "money" && typeof value === "number" && value < 0) color = NEG;
      drawCellText(ctx, cellDisplay(value, col), col, layout, i, top, color);
    });
    ctx.y = top + ROW_H;
  });

  if (totals && totals.some((t) => t !== null && t !== undefined && t !== "")) {
    ensureSpace(ctx, ROW_H + 2, repeat);
    const top = ctx.y;
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.pageH - top - ROW_H, width: ctx.pageW - 2 * MARGIN, height: ROW_H, color: TOTAL_BG });
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.pageH - top }, end: { x: ctx.pageW - MARGIN, y: ctx.pageH - top }, thickness: 1, color: ACCENT });
    columns.forEach((col, i) => {
      const value = totals[i] ?? null;
      if (value === null || value === "") return;
      const display = typeof value === "number" ? formatCell(value, col.type, { ascii: true }) : String(value);
      const align = columnAlign(col);
      const s = ellipsize(ctx, display, FS.td, ctx.bold, layout.w[i] - 2 * CELL_PAD);
      const tw = widthOf(ctx, s, FS.td, ctx.bold);
      let tx = layout.x[i] + CELL_PAD;
      if (align === "right") tx = layout.x[i] + layout.w[i] - CELL_PAD - tw;
      else if (align === "center") tx = layout.x[i] + (layout.w[i] - tw) / 2;
      textAt(ctx, s, tx, top + 4, FS.td, ctx.bold, INK);
    });
    ctx.y = top + ROW_H;
  }
  ctx.y += 12;
}

// --------------------------------------------------------------- sections ---

function drawSection(ctx: Ctx, sec: ReportSection): void {
  if (sec.title) {
    ensureSpace(ctx, 20, undefined);
    text(ctx, sec.title, MARGIN, FS.sectionTitle, ctx.bold, INK);
    ctx.y += FS.sectionTitle + 4;
    if (sec.subtitle) {
      text(ctx, sec.subtitle, MARGIN, FS.subtitle, ctx.font, MUTED);
      ctx.y += FS.subtitle + 4;
    }
  }
  drawTable(ctx, sec.columns, sec.rows, sec.totals, { zebra: true });
}

// ------------------------------------------------------------------ notes ---

function drawNotes(ctx: Ctx, notes: string[]): void {
  if (!notes.length) return;

  const maxW = ctx.pageW - 2 * MARGIN - 12;
  const wrapped = notes.map((n) => wrap(ctx, n, FS.notes, ctx.font, maxW));

  /*
   * Reserve the whole block, not just the heading.
   *
   * This used to reserve 24pt for the title and then break per line, so a
   * report whose notes ran a line past the bottom pushed that single line onto
   * a page of its own — a whole sheet carrying one sentence and a footer. The
   * notes are short by nature, so keeping them together is nearly always
   * possible and always better.
   */
  const blockH =
    FS.sectionTitle + 7 + wrapped.reduce((h, lines) => h + lines.length * (FS.notes + 3) + 2, 0);
  ensureSpace(ctx, Math.min(blockH, bottomLimit(ctx) - MARGIN), undefined);

  ctx.y += 2;
  text(ctx, "Notes", MARGIN, FS.sectionTitle, ctx.bold, INK);
  ctx.y += FS.sectionTitle + 5;
  wrapped.forEach((lines) => {
    lines.forEach((ln, i) => {
      ensureSpace(ctx, FS.notes + 3, undefined);
      if (i === 0) textAt(ctx, "-", MARGIN, ctx.y, FS.notes, ctx.bold, FAINT);
      textAt(ctx, ln, MARGIN + 12, ctx.y, FS.notes, ctx.font, MUTED);
      ctx.y += FS.notes + 3;
    });
    ctx.y += 2;
  });
}

// ----------------------------------------------------------------- footer ---

function drawFooters(ctx: Ctx): void {
  const total = ctx.pages.length;
  ctx.pages.forEach((page, i) => {
    const yLine = MARGIN - 6;
    page.drawLine({
      start: { x: MARGIN, y: yLine + 14 },
      end: { x: ctx.pageW - MARGIN, y: yLine + 14 },
      thickness: 0.5, color: RULE,
    });
    const left = pdfSafe(`${ctx.company.name} · ${ctx.title}`);
    page.drawText(left, { x: MARGIN, y: yLine, size: FS.footer, font: ctx.font, color: FAINT });
    const mid = "Confidential — generated by Circuvent admin";
    const midW = ctx.font.widthOfTextAtSize(mid, FS.footer);
    page.drawText(mid, { x: (ctx.pageW - midW) / 2, y: yLine, size: FS.footer, font: ctx.font, color: FAINT });
    const pg = `Page ${i + 1} of ${total}`;
    const pgW = ctx.bold.widthOfTextAtSize(pg, FS.footer);
    page.drawText(pg, { x: ctx.pageW - MARGIN - pgW, y: yLine, size: FS.footer, font: ctx.bold, color: MUTED });
  });
}

// ------------------------------------------------------------------- main ---

function wantsLandscape(table: ReportTable, orientation: PdfRenderOptions["orientation"]): boolean {
  if (orientation === "landscape") return true;
  if (orientation === "portrait") return false;
  const widest = Math.max(
    table.columns.length,
    ...(table.sections ?? []).map((s) => s.columns.length),
    0,
  );
  return widest >= 7;
}

/**
 * Renders a fully-built ReportTable to PDF bytes.
 *
 * The pipeline is: header → summary strip → main table (paginated, header
 * repeated per page, totals row) → extra sections → notes → per-page footers
 * with "Page X of Y". Footers are drawn last, once the final page count is
 * known, so the "of Y" is always correct.
 */
export async function renderReportPdf(table: ReportTable, opts: PdfRenderOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${table.title} — ${table.subtitle}`);
  doc.setAuthor(opts.company.name);
  doc.setSubject(`${table.group} report`);
  doc.setProducer("Circuvent Reports (pdf-lib)");
  doc.setCreationDate(new Date(table.generatedAt));

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  /*
   * Embedded once, for every page that wants it.
   *
   * Guarded because a report without a logo is still a usable report, and a
   * decoder that rejects the PNG must not take the whole download with it —
   * losing the figures to save the branding would be the wrong way round.
   */
  let logo: PDFImage | undefined;
  try {
    logo = await doc.embedPng(reportLogoBytes());
  } catch {
    logo = undefined;
  }

  const landscape = wantsLandscape(table, opts.orientation);
  const pageW = landscape ? A4_H : A4_W;
  const pageH = landscape ? A4_W : A4_H;

  const ctx: Ctx = {
    doc, font, bold, pageW, pageH, pages: [], page: undefined as unknown as PDFPage,
    y: MARGIN, title: table.title, company: opts.company, logo,
  };
  newPage(ctx);

  drawHeader(ctx, table);
  drawSummary(ctx, table.summary);
  /*
   * The chart goes above the table, where it is the first thing seen.
   *
   * Every report already described one and the PDF drew none of them, so a
   * report that opened with a chart on screen arrived as a wall of numbers
   * when downloaded — which is the version people forward and print.
   */
  drawChartBlock(ctx, table);
  drawTable(ctx, table.columns, table.rows, table.totals, {
    zebra: true,
    signedMoney: table.id === "pnl",
  });
  for (const sec of table.sections ?? []) drawSection(ctx, sec);
  drawNotes(ctx, table.notes);
  drawFooters(ctx);

  return doc.save();
}

/**
 * Draws the report's chart, if it has one and there is room to do it justice.
 *
 * A chart squeezed into the last 30pt of a page is worse than no chart, so it
 * takes a new page rather than being crushed — and it is skipped entirely when
 * the data behind it is empty, because a bare axis reads as "the value is
 * zero" rather than "there is nothing to show".
 */
function drawChartBlock(ctx: Ctx, table: ReportTable): void {
  if (!table.chart || !table.rows.length) return;

  const height = table.chart.kind === "hbar" || table.chart.kind === "donut" ? 170 : 150;
  const needed = height + 34;
  if (ctx.y + needed > bottomLimit(ctx)) newPage(ctx);

  const used = drawChart(
    { page: ctx.page, pageH: ctx.pageH, font: ctx.font, bold: ctx.bold },
    table.chart,
    table.columns,
    table.rows,
    { x: MARGIN, yTop: ctx.y, width: ctx.pageW - MARGIN * 2, height },
  );

  // Zero means the chart declined to draw; do not leave a hole where it was.
  if (used > 0) ctx.y += used + 26;
}

/** Convenience wrapper returning a Node Buffer for HTTP responses. */
export async function renderReportPdfBuffer(table: ReportTable, opts: PdfRenderOptions): Promise<Buffer> {
  const bytes = await renderReportPdf(table, opts);
  return Buffer.from(bytes);
}
