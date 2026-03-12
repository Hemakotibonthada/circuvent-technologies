// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Experiment Tracker Service (AI/MLOps)
// ══════════════════════════════════════════════════════════════════════════════

import { ExperimentTrackerService, ExperimentRun } from "../../../src/domain/services/experiment-tracker.service";

function createRun(overrides: Partial<ExperimentRun> & { runId: string }): ExperimentRun {
  return {
    experimentName: "anomaly-detection",
    modelName: "anomaly-detector-v2",
    status: "COMPLETED",
    hyperparameters: { learningRate: 0.001, batchSize: 32, epochs: 50, dropout: 0.2 },
    metrics: { accuracy: 0.92, loss: 0.08, f1: 0.90, precision: 0.91, recall: 0.89 },
    artifacts: ["/models/checkpoint.pt"],
    datasetVersion: "v3",
    startedAt: new Date("2026-03-10T10:00:00"),
    completedAt: new Date("2026-03-10T12:30:00"),
    durationSeconds: 9000,
    gpuType: "A100",
    notes: null,
    tags: ["baseline"],
    ...overrides,
  };
}

describe("ExperimentTrackerService", () => {
  let tracker: ExperimentTrackerService;

  beforeEach(() => {
    tracker = new ExperimentTrackerService();
  });

  describe("Run Management", () => {
    it("should add and retrieve runs", () => {
      const run = createRun({ runId: "run-001" });
      tracker.addRun(run);
      expect(tracker.getRun("run-001")).toBeDefined();
      expect(tracker.getRun("run-001")?.runId).toBe("run-001");
    });

    it("should list runs with filters", () => {
      tracker.addRun(createRun({ runId: "run-001", experimentName: "exp-A", status: "COMPLETED" }));
      tracker.addRun(createRun({ runId: "run-002", experimentName: "exp-B", status: "FAILED" }));
      tracker.addRun(createRun({ runId: "run-003", experimentName: "exp-A", status: "COMPLETED" }));

      const expA = tracker.listRuns({ experimentName: "exp-A" });
      expect(expA.length).toBe(2);

      const completed = tracker.listRuns({ status: "COMPLETED" });
      expect(completed.length).toBe(2);
    });

    it("should filter by tags", () => {
      tracker.addRun(createRun({ runId: "run-001", tags: ["baseline", "v2"] }));
      tracker.addRun(createRun({ runId: "run-002", tags: ["experimental"] }));

      const filtered = tracker.listRuns({ tags: ["baseline"] });
      expect(filtered.length).toBe(1);
      expect(filtered[0].runId).toBe("run-001");
    });
  });

  describe("Comparison", () => {
    it("should find best run by accuracy (MAXIMIZE)", () => {
      tracker.addRun(createRun({ runId: "run-001", metrics: { accuracy: 0.85, loss: 0.15 } }));
      tracker.addRun(createRun({ runId: "run-002", metrics: { accuracy: 0.95, loss: 0.05 } }));
      tracker.addRun(createRun({ runId: "run-003", metrics: { accuracy: 0.90, loss: 0.10 } }));

      const comparison = tracker.compare("accuracy", "MAXIMIZE");
      expect(comparison.bestRunId).toBe("run-002");
      expect(comparison.bestByMetric.accuracy.value).toBe(0.95);
    });

    it("should find best run by loss (MINIMIZE)", () => {
      tracker.addRun(createRun({ runId: "run-001", metrics: { accuracy: 0.85, loss: 0.15 } }));
      tracker.addRun(createRun({ runId: "run-002", metrics: { accuracy: 0.90, loss: 0.03 } }));

      const comparison = tracker.compare("loss", "MINIMIZE");
      expect(comparison.bestRunId).toBe("run-002");
    });

    it("should compute parameter ranges", () => {
      tracker.addRun(createRun({ runId: "r1", hyperparameters: { lr: 0.001, epochs: 50 } }));
      tracker.addRun(createRun({ runId: "r2", hyperparameters: { lr: 0.01, epochs: 100 } }));

      const comparison = tracker.compare("accuracy");
      expect(comparison.parameterRanges.lr.min).toBe(0.001);
      expect(comparison.parameterRanges.lr.max).toBe(0.01);
      expect(comparison.parameterRanges.epochs.min).toBe(50);
      expect(comparison.parameterRanges.epochs.max).toBe(100);
    });

    it("should detect metric correlations", () => {
      // Create runs where higher learning rate = lower accuracy (negative correlation)
      tracker.addRun(createRun({ runId: "r1", hyperparameters: { lr: 0.001 }, metrics: { accuracy: 0.95 } }));
      tracker.addRun(createRun({ runId: "r2", hyperparameters: { lr: 0.01 }, metrics: { accuracy: 0.85 } }));
      tracker.addRun(createRun({ runId: "r3", hyperparameters: { lr: 0.1 }, metrics: { accuracy: 0.60 } }));
      tracker.addRun(createRun({ runId: "r4", hyperparameters: { lr: 0.05 }, metrics: { accuracy: 0.75 } }));

      const comparison = tracker.compare("accuracy");
      const lrCorr = comparison.metricCorrelations.find((c: any) => c.param === "lr");
      expect(lrCorr).toBeDefined();
      expect(lrCorr?.correlation).toBe("NEGATIVE");
    });

    it("should handle empty runs", () => {
      const comparison = tracker.compare();
      expect(comparison.bestRunId).toBeNull();
      expect(comparison.recommendation).toContain("No completed runs");
    });

    it("should generate recommendation text", () => {
      tracker.addRun(createRun({ runId: "r1", metrics: { accuracy: 0.95 } }));
      const comparison = tracker.compare("accuracy");
      expect(comparison.recommendation).toContain("Best run: r1");
    });
  });

  describe("Suggest Next Runs", () => {
    it("should suggest parameter variations", () => {
      tracker.addRun(createRun({ runId: "r1", hyperparameters: { lr: 0.01, batchSize: 32, epochs: 50 }, metrics: { accuracy: 0.92 } }));

      const suggestions = tracker.suggestNextRuns("accuracy", 3);
      expect(suggestions.length).toBeGreaterThan(0);
      // Should vary parameters from the best run
      expect(suggestions[0].lr).not.toBe(0.01);
    });

    it("should return empty for no runs", () => {
      expect(tracker.suggestNextRuns().length).toBe(0);
    });
  });

  describe("Statistics", () => {
    it("should compute aggregate stats", () => {
      tracker.addRun(createRun({ runId: "r1", status: "COMPLETED", durationSeconds: 3600 }));
      tracker.addRun(createRun({ runId: "r2", status: "COMPLETED", durationSeconds: 7200 }));
      tracker.addRun(createRun({ runId: "r3", status: "FAILED", durationSeconds: null }));

      const stats = tracker.getStats();
      expect(stats.totalRuns).toBe(3);
      expect(stats.completedRuns).toBe(2);
      expect(stats.failedRuns).toBe(1);
      expect(stats.avgDurationSeconds).toBe(5400);
      expect(stats.totalGPUHours).toBeCloseTo(3, 0);
    });
  });
});
