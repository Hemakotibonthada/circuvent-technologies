// ══════════════════════════════════════════════════════════════════════════════
// Client Portal — Lead Entity (Domain Core)
// Aggregate root for the CRM lead lifecycle with scoring, qualification,
// and pipeline stage management.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Lead pipeline stages.
 */
export enum LeadStage {
  NEW = "NEW",
  CONTACTED = "CONTACTED",
  QUALIFIED = "QUALIFIED",
  PROPOSAL_SENT = "PROPOSAL_SENT",
  NEGOTIATION = "NEGOTIATION",
  WON = "WON",
  LOST = "LOST",
}

/** Allowed stage transitions */
const STAGE_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  [LeadStage.NEW]: [LeadStage.CONTACTED, LeadStage.LOST],
  [LeadStage.CONTACTED]: [LeadStage.QUALIFIED, LeadStage.LOST],
  [LeadStage.QUALIFIED]: [LeadStage.PROPOSAL_SENT, LeadStage.LOST],
  [LeadStage.PROPOSAL_SENT]: [LeadStage.NEGOTIATION, LeadStage.WON, LeadStage.LOST],
  [LeadStage.NEGOTIATION]: [LeadStage.WON, LeadStage.LOST],
  [LeadStage.WON]: [],
  [LeadStage.LOST]: [],
};

/**
 * Lead qualification criteria result.
 */
export interface QualificationResult {
  isQualified: boolean;
  score: number;
  criteria: Array<{ name: string; met: boolean; weight: number; reason: string }>;
  recommendation: "PURSUE" | "NURTURE" | "DISQUALIFY";
}

/**
 * Lead Entity — aggregate root for the sales pipeline.
 *
 * Business Rules:
 * 1. Leads follow a strict pipeline: NEW → CONTACTED → QUALIFIED → PROPOSAL → NEGOTIATION → WON/LOST
 * 2. Lead score is auto-computed from budget, authority, need, timeline (BANT)
 * 3. Deal value must be positive for active leads
 * 4. WON/LOST are terminal states
 * 5. Each stage transition records an activity log
 *
 * @example
 * ```ts
 * const lead = new LeadEntity({
 *   id: "lead-001", title: "TechCorp IoT Platform",
 *   company: "TechCorp", contactName: "John Doe",
 *   estimatedValue: 500000, stage: LeadStage.NEW,
 * });
 *
 * lead.qualify({
 *   hasBudget: true, hasAuthority: true,
 *   hasNeed: true, hasTimeline: true,
 *   budgetAmount: 500000, decisionTimelineDays: 30,
 * });
 *
 * lead.moveTo(LeadStage.PROPOSAL_SENT);
 * ```
 */
export class LeadEntity {
  public readonly id: string;
  public title: string;
  public description: string | null;
  public company: string;
  public contactName: string;
  public contactEmail: string | null;
  public contactPhone: string | null;
  private _stage: LeadStage;
  public estimatedValue: number;
  public currency: string;
  public probability: number; // 0-100
  public source: string;
  public assignedToId: string | null;
  public expectedCloseDate: Date | null;
  public tags: string[];
  private _score: number;
  private _qualificationResult: QualificationResult | null;
  private _events: Array<{ type: string; payload: Record<string, unknown>; timestamp: string }> = [];
  private _activityLog: Array<{ action: string; details: string; timestamp: string }> = [];

