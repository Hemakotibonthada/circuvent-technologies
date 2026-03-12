// ══════════════════════════════════════════════════════════════════════════════
// AI Orchestrator — Dataset Entity (MLOps Domain Core)
// Dataset versioning, lineage tracking, and split management.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Dataset type classification.
 */
export type DatasetType =
  | "TABULAR"
  | "IMAGE"
  | "TEXT"
  | "AUDIO"
  | "VIDEO"
  | "TIME_SERIES"
  | "GRAPH"
  | "MULTIMODAL";

/**
 * Dataset split configuration.
 */
export interface DatasetSplit {
  name: string;         // "train", "validation", "test"
  ratio: number;        // 0.0 - 1.0
  sampleCount: number;
  filePath?: string;
}

/**
 * Data quality metrics.
 */
export interface DataQualityMetrics {
  totalSamples: number;
  missingValues: number;
  missingValueRatio: number;
  duplicateCount: number;
  classDistribution?: Record<string, number>;
  featureCount?: number;
  outlierCount?: number;
  dataFreshnessDays: number;
}

/**
 * Dataset Entity — tracks ML dataset versions with lineage.
 *
 * Every model training references a specific dataset version.
 * When data drifts or quality degrades, a new version is created.
 *
 * @invariant Version numbers are monotonically increasing
 * @invariant Split ratios must sum to 1.0
 * @invariant Each version has immutable content hash
 *
 * @example
 * ```ts
 * const dataset = new DatasetEntity({
 *   id: "ds-001",
 *   name: "sensor-anomaly-dataset",
 *   version: 3,
 *   type: "TIME_SERIES",
 *   description: "IoT sensor anomaly data from 500 devices",
 *   storagePath: "s3://circuvent-ml/datasets/sensor-anomaly/v3/",
 *   splits: [
 *     { name: "train", ratio: 0.7, sampleCount: 70000 },
 *     { name: "validation", ratio: 0.15, sampleCount: 15000 },
 *     { name: "test", ratio: 0.15, sampleCount: 15000 },
 *   ],
 *   quality: { totalSamples: 100000, missingValues: 150, ... },
 *   createdBy: "data-pipeline",
 * });
 * ```
 */
export class DatasetEntity {
  public readonly id: string;
  /** Dataset family name */
  public readonly name: string;
  /** Version number (monotonically increasing) */
  public readonly version: number;
  /** Description */
  public description: string | null;
  /** Data type */
  public readonly type: DatasetType;
  /** Storage path (S3, GCS, local) */
  public readonly storagePath: string;
  /** Content hash for integrity verification */
  public contentHash: string | null;
  /** Size in MB */
  public sizeMB: number | null;
  /** Train/validation/test splits */
  private _splits: DatasetSplit[];
  /** Data quality metrics */
  public quality: DataQualityMetrics | null;
  /** Schema definition (column names, types) */
  public schema: Record<string, string> | null;
  /** Tags for searchability */
  public tags: string[];
  /** Parent dataset version (for lineage) */
  public parentVersionId: string | null;
  /** Transformation notes (how this version differs from parent) */
  public transformationNotes: string | null;
  /** Whether this version is marked as deprecated */
  public isDeprecated: boolean;
  /** Created by */
  public readonly createdBy: string;
  public readonly createdAt: Date;

  constructor(params: {
    id: string;
    name: string;
    version: number;
    description?: string | null;
    type: DatasetType;
    storagePath: string;
    contentHash?: string | null;
    sizeMB?: number | null;
    splits?: DatasetSplit[];
    quality?: DataQualityMetrics | null;
    schema?: Record<string, string> | null;
    tags?: string[];
    parentVersionId?: string | null;
    transformationNotes?: string | null;
    createdBy: string;
  }) {
    this.id = params.id;
    this.name = params.name;
    this.version = params.version;
    this.description = params.description || null;
    this.type = params.type;
    this.storagePath = params.storagePath;
    this.contentHash = params.contentHash || null;
    this.sizeMB = params.sizeMB || null;
    this._splits = params.splits || [];
    this.quality = params.quality || null;
    this.schema = params.schema || null;
    this.tags = params.tags || [];
    this.parentVersionId = params.parentVersionId || null;
    this.transformationNotes = params.transformationNotes || null;
    this.isDeprecated = false;
    this.createdBy = params.createdBy;
    this.createdAt = new Date();

    // Validate splits sum to ~1.0
    if (this._splits.length > 0) {
      const totalRatio = this._splits.reduce((s, sp) => s + sp.ratio, 0);
      if (Math.abs(totalRatio - 1.0) > 0.01) {
        throw new Error(`Dataset splits must sum to 1.0 (got ${totalRatio.toFixed(3)})`);
      }
    }
  }

