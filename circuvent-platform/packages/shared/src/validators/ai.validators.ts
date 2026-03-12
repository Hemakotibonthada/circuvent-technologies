// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Shared AI/ML Validators
// Validation schemas for compute resources, training jobs,
// model configs, and trading bot parameters.
// ──────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Resource Types ──

export const resourceTypeSchema = z.enum(["GPU", "CPU", "TPU"]);
export const resourceStatusSchema = z.enum(["AVAILABLE", "ALLOCATED", "MAINTENANCE", "OFFLINE"]);
export const allocationPurposeSchema = z.enum(["TRAINING", "INFERENCE", "TRADING_BOT", "RESEARCH", "FINE_TUNING"]);
export const jobStatusSchema = z.enum(["QUEUED", "PREPARING", "RUNNING", "PAUSED", "COMPLETED", "FAILED", "CANCELLED"]);
export const botStatusSchema = z.enum(["INACTIVE", "BACKTESTING", "PAPER_TRADING", "LIVE", "PAUSED", "ERROR", "DECOMMISSIONED"]);

// ── ML Framework ──

export const mlFrameworkSchema = z.enum(["PyTorch", "TensorFlow", "JAX", "ONNX", "scikit-learn", "XGBoost"]);

// ── Hyperparameters ──

export const hyperparametersSchema = z.object({
  learningRate: z.number().positive("Learning rate must be positive").max(10, "Learning rate too high").default(0.001),
  batchSize: z.number().int().positive().max(8192, "Batch size too large").default(32),
  epochs: z.number().int().positive().max(10000, "Max 10000 epochs").default(10),
  optimizer: z.enum(["SGD", "Adam", "AdamW", "RMSprop", "LAMB", "Adagrad", "Adadelta"]).default("Adam"),
  schedulerType: z.enum(["step", "cosine", "linear", "exponential", "warmup_cosine", "none"]).default("cosine"),
  warmupSteps: z.number().int().nonnegative().max(100000).default(0),
  weightDecay: z.number().nonnegative().max(1).default(0),
  gradientClipping: z.number().positive().max(100).optional(),
  dropoutRate: z.number().min(0).max(0.9).optional(),
  labelSmoothing: z.number().min(0).max(0.5).optional(),
  mixedPrecision: z.boolean().default(false),
  gradientAccumulationSteps: z.number().int().positive().max(64).default(1),
}).refine(
  (data) => {
    if (data.warmupSteps > 0 && data.schedulerType === "none") return false;
    return true;
  },
  { message: "Warmup steps require a scheduler", path: ["warmupSteps"] }
);

// ── Dataset Config ──

export const datasetConfigSchema = z.object({
  path: z.string().min(1, "Dataset path required"),
  trainSplit: z.number().min(0.1).max(0.95).default(0.8),
  validationSplit: z.number().min(0.01).max(0.5).default(0.1),
  testSplit: z.number().min(0.01).max(0.5).default(0.1),
  format: z.enum(["csv", "parquet", "json", "tfrecord", "hdf5", "custom"]).default("csv"),
  numSamples: z.number().int().positive().optional(),
  augmentations: z.array(z.string().max(50)).max(20).optional(),
  preprocessScript: z.string().max(500).optional(),
}).refine(
  (data) => {
    const total = data.trainSplit + data.validationSplit + data.testSplit;
    return Math.abs(total - 1.0) < 0.01;
  },
  { message: "Train + validation + test splits must sum to 1.0" }
);

// ── Resource Requirements ──

export const resourceRequirementsSchema = z.object({
  minVramGb: z.number().int().positive().max(640, "Max 640GB VRAM").default(8),
  preferredGpuModel: z.string().max(100).optional(),
  multiGpu: z.boolean().default(false),
  gpuCount: z.number().int().positive().max(8).default(1),
  estimatedTimeHours: z.number().positive().max(720, "Max 30 days").optional(),
}).refine(
  (data) => {
    if (data.multiGpu && data.gpuCount <= 1) return false;
    return true;
  },
  { message: "Multi-GPU requires gpuCount > 1", path: ["gpuCount"] }
);

// ── Checkpoint Config ──

