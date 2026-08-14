/**
 * Charts inside the report PDFs.
 *
 * Every report already declared a `chart` — the kind, which column labels the
 * axis, which columns carry the values — and the PDF renderer ignored all of
 * it. The information was computed, described and thrown away, so a report
 * that opened with a chart on screen arrived as a wall of numbers when it was
 * downloaded, which is the version people actually forward and print.
 *
 * Drawn with pdf-lib primitives rather than rasterising a chart library: the
 * output stays vector, so it is sharp at any zoom and when printed, and the
 * whole thing keeps running on the default serverless runtime with no headless
 * browser.
 *
 * Two rules carried over from the on-screen charts:
 *   - Axes start at zero. An axis starting at the minimum turns a small wobble
 *     into a cliff.
 *   - A chart with nothing in it is not drawn at all. A bare axis with no bars
 *     reads as "the value is zero" rather than "there is nothing to show".
 */

import { PDFFont, PDFPage, rgb, type RGB } from "pdf-lib";
import { formatCell, type Cell, type ChartSpec, type ReportColumn } from "./reports-format";

/** Enough hues to separate a stack; beyond that a chart is unreadable anyway. */
export const CHART_COLOURS: RGB[] = [
  rgb(0.15, 0.39, 0.92),
  rgb(0.02, 0.71, 0.83),
  rgb(0.55, 0.36, 0.96),
  rgb(0.96, 0.62, 0.04),
  rgb(0.93, 0.28, 0.6),
  rgb(0.13, 0.77, 0.37),
  rgb(0.99, 0.45, 0.28),
  rgb(0.4, 0.45, 0.55),
];

const AXIS_INK = rgb(0.42, 0.45, 0.5);
const GRID = rgb(0.88, 0.9, 0.93);

export interface ChartCtx {
  page: PDFPage;
  pageH: number;
  font: PDFFont;
  bold: PDFFont;
}

/** Top-origin text, matching the rest of the renderer's coordinate system. */
function label(c: ChartCtx, s: string, x: number, yTop: number, size: number, colour: RGB, font?: PDFFont): void {
  c.page.drawText(s, { x, y: c.pageH - yTop - size, size, font: font ?? c.font, color: colour });
}

function rect(c: ChartCtx, x: number, yTop: number, w: number, h: number, colour: RGB, opacity = 1): void {
  if (h <= 0 || w <= 0) return;
  c.page.drawRectangle({ x, y: c.pageH - yTop - h, width: w, height: h, color: colour, opacity });
}

function line(c: ChartCtx, x1: number, y1: number, x2: number, y2: number, colour: RGB, thickness = 1): void {
  c.page.drawLine({
    start: { x: x1, y: c.pageH - y1 },
    end: { x: x2, y: c.pageH - y2 },
    thickness,
    color: colour,
  });
}

const num = (v: Cell): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * A round number at or above the peak.
 *
 * Without this the top gridline reads 8,437 and the axis looks like a
 * measurement rather than a scale.
 *
 * The ladder is deliberately finer than the usual 1/2/5/10. On that coarse
 * ladder a peak of 25k rounds up to 50k, so the tallest bar reaches halfway
 * and the chart throws away half its height — the shape is what a chart is
 * for, and flattening it to make the axis tidy is the wrong trade.
 */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const ladder = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const step = ladder.find((s) => n <= s + 1e-9) ?? 10;
  return step * mag;
}

/** 12.4k, 1.2M — an axis has no room for the full number. */
function abbr(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return (n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1) + "M";
  if (a >= 1_000) return (n / 1_000).toFixed(a >= 10_000 ? 0 : 1) + "k";
  return String(Math.round(n));
}

