// ──────────────────────────────────────────────────────────────
// AI Orchestrator — Zod Validation Schemas
// ──────────────────────────────────────────────────────────────

import { z } from "zod";

export const createResourceSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  type: z.enum(["GPU", "CPU", "TPU"]),
  model: z.string().max(200).optional(),
  vramGb: z.number().int().positive().optional(),
  coresCount: z.number().int().positive().optional(),
  memoryGb: z.number().int().positive().optional(),
  location: z.string().max(200).optional(),
  powerWatts: z.number().int().positive().optional(),
  costPerHourINR: z.number().nonnegative().optional(),
  metadata: z.record(z.any()).optional(),
});

export const updateResourceStatusSchema = z.object({
  status: z.enum(["AVAILABLE", "ALLOCATED", "MAINTENANCE", "OFFLINE"]),
});

export const allocateResourceSchema = z.object({
  resourceId: z.string().cuid(),
  purpose: z.enum(["TRAINING", "INFERENCE", "TRADING_BOT", "RESEARCH", "FINE_TUNING"]),
  priority: z.number().int().min(1).max(10).default(5),
  estimatedHours: z.number().positive().optional(),
});

export const submitTrainingJobSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  modelName: z.string().min(1).max(200),
  framework: z.enum(["PyTorch", "TensorFlow", "JAX", "ONNX"]),
  resourceId: z.string().cuid().optional(),
  priority: z.number().int().min(1).max(10).default(5),
  datasetPath: z.string().optional(),
  configJson: z.object({
    learningRate: z.number().positive().default(0.001),
    batchSize: z.number().int().positive().default(32),
    epochs: z.number().int().positive().default(10),
    optimizer: z.string().default("Adam"),
    schedulerType: z.string().optional(),
    warmupSteps: z.number().int().nonnegative().optional(),
    weightDecay: z.number().nonnegative().optional(),
    gradientClipping: z.number().positive().optional(),
    dropoutRate: z.number().min(0).max(1).optional(),
  }).optional(),
  epochsTotal: z.number().int().positive().optional(),
  outputPath: z.string().optional(),
});

export const updateJobStatusSchema = z.object({
  status: z.enum(["QUEUED", "PREPARING", "RUNNING", "PAUSED", "COMPLETED", "FAILED", "CANCELLED"]),
  metricsJson: z.record(z.any()).optional(),
  epochsCompleted: z.number().int().nonnegative().optional(),
  errorLog: z.string().optional(),
});

export const createTradingBotSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  strategy: z.string().min(1).max(100),
  modelId: z.string().optional(),
  configJson: z.object({
    market: z.string().default("NSE"),
    instruments: z.array(z.string()).min(1),
    riskLimits: z.object({
      maxPositionSize: z.number().positive(),
      maxDailyLoss: z.number().positive(),
      maxDrawdownPercent: z.number().min(0).max(100),
      stopLossPercent: z.number().min(0).max(100),
      takeProfitPercent: z.number().min(0).max(100),
      maxOpenPositions: z.number().int().positive(),
    }),
    signalConfig: z.object({
      lookbackPeriod: z.number().int().positive().default(20),
      signalThreshold: z.number().min(0).max(1).default(0.5),
      rebalanceIntervalMinutes: z.number().int().positive().default(60),
    }).optional(),
    executionConfig: z.object({
      mode: z.enum(["MARKET", "LIMIT", "TWAP"]).default("MARKET"),
      slippageTolerance: z.number().min(0).max(10).default(0.1),
      dryRun: z.boolean().default(true),
    }).optional(),
  }),
});

export const updateBotStatusSchema = z.object({
  status: z.enum(["INACTIVE", "BACKTESTING", "PAPER_TRADING", "LIVE", "PAUSED", "ERROR", "DECOMMISSIONED"]),
});

export const logBotTradeSchema = z.object({
  logLevel: z.enum(["INFO", "WARN", "ERROR", "TRADE"]).default("INFO"),
  message: z.string().min(1).max(2000),
  tradeData: z.object({
    symbol: z.string(),
    side: z.enum(["BUY", "SELL"]),
    quantity: z.number().positive(),
    price: z.number().positive(),
    pnl: z.number().optional(),
    fees: z.number().nonnegative().optional(),
  }).optional(),
});
