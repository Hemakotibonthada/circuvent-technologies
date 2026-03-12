// ══════════════════════════════════════════════════════════════════════════════
// AI Orchestrator — Experiment Tracker Domain Service
// MLOps experiment management: track hyperparameters, metrics,
// compare runs, and determine best model variants.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * A single experiment run.
 */
export interface ExperimentRun {
  runId: string;
  experimentName: string;
  modelName: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  hyperparameters: Record<string, number | string | boolean>;
  metrics: Record<string, number>; // { accuracy: 0.95, loss: 0.05, f1: 0.93 }
  artifacts: string[]; // Paths to model checkpoints, logs
  datasetVersion: string;
  startedAt: Date;
  completedAt: Date | null;
  durationSeconds: number | null;
  gpuType: string | null;
  notes: string | null;
  tags: string[];
}

/**
 * Experiment comparison result.
 */
export interface ExperimentComparison {
  runs: ExperimentRun[];
  bestRunId: string | null;
  bestByMetric: Record<string, { runId: string; value: number }>;
  parameterRanges: Record<string, { min: number; max: number; values: (number | string | boolean)[] }>;
  metricCorrelations: Array<{
    param: string;
    metric: string;
    correlation: "POSITIVE" | "NEGATIVE" | "NONE";
    strength: number; // 0-1
  }>;
  recommendation: string;
}

/**
 * Experiment Tracker Domain Service.
 *
 * Key capabilities:
 * 1. Register and track experiment runs with hyperparameters + metrics
 * 2. Compare multiple runs to find the best configuration
 * 3. Detect parameter-metric correlations (which params matter most)
 * 4. Auto-recommend the best model for promotion
 * 5. Suggest next hyperparameter configurations (basic grid search)
 *
 * @example
 * ```ts
 * const tracker = new ExperimentTrackerService();
 *
 * // Register runs
 * tracker.addRun(run1);
 * tracker.addRun(run2);
 * tracker.addRun(run3);
 *
 * // Compare and find best
 * const comparison = tracker.compare("accuracy");
 * console.log(comparison.bestRunId); // "run-002"
 * ```
 */
export class ExperimentTrackerService {
  private runs: Map<string, ExperimentRun> = new Map();

  /**
   * Registers a new experiment run.
   */
  addRun(run: ExperimentRun): void {
    this.runs.set(run.runId, run);
  }

  /**
   * Retrieves a run by ID.
   */
  getRun(runId: string): ExperimentRun | undefined {
    return this.runs.get(runId);
  }

