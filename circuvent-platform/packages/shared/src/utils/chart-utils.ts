// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Chart Data Generation Utilities
// Bar, line, pie, donut, area, scatter, heatmap, Gantt, KPI,
// sparkline, trend-line, time-series, and color palettes.
// ──────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string;
  borderWidth?: number;
  fill?: boolean;
  tension?: number;
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ScatterPoint {
  x: number;
  y: number;
  label?: string;
}

export interface HeatmapCell {
  row: number;
  col: number;
  value: number;
  rowLabel: string;
  colLabel: string;
}

export interface GanttTask {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  color?: string;
  dependencies?: string[];
}

export interface GanttData {
  tasks: GanttTask[];
  minDate: string;
  maxDate: string;
  totalDays: number;
}

export interface KPIData {
  value: number;
  target: number;
  label: string;
  percentage: number;
  status: "on_track" | "at_risk" | "behind";
  color: string;
}

export interface SparklineData {
  values: number[];
  min: number;
  max: number;
  trend: "up" | "down" | "flat";
  change: number;
  changePercent: number;
}

export interface TrendLineResult {
  slope: number;
  intercept: number;
  rSquared: number;
  predicted: number[];
  direction: "up" | "down" | "flat";
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

// ══════════════════════════════════════════════════════════════
// Color Palettes
// ══════════════════════════════════════════════════════════════

export const COLOR_PALETTES = {
  default: [
    "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
    "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
  ],
  pastel: [
    "#93C5FD", "#6EE7B7", "#FCD34D", "#FCA5A5", "#C4B5FD",
    "#F9A8D4", "#67E8F9", "#BEF264", "#FDBA74", "#A5B4FC",
  ],
  dark: [
    "#1E40AF", "#047857", "#B45309", "#B91C1C", "#6D28D9",
    "#BE185D", "#0E7490", "#4D7C0F", "#C2410C", "#4338CA",
  ],
  monochrome: [
    "#111827", "#1F2937", "#374151", "#4B5563", "#6B7280",
    "#9CA3AF", "#D1D5DB", "#E5E7EB", "#F3F4F6", "#F9FAFB",
  ],
  circuvent: [
    "#2563EB", "#059669", "#D97706", "#DC2626", "#7C3AED",
    "#DB2777", "#0891B2", "#65A30D", "#EA580C", "#4F46E5",
  ],
  warm: [
    "#DC2626", "#EA580C", "#D97706", "#CA8A04", "#EAB308",
    "#F59E0B", "#FB923C", "#F87171", "#FCA5A5", "#FDE68A",
  ],
  cool: [
    "#2563EB", "#0891B2", "#0D9488", "#059669", "#10B981",
    "#3B82F6", "#06B6D4", "#14B8A6", "#34D399", "#6EE7B7",
  ],
} as const;

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function getColors(count: number, palette: keyof typeof COLOR_PALETTES = "default"): string[] {
  const colors = COLOR_PALETTES[palette];
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(colors[i % colors.length]);
  }
  return result;
}

// ══════════════════════════════════════════════════════════════
// Bar Chart
// ══════════════════════════════════════════════════════════════

export function generateBarChartData(
  labels: string[],
  datasets: Array<{ label: string; data: number[] }>,
  options: { palette?: keyof typeof COLOR_PALETTES; stacked?: boolean } = {},
): ChartData {
  const colors = getColors(datasets.length, options.palette);

  return {
    labels,
    datasets: datasets.map((ds, idx) => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: colors[idx],
      borderColor: colors[idx],
      borderWidth: 1,
    })),
  };
}

// ══════════════════════════════════════════════════════════════
// Line Chart
// ══════════════════════════════════════════════════════════════

