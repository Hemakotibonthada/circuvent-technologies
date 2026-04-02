// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Metrics Collector
// Singleton metrics collection: counters, histograms, gauges,
// timers, Prometheus format, Express middleware, percentiles.
// ──────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface MetricLabels {
  [key: string]: string;
}

interface CounterMetric {
  type: "counter";
  name: string;
  value: number;
  labels: MetricLabels;
}

interface HistogramMetric {
  type: "histogram";
  name: string;
  values: number[];
  labels: MetricLabels;
}

interface GaugeMetric {
  type: "gauge";
  name: string;
  value: number;
  labels: MetricLabels;
}

type Metric = CounterMetric | HistogramMetric | GaugeMetric;

interface APICallRecord {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  timestamp: number;
}

interface APIStats {
  totalRequests: number;
  avgDurationMs: number;
  errorRate: number;
  requestsPerMinute: number;
  topEndpoints: Array<{ path: string; count: number; avgMs: number }>;
  statusDistribution: Record<string, number>;
}

// ══════════════════════════════════════════════════════════════
// Label Key Generation
// ══════════════════════════════════════════════════════════════

function labelKey(name: string, labels: MetricLabels): string {
  const sorted = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  const labelStr = sorted.map(([k, v]) => `${k}="${v}"`).join(",");
  return labelStr ? `${name}{${labelStr}}` : name;
}

// ══════════════════════════════════════════════════════════════
// MetricsCollector — Singleton
// ══════════════════════════════════════════════════════════════

export class MetricsCollector {
  private static instance: MetricsCollector | null = null;

  private counters = new Map<string, CounterMetric>();
  private histograms = new Map<string, HistogramMetric>();
  private gauges = new Map<string, GaugeMetric>();
  private apiCalls: APICallRecord[] = [];
  private startedAt: number = Date.now();

  private constructor() {}

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  // ── Counters ────────────────────────────────────────────

  incrementCounter(name: string, labels: MetricLabels = {}, increment: number = 1): void {
    const key = labelKey(name, labels);
    const existing = this.counters.get(key);

    if (existing) {
      existing.value += increment;
    } else {
      this.counters.set(key, { type: "counter", name, value: increment, labels });
    }
  }

  // ── Histograms ──────────────────────────────────────────

  recordHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    const key = labelKey(name, labels);
    const existing = this.histograms.get(key);