function ellipsize(c: ChartCtx, s: string, size: number, maxW: number): string {
  if (c.font.widthOfTextAtSize(s, size) <= maxW) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (c.font.widthOfTextAtSize(s.slice(0, mid) + "..", size) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return (s.slice(0, lo).trimEnd() || s.slice(0, 1)) + "..";
}

interface Prepared {
  labels: string[];
  series: { key: string; label: string; values: number[]; colour: RGB }[];
  currency: boolean;
}

/**
 * Resolve the spec's column keys against the table.
 *
 * A key naming a column that does not exist is dropped rather than plotted as
 * zeros: a flat line labelled with a real column name is a far more convincing
 * lie than a missing series.
 */
function prepare(spec: ChartSpec, columns: ReportColumn[], rows: Cell[][]): Prepared | null {
  const labelIdx = columns.findIndex((c) => c.key === spec.labelKey);
  if (labelIdx < 0 || rows.length === 0) return null;

  const series = spec.valueKeys
    .map((key) => ({ key, idx: columns.findIndex((c) => c.key === key) }))
    .filter((s) => s.idx >= 0)
    .map((s, i) => ({
      key: s.key,
      label: columns[s.idx].label,
      values: rows.map((r) => num(r[s.idx])),
      colour: CHART_COLOURS[i % CHART_COLOURS.length],
    }));

  if (!series.length) return null;
  if (series.every((s) => s.values.every((v) => v === 0))) return null;

  let labels = rows.map((r) => String(formatCell(r[labelIdx], columns[labelIdx].type ?? "text")));

  let out = { labels, series, currency: !!spec.currency };

  // Top-N by the first value column, for kinds where every point needs a label.
  if (spec.limit && spec.limit > 0 && labels.length > spec.limit) {
    const order = labels
      .map((_, i) => i)
      .sort((a, b) => (series[0].values[b] ?? 0) - (series[0].values[a] ?? 0))
      .slice(0, spec.limit);
    labels = order.map((i) => labels[i]);
    out = {
      labels,
      series: series.map((s) => ({ ...s, values: order.map((i) => s.values[i]) })),
      currency: !!spec.currency,
    };
  }

  return out;
}

function drawLegend(c: ChartCtx, prepared: Prepared, x: number, yTop: number, maxW: number): number {
  if (prepared.series.length < 2) return 0;
  const size = 7;
  let cx = x;
  let cy = yTop;
  for (const s of prepared.series) {
    const w = 9 + c.font.widthOfTextAtSize(s.label, size) + 12;
    if (cx + w > x + maxW) {
      cx = x;
      cy += 12;
    }
    rect(c, cx, cy + 1, 6, 6, s.colour);
    label(c, s.label, cx + 9, cy, size, AXIS_INK);
    cx += w;
  }
  return cy - yTop + 12;
}

export interface ChartBox {
  x: number;
  yTop: number;
  width: number;
  height: number;
}

/**
 * Draw the chart described by `spec`. Returns the height consumed, or 0 when
 * there was nothing worth drawing.
 */
export function drawChart(
  c: ChartCtx,
  spec: ChartSpec,
  columns: ReportColumn[],
  rows: Cell[][],
  box: ChartBox,
): number {
  const prepared = prepare(spec, columns, rows);
  if (!prepared) return 0;

  let yTop = box.yTop;
  if (spec.title) {
    label(c, spec.title, box.x, yTop, 9, rgb(0.12, 0.14, 0.18), c.bold);
    yTop += 14;
  }

  const legendH = drawLegend(c, prepared, box.x, yTop, box.width);
  yTop += legendH;

  const plot: ChartBox = { x: box.x, yTop, width: box.width, height: box.height - (yTop - box.yTop) };
  if (plot.height < 40) return 0;

  switch (spec.kind) {
    case "hbar":
      drawHBar(c, prepared, plot);
      break;
    case "donut":
      drawDonut(c, prepared, plot);
      break;
    case "line":
      drawLines(c, prepared, plot, false);
      break;
    case "combo":
      drawCombo(c, prepared, plot);
      break;
    case "stacked":
      drawStacked(c, prepared, plot);
      break;
    case "waterfall":
      drawWaterfall(c, prepared, plot);
      break;
    default:
      drawBars(c, prepared, plot);
  }

  return yTop - box.yTop + plot.height;
}

/* ------------------------------------------------------------------ axes -- */

function drawYAxis(c: ChartCtx, max: number, box: ChartBox, padL: number): void {
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    const y = box.yTop + box.height - (v / max) * box.height;
    line(c, box.x + padL, y, box.x + box.width, y, GRID, 0.5);
    const t = abbr(v);
    label(c, t, box.x + padL - 4 - c.font.widthOfTextAtSize(t, 6.5), y - 3, 6.5, AXIS_INK);
  }
}

/**
 * X labels, thinned to whatever fits.
 *
 * Thirty dates at 6pt is a grey smear; the chart is for the shape, and the
 * table underneath carries every exact value anyway.
 */
function drawXLabels(c: ChartCtx, labels: string[], box: ChartBox, padL: number, slotW: number): void {
  const size = 6;
  const maxLabels = Math.max(2, Math.floor((box.width - padL) / 34));
  const step = Math.ceil(labels.length / maxLabels);
  labels.forEach((l, i) => {
    if (i % step !== 0) return;
    const s = ellipsize(c, l, size, slotW * step - 2);
    const cx = box.x + padL + i * slotW + slotW / 2;
    label(c, s, cx - c.font.widthOfTextAtSize(s, size) / 2, box.yTop + box.height + 4, size, AXIS_INK);
  });
}

/* ------------------------------------------------------------------ bars -- */