export function generateLineChartData(
  labels: string[],
  datasets: Array<{ label: string; data: number[] }>,
  options: { palette?: keyof typeof COLOR_PALETTES; smooth?: boolean } = {},
): ChartData {
  const colors = getColors(datasets.length, options.palette);

  return {
    labels,
    datasets: datasets.map((ds, idx) => ({
      label: ds.label,
      data: ds.data,
      borderColor: colors[idx],
      backgroundColor: `${colors[idx]}20`,
      borderWidth: 2,
      fill: false,
      tension: options.smooth ? 0.4 : 0,
    })),
  };
}

// ══════════════════════════════════════════════════════════════
// Pie Chart
// ══════════════════════════════════════════════════════════════

export function generatePieChartData(
  labels: string[],
  values: number[],
  colors?: string[],
): ChartData {
  const bgColors = colors || getColors(labels.length);

  return {
    labels,
    datasets: [{
      label: "Distribution",
      data: values,
      backgroundColor: bgColors,
      borderColor: "#ffffff",
      borderWidth: 2,
    }],
  };
}

// ══════════════════════════════════════════════════════════════
// Donut Chart
// ══════════════════════════════════════════════════════════════

export function generateDonutChartData(
  labels: string[],
  values: number[],
  options: { palette?: keyof typeof COLOR_PALETTES; cutout?: string } = {},
): ChartData & { options: { cutout: string } } {
  const bgColors = getColors(labels.length, options.palette);

  return {
    labels,
    datasets: [{
      label: "Distribution",
      data: values,
      backgroundColor: bgColors,
      borderColor: "#ffffff",
      borderWidth: 2,
    }],
    options: { cutout: options.cutout || "60%" },
  };
}

// ══════════════════════════════════════════════════════════════
// Area Chart
// ══════════════════════════════════════════════════════════════

export function generateAreaChartData(
  labels: string[],
  datasets: Array<{ label: string; data: number[] }>,
  options: { palette?: keyof typeof COLOR_PALETTES } = {},
): ChartData {
  const colors = getColors(datasets.length, options.palette);

  return {
    labels,
    datasets: datasets.map((ds, idx) => ({
      label: ds.label,
      data: ds.data,
      borderColor: colors[idx],
      backgroundColor: `${colors[idx]}30`,
      borderWidth: 2,
      fill: true,
      tension: 0.3,
    })),
  };
}

// ══════════════════════════════════════════════════════════════
// Scatter Plot
// ══════════════════════════════════════════════════════════════

export function generateScatterData(
  points: ScatterPoint[],
  options: { color?: string } = {},
): { data: ScatterPoint[]; color: string; bounds: { minX: number; maxX: number; minY: number; maxY: number } } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);

  return {
    data: points,
    color: options.color || COLOR_PALETTES.default[0],
    bounds: {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    },
  };
}

// ══════════════════════════════════════════════════════════════
// Heatmap
// ══════════════════════════════════════════════════════════════

export function generateHeatmapData(
  rows: string[],
  cols: string[],
  values: number[][],
): { cells: HeatmapCell[]; min: number; max: number; rows: string[]; cols: string[] } {
  const cells: HeatmapCell[] = [];
  let min = Infinity;
  let max = -Infinity;

  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols.length; c++) {
      const value = values[r]?.[c] ?? 0;
      min = Math.min(min, value);
      max = Math.max(max, value);
      cells.push({ row: r, col: c, value, rowLabel: rows[r], colLabel: cols[c] });
    }
  }

  return { cells, min, max, rows, cols };
}

// ══════════════════════════════════════════════════════════════
// Gantt Chart
// ══════════════════════════════════════════════════════════════

