// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Chart Utilities Test Suite
// Tests for bar, line, pie, donut, area, scatter, heatmap,
// Gantt, KPI, sparkline, trend line, time series.
// ──────────────────────────────────────────────────────────────

import {
  generateBarChartData,
  generateLineChartData,
  generatePieChartData,
  generateDonutChartData,
  generateAreaChartData,
  generateScatterData,
  generateHeatmapData,
  generateGanttData,
  generateKPIData,
  generateSparkline,
  calculateTrendLine,
  generateTimeSeriesData,
  COLOR_PALETTES,
} from "../utils/chart-utils";

// ══════════════════════════════════════════════════════════════
// Bar Chart
// ══════════════════════════════════════════════════════════════

describe("generateBarChartData", () => {
  it("should generate bar chart with labels and datasets", () => {
    const data = generateBarChartData(
      ["Jan", "Feb", "Mar"],
      [{ label: "Revenue", data: [100, 200, 300] }],
    );

    expect(data.labels).toEqual(["Jan", "Feb", "Mar"]);
    expect(data.datasets).toHaveLength(1);
    expect(data.datasets[0].data).toEqual([100, 200, 300]);
    expect(data.datasets[0].backgroundColor).toBeDefined();
  });

  it("should handle multiple datasets", () => {
    const data = generateBarChartData(
      ["Q1", "Q2"],
      [
        { label: "Revenue", data: [100, 200] },
        { label: "Expenses", data: [80, 150] },
      ],
    );

    expect(data.datasets).toHaveLength(2);
    expect(data.datasets[0].backgroundColor).not.toBe(data.datasets[1].backgroundColor);
  });

  it("should apply custom palette", () => {
    const data = generateBarChartData(["A"], [{ label: "Test", data: [1] }], { palette: "warm" });
    expect(data.datasets[0].backgroundColor).toBe(COLOR_PALETTES.warm[0]);
  });
});

// ══════════════════════════════════════════════════════════════
// Line Chart
// ══════════════════════════════════════════════════════════════

describe("generateLineChartData", () => {
  it("should generate line chart data", () => {
    const data = generateLineChartData(
      ["Mon", "Tue", "Wed"],
      [{ label: "Sales", data: [10, 20, 15] }],
    );

    expect(data.datasets[0].borderWidth).toBe(2);
    expect(data.datasets[0].fill).toBe(false);
    expect(data.datasets[0].tension).toBe(0);
  });

  it("should apply smooth option", () => {
    const data = generateLineChartData(["A"], [{ label: "Test", data: [1] }], { smooth: true });
    expect(data.datasets[0].tension).toBe(0.4);
  });
});

// ══════════════════════════════════════════════════════════════
// Pie Chart
// ══════════════════════════════════════════════════════════════

describe("generatePieChartData", () => {
  it("should generate pie chart data", () => {
    const data = generatePieChartData(["A", "B", "C"], [30, 50, 20]);

    expect(data.labels).toEqual(["A", "B", "C"]);
    expect(data.datasets[0].data).toEqual([30, 50, 20]);
    expect(data.datasets[0].backgroundColor).toHaveLength(3);
  });

  it("should use custom colors when provided", () => {
    const colors = ["#ff0000", "#00ff00", "#0000ff"];
    const data = generatePieChartData(["A", "B", "C"], [1, 2, 3], colors);
    expect(data.datasets[0].backgroundColor).toEqual(colors);
  });
});

// ══════════════════════════════════════════════════════════════
// Donut Chart
// ══════════════════════════════════════════════════════════════

describe("generateDonutChartData", () => {
  it("should generate donut data with default cutout", () => {
    const data = generateDonutChartData(["X", "Y"], [60, 40]);
    expect(data.options.cutout).toBe("60%");
  });

  it("should respect custom cutout", () => {
    const data = generateDonutChartData(["X", "Y"], [60, 40], { cutout: "75%" });
    expect(data.options.cutout).toBe("75%");
  });
});

// ══════════════════════════════════════════════════════════════
// Area Chart
// ══════════════════════════════════════════════════════════════

