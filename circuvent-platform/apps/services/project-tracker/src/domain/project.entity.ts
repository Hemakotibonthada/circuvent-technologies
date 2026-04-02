// ──────────────────────────────────────────────────────────────
// Project Tracker — Domain Entity
// Encapsulates project business rules, validations, and
// state transitions independent of persistence layer.
// ──────────────────────────────────────────────────────────────

export type ProjectType = "SOFTWARE" | "HARDWARE" | "HYBRID";
export type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";

const VALID_STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  PLANNING: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["ON_HOLD", "COMPLETED", "ARCHIVED"],
  ON_HOLD: ["ACTIVE", "ARCHIVED"],
  COMPLETED: ["ARCHIVED"],
  ARCHIVED: [],
};

export interface ProjectProps {
  id: string;
  name: string;
  code: string;
  description?: string;
  type: ProjectType;
  status: ProjectStatus;
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  budgetCurrency: string;
  isRnD: boolean;
  rnDCategory?: string;
  memberCount: number;
  sprintCount: number;
  hardwareRevisionCount: number;
}

export class ProjectEntity {
  constructor(private props: ProjectProps) {}

  get id() { return this.props.id; }
  get name() { return this.props.name; }
  get code() { return this.props.code; }
  get type() { return this.props.type; }
  get status() { return this.props.status; }
  get isRnD() { return this.props.isRnD; }
  get budget() { return this.props.budget; }

  canTransitionTo(newStatus: ProjectStatus): boolean {
    return VALID_STATUS_TRANSITIONS[this.props.status].includes(newStatus);
  }

  transitionTo(newStatus: ProjectStatus): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new Error(
        `Invalid project status transition: ${this.props.status} → ${newStatus}. ` +
        `Allowed: ${VALID_STATUS_TRANSITIONS[this.props.status].join(", ") || "none"}`
      );
    }
    this.props.status = newStatus;
  }

  isOverBudget(currentSpend: number): boolean {
    if (!this.props.budget) return false;
    return currentSpend > this.props.budget;
  }

  getBudgetUtilization(currentSpend: number): number {
    if (!this.props.budget || this.props.budget === 0) return 0;
    return Math.round((currentSpend / this.props.budget) * 10000) / 100;
  }

  isOverdue(): boolean {
    if (!this.props.endDate) return false;
    return this.props.status === "ACTIVE" && new Date() > this.props.endDate;
  }

  getDurationDays(): number {
    if (!this.props.startDate) return 0;
    const end = this.props.endDate || new Date();
    return Math.floor((end.getTime() - this.props.startDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  canAddSprint(): boolean {
    return this.props.type !== "HARDWARE" && this.props.status === "ACTIVE";
  }

  canAddHardwareRevision(): boolean {
    return this.props.type !== "SOFTWARE" && ["PLANNING", "ACTIVE"].includes(this.props.status);
  }

  getHealthScore(): { score: number; factors: string[] } {
    let score = 100;
    const factors: string[] = [];

    if (this.isOverdue()) { score -= 30; factors.push("Project is overdue"); }
    if (this.props.status === "ON_HOLD") { score -= 20; factors.push("Project is on hold"); }
    if (this.props.sprintCount === 0 && this.props.type !== "HARDWARE") { score -= 15; factors.push("No sprints created"); }
    if (this.props.memberCount === 0) { score -= 25; factors.push("No team members assigned"); }
    if (!this.props.startDate) { score -= 10; factors.push("No start date set"); }

    return { score: Math.max(0, score), factors };
  }

  toSummary(): Record<string, unknown> {
    return {
      id: this.props.id,
      name: this.props.name,
      code: this.props.code,
      type: this.props.type,
      status: this.props.status,
      isRnD: this.props.isRnD,
      isOverdue: this.isOverdue(),
      durationDays: this.getDurationDays(),
      healthScore: this.getHealthScore().score,
    };
  }
}

// ── Sprint Domain ──

export type SprintStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export type TaskStatus = "BACKLOG" | "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "BLOCKED";

const SPRINT_TRANSITIONS: Record<SprintStatus, SprintStatus[]> = {
  PLANNED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export class SprintEntity {
  constructor(
    private id: string,
    private name: string,
    private status: SprintStatus,
    private startDate: Date,
    private endDate: Date,
    private tasks: { status: TaskStatus; storyPoints: number | null }[]
  ) {}

  canTransitionTo(newStatus: SprintStatus): boolean {
    return SPRINT_TRANSITIONS[this.status].includes(newStatus);
  }

  getVelocity(): number {
    return this.tasks
      .filter((t) => t.status === "DONE")
      .reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  }

  getCompletionPercentage(): number {
    if (this.tasks.length === 0) return 0;
    const done = this.tasks.filter((t) => t.status === "DONE").length;
    return Math.round((done / this.tasks.length) * 100);
  }

  getRemainingDays(): number {
    const now = new Date();
    if (now > this.endDate) return 0;
    return Math.ceil((this.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  getBlockedTasks(): number {
    return this.tasks.filter((t) => t.status === "BLOCKED").length;
  }

  getBurndownData(): { totalPoints: number; completedPoints: number; remainingPoints: number; blockedPoints: number } {
    const totalPoints = this.tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
    const completedPoints = this.tasks.filter((t) => t.status === "DONE").reduce((sum, t) => sum + (t.storyPoints || 0), 0);
    const blockedPoints = this.tasks.filter((t) => t.status === "BLOCKED").reduce((sum, t) => sum + (t.storyPoints || 0), 0);

    return {
      totalPoints,
      completedPoints,
      remainingPoints: totalPoints - completedPoints,
      blockedPoints,
    };
  }

  isAtRisk(): boolean {
    const remaining = this.getRemainingDays();
    const completion = this.getCompletionPercentage();
    const totalDays = Math.ceil((this.endDate.getTime() - this.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const expectedCompletion = totalDays > 0 ? ((totalDays - remaining) / totalDays) * 100 : 100;

    return completion < expectedCompletion - 20;
  }
}
