// ──────────────────────────────────────────────────────────────
// AI Orchestrator — Domain Entities
// GPU resource pool logic, training job state machine, and
// trading bot risk validation.
// ──────────────────────────────────────────────────────────────

// ═══ Compute Resource ═══

export type ResourceType = "GPU" | "CPU" | "TPU";
export type ResourceStatus = "AVAILABLE" | "ALLOCATED" | "MAINTENANCE" | "OFFLINE";

const RESOURCE_TRANSITIONS: Record<ResourceStatus, ResourceStatus[]> = {
  AVAILABLE: ["ALLOCATED", "MAINTENANCE", "OFFLINE"],
  ALLOCATED: ["AVAILABLE", "MAINTENANCE"],
  MAINTENANCE: ["AVAILABLE", "OFFLINE"],
  OFFLINE: ["AVAILABLE", "MAINTENANCE"],
};

export class ComputeResourceEntity {
  constructor(
    public readonly id: string,
    public readonly resourceCode: string,
    public readonly type: ResourceType,
    private _status: ResourceStatus,
    public readonly vramGb: number | null,
    public readonly costPerHourINR: number | null,
  ) {}

  get status() { return this._status; }

  canTransitionTo(newStatus: ResourceStatus): boolean {
    return RESOURCE_TRANSITIONS[this._status].includes(newStatus);
  }

  transitionTo(newStatus: ResourceStatus): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new Error(`Cannot transition resource from ${this._status} to ${newStatus}`);
    }
    this._status = newStatus;
  }

  isAvailable(): boolean { return this._status === "AVAILABLE"; }

  meetsVramRequirement(requiredGb: number): boolean {
    return this.vramGb !== null && this.vramGb >= requiredGb;
  }

  estimateCost(hours: number): number {
    return this.costPerHourINR ? Math.round(this.costPerHourINR * hours) : 0;
  }
}

// ═══ Training Job ═══

export type JobStatus = "QUEUED" | "PREPARING" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED";

const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  QUEUED: ["PREPARING", "CANCELLED"],
  PREPARING: ["RUNNING", "FAILED", "CANCELLED"],
  RUNNING: ["PAUSED", "COMPLETED", "FAILED", "CANCELLED"],
  PAUSED: ["RUNNING", "CANCELLED"],
  COMPLETED: [],
  FAILED: ["QUEUED"], // Allow retry
  CANCELLED: [],
};

export class TrainingJobEntity {
  constructor(
    public readonly id: string,
    public readonly jobCode: string,
    private _status: JobStatus,
    public readonly modelName: string,
    public readonly framework: string,
    public readonly epochsTotal: number | null,
    private _epochsCompleted: number,
    private _resourceId: string | null,
  ) {}

  get status() { return this._status; }
  get epochsCompleted() { return this._epochsCompleted; }

  canTransitionTo(newStatus: JobStatus): boolean {
    return JOB_TRANSITIONS[this._status].includes(newStatus);
  }

  transitionTo(newStatus: JobStatus): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new Error(`Cannot transition job ${this.jobCode} from ${this._status} to ${newStatus}`);
    }
    this._status = newStatus;
  }

  getProgressPercent(): number {
    if (!this.epochsTotal || this.epochsTotal === 0) return 0;
    return Math.round((this._epochsCompleted / this.epochsTotal) * 100);
  }

  isTerminal(): boolean {
    return ["COMPLETED", "FAILED", "CANCELLED"].includes(this._status);
  }

  needsResource(): boolean {
    return !this._resourceId && ["QUEUED", "PREPARING"].includes(this._status);
  }

  canCancel(): boolean {
    return ["QUEUED", "PREPARING", "RUNNING", "PAUSED"].includes(this._status);
  }

  estimateRemainingMinutes(avgMinutesPerEpoch: number): number {
    if (!this.epochsTotal) return 0;
    const remaining = this.epochsTotal - this._epochsCompleted;
    return Math.round(remaining * avgMinutesPerEpoch);
  }
}

// ═══ Trading Bot ═══

export type BotStatus = "INACTIVE" | "BACKTESTING" | "PAPER_TRADING" | "LIVE" | "PAUSED" | "ERROR" | "DECOMMISSIONED";

const BOT_TRANSITIONS: Record<BotStatus, BotStatus[]> = {
  INACTIVE: ["BACKTESTING", "PAPER_TRADING", "DECOMMISSIONED"],
  BACKTESTING: ["INACTIVE", "PAPER_TRADING", "PAUSED", "ERROR"],
  PAPER_TRADING: ["INACTIVE", "LIVE", "PAUSED", "ERROR"],
  LIVE: ["PAUSED", "ERROR", "INACTIVE"],
  PAUSED: ["LIVE", "PAPER_TRADING", "BACKTESTING", "INACTIVE"],
  ERROR: ["INACTIVE", "PAUSED"],
  DECOMMISSIONED: [],
};

export interface RiskLimits {
  maxPositionSize: number;
  maxDailyLoss: number;
  maxDrawdownPercent: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxOpenPositions: number;
}

export class TradingBotEntity {
  constructor(
    public readonly id: string,
    public readonly botCode: string,
    private _status: BotStatus,
    public readonly strategy: string,
    private riskLimits: RiskLimits,
  ) {}

  get status() { return this._status; }

  canTransitionTo(newStatus: BotStatus): boolean {
    return BOT_TRANSITIONS[this._status].includes(newStatus);
  }

  transitionTo(newStatus: BotStatus): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new Error(`Invalid bot transition: ${this._status} → ${newStatus}`);
    }
    this._status = newStatus;
  }

  validateTradeRisk(trade: { size: number; currentDailyLoss: number; openPositions: number }): {
    allowed: boolean;
    violations: string[];
  } {
    const violations: string[] = [];

    if (trade.size > this.riskLimits.maxPositionSize) {
      violations.push(`Position size ${trade.size} exceeds limit ${this.riskLimits.maxPositionSize}`);
    }
    if (trade.currentDailyLoss >= this.riskLimits.maxDailyLoss) {
      violations.push(`Daily loss limit reached: ${trade.currentDailyLoss} >= ${this.riskLimits.maxDailyLoss}`);
    }
    if (trade.openPositions >= this.riskLimits.maxOpenPositions) {
      violations.push(`Max open positions reached: ${trade.openPositions} >= ${this.riskLimits.maxOpenPositions}`);
    }

    return { allowed: violations.length === 0, violations };
  }

  isLive(): boolean { return this._status === "LIVE"; }
  isActive(): boolean { return ["LIVE", "PAPER_TRADING", "BACKTESTING"].includes(this._status); }

  canGoLive(): boolean {
    return this._status === "PAPER_TRADING" || this._status === "PAUSED";
  }
}
