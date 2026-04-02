// ══════════════════════════════════════════════════════════════════════════════
// AI Orchestrator — Model Registry Entity (MLOps Domain Core)
// Tracks ML model versions, stages (dev→staging→production),
// metrics, and deployment status.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Model lifecycle stages (MLflow convention).
 */
export enum ModelStage {
  DEVELOPMENT = "DEVELOPMENT",
  STAGING = "STAGING",
  PRODUCTION = "PRODUCTION",
  ARCHIVED = "ARCHIVED",
}

/**
 * Model type classification.
 */
export type ModelType =
  | "CLASSIFICATION"
  | "REGRESSION"
  | "OBJECT_DETECTION"
  | "NLP"
  | "RECOMMENDATION"
  | "TIME_SERIES"
  | "REINFORCEMENT_LEARNING"
  | "GENERATIVE"
  | "CUSTOM";

/**
 * Training metrics snapshot for a model version.
 */
export interface ModelMetrics {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  loss?: number;
  mse?: number;
  mae?: number;
  auc?: number;
  latencyP50Ms?: number;
  latencyP99Ms?: number;
  throughputRPS?: number;
  modelSizeMB?: number;
  customMetrics?: Record<string, number>;
}

/**
 * Deployment configuration for a model version.
 */
export interface DeploymentConfig {
  endpoint: string;
  replicas: number;
  gpuType: string | null;
  maxBatchSize: number;
  timeoutMs: number;
  minInstances: number;
  maxInstances: number;
  autoscaleMetric: "cpu" | "gpu" | "rps" | "latency";
  autoscaleThreshold: number;
}

/**
 * Model Registry Entry — aggregate root for ML model lifecycle.
 *
 * Lifecycle:
 * ```
 * DEVELOPMENT → STAGING → PRODUCTION
 *      ↓            ↓          ↓
 *              ARCHIVED  ←────┘
 * ```
 *
 * @invariant Only one PRODUCTION version per model name
 * @invariant Promotion to PRODUCTION requires passing staging validation
 * @invariant ARCHIVED models cannot be promoted
 *
 * @example
 * ```ts
 * const model = new ModelRegistryEntity({
 *   id: "m-001",
 *   name: "anomaly-detector-v2",
 *   version: "2.1.0",
 *   type: "CLASSIFICATION",
 *   framework: "PyTorch",
 *   stage: ModelStage.DEVELOPMENT,
 *   metrics: { accuracy: 0.95, f1Score: 0.93 },
 *   createdBy: "data-science-team",
 * });
 *
 * model.promoteToStaging("reviewer-001");
 * // ... after validation ...
 * model.promoteToProduction("ml-ops-admin");
 * ```
 */
export class ModelRegistryEntity {
  public readonly id: string;
  /** Model family name (e.g., "anomaly-detector", "device-classifier") */
  public readonly name: string;
  /** Semantic version of this model */
  public readonly version: string;
  /** Description/notes */
  public description: string | null;
  /** Model type */
  public readonly type: ModelType;
  /** ML framework (PyTorch, TensorFlow, ONNX, etc.) */
  public readonly framework: string;
  /** Current lifecycle stage */
  private _stage: ModelStage;
  /** Training metrics */
  public metrics: ModelMetrics;
  /** Link to training job that produced this model */
  public trainingJobId: string | null;
  /** Link to dataset used for training */
  public datasetId: string | null;
  /** Dataset version */
  public datasetVersion: string | null;
  /** Hyperparameters used */
  public hyperparameters: Record<string, unknown>;
  /** Storage path for model artifacts */
  public artifactPath: string | null;
  /** Model file size in MB */
  public sizeMB: number | null;
  /** Deployment configuration (set when promoted to PRODUCTION) */
  private _deploymentConfig: DeploymentConfig | null;
  /** Who created this version */
  public readonly createdBy: string;
  /** Who promoted to staging */
  public stagingApprovedBy: string | null;
  /** Who promoted to production */
  public productionApprovedBy: string | null;
  /** Timestamps */
  public promotedToStagingAt: Date | null;
  public promotedToProductionAt: Date | null;
  public archivedAt: Date | null;
  /** SLA breach tracking */
  public slaBreaches: number;
  /** Domain events */
  private _events: Array<{ type: string; payload: Record<string, unknown> }> = [];

  constructor(params: {
    id: string;
    name: string;
    version: string;
    description?: string | null;
    type: ModelType;
    framework: string;
    stage?: ModelStage;
    metrics?: ModelMetrics;
    trainingJobId?: string | null;
    datasetId?: string | null;
    datasetVersion?: string | null;
    hyperparameters?: Record<string, unknown>;
    artifactPath?: string | null;
    sizeMB?: number | null;
    deploymentConfig?: DeploymentConfig | null;
    createdBy: string;
  }) {
    this.id = params.id;
    this.name = params.name;
    this.version = params.version;
    this.description = params.description || null;
    this.type = params.type;
    this.framework = params.framework;
    this._stage = params.stage || ModelStage.DEVELOPMENT;
    this.metrics = params.metrics || {};
    this.trainingJobId = params.trainingJobId || null;
    this.datasetId = params.datasetId || null;
    this.datasetVersion = params.datasetVersion || null;
    this.hyperparameters = params.hyperparameters || {};
    this.artifactPath = params.artifactPath || null;
    this.sizeMB = params.sizeMB || null;
    this._deploymentConfig = params.deploymentConfig || null;
    this.createdBy = params.createdBy;
    this.stagingApprovedBy = null;
    this.productionApprovedBy = null;
    this.promotedToStagingAt = null;
    this.promotedToProductionAt = null;
    this.archivedAt = null;
    this.slaBreaches = 0;
  }

