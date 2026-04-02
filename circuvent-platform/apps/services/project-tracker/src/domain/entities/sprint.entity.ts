// ══════════════════════════════════════════════════════════════════════════════
// Project Tracker — Sprint Entity (Domain Core)
// Agile sprint with velocity tracking, burndown calculation,
// and task state machine.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Sprint status lifecycle.
 */
export enum SprintStatus {
  PLANNING = "PLANNING",
  ACTIVE = "ACTIVE",
  REVIEW = "REVIEW",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

/**
 * Task status within a sprint.
 */
export enum TaskStatus {
  BACKLOG = "BACKLOG",
  TODO = "TODO",
  IN_PROGRESS = "IN_PROGRESS",
  IN_REVIEW = "IN_REVIEW",
  DONE = "DONE",
  BLOCKED = "BLOCKED",
}

/**
 * A task within a sprint.
 */
export interface SprintTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  storyPoints: number;
  assigneeId: string | null;
  type: "FEATURE" | "BUG" | "CHORE" | "SPIKE";
  createdAt: Date;
  completedAt: Date | null;
}

/**
 * Sprint aggregate with velocity tracking and burndown.
 *
 * @invariant Story points must be non-negative
 * @invariant Sprint dates: endDate >= startDate
 * @invariant Cannot add tasks to COMPLETED/CANCELLED sprints
 */
export class SprintEntity {
  public readonly id: string;
  public readonly sprintNumber: number;
  public name: string;
  public readonly projectId: string;
  private _status: SprintStatus;
  public startDate: Date;
  public endDate: Date;
  public goal: string | null;
  private _tasks: SprintTask[];
  private _events: Array<{ type: string; payload: Record<string, unknown> }> = [];

  constructor(params: {
    id: string;
    sprintNumber: number;
    name: string;
    projectId: string;
    status?: SprintStatus;
    startDate: Date;
    endDate: Date;
    goal?: string | null;
    tasks?: SprintTask[];
  }) {
    this.id = params.id;
    this.sprintNumber = params.sprintNumber;
    this.name = params.name;
    this.projectId = params.projectId;
    this._status = params.status || SprintStatus.PLANNING;
    this.startDate = params.startDate;
    this.endDate = params.endDate;
    this.goal = params.goal || null;
    this._tasks = params.tasks || [];

    if (this.endDate < this.startDate) {
      throw new Error("Sprint end date cannot be before start date");
    }
  }

  get status(): SprintStatus { return this._status; }
  get tasks(): ReadonlyArray<SprintTask> { return this._tasks; }
  get events() { return this._events; }

  // ── Velocity Metrics ──────────────────────────────────────────────────────

  /** Total story points planned for this sprint */
  get plannedPoints(): number {
    return this._tasks.reduce((sum, t) => sum + t.storyPoints, 0);
  }

  /** Story points completed (tasks with status DONE) */
  get completedPoints(): number {
    return this._tasks.filter(t => t.status === TaskStatus.DONE).reduce((sum, t) => sum + t.storyPoints, 0);
  }

  /** Remaining story points */
  get remainingPoints(): number {
    return this.plannedPoints - this.completedPoints;
  }

  /** Velocity = completed points / sprint duration in weeks */
  get velocity(): number {
    if (this._status !== SprintStatus.COMPLETED) return 0;
    const durationWeeks = (this.endDate.getTime() - this.startDate.getTime()) / (7 * 24 * 60 * 60 * 1000);
    return durationWeeks > 0 ? Number((this.completedPoints / durationWeeks).toFixed(1)) : 0;
  }

  /** Completion rate as percentage */
  get completionRate(): number {
    if (this.plannedPoints === 0) return 0;
    return Number(((this.completedPoints / this.plannedPoints) * 100).toFixed(1));
  }

  /** Sprint duration in days */
  get durationDays(): number {
    return Math.ceil((this.endDate.getTime() - this.startDate.getTime()) / (24 * 60 * 60 * 1000));
  }

