// ══════════════════════════════════════════════════════════════════════════════
// ATS Engine — Hiring Stage Value Object
// State machine for the application lifecycle with validation of allowed
// transitions and stage metadata.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * All possible hiring stages in order.
 */
export const HIRING_STAGES = [
  "APPLIED",
  "SCREENING",
  "SHORTLISTED",
  "TECHNICAL_ROUND",
  "HR_ROUND",
  "FINAL_ROUND",
  "OFFER_EXTENDED",
  "OFFER_ACCEPTED",
  "OFFER_DECLINED",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
  "ON_HOLD",
] as const;

export type HiringStage = (typeof HIRING_STAGES)[number];

/**
 * Allowed stage transitions. Maps each stage to a list of valid next stages.
 *
 * ```
 * APPLIED → SCREENING → SHORTLISTED → TECHNICAL → HR → FINAL → OFFER
 *    ↓          ↓           ↓            ↓         ↓       ↓       ↓
 * REJECTED  REJECTED   REJECTED     REJECTED  REJECTED REJECTED  ACCEPTED/DECLINED
 *    ↓          ↓           ↓            ↓         ↓       ↓       ↓
 * WITHDRAWN WITHDRAWN  WITHDRAWN    WITHDRAWN WITHDRAWN WITHDRAWN  HIRED
 *                                                                    ↓
 *                                                               ON_HOLD (any)
 * ```
 */
const TRANSITIONS: Record<HiringStage, HiringStage[]> = {
  APPLIED: ["SCREENING", "REJECTED", "WITHDRAWN"],
  SCREENING: ["SHORTLISTED", "REJECTED", "WITHDRAWN", "ON_HOLD"],
  SHORTLISTED: ["TECHNICAL_ROUND", "REJECTED", "WITHDRAWN", "ON_HOLD"],
  TECHNICAL_ROUND: ["HR_ROUND", "REJECTED", "WITHDRAWN", "ON_HOLD"],
  HR_ROUND: ["FINAL_ROUND", "OFFER_EXTENDED", "REJECTED", "WITHDRAWN", "ON_HOLD"],
  FINAL_ROUND: ["OFFER_EXTENDED", "REJECTED", "WITHDRAWN", "ON_HOLD"],
  OFFER_EXTENDED: ["OFFER_ACCEPTED", "OFFER_DECLINED", "WITHDRAWN", "ON_HOLD"],
  OFFER_ACCEPTED: ["HIRED", "WITHDRAWN"],
  OFFER_DECLINED: [],
  HIRED: [],
  REJECTED: [],
  WITHDRAWN: [],
  ON_HOLD: ["SCREENING", "SHORTLISTED", "TECHNICAL_ROUND", "HR_ROUND", "FINAL_ROUND", "REJECTED", "WITHDRAWN"],
};

/** Stage metadata for UI rendering */
const STAGE_META: Record<HiringStage, { label: string; color: string; icon: string; isTerminal: boolean }> = {
  APPLIED: { label: "Applied", color: "blue", icon: "📩", isTerminal: false },
  SCREENING: { label: "Screening", color: "cyan", icon: "🔍", isTerminal: false },
  SHORTLISTED: { label: "Shortlisted", color: "emerald", icon: "✅", isTerminal: false },
  TECHNICAL_ROUND: { label: "Technical Round", color: "purple", icon: "💻", isTerminal: false },
  HR_ROUND: { label: "HR Round", color: "pink", icon: "🤝", isTerminal: false },
  FINAL_ROUND: { label: "Final Round", color: "amber", icon: "🏆", isTerminal: false },
  OFFER_EXTENDED: { label: "Offer Extended", color: "orange", icon: "📄", isTerminal: false },
  OFFER_ACCEPTED: { label: "Offer Accepted", color: "emerald", icon: "🎉", isTerminal: false },
  OFFER_DECLINED: { label: "Offer Declined", color: "red", icon: "❌", isTerminal: true },
  HIRED: { label: "Hired", color: "emerald", icon: "🎊", isTerminal: true },
  REJECTED: { label: "Rejected", color: "red", icon: "🚫", isTerminal: true },
  WITHDRAWN: { label: "Withdrawn", color: "slate", icon: "↩️", isTerminal: true },
  ON_HOLD: { label: "On Hold", color: "amber", icon: "⏸️", isTerminal: false },
};

/**
 * Hiring Stage value object with state machine validation.
 *
 * @example
 * ```ts
 * const stage = HiringStageVO.of("APPLIED");
 * const next = stage.transitionTo("SCREENING"); // OK
 * stage.transitionTo("HIRED"); // throws — not allowed
 * ```
 */
export class HiringStageVO {
  private constructor(public readonly value: HiringStage) {}

  static of(stage: string): HiringStageVO {
    if (!HIRING_STAGES.includes(stage as HiringStage)) {
      throw new Error(`Invalid hiring stage: '${stage}'`);
    }
    return new HiringStageVO(stage as HiringStage);
  }

  /** Returns the label, color, icon for this stage */
  get meta() { return STAGE_META[this.value]; }

  /** Whether this is a terminal (final) state */
  get isTerminal(): boolean { return STAGE_META[this.value].isTerminal; }

  /** Whether this is an active (non-terminal) state */
  get isActive(): boolean { return !this.isTerminal; }

  /** Returns allowed next stages */
  get allowedTransitions(): HiringStage[] { return TRANSITIONS[this.value]; }

  /** Checks if transitioning to `target` is allowed */
  canTransitionTo(target: HiringStage): boolean {
    return TRANSITIONS[this.value].includes(target);
  }

  /** Creates a new HiringStageVO after validation */
  transitionTo(target: string): HiringStageVO {
    const targetStage = target as HiringStage;
    if (!this.canTransitionTo(targetStage)) {
      throw new Error(
        `Cannot transition from '${this.value}' to '${target}'. ` +
        `Allowed: ${this.allowedTransitions.join(", ")}`
      );
    }
    return HiringStageVO.of(targetStage);
  }

  /** Returns the progress percentage (0-100) through the pipeline */
  get progressPercent(): number {
    const pipeline: HiringStage[] = ["APPLIED", "SCREENING", "SHORTLISTED", "TECHNICAL_ROUND", "HR_ROUND", "FINAL_ROUND", "OFFER_EXTENDED", "OFFER_ACCEPTED", "HIRED"];
    const idx = pipeline.indexOf(this.value);
    if (idx === -1) return 0; // REJECTED/WITHDRAWN/ON_HOLD
    return Math.round((idx / (pipeline.length - 1)) * 100);
  }

  equals(other: HiringStageVO): boolean { return this.value === other.value; }
  toString(): string { return this.value; }
  toJSON(): string { return this.value; }
}