function drawBars(c: ChartCtx, p: Prepared, box: ChartBox): void {
  const padL = 30;
  const max = niceMax(Math.max(...p.series.flatMap((s) => s.values), 1));
  drawYAxis(c, max, box, padL);

  const slotW = (box.width - padL) / p.labels.length;
  const groupW = slotW * 0.72;
  const barW = groupW / p.series.length;

  p.labels.forEach((_, i) => {
    p.series.forEach((s, si) => {
      const v = s.values[i] ?? 0;
      const h = (Math.max(0, v) / max) * box.height;
      rect(c, box.x + padL + i * slotW + (slotW - groupW) / 2 + si * barW, box.yTop + box.height - h, barW - 1, h, s.colour);
    });
  });

  drawXLabels(c, p.labels, box, padL, slotW);
}

function drawStacked(c: ChartCtx, p: Prepared, box: ChartBox): void {
  const padL = 30;
  const totals = p.labels.map((_, i) => p.series.reduce((s, ser) => s + Math.max(0, ser.values[i] ?? 0), 0));
  const max = niceMax(Math.max(...totals, 1));
  drawYAxis(c, max, box, padL);

  const slotW = (box.width - padL) / p.labels.length;
  const barW = slotW * 0.62;

  p.labels.forEach((_, i) => {
    let acc = 0;
    p.series.forEach((s) => {
      const v = Math.max(0, s.values[i] ?? 0);
      const h = (v / max) * box.height;
      acc += h;
      rect(c, box.x + padL + i * slotW + (slotW - barW) / 2, box.yTop + box.height - acc, barW, h, s.colour);
    });
  });

  drawXLabels(c, p.labels, box, padL, slotW);
}

/* ----------------------------------------------------------------- lines -- */

function drawLines(c: ChartCtx, p: Prepared, box: ChartBox, skipAxis: boolean, only?: number): void {
  const padL = 30;
  const set = only === undefined ? p.series : [p.series[only]];
  const max = niceMax(Math.max(...set.flatMap((s) => s.values), 1));
  if (!skipAxis) drawYAxis(c, max, box, padL);

  const n = Math.max(1, p.labels.length - 1);
  const stepX = (box.width - padL) / n;

  for (const s of set) {
    for (let i = 1; i < s.values.length; i++) {
      const x1 = box.x + padL + (i - 1) * stepX;
      const x2 = box.x + padL + i * stepX;
      const y1 = box.yTop + box.height - (Math.max(0, s.values[i - 1]) / max) * box.height;
      const y2 = box.yTop + box.height - (Math.max(0, s.values[i]) / max) * box.height;
      line(c, x1, y1, x2, y2, s.colour, 1.4);
    }
  }

  if (!skipAxis) drawXLabels(c, p.labels, box, padL, stepX);
}

/**
 * Bars for the first series, a line for the second.
 *
 * Each gets its own scale, because the pair is nearly always a money figure
 * against a count — revenue against orders — and forcing them onto one axis
 * flattens the smaller of the two into the floor.
 */
function drawCombo(c: ChartCtx, p: Prepared, box: ChartBox): void {
  const padL = 30;
  const bars = p.series[0];
  const lineSeries = p.series[1];

  const barMax = niceMax(Math.max(...bars.values, 1));
  drawYAxis(c, barMax, box, padL);

  const slotW = (box.width - padL) / p.labels.length;
  const barW = slotW * 0.6;
  bars.values.forEach((v, i) => {
    const h = (Math.max(0, v) / barMax) * box.height;
    rect(c, box.x + padL + i * slotW + (slotW - barW) / 2, box.yTop + box.height - h, barW, h, bars.colour, 0.85);
  });

  if (lineSeries) {
    const lineMax = niceMax(Math.max(...lineSeries.values, 1));
    for (let i = 1; i < lineSeries.values.length; i++) {
      const x1 = box.x + padL + (i - 1) * slotW + slotW / 2;
      const x2 = box.x + padL + i * slotW + slotW / 2;
      const y1 = box.yTop + box.height - (Math.max(0, lineSeries.values[i - 1]) / lineMax) * box.height;
      const y2 = box.yTop + box.height - (Math.max(0, lineSeries.values[i]) / lineMax) * box.height;
      line(c, x1, y1, x2, y2, lineSeries.colour, 1.4);
    }
  }

  drawXLabels(c, p.labels, box, padL, slotW);
}

/* ------------------------------------------------------------------ hbar -- */