  /** Days remaining until sprint end */
  get daysRemaining(): number {
    const now = new Date();
    if (now > this.endDate) return 0;
    return Math.ceil((this.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  }

  /**
   * Generates burndown chart data points.
   * Returns ideal vs actual burndown for each day.
   */
  getBurndownData(): Array<{ day: number; ideal: number; actual: number }> {
    const totalDays = this.durationDays;
    const pointsPerDay = this.plannedPoints / (totalDays || 1);

    const data: Array<{ day: number; ideal: number; actual: number }> = [];

    // Sort tasks by completion date
    const completedTasks = this._tasks
      .filter(t => t.completedAt && t.status === TaskStatus.DONE)
      .sort((a, b) => a.completedAt!.getTime() - b.completedAt!.getTime());

    let actualRemaining = this.plannedPoints;
    let taskIndex = 0;

    for (let day = 0; day <= totalDays; day++) {
      const dayDate = new Date(this.startDate.getTime() + day * 24 * 60 * 60 * 1000);

      // Count points completed by this day
      while (taskIndex < completedTasks.length && completedTasks[taskIndex].completedAt! <= dayDate) {
        actualRemaining -= completedTasks[taskIndex].storyPoints;
        taskIndex++;
      }

      data.push({
        day,
        ideal: Number((this.plannedPoints - pointsPerDay * day).toFixed(1)),
        actual: actualRemaining,
      });
    }

    return data;
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  /** Starts the sprint (PLANNING → ACTIVE) */
  start(): void {
    if (this._status !== SprintStatus.PLANNING) {
      throw new Error(`Cannot start sprint in ${this._status} status`);
    }
    if (this._tasks.length === 0) {
      throw new Error("Cannot start sprint with no tasks");
    }
    this._status = SprintStatus.ACTIVE;
    this._events.push({ type: "SprintStarted", payload: { sprintId: this.id, taskCount: this._tasks.length, totalPoints: this.plannedPoints } });
  }

  /** Completes the sprint (ACTIVE/REVIEW → COMPLETED) */
  complete(): void {
    if (this._status !== SprintStatus.ACTIVE && this._status !== SprintStatus.REVIEW) {
      throw new Error(`Cannot complete sprint in ${this._status} status`);
    }
    this._status = SprintStatus.COMPLETED;
    this._events.push({
      type: "SprintCompleted",
      payload: {
        sprintId: this.id,
        completedPoints: this.completedPoints,
        plannedPoints: this.plannedPoints,
        velocity: this.velocity,
        completionRate: this.completionRate,
      },
    });
  }

  /** Adds a task to the sprint */
  addTask(task: SprintTask): void {
    if (this._status === SprintStatus.COMPLETED || this._status === SprintStatus.CANCELLED) {
      throw new Error(`Cannot add tasks to ${this._status} sprint`);
    }
    this._tasks.push(task);
  }

  /** Transitions a task to a new status */
  moveTask(taskId: string, newStatus: TaskStatus): void {
    const task = this._tasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Task '${taskId}' not found in sprint`);

    const oldStatus = task.status;
    task.status = newStatus;

    if (newStatus === TaskStatus.DONE && !task.completedAt) {
      task.completedAt = new Date();
    }

    this._events.push({
      type: "TaskStatusChanged",
      payload: { taskId, fromStatus: oldStatus, toStatus: newStatus, sprintId: this.id },
    });
  }

  /** Task breakdown by status */
  getTaskBreakdown(): Record<string, { count: number; points: number }> {
    const breakdown: Record<string, { count: number; points: number }> = {};
    for (const task of this._tasks) {
      if (!breakdown[task.status]) breakdown[task.status] = { count: 0, points: 0 };
      breakdown[task.status].count++;
      breakdown[task.status].points += task.storyPoints;
    }
    return breakdown;
  }

  clearEvents(): void { this._events = []; }
}