export const checkpointConfigSchema = z.object({
  saveEveryNEpochs: z.number().int().positive().max(100).default(5),
  keepTopK: z.number().int().positive().max(20).default(3),
  metricToWatch: z.string().max(100).default("val_loss"),
  metricDirection: z.enum(["minimize", "maximize"]).default("minimize"),
  saveOptimizer: z.boolean().default(true),
});

// ── Trading Risk Limits ──

export const riskLimitsSchema = z.object({
  maxPositionSize: z.number().positive("Max position must be positive"),
  maxDailyLoss: z.number().positive("Max daily loss must be positive"),
  maxDrawdownPercent: z.number().min(0.1).max(50, "Drawdown max 50%"),
  stopLossPercent: z.number().min(0.01).max(20, "Stop loss max 20%"),
  takeProfitPercent: z.number().min(0.01).max(100, "Take profit max 100%"),
  maxOpenPositions: z.number().int().positive().max(100),
  maxLeverage: z.number().min(1).max(20).default(1),
  cooldownAfterLoss: z.number().int().nonnegative().max(1440, "Max 24 hours cooldown in minutes").default(0),
}).refine(
  (data) => data.maxDailyLoss < data.maxPositionSize,
  { message: "Daily loss limit should be less than max position size", path: ["maxDailyLoss"] }
);

// ── Trading Signal Config ──

export const signalConfigSchema = z.object({
  modelEndpoint: z.string().url("Invalid model endpoint URL").optional(),
  lookbackPeriod: z.number().int().positive().max(500).default(20),
  signalThreshold: z.number().min(0).max(1).default(0.5),
  rebalanceIntervalMinutes: z.number().int().positive().max(1440).default(60),
  indicators: z.array(z.string().max(50)).max(20).optional(),
  featureColumns: z.array(z.string().max(100)).max(50).optional(),
});

// ── Trading Execution Config ──

export const executionConfigSchema = z.object({
  mode: z.enum(["MARKET", "LIMIT", "TWAP", "VWAP", "ICEBERG"]).default("MARKET"),
  slippageTolerance: z.number().min(0).max(10, "Slippage max 10%").default(0.1),
  dryRun: z.boolean().default(true),
  broker: z.string().max(100).optional(),
  apiKeyRef: z.string().max(200).optional(),
  orderSize: z.enum(["FIXED", "PERCENT_EQUITY", "KELLY_CRITERION"]).default("FIXED"),
});

// ── Trade Data Schema ──

export const tradeDataSchema = z.object({
  symbol: z.string().min(1).max(20),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().positive(),
  price: z.number().positive(),
  pnl: z.number().optional(),
  fees: z.number().nonnegative().optional(),
  exchange: z.string().max(50).optional(),
  orderId: z.string().max(100).optional(),
  executionTime: z.string().datetime().optional(),
  slippage: z.number().optional(),
});

// ── Training Metrics Schema ──

export const trainingMetricsSchema = z.object({
  epoch: z.number().int().nonnegative(),
  step: z.number().int().nonnegative().optional(),
  trainLoss: z.number(),
  validationLoss: z.number().optional(),
  accuracy: z.number().min(0).max(1).optional(),
  f1Score: z.number().min(0).max(1).optional(),
  precision: z.number().min(0).max(1).optional(),
  recall: z.number().min(0).max(1).optional(),
  learningRate: z.number().positive(),
  throughputSamplesPerSec: z.number().positive().optional(),
  gpuMemoryUsedGb: z.number().nonnegative().optional(),
  elapsedSeconds: z.number().nonnegative(),
  customMetrics: z.record(z.number()).optional(),
});

// ── Search/Filter ──

export const aiResourceSearchSchema = z.object({
  type: resourceTypeSchema.optional(),
  status: resourceStatusSchema.optional(),
  minVramGb: z.coerce.number().int().nonnegative().optional(),
  location: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(["createdAt", "name", "resourceCode", "type", "costPerHourINR"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const trainingJobSearchSchema = z.object({
  status: jobStatusSchema.optional(),
  framework: mlFrameworkSchema.optional(),
  requestedById: z.string().cuid().optional(),
  modelName: z.string().max(200).optional(),
  minPriority: z.coerce.number().int().min(1).max(10).optional(),
  maxPriority: z.coerce.number().int().min(1).max(10).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const tradingBotSearchSchema = z.object({
  status: botStatusSchema.optional(),
  strategy: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