function drawHBar(c: ChartCtx, p: Prepared, box: ChartBox): void {
  const s = p.series[0];
  const rowsToDraw = Math.min(p.labels.length, Math.floor(box.height / 14));
  if (rowsToDraw < 1) return;

  const max = Math.max(...s.values.slice(0, rowsToDraw), 1);
  const labelW = Math.min(150, box.width * 0.34);
  const barArea = box.width - labelW - 52;
  const rowH = box.height / rowsToDraw;

  for (let i = 0; i < rowsToDraw; i++) {
    const y = box.yTop + i * rowH;
    const v = s.values[i] ?? 0;
    const w = (Math.max(0, v) / max) * barArea;
    label(c, ellipsize(c, p.labels[i], 7, labelW - 6), box.x, y + rowH / 2 - 4, 7, AXIS_INK);
    rect(c, box.x + labelW, y + rowH / 2 - 4, w, 8, s.colour);
    const val = p.currency ? "Rs " + Math.round(v).toLocaleString("en-IN") : abbr(v);
    label(c, val, box.x + labelW + w + 4, y + rowH / 2 - 4, 6.5, AXIS_INK);
  }
}

/* ----------------------------------------------------------------- donut -- */

/**
 * A donut, approximated with wedges.
 *
 * pdf-lib has no arc primitive, so each slice is a fan of thin triangles. At
 * two degrees a step the edge is smooth at any print size and the whole chart
 * is still only a few hundred operations.
 */
function drawDonut(c: ChartCtx, p: Prepared, box: ChartBox): void {
  const s = p.series[0];
  const total = s.values.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return;

  const size = Math.min(box.height, box.width * 0.45);
  const r = size / 2;
  const cx = box.x + r + 6;
  const cy = box.yTop + box.height / 2;
  const inner = r * 0.58;

  let angle = -Math.PI / 2;
  s.values.forEach((v, i) => {
    const frac = Math.max(0, v) / total;
    if (frac <= 0) return;
    const sweep = frac * Math.PI * 2;
    const colour = CHART_COLOURS[i % CHART_COLOURS.length];
    const steps = Math.max(2, Math.ceil((sweep * 180) / Math.PI / 2));
    for (let k = 0; k < steps; k++) {
      const a0 = angle + (sweep * k) / steps;
      const a1 = angle + (sweep * (k + 1)) / steps;
      c.page.drawSvgPath(
        `M ${Math.cos(a0) * inner} ${Math.sin(a0) * inner} L ${Math.cos(a0) * r} ${Math.sin(a0) * r} L ${Math.cos(a1) * r} ${Math.sin(a1) * r} L ${Math.cos(a1) * inner} ${Math.sin(a1) * inner} Z`,
        { x: cx, y: c.pageH - cy, color: colour, borderWidth: 0 },
      );
    }
    angle += sweep;
  });

  // Key to the right, with the share, because a slice without a percentage
  // invites people to estimate one from the angle.
  const keyX = cx + r + 14;
  const keyW = box.x + box.width - keyX;
  const maxRows = Math.min(s.values.length, Math.floor(box.height / 12));
  for (let i = 0; i < maxRows; i++) {
    const y = box.yTop + (box.height - maxRows * 12) / 2 + i * 12;
    rect(c, keyX, y + 1, 6, 6, CHART_COLOURS[i % CHART_COLOURS.length]);
    const pct = ((Math.max(0, s.values[i]) / total) * 100).toFixed(1) + "%";
    const name = ellipsize(c, p.labels[i], 7, keyW - 20 - c.font.widthOfTextAtSize(pct, 7));
    label(c, name, keyX + 10, y, 7, AXIS_INK);
    label(c, pct, box.x + box.width - c.font.widthOfTextAtSize(pct, 7), y, 7, AXIS_INK, c.bold);
  }
}

/* ------------------------------------------------------------- waterfall -- */

/** Running total, with rises and falls coloured differently. */
function drawWaterfall(c: ChartCtx, p: Prepared, box: ChartBox): void {
  const padL = 30;
  const s = p.series[0];

  let run = 0;
  const spans = s.values.map((v) => {
    const from = run;
    run += v;
    return { from, to: run, v };
  });

  const peak = Math.max(...spans.map((x) => Math.max(x.from, x.to)), 1);
  const max = niceMax(peak);
  drawYAxis(c, max, box, padL);

  const slotW = (box.width - padL) / spans.length;
  const barW = slotW * 0.6;
  const up = rgb(0.13, 0.7, 0.36);
  const down = rgb(0.85, 0.28, 0.28);

  spans.forEach((sp, i) => {
    const yTop = box.yTop + box.height - (Math.max(sp.from, sp.to) / max) * box.height;
    const h = (Math.abs(sp.to - sp.from) / max) * box.height;
    rect(c, box.x + padL + i * slotW + (slotW - barW) / 2, yTop, barW, Math.max(h, 0.8), sp.v >= 0 ? up : down);
  });

  drawXLabels(c, p.labels, box, padL, slotW);
}
