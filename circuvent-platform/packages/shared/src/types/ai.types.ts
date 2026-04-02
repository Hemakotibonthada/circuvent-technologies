// ──────────────────────────────────────────────────────────────
// Circuvent Platform — AI Orchestrator Domain Types
// GPU/CPU resource management, training jobs, trading bots.
// ──────────────────────────────────────────────────────────────

export type ResourceType = "GPU" | "CPU" | "TPU";
export type ResourceStatus = "AVAILABLE" | "ALLOCATED" | "MAINTENANCE" | "OFFLINE";
export type JobStatusType = "QUEUED" | "PREPARING" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED";
export type BotStatusType = "INACTIVE" | "BACKTESTING" | "PAPER_TRADING" | "LIVE" | "PAUSED" | "ERROR" | "DECOMMISSIONED";
export type AllocationPurpose = "TRAINING" | "INFERENCE" | "TRADING_BOT" | "RESEARCH" | "FINE_TUNING";

export interface ResourcePoolSummary {
  totalResources: number;
  available: number;
  allocated: number;
  maintenance: number;
  offline: number;
  totalVramGb: number;
  availableVramGb: number;
  utilizationPercent: number;
  totalCostPerHour: number;
  byType: { type: ResourceType; count: number; available: number }[];
}

export interface TrainingJobConfig {
  modelName: string;
  framework: "PyTorch" | "TensorFlow" | "JAX" | "ONNX";
  hyperparameters: {
    learningRate: number;
    batchSize: number;
    epochs: number;
    optimizer: string;
    schedulerType?: string;
    warmupSteps?: number;
    weightDecay?: number;
    gradientClipping?: number;
    dropoutRate?: number;
    [key: string]: unknown;
  };
  datasetConfig: {
    path: string;
    trainSplit: number;
    validationSplit: number;
    testSplit: number;
    augmentations?: string[];
  };
  resourceRequirements: {
    minVramGb: number;
    preferredGpuModel?: string;
    multiGpu: boolean;
    gpuCount?: number;
  };
  checkpointConfig: {
    saveEveryNEpochs: number;
    keepTopK: number;
    metricToWatch: string;
    metricDirection: "minimize" | "maximize";
  };
}

export interface TrainingMetrics {
  epoch: number;
  step: number;
  trainLoss: number;
  validationLoss?: number;
  accuracy?: number;
  f1Score?: number;
  precision?: number;
  recall?: number;
  learningRate: number;
  throughputSamplesPerSec?: number;
  gpuMemoryUsedGb?: number;
  elapsedSeconds: number;
  customMetrics?: Record<string, number>;
}

export interface TradingBotConfig {
  strategy: string;
  market: string;
  instruments: string[];
  riskLimits: {
    maxPositionSize: number;
    maxDailyLoss: number;
    maxDrawdownPercent: number;
    stopLossPercent: number;
    takeProfitPercent: number;
    maxOpenPositions: number;
  };
  signalConfig: {
    modelEndpoint?: string;
    lookbackPeriod: number;
    signalThreshold: number;
    rebalanceIntervalMinutes: number;
  };
  executionConfig: {
    mode: "MARKET" | "LIMIT" | "TWAP";
    slippageTolerance: number;
    dryRun: boolean;
  };
}

export interface BotPerformance {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  averageTradeSize: number;
  averageHoldingPeriodMinutes: number;
  profitFactor: number;
  lastUpdated: string;
}

export interface ResourceScheduleRequest {
  purpose: AllocationPurpose;
  requiredVramGb?: number;
  preferredResourceType: ResourceType;
  estimatedHours: number;
  priority: number; // 1-10
  requestedById: string;
  jobId?: string;
}

export interface SchedulerDecision {
  allocated: boolean;
  resourceId?: string;
  reason: string;
  estimatedWaitMinutes?: number;
  alternativeResources?: string[];
}
