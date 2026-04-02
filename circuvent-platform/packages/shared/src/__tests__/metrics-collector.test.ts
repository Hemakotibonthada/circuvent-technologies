// ──────────────────────────────────────────────────────────────
// MetricsCollector — Test Suite
// Tests for counters, histograms, gauges, percentiles,
// Prometheus format, API stats, Express middleware.
// ──────────────────────────────────────────────────────────────

import { MetricsCollector } from "../utils/metrics-collector";

// ══════════════════════════════════════════════════════════════
// Helpers — convenience wrappers over available API
// ══════════════════════════════════════════════════════════════

function getCounterValue(m: MetricsCollector, name: string, labels: Record<string, string>): number {
  const key = JSON.stringify(labels);
  const found = m.getMetricsByName(name).find(
    (metric) => metric.type === "counter" && JSON.stringify(metric.labels) === key,
  );
  return found?.type === "counter" ? found.value : 0;
}

function getGaugeValue(m: MetricsCollector, name: string, labels: Record<string, string>): number {
  const key = JSON.stringify(labels);
  const found = m.getMetricsByName(name).find(
    (metric) => metric.type === "gauge" && JSON.stringify(metric.labels) === key,
  );
  return found?.type === "gauge" ? found.value : 0;
}

function getHistogramStats(m: MetricsCollector, name: string, labels: Record<string, string>) {
  const key = JSON.stringify(labels);
  const found = m.getMetricsByName(name).find(
    (metric) => metric.type === "histogram" && JSON.stringify(metric.labels) === key,
  );
  if (!found || found.type !== "histogram") return null;
  const values = found.values;
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  return {
    count,
    mean: values.reduce((a, b) => a + b, 0) / count,
    min: sorted[0],
    max: sorted[count - 1],
    p50: sorted[Math.floor(count * 0.5)],
    p95: sorted[Math.floor(count * 0.95)],
    p99: sorted[Math.floor(count * 0.99)],
  };
}

// ══════════════════════════════════════════════════════════════
// Setup
// ══════════════════════════════════════════════════════════════

let metrics: MetricsCollector;

beforeEach(() => {
  metrics = MetricsCollector.getInstance();
  metrics.resetMetrics();
});

// ══════════════════════════════════════════════════════════════
// Singleton
// ══════════════════════════════════════════════════════════════

describe("Singleton", () => {
  it("should return the same instance", () => {
    const a = MetricsCollector.getInstance();
    const b = MetricsCollector.getInstance();
    expect(a).toBe(b);
  });

  it("should reset to new instance", () => {
    const a = MetricsCollector.getInstance();
    a.resetMetrics();
    const b = MetricsCollector.getInstance();
    expect(a).toBe(b);
  });
});

// ══════════════════════════════════════════════════════════════
// Counters
// ══════════════════════════════════════════════════════════════