export function generateGanttData(
  tasks: Array<{ id: string; name: string; start: string; end: string; progress: number; dependencies?: string[] }>,
): GanttData {
  const colors = getColors(tasks.length, "circuvent");

  const ganttTasks: GanttTask[] = tasks.map((t, idx) => ({
    id: t.id,
    name: t.name,
    start: t.start,
    end: t.end,
    progress: Math.max(0, Math.min(100, t.progress)),
    color: colors[idx],
    dependencies: t.dependencies,
  }));

  const allDates = tasks.flatMap((t) => [new Date(t.start).getTime(), new Date(t.end).getTime()]);
  const minDate = new Date(Math.min(...allDates)).toISOString().split("T")[0];
  const maxDate = new Date(Math.max(...allDates)).toISOString().split("T")[0];
  const totalDays = Math.ceil((new Date(maxDate).getTime() - new Date(minDate).getTime()) / (24 * 60 * 60 * 1000));

  return { tasks: ganttTasks, minDate, maxDate, totalDays };
}

// ══════════════════════════════════════════════════════════════
// KPI / Gauge
// ══════════════════════════════════════════════════════════════

export function generateKPIData(value: number, target: number, label: string): KPIData {
  const percentage = target > 0 ? Math.round((value / target) * 100) : 0;
  let status: KPIData["status"];
  let color: string;

  if (percentage >= 90) {
    status = "on_track";
    color = "#10B981";
  } else if (percentage >= 70) {
    status = "at_risk";
    color = "#F59E0B";
  } else {
    status = "behind";
    color = "#EF4444";
  }

  return { value, target, label, percentage, status, color };
}

// ══════════════════════════════════════════════════════════════
// Sparkline
// ══════════════════════════════════════════════════════════════

export function generateSparkline(values: number[]): SparklineData {
  if (values.length === 0) {
    return { values: [], min: 0, max: 0, trend: "flat", change: 0, changePercent: 0 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const first = values[0];
  const last = values[values.length - 1];
  const change = last - first;
  const changePercent = first !== 0 ? Math.round((change / first) * 10000) / 100 : 0;

  let trend: SparklineData["trend"];
  if (Math.abs(changePercent) < 1) trend = "flat";
  else if (change > 0) trend = "up";
  else trend = "down";

  return { values, min, max, trend, change, changePercent };
}

// ══════════════════════════════════════════════════════════════
// Trend Line (Linear Regression)
// ══════════════════════════════════════════════════════════════

export function calculateTrendLine(data: number[]): TrendLineResult {
  const n = data.length;
  if (n < 2) {
    return { slope: 0, intercept: data[0] || 0, rSquared: 0, predicted: [...data], direction: "flat" };
  }

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += data[i];
    sumXY += i * data[i];
    sumX2 += i * i;
    sumY2 += data[i] * data[i];
  }

  const denominator = n * sumX2 - sumX * sumX;
  const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const meanY = sumY / n;
  let ssRes = 0, ssTot = 0;
  const predicted: number[] = [];

  for (let i = 0; i < n; i++) {
    const pred = slope * i + intercept;
    predicted.push(Math.round(pred * 100) / 100);
    ssRes += (data[i] - pred) ** 2;
    ssTot += (data[i] - meanY) ** 2;
  }

  const rSquared = ssTot !== 0 ? Math.round((1 - ssRes / ssTot) * 1000) / 1000 : 0;

  let direction: TrendLineResult["direction"];
  if (Math.abs(slope) < 0.001) direction = "flat";
  else if (slope > 0) direction = "up";
  else direction = "down";

  return {
    slope: Math.round(slope * 1000) / 1000,
    intercept: Math.round(intercept * 100) / 100,
    rSquared,
    predicted,
    direction,
  };
}

// ══════════════════════════════════════════════════════════════
// Time Series
// ══════════════════════════════════════════════════════════════

export function generateTimeSeriesData(
  startDate: string,
  endDate: string,
  values: number[],
): TimeSeriesPoint[] {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const points = values.length;

  if (points === 0) return [];

  const interval = points > 1 ? (end - start) / (points - 1) : 0;
  const result: TimeSeriesPoint[] = [];

  for (let i = 0; i < points; i++) {
    const date = new Date(start + interval * i);
    result.push({
      date: date.toISOString().split("T")[0],
      value: values[i],
    });
  }

  return result;
}