  get stage(): ModelStage { return this._stage; }
  get deploymentConfig(): DeploymentConfig | null { return this._deploymentConfig; }
  get events() { return this._events; }

  // ── Promotion Lifecycle ────────────────────────────────────────────────────

  /**
   * Promotes from DEVELOPMENT → STAGING.
   * Requires minimum metrics thresholds.
   */
  promoteToStaging(approvedBy: string): void {
    if (this._stage !== ModelStage.DEVELOPMENT) {
      throw new Error(`Cannot promote to staging from ${this._stage}`);
    }

    // Validation: must have minimum metrics
    if (!this.metrics.accuracy && !this.metrics.f1Score && !this.metrics.loss) {
      throw new Error("Cannot promote to staging without training metrics (accuracy, f1Score, or loss)");
    }

    this._stage = ModelStage.STAGING;
    this.stagingApprovedBy = approvedBy;
    this.promotedToStagingAt = new Date();
    this._events.push({
      type: "ModelPromotedToStaging",
      payload: { modelId: this.id, name: this.name, version: this.version, approvedBy, metrics: this.metrics },
    });
  }

  /**
   * Promotes from STAGING → PRODUCTION.
   * Requires staging validation and deployment config.
   */
  promoteToProduction(approvedBy: string, deploymentConfig: DeploymentConfig): void {
    if (this._stage !== ModelStage.STAGING) {
      throw new Error(`Cannot promote to production from ${this._stage} (must be STAGING)`);
    }

    this._stage = ModelStage.PRODUCTION;
    this.productionApprovedBy = approvedBy;
    this.promotedToProductionAt = new Date();
    this._deploymentConfig = deploymentConfig;
    this._events.push({
      type: "ModelPromotedToProduction",
      payload: {
        modelId: this.id, name: this.name, version: this.version,
        approvedBy, endpoint: deploymentConfig.endpoint,
      },
    });
  }

  /**
   * Archives the model (removes from any active stage).
   * Can archive from any non-archived stage.
   */
  archive(reason: string, archivedBy: string): void {
    if (this._stage === ModelStage.ARCHIVED) {
      throw new Error("Model is already archived");
    }
    const previousStage = this._stage;
    this._stage = ModelStage.ARCHIVED;
    this.archivedAt = new Date();
    this._deploymentConfig = null;
    this._events.push({
      type: "ModelArchived",
      payload: { modelId: this.id, previousStage, reason, archivedBy },
    });
  }

  /**
   * Records an SLA breach (latency or availability violation).
   * After 3 breaches, triggers a review alert.
   */
  recordSLABreach(metric: string, actual: number, threshold: number): void {
    this.slaBreaches++;
    this._events.push({
      type: "InferenceSLABreach",
      payload: {
        modelId: this.id, metric, actual, threshold,
        totalBreaches: this.slaBreaches,
        requiresReview: this.slaBreaches >= 3,
      },
    });
  }

  /**
   * Updates metrics (e.g., after retraining or evaluation).
   */
  updateMetrics(newMetrics: Partial<ModelMetrics>): void {
    this.metrics = { ...this.metrics, ...newMetrics };
  }

  /**
   * Checks if this model meets minimum quality gates for promotion.
   */
  meetsQualityGate(requirements: {
    minAccuracy?: number;
    maxLatencyP99Ms?: number;
    minThroughputRPS?: number;
  }): { passes: boolean; failures: string[] } {
    const failures: string[] = [];

    if (requirements.minAccuracy && (this.metrics.accuracy || 0) < requirements.minAccuracy) {
      failures.push(`Accuracy ${this.metrics.accuracy || 0} < required ${requirements.minAccuracy}`);
    }
    if (requirements.maxLatencyP99Ms && (this.metrics.latencyP99Ms || Infinity) > requirements.maxLatencyP99Ms) {
      failures.push(`P99 latency ${this.metrics.latencyP99Ms}ms > max ${requirements.maxLatencyP99Ms}ms`);
    }
    if (requirements.minThroughputRPS && (this.metrics.throughputRPS || 0) < requirements.minThroughputRPS) {
      failures.push(`Throughput ${this.metrics.throughputRPS} RPS < required ${requirements.minThroughputRPS} RPS`);
    }

    return { passes: failures.length === 0, failures };
  }

  clearEvents(): void { this._events = []; }
}