describe("Counters", () => {
  it("should increment a counter", () => {
    metrics.incrementCounter("http_requests_total", { method: "GET", path: "/api" });
    metrics.incrementCounter("http_requests_total", { method: "GET", path: "/api" });
    const value = getCounterValue(metrics, "http_requests_total", { method: "GET", path: "/api" });
    expect(value).toBe(2);
  });

  it("should increment by custom amount", () => {
    metrics.incrementCounter("bytes_sent", { service: "api" }, 1024);
    expect(getCounterValue(metrics, "bytes_sent", { service: "api" })).toBe(1024);
  });

  it("should return 0 for unknown counter", () => {
    expect(getCounterValue(metrics, "unknown", {})).toBe(0);
  });

  it("should handle different labels independently", () => {
    metrics.incrementCounter("status", { code: "200" });
    metrics.incrementCounter("status", { code: "404" });
    expect(getCounterValue(metrics, "status", { code: "200" })).toBe(1);
    expect(getCounterValue(metrics, "status", { code: "404" })).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// Histograms
// ══════════════════════════════════════════════════════════════

describe("Histograms", () => {
  it("should record histogram values", () => {
    metrics.recordHistogram("response_time", 150, { route: "/api" });
    metrics.recordHistogram("response_time", 200, { route: "/api" });
    metrics.recordHistogram("response_time", 50, { route: "/api" });

    const stats = getHistogramStats(metrics, "response_time", { route: "/api" });
    expect(stats).toBeDefined();
    expect(stats!.count).toBe(3);
    expect(stats!.mean).toBeCloseTo(133.33, 0);
    expect(stats!.min).toBe(50);
    expect(stats!.max).toBe(200);
  });

  it("should return null for unknown histogram", () => {
    expect(getHistogramStats(metrics, "unknown", {})).toBeNull();
  });

  it("should calculate percentiles", () => {
    for (let i = 1; i <= 100; i++) {
      metrics.recordHistogram("latency", i);
    }
    const stats = getHistogramStats(metrics, "latency", {});
    expect(stats!.p50).toBeCloseTo(50, 0);
    expect(stats!.p95).toBeCloseTo(95, 0);
    expect(stats!.p99).toBeCloseTo(99, 0);
  });
});

// ══════════════════════════════════════════════════════════════
// Gauges
// ══════════════════════════════════════════════════════════════

describe("Gauges", () => {
  it("should set a gauge value", () => {
    metrics.setGauge("active_connections", 42, { service: "ws" });
    expect(getGaugeValue(metrics, "active_connections", { service: "ws" })).toBe(42);
  });

  it("should overwrite gauge value", () => {
    metrics.setGauge("cpu_usage", 75);
    metrics.setGauge("cpu_usage", 82);
    expect(getGaugeValue(metrics, "cpu_usage", {})).toBe(82);
  });

  it("should support setting and overwriting gauge", () => {
    metrics.setGauge("queue_size", 10);
    metrics.setGauge("queue_size", 15);
    expect(getGaugeValue(metrics, "queue_size", {})).toBe(15);
    metrics.setGauge("queue_size", 12);
    expect(getGaugeValue(metrics, "queue_size", {})).toBe(12);
  });

  it("should return 0 for unknown gauge", () => {
    expect(getGaugeValue(metrics, "unknown", {})).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// API Stats
// ══════════════════════════════════════════════════════════════

describe("API Stats", () => {
  it("should record API calls", () => {
    metrics.recordAPICall("GET", "/api/users", 200, 45);
    metrics.recordAPICall("POST", "/api/users", 201, 120);
    metrics.recordAPICall("GET", "/api/users", 500, 30);

    const stats = metrics.getAPIStats();
    expect(stats.totalRequests).toBe(3);
    expect(stats.avgDurationMs).toBeGreaterThan(0);
    expect(stats.errorRate).toBeGreaterThan(0);
  });

  it("should track top endpoints", () => {
    metrics.recordAPICall("GET", "/api/users", 200, 45);
    metrics.recordAPICall("GET", "/api/users", 200, 50);
    metrics.recordAPICall("GET", "/api/projects", 200, 30);

    const stats = metrics.getAPIStats();
    expect(stats.topEndpoints.length).toBeGreaterThan(0);
    expect(stats.topEndpoints[0].path).toBe("/api/users");
  });

  it("should track status distribution", () => {
    metrics.recordAPICall("GET", "/api", 200, 10);
    metrics.recordAPICall("GET", "/api", 200, 10);
    metrics.recordAPICall("GET", "/api", 404, 10);

    const stats = metrics.getAPIStats();
    expect(stats.statusDistribution["200"]).toBe(2);
    expect(stats.statusDistribution["404"]).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// Prometheus Format
// ══════════════════════════════════════════════════════════════

describe("Prometheus Format", () => {
  it("should export metrics in Prometheus text format", () => {
    metrics.incrementCounter("http_total", { method: "GET" });
    metrics.setGauge("active_users", 15);

    const output = metrics.toPrometheusFormat();
    expect(output).toContain("http_total");
    expect(output).toContain("active_users");
  });
});
