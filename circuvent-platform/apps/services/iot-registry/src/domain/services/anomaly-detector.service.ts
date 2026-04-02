// ══════════════════════════════════════════════════════════════════════════════
// IoT Registry — Anomaly Detection Domain Service
// Detects anomalies in telemetry readings using statistical methods.
// Works purely with domain data — no infrastructure dependencies.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * A single telemetry reading for analysis.
 */
export interface TelemetryReading {
  deviceId: string;
  metric: string;
  value: number;
  timestamp: Date;
  unit?: string;
}

/**
 * Detected anomaly result.
 */
export interface AnomalyResult {
  deviceId: string;
  metric: string;
  value: number;
  expectedRange: { min: number; max: number };
  deviationFactor: number;
  severity: "INFO" | "WARNING" | "CRITICAL";
  type: "SPIKE" | "DROP" | "FLATLINE" | "DRIFT" | "OUT_OF_RANGE";
  description: string;
  timestamp: Date;
}

/**
 * Configuration for anomaly detection thresholds.
 */
export interface AnomalyThresholds {
  /** Standard deviations from mean before flagging (default: 2.5) */
  zScoreThreshold: number;
  /** Absolute min/max bounds for the metric */
  absoluteBounds?: { min: number; max: number };
  /** Minimum readings required for statistical analysis */
  minSampleSize: number;
  /** Consecutive identical readings before "flatline" alert */
  flatlineCount: number;
  /** Rate of change threshold (per reading) for drift detection */
  driftRateThreshold: number;
}

/** Default thresholds suitable for most IoT sensors */
const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  zScoreThreshold: 2.5,
  minSampleSize: 10,
  flatlineCount: 10,
  driftRateThreshold: 0.15,
};

/**
 * Domain service for detecting anomalies in device telemetry streams.
 *
 * Detection Methods:
 * 1. **Z-Score** — flags readings >N standard deviations from the mean
 * 2. **Absolute Bounds** — flags readings outside configured min/max
 * 3. **Flatline** — detects sensor stuck at a constant value
 * 4. **Drift** — identifies gradual upward/downward trends
 * 5. **Spike/Drop** — sudden single-reading jumps
 *
 * @example
 * ```ts
 * const detector = new AnomalyDetectorService();
 *
 * const anomalies = detector.analyze(readings, {
 *   zScoreThreshold: 3,
 *   absoluteBounds: { min: -40, max: 125 },
 *   minSampleSize: 20,
 *   flatlineCount: 15,
 *   driftRateThreshold: 0.1,
 * });
 *
 * anomalies.forEach(a => {
 *   if (a.severity === "CRITICAL") triggerAlert(a);
 * });
 * ```
 */
export class AnomalyDetectorService {

  /**
   * Analyzes a series of telemetry readings for a single metric
   * and returns any detected anomalies.
   *
   * @param readings Sorted readings (oldest first) for a single device+metric
   * @param thresholds Detection thresholds (merged with defaults)
   * @returns Array of detected anomalies
   */
  analyze(
    readings: TelemetryReading[],
    thresholds?: Partial<AnomalyThresholds>,
  ): AnomalyResult[] {
    if (readings.length === 0) return [];

    const cfg = { ...DEFAULT_THRESHOLDS, ...thresholds };
    const anomalies: AnomalyResult[] = [];
    const values = readings.map(r => r.value);
    const deviceId = readings[0].deviceId;
    const metric = readings[0].metric;

    // 1. Absolute bounds check
    if (cfg.absoluteBounds) {
      for (const reading of readings) {
        if (reading.value < cfg.absoluteBounds.min) {
          anomalies.push(this.createAnomaly(reading, {
            expectedRange: cfg.absoluteBounds,
            deviationFactor: (cfg.absoluteBounds.min - reading.value) / (cfg.absoluteBounds.max - cfg.absoluteBounds.min),
            severity: "CRITICAL",
            type: "OUT_OF_RANGE",
            description: `${metric} below minimum (${reading.value} < ${cfg.absoluteBounds.min})`,
          }));
        }
        if (reading.value > cfg.absoluteBounds.max) {
          anomalies.push(this.createAnomaly(reading, {
            expectedRange: cfg.absoluteBounds,
            deviationFactor: (reading.value - cfg.absoluteBounds.max) / (cfg.absoluteBounds.max - cfg.absoluteBounds.min),
            severity: "CRITICAL",
            type: "OUT_OF_RANGE",
            description: `${metric} above maximum (${reading.value} > ${cfg.absoluteBounds.max})`,
          }));
        }
      }
    }

    // 2. Statistical analysis (needs minimum sample size)
    if (values.length >= cfg.minSampleSize) {
      const stats = this.calculateStats(values);

      // Z-Score anomaly detection
      for (const reading of readings) {
        const zScore = Math.abs((reading.value - stats.mean) / stats.stdDev);
        if (zScore > cfg.zScoreThreshold) {
          const isSpike = reading.value > stats.mean;
          anomalies.push(this.createAnomaly(reading, {
            expectedRange: {
              min: stats.mean - cfg.zScoreThreshold * stats.stdDev,
              max: stats.mean + cfg.zScoreThreshold * stats.stdDev,
            },
            deviationFactor: zScore,
            severity: zScore > cfg.zScoreThreshold * 1.5 ? "CRITICAL" : "WARNING",
            type: isSpike ? "SPIKE" : "DROP",
            description: `${metric} ${isSpike ? "spike" : "drop"} detected (z-score: ${zScore.toFixed(2)})`,
          }));
        }
      }
    }

    // 3. Flatline detection
    const flatlineAnomaly = this.detectFlatline(readings, cfg.flatlineCount);
    if (flatlineAnomaly) anomalies.push(flatlineAnomaly);

    // 4. Drift detection
    if (values.length >= cfg.minSampleSize) {
      const driftAnomaly = this.detectDrift(readings, cfg.driftRateThreshold);
      if (driftAnomaly) anomalies.push(driftAnomaly);
    }

    return anomalies;
  }