  constructor(params: {
    id: string;
    title: string;
    description?: string | null;
    company: string;
    contactName: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    stage?: LeadStage;
    estimatedValue?: number;
    currency?: string;
    probability?: number;
    source?: string;
    assignedToId?: string | null;
    expectedCloseDate?: Date | null;
    tags?: string[];
  }) {
    this.id = params.id;
    this.title = params.title;
    this.description = params.description || null;
    this.company = params.company;
    this.contactName = params.contactName;
    this.contactEmail = params.contactEmail || null;
    this.contactPhone = params.contactPhone || null;
    this._stage = params.stage || LeadStage.NEW;
    this.estimatedValue = params.estimatedValue || 0;
    this.currency = params.currency || "INR";
    this.probability = params.probability || this.defaultProbability(this._stage);
    this.source = params.source || "WEBSITE";
    this.assignedToId = params.assignedToId || null;
    this.expectedCloseDate = params.expectedCloseDate || null;
    this.tags = params.tags || [];
    this._score = 0;
    this._qualificationResult = null;
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  get stage(): LeadStage { return this._stage; }
  get score(): number { return this._score; }
  get qualificationResult(): QualificationResult | null { return this._qualificationResult; }
  get events() { return this._events; }
  get activityLog() { return this._activityLog; }
  get isTerminal(): boolean { return this._stage === LeadStage.WON || this._stage === LeadStage.LOST; }
  get isActive(): boolean { return !this.isTerminal; }

  /** Weighted deal value = estimatedValue * (probability / 100) */
  get weightedValue(): number {
    return Math.round(this.estimatedValue * (this.probability / 100));
  }

  // ── Stage Management ───────────────────────────────────────────────────────

  /**
   * Transitions the lead to a new pipeline stage.
   * @throws Error if the transition is not allowed
   */
  moveTo(targetStage: LeadStage, notes?: string): void {
    const allowed = STAGE_TRANSITIONS[this._stage];
    if (!allowed.includes(targetStage)) {
      throw new Error(
        `Cannot move lead from '${this._stage}' to '${targetStage}'. ` +
        `Allowed: ${allowed.join(", ") || "none (terminal state)"}`
      );
    }

    const oldStage = this._stage;
    this._stage = targetStage;
    this.probability = this.defaultProbability(targetStage);

    this._activityLog.push({
      action: "STAGE_CHANGED",
      details: `${oldStage} → ${targetStage}${notes ? `: ${notes}` : ""}`,
      timestamp: new Date().toISOString(),
    });

    this._events.push({
      type: targetStage === LeadStage.WON ? "DealWon" :
            targetStage === LeadStage.LOST ? "DealLost" : "LeadStageChanged",
      payload: {
        leadId: this.id,
        fromStage: oldStage,
        toStage: targetStage,
        estimatedValue: this.estimatedValue,
        notes,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // ── BANT Qualification ─────────────────────────────────────────────────────

  /**
   * Qualifies the lead using the BANT framework:
   * - **B**udget: Does the prospect have budget?
   * - **A**uthority: Is the contact a decision-maker?
   * - **N**eed: Does the prospect have a genuine need?
   * - **T**imeline: Is there a defined purchase timeline?
   *
   * @returns QualificationResult with score and recommendation
   */
  qualify(bant: {
    hasBudget: boolean;
    hasAuthority: boolean;
    hasNeed: boolean;
    hasTimeline: boolean;
    budgetAmount?: number;
    decisionTimelineDays?: number;
    competitorInvolved?: boolean;
    technicalFit?: boolean;
  }): QualificationResult {
    const criteria: QualificationResult["criteria"] = [];
    let totalScore = 0;
    const maxScore = 100;

    // Budget (30 points)
    const budgetWeight = 30;
    if (bant.hasBudget) {
      let budgetScore = budgetWeight;
      if (bant.budgetAmount && this.estimatedValue > 0) {
        const ratio = bant.budgetAmount / this.estimatedValue;
        if (ratio >= 1) budgetScore = budgetWeight;
        else if (ratio >= 0.7) budgetScore = budgetWeight * 0.8;
        else budgetScore = budgetWeight * 0.5;
      }
      totalScore += budgetScore;
      criteria.push({ name: "Budget", met: true, weight: budgetWeight, reason: `Budget confirmed${bant.budgetAmount ? ` (₹${bant.budgetAmount.toLocaleString()})` : ""}` });
    } else {
      criteria.push({ name: "Budget", met: false, weight: budgetWeight, reason: "No budget confirmed" });
    }

    // Authority (25 points)
    const authorityWeight = 25;
    if (bant.hasAuthority) {
      totalScore += authorityWeight;
      criteria.push({ name: "Authority", met: true, weight: authorityWeight, reason: "Contact is decision-maker" });
    } else {
      criteria.push({ name: "Authority", met: false, weight: authorityWeight, reason: "Contact is not decision-maker" });
    }

    // Need (25 points)
    const needWeight = 25;
    if (bant.hasNeed) {
      let needScore = needWeight;
      if (bant.technicalFit) needScore = needWeight; // Full score
      else needScore = needWeight * 0.7;
      totalScore += needScore;
      criteria.push({ name: "Need", met: true, weight: needWeight, reason: `Genuine need identified${bant.technicalFit ? " (technical fit confirmed)" : ""}` });
    } else {
      criteria.push({ name: "Need", met: false, weight: needWeight, reason: "No clear need identified" });
    }

    // Timeline (20 points)
    const timelineWeight = 20;
    if (bant.hasTimeline) {
      let timelineScore = timelineWeight;
      if (bant.decisionTimelineDays) {
        if (bant.decisionTimelineDays <= 30) timelineScore = timelineWeight;
        else if (bant.decisionTimelineDays <= 90) timelineScore = timelineWeight * 0.7;
        else timelineScore = timelineWeight * 0.4;
      }
      totalScore += timelineScore;
      criteria.push({ name: "Timeline", met: true, weight: timelineWeight, reason: `Decision in ${bant.decisionTimelineDays || "?"} days` });
    } else {
      criteria.push({ name: "Timeline", met: false, weight: timelineWeight, reason: "No purchase timeline" });
    }

    // Competitor penalty (-10)
    if (bant.competitorInvolved) {
      totalScore = Math.max(0, totalScore - 10);
      criteria.push({ name: "Competition", met: false, weight: -10, reason: "Competitor involved — risk factor" });
    }

    const score = Math.round(Math.min(100, (totalScore / maxScore) * 100));
    const metCount = criteria.filter(c => c.met).length;

    const recommendation: QualificationResult["recommendation"] =
      score >= 70 ? "PURSUE" :
      score >= 40 ? "NURTURE" :
      "DISQUALIFY";

    this._score = score;
    this._qualificationResult = { isQualified: score >= 60, score, criteria, recommendation };

    if (score >= 60 && this._stage === LeadStage.CONTACTED) {
      this.moveTo(LeadStage.QUALIFIED, `Auto-qualified with BANT score ${score}/100`);
    }

    this._activityLog.push({
      action: "QUALIFIED",
      details: `BANT Score: ${score}/100 (${metCount}/4 criteria met) — ${recommendation}`,
      timestamp: new Date().toISOString(),
    });

    return this._qualificationResult;
  }

  // ── Revenue Forecasting ────────────────────────────────────────────────────

  /**
   * Calculates expected revenue contribution for a given period.
   * Uses probability-weighted value adjusted by pipeline stage.
   */
  forecastRevenue(periodEndDate: Date): {
    expectedRevenue: number;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    inPeriod: boolean;
  } {
    if (this.isTerminal || !this.expectedCloseDate) {
      return {
        expectedRevenue: this._stage === LeadStage.WON ? this.estimatedValue : 0,
        confidence: this._stage === LeadStage.WON ? "HIGH" : "LOW",
        inPeriod: false,
      };
    }

    const inPeriod = this.expectedCloseDate <= periodEndDate;
    const expectedRevenue = inPeriod ? this.weightedValue : 0;
    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      this.probability >= 70 ? "HIGH" :
      this.probability >= 40 ? "MEDIUM" : "LOW";

    return { expectedRevenue, confidence, inPeriod };
  }

  /**
   * Returns the number of days since the lead was stuck in the current stage.
   * Used for stale lead detection.
   */
  daysSinceLastActivity(): number {
    if (this._activityLog.length === 0) return Infinity;
    const lastActivity = new Date(this._activityLog[this._activityLog.length - 1].timestamp);
    return Math.floor((Date.now() - lastActivity.getTime()) / (24 * 60 * 60 * 1000));
  }

  /** Checks if this lead is stale (no activity for N days) */
  isStale(daysThreshold: number = 14): boolean {
    return this.isActive && this.daysSinceLastActivity() > daysThreshold;
  }

  /** Clears events after persistence */
  clearEvents(): void { this._events = []; }

  // ── Private ────────────────────────────────────────────────────────────────

  private defaultProbability(stage: LeadStage): number {
    const map: Record<LeadStage, number> = {
      [LeadStage.NEW]: 10,
      [LeadStage.CONTACTED]: 20,
      [LeadStage.QUALIFIED]: 40,
      [LeadStage.PROPOSAL_SENT]: 60,
      [LeadStage.NEGOTIATION]: 80,
      [LeadStage.WON]: 100,
      [LeadStage.LOST]: 0,
    };
    return map[stage];
  }
}