  get splits(): ReadonlyArray<DatasetSplit> { return this._splits; }

  /** Total sample count across all splits */
  get totalSamples(): number {
    return this._splits.reduce((s, sp) => s + sp.sampleCount, 0);
  }

  /** Returns the training split */
  get trainingSplit(): DatasetSplit | undefined {
    return this._splits.find(s => s.name === "train");
  }

  /** Returns the test split */
  get testSplit(): DatasetSplit | undefined {
    return this._splits.find(s => s.name === "test");
  }

  /**
   * Checks if dataset quality meets minimum standards for training.
   */
  meetsQualityStandards(requirements?: {
    maxMissingRatio?: number;
    minSampleCount?: number;
    maxDuplicateRatio?: number;
    maxAgeDays?: number;
  }): { passes: boolean; issues: string[] } {
    const reqs = {
      maxMissingRatio: 0.05,
      minSampleCount: 100,
      maxDuplicateRatio: 0.1,
      maxAgeDays: 90,
      ...requirements,
    };

    const issues: string[] = [];
    const q = this.quality;

    if (!q) {
      return { passes: false, issues: ["No quality metrics computed"] };
    }

    if (q.missingValueRatio > reqs.maxMissingRatio) {
      issues.push(`Missing value ratio ${(q.missingValueRatio * 100).toFixed(1)}% exceeds ${(reqs.maxMissingRatio * 100)}%`);
    }
    if (q.totalSamples < reqs.minSampleCount) {
      issues.push(`Only ${q.totalSamples} samples (minimum ${reqs.minSampleCount})`);
    }
    if (q.totalSamples > 0 && q.duplicateCount / q.totalSamples > reqs.maxDuplicateRatio) {
      issues.push(`Duplicate ratio ${((q.duplicateCount / q.totalSamples) * 100).toFixed(1)}% exceeds ${(reqs.maxDuplicateRatio * 100)}%`);
    }
    if (q.dataFreshnessDays > reqs.maxAgeDays) {
      issues.push(`Data is ${q.dataFreshnessDays} days old (max ${reqs.maxAgeDays})`);
    }

    return { passes: issues.length === 0, issues };
  }

  /**
   * Marks this dataset version as deprecated.
   * Deprecated datasets produce warnings when used for new training.
   */
  deprecate(reason: string): void {
    this.isDeprecated = true;
    this.description = `[DEPRECATED: ${reason}] ${this.description || ""}`;
  }

  /**
   * Sets data splits.
   */
  setSplits(splits: DatasetSplit[]): void {
    const totalRatio = splits.reduce((s, sp) => s + sp.ratio, 0);
    if (Math.abs(totalRatio - 1.0) > 0.01) {
      throw new Error(`Splits must sum to 1.0 (got ${totalRatio.toFixed(3)})`);
    }
    this._splits = splits;
  }

  /**
   * Detects potential data drift between this version and another.
   * Simple heuristic based on class distribution shift.
   */
  detectDrift(other: DatasetEntity): {
    hasDrift: boolean;
    driftScore: number;
    details: string[];
  } {
    const details: string[] = [];
    let driftScore = 0;

    // Size drift
    if (this.totalSamples > 0 && other.totalSamples > 0) {
      const sizeRatio = other.totalSamples / this.totalSamples;
      if (sizeRatio < 0.5 || sizeRatio > 2.0) {
        driftScore += 0.3;
        details.push(`Sample count changed significantly (${this.totalSamples} → ${other.totalSamples})`);
      }
    }

    // Class distribution drift
    const thisDist = this.quality?.classDistribution;
    const otherDist = other.quality?.classDistribution;
    if (thisDist && otherDist) {
      const allClasses = new Set([...Object.keys(thisDist), ...Object.keys(otherDist)]);
      let totalShift = 0;
      for (const cls of allClasses) {
        const thisRatio = (thisDist[cls] || 0) / (this.quality?.totalSamples || 1);
        const otherRatio = (otherDist[cls] || 0) / (other.quality?.totalSamples || 1);
        totalShift += Math.abs(thisRatio - otherRatio);
      }
      if (totalShift > 0.2) {
        driftScore += 0.5;
        details.push(`Class distribution shifted by ${(totalShift * 100).toFixed(1)}%`);
      }
    }

    // Quality degradation
    if (this.quality && other.quality) {
      if (other.quality.missingValueRatio > this.quality.missingValueRatio * 2) {
        driftScore += 0.2;
        details.push("Missing value ratio increased significantly");
      }
    }

    return {
      hasDrift: driftScore >= 0.3,
      driftScore: Number(driftScore.toFixed(2)),
      details,
    };
  }
}
