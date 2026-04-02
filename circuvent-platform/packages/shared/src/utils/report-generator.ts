// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Report Generator Utilities
// HTML reports, tables, charts (Chart.js + inline SVG),
// PDF metadata, summary stats, formatting helpers.
// ──────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface ReportSection {
  title: string;
  type: "text" | "table" | "chart" | "html";
  content: string;
}

interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string;
  borderColor?: string;
}

interface PDFMetadata {
  title: string;
  author: string;
  subject: string;
  creator: string;
  producer: string;
  createdAt: string;
  keywords: string[];
}

interface SummaryStats {
  count: number;
  min: number;
  max: number;
  sum: number;
  avg: number;
  median: number;
  stddev: number;
  variance: number;
}

interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

// ══════════════════════════════════════════════════════════════
// HTML Report Generation
// ══════════════════════════════════════════════════════════════

export function generateHTMLReport(title: string, sections: ReportSection[]): string {
  const sectionHTML = sections.map((section) => {
    const sectionTitle = `<h2 style="color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin-top:24px;">${escapeHTML(section.title)}</h2>`;

    switch (section.type) {
      case "text":
        return `${sectionTitle}<p style="color:#475569;line-height:1.6;">${escapeHTML(section.content)}</p>`;
      case "table":
        return `${sectionTitle}${section.content}`;
      case "chart":
        return `${sectionTitle}<div style="text-align:center;padding:16px;">${section.content}</div>`;
      case "html":
        return `${sectionTitle}${section.content}`;
      default:
        return `${sectionTitle}<p>${escapeHTML(section.content)}</p>`;
    }
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 32px; background: #f8fafc; color: #1e293b; }
    h1 { color: #0f172a; font-size: 24px; margin-bottom: 8px; }
    h2 { font-size: 18px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th { background: #1e293b; color: white; padding: 10px 12px; text-align: left; font-size: 13px; }
    td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    tr:nth-child(even) { background: #f1f5f9; }
    .header { border-bottom: 3px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHTML(title)}</h1>
    <p style="color:#64748b;font-size:13px;">Generated on ${new Date().toLocaleString()}</p>
  </div>
  ${sectionHTML}
  <div class="footer">
    <p>Circuvent Technologies — Confidential Report</p>
  </div>
</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════
// HTML Table
// ══════════════════════════════════════════════════════════════

export function generateTableHTML(headers: string[], rows: string[][]): string {
  const headerCells = headers.map((h) => `<th>${escapeHTML(h)}</th>`).join("");
  const bodyRows = rows.map((row) => {
    const cells = row.map((cell) => `<td>${escapeHTML(cell)}</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("\n");

  return `<table>
  <thead><tr>${headerCells}</tr></thead>
  <tbody>${bodyRows}</tbody>
</table>`;
}

// ══════════════════════════════════════════════════════════════
// Chart.js Compatible JSON Data
// ══════════════════════════════════════════════════════════════

const DEFAULT_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

export function generateChartDataJSON(
  labels: string[],
  datasets: ChartDataset[],
): {
  type: string;
  data: { labels: string[]; datasets: Array<{ label: string; data: number[]; backgroundColor: string; borderColor: string }> };
} {
  return {
    type: "bar",
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: ds.backgroundColor ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        borderColor: ds.borderColor ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      })),
    },
  };
}

// ══════════════════════════════════════════════════════════════
// PDF Metadata
// ══════════════════════════════════════════════════════════════

export function generatePDFMetadata(title: string, author: string): PDFMetadata {
  return {
    title,
    author,
    subject: `${title} — Generated Report`,
    creator: "Circuvent Platform Report Engine",
    producer: "Circuvent Technologies",
    createdAt: new Date().toISOString(),
    keywords: ["report", "circuvent", title.toLowerCase().replace(/\s+/g, "-")],
  };
}

// ══════════════════════════════════════════════════════════════
// Report Header
// ══════════════════════════════════════════════════════════════

export function formatReportHeader(
  title: string,
  period: { start: string; end: string },
  generatedAt?: Date,
): string {
  const genDate = generatedAt ?? new Date();
  return [
    `═══════════════════════════════════════`,
    `  ${title}`,
    `  Period: ${period.start} — ${period.end}`,
    `  Generated: ${genDate.toLocaleString()}`,
    `  Circuvent Technologies`,
    `═══════════════════════════════════════`,
  ].join("\n");
}

// ══════════════════════════════════════════════════════════════
// Calculations
// ══════════════════════════════════════════════════════════════

export function calculatePercentage(value: number, total: number, decimals: number = 2): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100 * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export function calculateGrowthRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 100 * 100) / 100;
}

// ══════════════════════════════════════════════════════════════
// Summary Statistics
// ══════════════════════════════════════════════════════════════

export function generateSummaryStats(numbers: number[]): SummaryStats {
  if (numbers.length === 0) {
    return { count: 0, min: 0, max: 0, sum: 0, avg: 0, median: 0, stddev: 0, variance: 0 };
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / count;

  // Median
  let median: number;
  if (count % 2 === 0) {
    median = (sorted[count / 2 - 1] + sorted[count / 2]) / 2;
  } else {
    median = sorted[Math.floor(count / 2)];
  }

  // Variance & Standard deviation
  const variance = sorted.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / count;
  const stddev = Math.sqrt(variance);

  return {
    count,
    min: sorted[0],
    max: sorted[count - 1],
    sum: Math.round(sum * 100) / 100,
    avg: Math.round(avg * 100) / 100,
    median: Math.round(median * 100) / 100,
    stddev: Math.round(stddev * 100) / 100,
    variance: Math.round(variance * 100) / 100,
  };
}

// ══════════════════════════════════════════════════════════════
// Inline SVG Bar Chart
// ══════════════════════════════════════════════════════════════

export function generateBarChartHTML(
  data: ChartDataPoint[],
  options?: { width?: number; height?: number; title?: string },
): string {
  const width = options?.width ?? 600;
  const height = options?.height ?? 300;
  const padding = { top: 40, right: 20, bottom: 60, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  if (data.length === 0) {
    return `<svg width="${width}" height="${height}"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#94a3b8">No data</text></svg>`;
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.min(chartWidth / data.length - 8, 50);
  const barSpacing = (chartWidth - barWidth * data.length) / (data.length + 1);

  const bars = data.map((d, i) => {
    const x = padding.left + barSpacing * (i + 1) + barWidth * i;
    const barHeight = (d.value / maxVal) * chartHeight;
    const y = padding.top + chartHeight - barHeight;
    const color = d.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length];

    return [
      `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" rx="3"/>`,
      `<text x="${x + barWidth / 2}" y="${y - 5}" text-anchor="middle" fill="#475569" font-size="11">${d.value}</text>`,
      `<text x="${x + barWidth / 2}" y="${height - padding.bottom + 15}" text-anchor="middle" fill="#64748b" font-size="10" transform="rotate(-30 ${x + barWidth / 2} ${height - padding.bottom + 15})">${escapeHTML(d.label.slice(0, 12))}</text>`,
    ].join("\n");
  }).join("\n");

  // Y-axis gridlines
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((pct) => {
    const y = padding.top + chartHeight * (1 - pct);
    const val = Math.round(maxVal * pct);
    return [
      `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="4"/>`,
      `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" fill="#94a3b8" font-size="10">${val}</text>`,
    ].join("\n");
  }).join("\n");

  const titleSvg = options?.title
    ? `<text x="${width / 2}" y="20" text-anchor="middle" fill="#1e293b" font-size="14" font-weight="600">${escapeHTML(options.title)}</text>`
    : "";

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="white" rx="8"/>
  ${titleSvg}
  ${gridLines}
  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartHeight}" stroke="#cbd5e1"/>
  <line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${width - padding.right}" y2="${padding.top + chartHeight}" stroke="#cbd5e1"/>
  ${bars}
</svg>`;
}

// ══════════════════════════════════════════════════════════════
// Inline SVG Pie Chart
// ══════════════════════════════════════════════════════════════

export function generatePieChartHTML(
  data: ChartDataPoint[],
  options?: { width?: number; height?: number; title?: string },
): string {
  const width = options?.width ?? 400;
  const height = options?.height ?? 400;
  const cx = width / 2;
  const cy = height / 2 + 10;
  const radius = Math.min(cx, cy) - 60;

  if (data.length === 0) {
    return `<svg width="${width}" height="${height}"><text x="${cx}" y="${cy}" text-anchor="middle" fill="#94a3b8">No data</text></svg>`;
  }

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return `<svg width="${width}" height="${height}"><text x="${cx}" y="${cy}" text-anchor="middle" fill="#94a3b8">No data</text></svg>`;
  }

  let startAngle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const sliceAngle = (d.value / total) * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;

    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);

    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    const color = d.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length];

    // Label position
    const midAngle = startAngle + sliceAngle / 2;
    const labelRadius = radius * 0.65;
    const lx = cx + labelRadius * Math.cos(midAngle);
    const ly = cy + labelRadius * Math.sin(midAngle);
    const pct = Math.round((d.value / total) * 100);

    const path = `<path d="M${cx},${cy} L${x1},${y1} A${radius},${radius} 0 ${largeArc},1 ${x2},${y2} Z" fill="${color}" stroke="white" stroke-width="2"/>`;
    const label = pct >= 5
      ? `<text x="${lx}" y="${ly}" text-anchor="middle" fill="white" font-size="11" font-weight="600">${pct}%</text>`
      : "";

    startAngle = endAngle;
    return path + label;
  }).join("\n");

  // Legend
  const legend = data.map((d, i) => {
    const color = d.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    const y = height - 30;
    const x = 10 + i * (width / data.length);
    return [
      `<rect x="${x}" y="${y}" width="10" height="10" fill="${color}" rx="2"/>`,
      `<text x="${x + 14}" y="${y + 9}" fill="#475569" font-size="10">${escapeHTML(d.label.slice(0, 10))}</text>`,
    ].join("\n");
  }).join("\n");

  const titleSvg = options?.title
    ? `<text x="${cx}" y="20" text-anchor="middle" fill="#1e293b" font-size="14" font-weight="600">${escapeHTML(options.title)}</text>`
    : "";

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="white" rx="8"/>
  ${titleSvg}
  ${slices}
  ${legend}
</svg>`;
}

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