  /**
   * Quick health assessment for a batch of latest readings.
   * Returns a summary suitable for dashboards.
   */
  assessFleetHealth(
    deviceReadings: Map<string, TelemetryReading[]>,
    thresholds?: Partial<AnomalyThresholds>,
  ): {
    totalDevices: number;
    healthyDevices: number;
    anomalousDevices: string[];
    criticalDevices: string[];
    summary: Record<string, number>;
  } {
    const anomalousDevices: string[] = [];
    const criticalDevices: string[] = [];
    const summary: Record<string, number> = {};

    for (const [deviceId, readings] of deviceReadings) {
      const anomalies = this.analyze(readings, thresholds);
      if (anomalies.length > 0) {
        anomalousDevices.push(deviceId);
        for (const a of anomalies) {
          summary[a.type] = (summary[a.type] || 0) + 1;
          if (a.severity === "CRITICAL") {
            if (!criticalDevices.includes(deviceId)) criticalDevices.push(deviceId);
          }
        }
      }
    }

    return {
      totalDevices: deviceReadings.size,
      healthyDevices: deviceReadings.size - anomalousDevices.length,
      anomalousDevices,
      criticalDevices,
      summary,
    };
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private calculateStats(values: number[]): { mean: number; stdDev: number; median: number } {
    const n = values.length;
    const mean = values.reduce((s, v) => s + v, 0) / n;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance) || 1; // Prevent division by zero

    const sorted = [...values].sort((a, b) => a - b);
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    return { mean, stdDev, median };
  }

  private detectFlatline(readings: TelemetryReading[], threshold: number): AnomalyResult | null {
    if (readings.length < threshold) return null;

    let consecutiveCount = 1;
    for (let i = readings.length - 1; i > 0; i--) {
      if (readings[i].value === readings[i - 1].value) {
        consecutiveCount++;
      } else {
        break;
      }
    }

    if (consecutiveCount >= threshold) {
      const latest = readings[readings.length - 1];
      return this.createAnomaly(latest, {
        expectedRange: { min: 0, max: 0 },
        deviationFactor: consecutiveCount / threshold,
        severity: consecutiveCount >= threshold * 2 ? "CRITICAL" : "WARNING",
        type: "FLATLINE",
        description: `${latest.metric} flatlined at ${latest.value} for ${consecutiveCount} consecutive readings — sensor may be stuck`,
      });
    }

    return null;
  }

  private detectDrift(readings: TelemetryReading[], rateThreshold: number): AnomalyResult | null {
    // Use linear regression slope to detect drift
    const n = readings.length;
    const xValues = readings.map((_, i) => i);
    const yValues = readings.map(r => r.value);

    const xMean = (n - 1) / 2;
    const yMean = yValues.reduce((s, v) => s + v, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
      denominator += Math.pow(xValues[i] - xMean, 2);
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;
    const normalizedSlope = Math.abs(slope) / (Math.abs(yMean) || 1);

    if (normalizedSlope > rateThreshold) {
      const latest = readings[readings.length - 1];
      return this.createAnomaly(latest, {
        expectedRange: { min: yMean * 0.9, max: yMean * 1.1 },
        deviationFactor: normalizedSlope / rateThreshold,
        severity: normalizedSlope > rateThreshold * 2 ? "CRITICAL" : "WARNING",
        type: "DRIFT",
        description: `${latest.metric} is drifting ${slope > 0 ? "upward" : "downward"} (slope: ${slope.toFixed(4)}/reading)`,
      });
    }

    return null;
  }

  private createAnomaly(
    reading: TelemetryReading,
    params: Omit<AnomalyResult, "deviceId" | "metric" | "value" | "timestamp">,
  ): AnomalyResult {
    return {
      deviceId: reading.deviceId,
      metric: reading.metric,
      value: reading.value,
      timestamp: reading.timestamp,
      ...params,
    };
  }
}