    if (existing) {
      existing.values.push(value);
    } else {
      this.histograms.set(key, { type: "histogram", name, values: [value], labels });
    }
  }

  // ── Gauges ──────────────────────────────────────────────

  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    const key = labelKey(name, labels);
    this.gauges.set(key, { type: "gauge", name, value, labels });
  }

  // ── Timers ──────────────────────────────────────────────

  recordTimer(name: string, durationMs: number, labels: MetricLabels = {}): void {
    this.recordHistogram(name, durationMs, labels);
  }

  // ── Retrieve Metrics ────────────────────────────────────

  getMetrics(): Metric[] {
    return [
      ...Array.from(this.counters.values()),
      ...Array.from(this.histograms.values()),
      ...Array.from(this.gauges.values()),
    ];
  }

  getMetricsByName(name: string): Metric[] {
    return this.getMetrics().filter((m) => m.name === name);
  }

  // ── Reset ───────────────────────────────────────────────

  resetMetrics(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
    this.apiCalls = [];
    this.startedAt = Date.now();
  }

  // ── Prometheus Text Format ──────────────────────────────

  toPrometheusFormat(): string {
    const lines: string[] = [];

    // Counters
    const counterNames = new Set(Array.from(this.counters.values()).map((c) => c.name));
    for (const name of counterNames) {
      lines.push(`# HELP ${name} Counter metric`);
      lines.push(`# TYPE ${name} counter`);
      for (const [key, metric] of this.counters) {
        if (metric.name === name) {
          lines.push(`${key} ${metric.value}`);
        }
      }
    }

    // Histograms
    const histNames = new Set(Array.from(this.histograms.values()).map((h) => h.name));
    for (const name of histNames) {
      lines.push(`# HELP ${name} Histogram metric`);
      lines.push(`# TYPE ${name} histogram`);
      for (const [key, metric] of this.histograms) {
        if (metric.name !== name) continue;
        const sorted = [...metric.values].sort((a, b) => a - b);
        const count = sorted.length;
        const sum = sorted.reduce((a, b) => a + b, 0);

        // Buckets
        const buckets = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
        for (const bucket of buckets) {
          const le = sorted.filter((v) => v <= bucket).length;
          lines.push(`${name}_bucket{le="${bucket}"} ${le}`);
        }
        lines.push(`${name}_bucket{le="+Inf"} ${count}`);
        lines.push(`${name}_sum ${sum}`);
        lines.push(`${name}_count ${count}`);
      }
    }

    // Gauges
    const gaugeNames = new Set(Array.from(this.gauges.values()).map((g) => g.name));
    for (const name of gaugeNames) {
      lines.push(`# HELP ${name} Gauge metric`);
      lines.push(`# TYPE ${name} gauge`);
      for (const [key, metric] of this.gauges) {
        if (metric.name === name) {
          lines.push(`${key} ${metric.value}`);
        }
      }
    }

    return lines.join("\n");
  }

  // ── Express Middleware ──────────────────────────────────

  middleware() {
    return (req: any, res: any, next: any) => {
      const start = Date.now();

      res.on("finish", () => {
        const duration = Date.now() - start;
        const method = req.method;
        const path = req.route?.path ?? req.path ?? "unknown";
        const statusCode = res.statusCode;

        this.recordAPICall(method, path, statusCode, duration);
      });

      next();
    };
  }

  // ── Record API Call ─────────────────────────────────────

  recordAPICall(method: string, path: string, statusCode: number, duration: number): void {
    this.apiCalls.push({ method, path, statusCode, duration, timestamp: Date.now() });

    // Increment request counter
    this.incrementCounter("http_requests_total", { method, path, status: String(statusCode) });

    // Record response time histogram
    this.recordHistogram("http_request_duration_ms", duration, { method, path });

    // Track errors
    if (statusCode >= 400) {
      this.incrementCounter("http_errors_total", { method, path, status: String(statusCode) });
    }

    // Trim old records (keep last 10,000)
    if (this.apiCalls.length > 10000) {
      this.apiCalls = this.apiCalls.slice(-5000);
    }
  }

  // ── API Stats ───────────────────────────────────────────

  getAPIStats(): APIStats {
    if (this.apiCalls.length === 0) {
      return {
        totalRequests: 0,
        avgDurationMs: 0,
        errorRate: 0,
        requestsPerMinute: 0,
        topEndpoints: [],
        statusDistribution: {},
      };
    }

    const total = this.apiCalls.length;
    const totalDuration = this.apiCalls.reduce((s, c) => s + c.duration, 0);
    const errors = this.apiCalls.filter((c) => c.statusCode >= 400).length;

    // Requests per minute
    const elapsedMs = Date.now() - this.startedAt;
    const elapsedMin = Math.max(1, elapsedMs / 60000);
    const rpm = Math.round((total / elapsedMin) * 100) / 100;

    // Top endpoints
    const pathMap = new Map<string, { count: number; totalMs: number }>();
    for (const call of this.apiCalls) {
      const key = `${call.method} ${call.path}`;
      const entry = pathMap.get(key) ?? { count: 0, totalMs: 0 };
      entry.count++;
      entry.totalMs += call.duration;
      pathMap.set(key, entry);
    }

    const topEndpoints = Array.from(pathMap.entries())
      .map(([path, data]) => ({
        path,
        count: data.count,
        avgMs: Math.round(data.totalMs / data.count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Status distribution
    const statusDistribution: Record<string, number> = {};
    for (const call of this.apiCalls) {
      const key = `${Math.floor(call.statusCode / 100)}xx`;
      statusDistribution[key] = (statusDistribution[key] ?? 0) + 1;
    }

    return {
      totalRequests: total,
      avgDurationMs: Math.round(totalDuration / total),
      errorRate: Math.round((errors / total) * 100 * 100) / 100,
      requestsPerMinute: rpm,
      topEndpoints,
      statusDistribution,
    };
  }

  // ── Percentile Calculations ─────────────────────────────

  getP50(name: string): number {
    return this.getPercentile(name, 50);
  }

  getP90(name: string): number {
    return this.getPercentile(name, 90);
  }

  getP99(name: string): number {
    return this.getPercentile(name, 99);
  }

  private getPercentile(name: string, percentile: number): number {
    const allValues: number[] = [];
    for (const [, metric] of this.histograms) {
      if (metric.name === name) {
        allValues.push(...metric.values);
      }
    }

    if (allValues.length === 0) return 0;

    const sorted = allValues.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }
}

// ══════════════════════════════════════════════════════════════
// Default Export
// ══════════════════════════════════════════════════════════════

export const metricsCollector = MetricsCollector.getInstance();
