// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Dataset Entity (AI/MLOps Domain)
// Tests versioning, split validation, quality checks, drift detection.
// ══════════════════════════════════════════════════════════════════════════════

import { DatasetEntity } from "../../../src/domain/entities/dataset.entity";

function createDataset(overrides?: Partial<ConstructorParameters<typeof DatasetEntity>[0]>): DatasetEntity {
  return new DatasetEntity({
    id: "ds-001", name: "sensor-anomaly-dataset", version: 1,
    type: "TIME_SERIES", storagePath: "s3://circuvent/datasets/v1/",
    createdBy: "data-team",
    splits: [
      { name: "train", ratio: 0.7, sampleCount: 70000 },
      { name: "validation", ratio: 0.15, sampleCount: 15000 },
      { name: "test", ratio: 0.15, sampleCount: 15000 },
    ],
    quality: {
      totalSamples: 100000, missingValues: 500, missingValueRatio: 0.005,
      duplicateCount: 200, dataFreshnessDays: 30,
      classDistribution: { normal: 85000, anomaly: 15000 },
    },
    ...overrides,
  });
}

describe("DatasetEntity", () => {
  describe("Creation", () => {
    it("should create with valid splits", () => {
      const ds = createDataset();
      expect(ds.totalSamples).toBe(100000);
      expect(ds.splits.length).toBe(3);
    });

    it("should reject splits that don't sum to 1.0", () => {
      expect(() => createDataset({
        splits: [
          { name: "train", ratio: 0.5, sampleCount: 50000 },
          { name: "test", ratio: 0.3, sampleCount: 30000 },
        ],
      })).toThrow("sum to 1.0");
    });

    it("should allow creation without splits", () => {
      const ds = createDataset({ splits: [] });
      expect(ds.splits.length).toBe(0);
    });
  });

  describe("Split Access", () => {
    it("should access training split", () => {
      const ds = createDataset();
      expect(ds.trainingSplit?.ratio).toBe(0.7);
      expect(ds.trainingSplit?.sampleCount).toBe(70000);
    });

    it("should access test split", () => {
      const ds = createDataset();
      expect(ds.testSplit?.ratio).toBe(0.15);
    });
  });

  describe("Quality Standards", () => {
    it("should pass quality check for clean dataset", () => {
      const ds = createDataset();
      const result = ds.meetsQualityStandards();
      expect(result.passes).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it("should fail for high missing values", () => {
      const ds = createDataset({
        quality: {
          totalSamples: 100000, missingValues: 10000, missingValueRatio: 0.10,
          duplicateCount: 0, dataFreshnessDays: 10,
        },
      });
      const result = ds.meetsQualityStandards({ maxMissingRatio: 0.05 });
      expect(result.passes).toBe(false);
      expect(result.issues.some((i: any) => i.includes("Missing value"))).toBe(true);
    });

    it("should fail for too few samples", () => {
      const ds = createDataset({
        quality: {
          totalSamples: 50, missingValues: 0, missingValueRatio: 0,
          duplicateCount: 0, dataFreshnessDays: 5,
        },
      });
      const result = ds.meetsQualityStandards({ minSampleCount: 100 });
      expect(result.passes).toBe(false);
    });

    it("should fail for stale data", () => {
      const ds = createDataset({
        quality: {
          totalSamples: 100000, missingValues: 0, missingValueRatio: 0,
          duplicateCount: 0, dataFreshnessDays: 120,
        },
      });
      const result = ds.meetsQualityStandards({ maxAgeDays: 90 });
      expect(result.passes).toBe(false);
      expect(result.issues.some((i: any) => i.includes("days old"))).toBe(true);
    });

    it("should return error for missing quality metrics", () => {
      const ds = createDataset({ quality: null });
      const result = ds.meetsQualityStandards();
      expect(result.passes).toBe(false);
    });
  });

  describe("Deprecation", () => {
    it("should mark as deprecated", () => {
      const ds = createDataset();
      ds.deprecate("Replaced by v2 with better labels");
      expect(ds.isDeprecated).toBe(true);
      expect(ds.description).toContain("DEPRECATED");
    });
  });

  describe("Drift Detection", () => {
    it("should detect size drift", () => {
      const ds1 = createDataset({
        quality: { totalSamples: 100000, missingValues: 0, missingValueRatio: 0, duplicateCount: 0, dataFreshnessDays: 10 },
      });
      const ds2 = createDataset({
        quality: { totalSamples: 20000, missingValues: 0, missingValueRatio: 0, duplicateCount: 0, dataFreshnessDays: 10 },
      });
      const drift = ds1.detectDrift(ds2);
      expect(drift.hasDrift).toBe(true);
      expect(drift.details.some((d: any) => d.includes("Sample count"))).toBe(true);
    });

    it("should detect class distribution drift", () => {
      const ds1 = createDataset({
        quality: {
          totalSamples: 100000, missingValues: 0, missingValueRatio: 0,
          duplicateCount: 0, dataFreshnessDays: 10,
          classDistribution: { normal: 90000, anomaly: 10000 },
        },
      });
      const ds2 = createDataset({
        quality: {
          totalSamples: 100000, missingValues: 0, missingValueRatio: 0,
          duplicateCount: 0, dataFreshnessDays: 10,
          classDistribution: { normal: 50000, anomaly: 50000 },
        },
      });
      const drift = ds1.detectDrift(ds2);
      expect(drift.hasDrift).toBe(true);
      expect(drift.details.some((d: any) => d.includes("distribution"))).toBe(true);
    });

    it("should not detect drift for similar datasets", () => {
      const ds1 = createDataset();
      const ds2 = createDataset();
      const drift = ds1.detectDrift(ds2);
      expect(drift.hasDrift).toBe(false);
    });
  });

  describe("Split Validation", () => {
    it("should accept valid split updates", () => {
      const ds = createDataset({ splits: [] });
      ds.setSplits([
        { name: "train", ratio: 0.8, sampleCount: 80000 },
        { name: "test", ratio: 0.2, sampleCount: 20000 },
      ]);
      expect(ds.splits.length).toBe(2);
    });

    it("should reject invalid split ratio", () => {
      const ds = createDataset({ splits: [] });
      expect(() => ds.setSplits([
        { name: "train", ratio: 0.9, sampleCount: 90000 },
        { name: "test", ratio: 0.3, sampleCount: 30000 },
      ])).toThrow("sum to 1.0");
    });
  });
});