describe("generateAreaChartData", () => {
  it("should generate area chart with fill enabled", () => {
    const data = generateAreaChartData(["A", "B"], [{ label: "Data", data: [10, 20] }]);
    expect(data.datasets[0].fill).toBe(true);
    expect(data.datasets[0].tension).toBe(0.3);
  });
});

// ══════════════════════════════════════════════════════════════
// Scatter Plot
// ══════════════════════════════════════════════════════════════

describe("generateScatterData", () => {
  it("should compute correct bounds", () => {
    const result = generateScatterData([
      { x: 1, y: 5 },
      { x: 3, y: 2 },
      { x: 7, y: 9 },
    ]);

    expect(result.bounds.minX).toBe(1);
    expect(result.bounds.maxX).toBe(7);
    expect(result.bounds.minY).toBe(2);
    expect(result.bounds.maxY).toBe(9);
    expect(result.data).toHaveLength(3);
  });

  it("should apply custom color", () => {
    const result = generateScatterData([{ x: 0, y: 0 }], { color: "#ff0000" });
    expect(result.color).toBe("#ff0000");
  });
});

// ══════════════════════════════════════════════════════════════
// Heatmap
// ══════════════════════════════════════════════════════════════

describe("generateHeatmapData", () => {
  it("should create correct number of cells", () => {
    const result = generateHeatmapData(
      ["Mon", "Tue"],
      ["9AM", "10AM", "11AM"],
      [[1, 2, 3], [4, 5, 6]],
    );

    expect(result.cells).toHaveLength(6);
    expect(result.min).toBe(1);
    expect(result.max).toBe(6);
  });

  it("should handle missing values as 0", () => {
    const result = generateHeatmapData(["A"], ["B", "C"], [[]]);
    expect(result.cells[0].value).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Gantt Chart
// ══════════════════════════════════════════════════════════════

describe("generateGanttData", () => {
  it("should generate Gantt data with date range", () => {
    const result = generateGanttData([
      { id: "1", name: "Design", start: "2026-03-01", end: "2026-03-10", progress: 100 },
      { id: "2", name: "Development", start: "2026-03-05", end: "2026-03-20", progress: 50 },
    ]);

    expect(result.tasks).toHaveLength(2);
    expect(result.minDate).toBe("2026-03-01");
    expect(result.maxDate).toBe("2026-03-20");
    expect(result.totalDays).toBe(19);
  });

  it("should clamp progress to 0-100", () => {
    const result = generateGanttData([
      { id: "1", name: "Task", start: "2026-01-01", end: "2026-01-02", progress: 150 },
    ]);
    expect(result.tasks[0].progress).toBe(100);
  });

  it("should assign colors from palette", () => {
    const result = generateGanttData([
      { id: "1", name: "T1", start: "2026-01-01", end: "2026-01-02", progress: 0 },
    ]);
    expect(result.tasks[0].color).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════
// KPI / Gauge
// ══════════════════════════════════════════════════════════════

describe("generateKPIData", () => {
  it("should return on_track for >= 90%", () => {
    const kpi = generateKPIData(95, 100, "Sales");
    expect(kpi.status).toBe("on_track");
    expect(kpi.percentage).toBe(95);
    expect(kpi.color).toBe("#10B981");
  });

  it("should return at_risk for 70-89%", () => {
    const kpi = generateKPIData(75, 100, "Revenue");
    expect(kpi.status).toBe("at_risk");
  });

  it("should return behind for < 70%", () => {
    const kpi = generateKPIData(50, 100, "Tickets");
    expect(kpi.status).toBe("behind");
    expect(kpi.color).toBe("#EF4444");
  });

  it("should handle zero target", () => {
    const kpi = generateKPIData(50, 0, "Zero");
    expect(kpi.percentage).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Sparkline
// ══════════════════════════════════════════════════════════════

describe("generateSparkline", () => {
  it("should detect upward trend", () => {
    const result = generateSparkline([10, 20, 30, 40, 50]);
    expect(result.trend).toBe("up");
    expect(result.change).toBe(40);
    expect(result.min).toBe(10);
    expect(result.max).toBe(50);
  });

  it("should detect downward trend", () => {
    const result = generateSparkline([50, 40, 30, 20, 10]);
    expect(result.trend).toBe("down");
    expect(result.change).toBe(-40);
  });

  it("should detect flat trend", () => {
    const result = generateSparkline([100, 100, 101, 100, 100]);
    expect(result.trend).toBe("flat");
  });

  it("should handle empty array", () => {
    const result = generateSparkline([]);
    expect(result.values).toEqual([]);
    expect(result.trend).toBe("flat");
  });
});

// ══════════════════════════════════════════════════════════════
// Trend Line (Linear Regression)
// ══════════════════════════════════════════════════════════════

describe("calculateTrendLine", () => {
  it("should calculate upward trend for increasing data", () => {
    const result = calculateTrendLine([10, 20, 30, 40, 50]);
    expect(result.slope).toBe(10);
    expect(result.direction).toBe("up");
    expect(result.rSquared).toBe(1);
  });

  it("should calculate downward trend", () => {
    const result = calculateTrendLine([50, 40, 30, 20, 10]);
    expect(result.slope).toBe(-10);
    expect(result.direction).toBe("down");
  });

  it("should handle flat data", () => {
    const result = calculateTrendLine([5, 5, 5, 5, 5]);
    expect(result.slope).toBe(0);
    expect(result.direction).toBe("flat");
  });

  it("should generate predicted values", () => {
    const result = calculateTrendLine([10, 20, 30]);
    expect(result.predicted).toHaveLength(3);
  });

  it("should handle single data point", () => {
    const result = calculateTrendLine([42]);
    expect(result.slope).toBe(0);
    expect(result.predicted).toEqual([42]);
  });
});

// ══════════════════════════════════════════════════════════════
// Time Series
// ══════════════════════════════════════════════════════════════

describe("generateTimeSeriesData", () => {
  it("should generate correct number of points", () => {
    const result = generateTimeSeriesData("2026-01-01", "2026-01-10", [1, 2, 3, 4, 5]);
    expect(result).toHaveLength(5);
  });

  it("should have valid date strings", () => {
    const result = generateTimeSeriesData("2026-03-01", "2026-03-31", [10, 20, 30]);
    expect(result[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result[0].value).toBe(10);
  });

  it("should handle empty values", () => {
    const result = generateTimeSeriesData("2026-01-01", "2026-01-31", []);
    expect(result).toHaveLength(0);
  });

  it("should distribute dates evenly", () => {
    const result = generateTimeSeriesData("2026-01-01", "2026-01-31", [1, 2, 3]);
    const d1 = new Date(result[0].date).getTime();
    const d2 = new Date(result[1].date).getTime();
    const d3 = new Date(result[2].date).getTime();
    // Intervals should be approximately equal
    expect(Math.abs((d2 - d1) - (d3 - d2))).toBeLessThan(1000); // Within 1 second
  });
});

// ══════════════════════════════════════════════════════════════
// Color Palettes
// ══════════════════════════════════════════════════════════════

describe("COLOR_PALETTES", () => {
  it("should have all expected palettes", () => {
    expect(COLOR_PALETTES.default).toBeDefined();
    expect(COLOR_PALETTES.pastel).toBeDefined();
    expect(COLOR_PALETTES.dark).toBeDefined();
    expect(COLOR_PALETTES.monochrome).toBeDefined();
    expect(COLOR_PALETTES.circuvent).toBeDefined();
    expect(COLOR_PALETTES.warm).toBeDefined();
    expect(COLOR_PALETTES.cool).toBeDefined();
  });

  it("should have 10 colors per palette", () => {
    for (const palette of Object.values(COLOR_PALETTES)) {
      expect(palette).toHaveLength(10);
    }
  });

  it("should have valid hex color format", () => {
    for (const palette of Object.values(COLOR_PALETTES)) {
      for (const color of palette) {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
});
