// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Anomaly Detection Domain Service
// Tests Z-score, flatline, drift, and absolute bounds detection.
// ══════════════════════════════════════════════════════════════════════════════

import { AnomalyDetectorService, TelemetryReading } from "../../../src/domain/services/anomaly-detector.service";

function createReadings(values: number[], metric: string = "temperature"): TelemetryReading[] {
  return values.map((value, i) => ({
    deviceId: "dev-001",
    metric,
    value,
    timestamp: new Date(Date.now() + i * 60000),
    unit: "°C",
  }));
}

describe("AnomalyDetectorService", () => {
  let detector: AnomalyDetectorService;

  beforeEach(() => {
    detector = new AnomalyDetectorService();
  });

  describe("Absolute Bounds", () => {
    it("should detect out-of-range values", () => {
      const readings = createReadings([22, 23, 24, -50, 200]); // -50 and 200 are out of range
      const anomalies = detector.analyze(readings, {
        absoluteBounds: { min: -40, max: 125 },
        minSampleSize: 100, // Disable statistical analysis
      });

      expect(anomalies.length).toBe(2);
      expect(anomalies[0].type).toBe("OUT_OF_RANGE");
      expect(anomalies[0].severity).toBe("CRITICAL");
      expect(anomalies[1].type).toBe("OUT_OF_RANGE");
    });

    it("should not flag values within bounds", () => {
      const readings = createReadings([22, 23, 24, 25, 26]);
      const anomalies = detector.analyze(readings, {
        absoluteBounds: { min: 0, max: 50 },
        minSampleSize: 100,
      });
      expect(anomalies.length).toBe(0);
    });
  });

  describe("Z-Score Anomaly Detection", () => {
    it("should detect statistical spikes", () => {
      // Normal readings around 25°C, then spike to 100°C
      const values = Array.from({ length: 20 }, () => 25 + Math.random() * 2);
      values.push(100); // Spike!

      const readings = createReadings(values);
      const anomalies = detector.analyze(readings, { zScoreThreshold: 2.5, minSampleSize: 10 });

      const spike = anomalies.find((a: any) => a.type === "SPIKE");
      expect(spike).toBeDefined();
      expect(spike?.value).toBe(100);
    });

    it("should detect statistical drops", () => {
      const values = Array.from({ length: 20 }, () => 50 + Math.random() * 2);
      values.push(-10); // Drop!

      const readings = createReadings(values);
      const anomalies = detector.analyze(readings, { zScoreThreshold: 2.5, minSampleSize: 10 });

      const drop = anomalies.find((a: any) => a.type === "DROP");
      expect(drop).toBeDefined();
    });

    it("should not flag normal variation", () => {
      const values = Array.from({ length: 30 }, () => 25 + (Math.random() - 0.5) * 2);
      const readings = createReadings(values);
      const anomalies = detector.analyze(readings, {
        zScoreThreshold: 3,
        minSampleSize: 10,
      });

      // Normal random variation should produce very few (if any) anomalies
      const spikeDrops = anomalies.filter((a: any) => a.type === "SPIKE" || a.type === "DROP");
      expect(spikeDrops.length).toBeLessThan(3);
    });
  });

  describe("Flatline Detection", () => {
    it("should detect sensor stuck at constant value", () => {
      const values = [25, 25.1, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25]; // 10 consecutive identical
      const readings = createReadings(values);
      const anomalies = detector.analyze(readings, { flatlineCount: 10, minSampleSize: 100 });

      const flatline = anomalies.find((a: any) => a.type === "FLATLINE");
      expect(flatline).toBeDefined();
      expect(flatline?.description).toContain("flatlined");
    });

    it("should not flag normal readings with small variation", () => {
      const values = [25, 25.1, 24.9, 25.2, 24.8, 25.3];
      const readings = createReadings(values);
      const anomalies = detector.analyze(readings, { flatlineCount: 5, minSampleSize: 100 });

      const flatline = anomalies.find((a: any) => a.type === "FLATLINE");
      expect(flatline).toBeUndefined();
    });
  });

  describe("Drift Detection", () => {
    it("should detect upward drift", () => {
      // Steady upward trend: starts at ~20, ends at ~40
      const values = Array.from({ length: 30 }, (_, i) => 20 + i * 0.7 + Math.random() * 0.5);
      const readings = createReadings(values);
      const anomalies = detector.analyze(readings, { driftRateThreshold: 0.05, minSampleSize: 10 });

      const drift = anomalies.find((a: any) => a.type === "DRIFT");
      expect(drift).toBeDefined();
      expect(drift?.description).toContain("upward");
    });

    it("should detect downward drift", () => {
      const values = Array.from({ length: 30 }, (_, i) => 50 - i * 0.8 + Math.random() * 0.5);
      const readings = createReadings(values);
      const anomalies = detector.analyze(readings, { driftRateThreshold: 0.05, minSampleSize: 10 });

      const drift = anomalies.find((a: any) => a.type === "DRIFT");
      expect(drift).toBeDefined();
      expect(drift?.description).toContain("downward");
    });

    it("should not flag stable readings as drift", () => {
      const values = Array.from({ length: 30 }, () => 25 + (Math.random() - 0.5) * 2);
      const readings = createReadings(values);
      const anomalies = detector.analyze(readings, { driftRateThreshold: 0.15, minSampleSize: 10 });

      const drift = anomalies.find((a: any) => a.type === "DRIFT");
      expect(drift).toBeUndefined();
    });
  });

  describe("Fleet Health Assessment", () => {
    it("should summarize fleet health across devices", () => {
      const deviceReadings = new Map<string, TelemetryReading[]>();

      // Healthy device
      deviceReadings.set("dev-001", createReadings(Array.from({ length: 20 }, () => 25 + Math.random())));

      // Device with spike
      const spikeValues = Array.from({ length: 20 }, () => 25 + Math.random());
      spikeValues.push(200);
      deviceReadings.set("dev-002", createReadings(spikeValues));

      // Flatlined device
      deviceReadings.set("dev-003", createReadings(Array.from({ length: 15 }, () => 30)));

      const health = detector.assessFleetHealth(deviceReadings, {
        zScoreThreshold: 2.5,
        flatlineCount: 10,
        minSampleSize: 10,
      });

      expect(health.totalDevices).toBe(3);
      expect(health.healthyDevices).toBeLessThanOrEqual(2);
      expect(health.anomalousDevices.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty readings", () => {
      const anomalies = detector.analyze([]);
      expect(anomalies).toEqual([]);
    });

    it("should handle single reading", () => {
      const readings = createReadings([25]);
      const anomalies = detector.analyze(readings, {
        absoluteBounds: { min: 0, max: 50 },
        minSampleSize: 10,
      });
      expect(anomalies.length).toBe(0); // Within bounds, too few for stats
    });
  });
});