  /**
   * Lists all runs, optionally filtered.
   */
  listRuns(filter?: {
    experimentName?: string;
    status?: string;
    modelName?: string;
    tags?: string[];
  }): ExperimentRun[] {
    let results = Array.from(this.runs.values());

    if (filter?.experimentName) {
      results = results.filter(r => r.experimentName === filter.experimentName);
    }
    if (filter?.status) {
      results = results.filter(r => r.status === filter.status);
    }
    if (filter?.modelName) {
      results = results.filter(r => r.modelName === filter.modelName);
    }
    if (filter?.tags && filter.tags.length > 0) {
      results = results.filter(r => filter.tags!.some(t => r.tags.includes(t)));
    }

    return results.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  /**
   * Compares experiment runs and identifies the best configuration.
   *
   * @param primaryMetric The metric to optimize (e.g., "accuracy")
   * @param direction "MAXIMIZE" for accuracy, "MINIMIZE" for loss
   */
  compare(
    primaryMetric: string = "accuracy",
    direction: "MAXIMIZE" | "MINIMIZE" = "MAXIMIZE",
    filterExperiment?: string,
  ): ExperimentComparison {
    const completedRuns = this.listRuns({
      status: "COMPLETED",
      experimentName: filterExperiment,
    });

    if (completedRuns.length === 0) {
      return {
        runs: [],
        bestRunId: null,
        bestByMetric: {},
        parameterRanges: {},
        metricCorrelations: [],
        recommendation: "No completed runs to compare.",
      };
    }

    // Find best run by primary metric
    const runsWithMetric = completedRuns.filter(r => primaryMetric in r.metrics);
    let bestRun: ExperimentRun | null = null;

    if (runsWithMetric.length > 0) {
      bestRun = runsWithMetric.reduce((best, r) => {
        const isBetter = direction === "MAXIMIZE"
          ? r.metrics[primaryMetric] > best.metrics[primaryMetric]
          : r.metrics[primaryMetric] < best.metrics[primaryMetric];
        return isBetter ? r : best;
      }, runsWithMetric[0]);
    }

    // Best by each metric
    const allMetrics = new Set<string>();
    for (const r of completedRuns) {
      Object.keys(r.metrics).forEach(m => allMetrics.add(m));
    }

    const bestByMetric: Record<string, { runId: string; value: number }> = {};
    for (const metric of allMetrics) {
      const runsWithM = completedRuns.filter(r => metric in r.metrics);
      if (runsWithM.length === 0) continue;

      // Assume maximize for accuracy/f1/precision/recall, minimize for loss/mse/mae
      const minimize = metric.includes("loss") || metric.includes("mse") || metric.includes("mae") || metric.includes("error");
      const best = runsWithM.reduce((b, r) =>
        minimize ? (r.metrics[metric] < b.metrics[metric] ? r : b)
                 : (r.metrics[metric] > b.metrics[metric] ? r : b),
        runsWithM[0]
      );
      bestByMetric[metric] = { runId: best.runId, value: best.metrics[metric] };
    }

    // Parameter ranges
    const parameterRanges: Record<string, { min: number; max: number; values: (number | string | boolean)[] }> = {};
    for (const r of completedRuns) {
      for (const [param, value] of Object.entries(r.hyperparameters)) {
        if (!parameterRanges[param]) {
          parameterRanges[param] = { min: Infinity, max: -Infinity, values: [] };
        }
        parameterRanges[param].values.push(value);
        if (typeof value === "number") {
          parameterRanges[param].min = Math.min(parameterRanges[param].min, value);
          parameterRanges[param].max = Math.max(parameterRanges[param].max, value);
        }
      }
    }

    // Simple correlation analysis
    const metricCorrelations = this.analyzeCorrelations(completedRuns, primaryMetric);

    // Recommendation
    let recommendation = "";
    if (bestRun) {
      recommendation = `Best run: ${bestRun.runId} (${primaryMetric}=${bestRun.metrics[primaryMetric]?.toFixed(4)}). `;
      recommendation += `Hyperparameters: ${JSON.stringify(bestRun.hyperparameters)}. `;

      if (metricCorrelations.length > 0) {
        const topCorr = metricCorrelations[0];
        recommendation += `Strongest correlation: ${topCorr.param} has ${topCorr.correlation} impact on ${topCorr.metric}.`;
      }
    }

    return {
      runs: completedRuns,
      bestRunId: bestRun?.runId || null,
      bestByMetric,
      parameterRanges,
      metricCorrelations,
      recommendation,
    };
  }

  /**
   * Suggests next hyperparameter configurations based on previous results.
   * Simple strategy: perturb the best run's parameters.
   */
  suggestNextRuns(
    primaryMetric: string = "accuracy",
    count: number = 3,
  ): Array<Record<string, number | string | boolean>> {
    const comparison = this.compare(primaryMetric);
    if (!comparison.bestRunId) return [];

    const bestRun = this.getRun(comparison.bestRunId);
    if (!bestRun) return [];

    const suggestions: Array<Record<string, number | string | boolean>> = [];
    const numericParams = Object.entries(bestRun.hyperparameters)
      .filter(([, v]) => typeof v === "number") as [string, number][];

    for (let i = 0; i < Math.min(count, numericParams.length); i++) {
      // Vary one parameter at a time
      const [paramToVary, currentValue] = numericParams[i % numericParams.length];
      const variation = currentValue * (i % 2 === 0 ? 1.5 : 0.7);
      const suggested = { ...bestRun.hyperparameters };
      suggested[paramToVary] = Number(variation.toPrecision(4));
      suggestions.push(suggested);
    }

    return suggestions;
  }

  /**
   * Returns experiment statistics summary.
   */
  getStats(): {
    totalRuns: number;
    completedRuns: number;
    failedRuns: number;
    runningRuns: number;
    uniqueExperiments: number;
    avgDurationSeconds: number;
    totalGPUHours: number;
  } {
    const all = Array.from(this.runs.values());
    const completed = all.filter(r => r.status === "COMPLETED");
    const durations = completed.filter(r => r.durationSeconds).map(r => r.durationSeconds!);

    return {
      totalRuns: all.length,
      completedRuns: completed.length,
      failedRuns: all.filter(r => r.status === "FAILED").length,
      runningRuns: all.filter(r => r.status === "RUNNING").length,
      uniqueExperiments: new Set(all.map(r => r.experimentName)).size,
      avgDurationSeconds: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      totalGPUHours: Math.round(durations.reduce((a, b) => a + b, 0) / 3600 * 10) / 10,
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private analyzeCorrelations(
    runs: ExperimentRun[],
    targetMetric: string,
  ): ExperimentComparison["metricCorrelations"] {
    if (runs.length < 3) return []; // Need at least 3 points

    const numericParams = new Set<string>();
    for (const r of runs) {
      for (const [k, v] of Object.entries(r.hyperparameters)) {
        if (typeof v === "number") numericParams.add(k);
      }
    }

    const correlations: ExperimentComparison["metricCorrelations"] = [];

    for (const param of numericParams) {
      const pairs = runs
        .filter(r => typeof r.hyperparameters[param] === "number" && targetMetric in r.metrics)
        .map(r => ({
          param: r.hyperparameters[param] as number,
          metric: r.metrics[targetMetric],
        }));

      if (pairs.length < 3) continue;

      // Simple Pearson correlation
      const n = pairs.length;
      const sumX = pairs.reduce((s, p) => s + p.param, 0);
      const sumY = pairs.reduce((s, p) => s + p.metric, 0);
      const sumXY = pairs.reduce((s, p) => s + p.param * p.metric, 0);
      const sumX2 = pairs.reduce((s, p) => s + p.param ** 2, 0);
      const sumY2 = pairs.reduce((s, p) => s + p.metric ** 2, 0);

      const numerator = n * sumXY - sumX * sumY;
      const denominator = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));

      if (denominator === 0) continue;

      const r = numerator / denominator;
      const strength = Math.abs(r);

      if (strength > 0.3) {
        correlations.push({
          param,
          metric: targetMetric,
          correlation: r > 0 ? "POSITIVE" : "NEGATIVE",
          strength: Math.round(strength * 100) / 100,
        });
      }
    }

    return correlations.sort((a, b) => b.strength - a.strength);
  }
}
