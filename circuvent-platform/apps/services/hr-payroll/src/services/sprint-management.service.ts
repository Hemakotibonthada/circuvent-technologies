// ──────────────────────────────────────────────────────────────
// HR Payroll — Sprint Management Service
// Sprint lifecycle: create, start, complete, burndown,
// velocity tracking, backlog, planning, reports.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface Sprint {
  id: string;
  boardId: string;
  name: string;
  goal: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startDate: string;
  endDate: string;
  taskIds: string[];
  velocity: number | null;
  scopeChanges: ScopeChange[];
  createdAt: string;
  createdBy: string;
}

interface ScopeChange {
  taskId: string;
  action: "added" | "removed";
  changedAt: string;
  changedBy: string;
}

interface BurndownEntry {
  date: string;
  remainingPoints: number;
  idealRemaining: number;
  completedPoints: number;
}

interface VelocityEntry {
  sprintId: string;
  sprintName: string;
  completedPoints: number;
  committedPoints: number;
  completionRate: number;
}

interface SprintReport {
  sprint: Sprint;
  completedTasks: any[];
  remainingTasks: any[];
  scopeChanges: ScopeChange[];
  totalCommitted: number;
  totalCompleted: number;
  completionRate: number;
  avgCycleTimeDays: number;
}

// ══════════════════════════════════════════════════════════════
// Helper
// ══════════════════════════════════════════════════════════════

function generateId(): string {
  return `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ══════════════════════════════════════════════════════════════
// SprintManagementService
// ══════════════════════════════════════════════════════════════

export class SprintManagementService {
  // ── Sprint CRUD ───────────────────────────────────────────

  async createSprint(
    boardId: string,
    name: string,
    goal: string,
    startDate: string,
    endDate: string,
    createdBy: string,
  ): Promise<Sprint> {
    const doc = await prisma.generatedDocument.create({
      data: {
        name,
        category: "KANBAN_SPRINT",
        entityType: "WS_SPRINT",
        entityId: boardId,
        generatedBy: createdBy,
        format: "JSON",
        data: {
          boardId,
          goal,
          status: "PLANNED",
          startDate,
          endDate,
          taskIds: [],
          velocity: null,
          scopeChanges: [],
          dailySnapshots: [],
        },
      },
    });

    return {
      id: doc.id,
      boardId,
      name: doc.name,
      goal,
      status: "PLANNED",
      startDate,
      endDate,
      taskIds: [],
      velocity: null,
      scopeChanges: [],
      createdAt: doc.createdAt.toISOString(),
      createdBy,
    };
  }

  async startSprint(sprintId: string): Promise<Sprint | null> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: sprintId, category: "KANBAN_SPRINT" },
    });
    if (!doc || !doc.data) return null;

    const data = doc.data as Record<string, any>;

    // Check if there's already an active sprint on this board
    const activeSprints = await prisma.generatedDocument.findMany({
      where: {
        category: "KANBAN_SPRINT",
        entityId: data.boardId,
      },
    });

    for (const s of activeSprints) {
      const sd = s.data as Record<string, any>;
      if (sd.status === "ACTIVE" && s.id !== sprintId) {
        throw new Error("Another sprint is already active on this board");
      }
    }

    data.status = "ACTIVE";
    data.startDate = new Date().toISOString();

    // Take initial snapshot
    const taskIds = (data.taskIds ?? []) as string[];
    let totalPoints = 0;
    for (const taskId of taskIds) {
      const task = await prisma.generatedDocument.findFirst({
        where: { id: taskId, category: "KANBAN_TASK" },
      });
      if (task?.data) {
        const td = task.data as Record<string, any>;
        totalPoints += td.storyPoints ?? 0;
      }
    }

    data.committedPoints = totalPoints;
    data.dailySnapshots = [
      {
        date: new Date().toISOString().split("T")[0],
        remainingPoints: totalPoints,
        completedPoints: 0,
      },
    ];

    await prisma.generatedDocument.update({
      where: { id: sprintId },
      data: { data },
    });

    return this.docToSprint(doc, data);
  }

  async completeSprint(
    sprintId: string,
    moveUnfinishedTo: string | null,
  ): Promise<{ completed: string[]; moved: string[] }> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: sprintId, category: "KANBAN_SPRINT" },
    });
    if (!doc || !doc.data) throw new Error("Sprint not found");

    const data = doc.data as Record<string, any>;
    const taskIds = (data.taskIds ?? []) as string[];

    const completed: string[] = [];
    const moved: string[] = [];
    let completedPoints = 0;

    for (const taskId of taskIds) {
      const task = await prisma.generatedDocument.findFirst({
        where: { id: taskId, category: "KANBAN_TASK" },
      });
      if (!task?.data) continue;
      const td = task.data as Record<string, any>;

      if (td.status === "DONE") {
        completed.push(taskId);
        completedPoints += td.storyPoints ?? 0;
      } else {
        moved.push(taskId);
        // Clear sprint reference from unfinished tasks
        td.sprintId = moveUnfinishedTo ?? null;
        await prisma.generatedDocument.update({
          where: { id: taskId },
          data: { data: td },
        });

        // Add to next sprint if specified
        if (moveUnfinishedTo) {
          await this.addTaskToSprint(moveUnfinishedTo, taskId);
        }
      }
    }

    data.status = "COMPLETED";
    data.velocity = completedPoints;
    data.completedAt = new Date().toISOString();

    await prisma.generatedDocument.update({
      where: { id: sprintId },
      data: { data },
    });

    return { completed, moved };
  }

  // ── Sprint Task Management ─────────────────────────────────

  async addTaskToSprint(sprintId: string, taskId: string): Promise<boolean> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: sprintId, category: "KANBAN_SPRINT" },
    });
    if (!doc || !doc.data) return false;

    const data = doc.data as Record<string, any>;
    const taskIds = (data.taskIds ?? []) as string[];

    if (taskIds.includes(taskId)) return true;
    taskIds.push(taskId);
    data.taskIds = taskIds;

    // Record scope change
    const scopeChanges = (data.scopeChanges ?? []) as ScopeChange[];
    scopeChanges.push({
      taskId,
      action: "added",
      changedAt: new Date().toISOString(),
      changedBy: "system",
    });
    data.scopeChanges = scopeChanges;

    await prisma.generatedDocument.update({
      where: { id: sprintId },
      data: { data },
    });

    // Update task with sprint reference
    const task = await prisma.generatedDocument.findFirst({
      where: { id: taskId, category: "KANBAN_TASK" },
    });
    if (task?.data) {
      const td = task.data as Record<string, any>;
      td.sprintId = sprintId;
      await prisma.generatedDocument.update({
        where: { id: taskId },
        data: { data: td },
      });
    }

    return true;
  }

  async removeTaskFromSprint(sprintId: string, taskId: string): Promise<boolean> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: sprintId, category: "KANBAN_SPRINT" },
    });
    if (!doc || !doc.data) return false;

    const data = doc.data as Record<string, any>;
    const taskIds = (data.taskIds ?? []) as string[];
    const index = taskIds.indexOf(taskId);
    if (index === -1) return false;

    taskIds.splice(index, 1);
    data.taskIds = taskIds;

    const scopeChanges = (data.scopeChanges ?? []) as ScopeChange[];
    scopeChanges.push({
      taskId,
      action: "removed",
      changedAt: new Date().toISOString(),
      changedBy: "system",
    });
    data.scopeChanges = scopeChanges;

    await prisma.generatedDocument.update({
      where: { id: sprintId },
      data: { data },
    });

    // Clear sprint reference from task
    const task = await prisma.generatedDocument.findFirst({
      where: { id: taskId, category: "KANBAN_TASK" },
    });
    if (task?.data) {
      const td = task.data as Record<string, any>;
      td.sprintId = null;
      await prisma.generatedDocument.update({
        where: { id: taskId },
        data: { data: td },
      });
    }

    return true;
  }

  // ── Burndown ──────────────────────────────────────────────

  async getSprintBurndown(sprintId: string): Promise<BurndownEntry[]> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: sprintId, category: "KANBAN_SPRINT" },
    });
    if (!doc || !doc.data) return [];

    const data = doc.data as Record<string, any>;
    const taskIds = (data.taskIds ?? []) as string[];
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    const totalDays = daysBetween(startDate, endDate);

    // Get committed points
    let totalPoints = data.committedPoints ?? 0;
    if (!totalPoints) {
      for (const taskId of taskIds) {
        const task = await prisma.generatedDocument.findFirst({
          where: { id: taskId, category: "KANBAN_TASK" },
        });
        if (task?.data) {
          totalPoints += (task.data as Record<string, any>).storyPoints ?? 0;
        }
      }
    }

    // Build daily burndown
    const entries: BurndownEntry[] = [];
    const today = new Date();
    const dayMs = 24 * 60 * 60 * 1000;

    for (let i = 0; i <= totalDays; i++) {
      const date = new Date(startDate.getTime() + i * dayMs);
      if (date > today) break;

      const dateStr = date.toISOString().split("T")[0];
      const idealRemaining = totalPoints - (totalPoints / totalDays) * i;

      // Calculate completed points as of this date
      let completedPoints = 0;
      for (const taskId of taskIds) {
        const task = await prisma.generatedDocument.findFirst({
          where: { id: taskId, category: "KANBAN_TASK" },
        });
        if (task?.data) {
          const td = task.data as Record<string, any>;
          if (td.status === "DONE" && td.completedAt) {
            const completedDate = new Date(td.completedAt);
            if (completedDate <= date) {
              completedPoints += td.storyPoints ?? 0;
            }
          }
        }
      }

      entries.push({
        date: dateStr,
        remainingPoints: totalPoints - completedPoints,
        idealRemaining: Math.max(0, Math.round(idealRemaining * 100) / 100),
        completedPoints,
      });
    }

    return entries;
  }

  // ── Velocity ──────────────────────────────────────────────

  async getSprintVelocity(boardId: string): Promise<VelocityEntry[]> {
    const sprints = await prisma.generatedDocument.findMany({
      where: {
        category: "KANBAN_SPRINT",
        entityId: boardId,
      },
      orderBy: { createdAt: "asc" },
    });

    const entries: VelocityEntry[] = [];

    for (const s of sprints) {
      const sd = s.data as Record<string, any>;
      if (sd.status !== "COMPLETED") continue;

      const committedPoints = sd.committedPoints ?? 0;
      const completedPoints = sd.velocity ?? 0;
      const completionRate = committedPoints > 0 ? (completedPoints / committedPoints) * 100 : 0;

      entries.push({
        sprintId: s.id,
        sprintName: s.name,
        completedPoints,
        committedPoints,
        completionRate: Math.round(completionRate * 100) / 100,
      });
    }

    return entries;
  }

  // ── Current Sprint ────────────────────────────────────────

  async getCurrentSprint(boardId: string): Promise<Sprint | null> {
    const sprints = await prisma.generatedDocument.findMany({
      where: {
        category: "KANBAN_SPRINT",
        entityId: boardId,
      },
    });

    for (const s of sprints) {
      const sd = s.data as Record<string, any>;
      if (sd.status === "ACTIVE") {
        return this.docToSprint(s, sd);
      }
    }

    return null;
  }

  // ── Sprint Report ─────────────────────────────────────────

  async getSprintReport(sprintId: string): Promise<SprintReport | null> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: sprintId, category: "KANBAN_SPRINT" },
    });
    if (!doc || !doc.data) return null;

    const data = doc.data as Record<string, any>;
    const taskIds = (data.taskIds ?? []) as string[];

    const completedTasks: any[] = [];
    const remainingTasks: any[] = [];
    let totalCommitted = 0;
    let totalCompleted = 0;
    let totalCycleTimeMs = 0;
    let completedCount = 0;

    for (const taskId of taskIds) {
      const task = await prisma.generatedDocument.findFirst({
        where: { id: taskId, category: "KANBAN_TASK" },
      });
      if (!task?.data) continue;
      const td = task.data as Record<string, any>;
      const pts = td.storyPoints ?? 0;
      totalCommitted += pts;

      const taskInfo = {
        id: task.id,
        title: td.title ?? task.name,
        taskCode: td.taskCode ?? "",
        status: td.status ?? "TODO",
        storyPoints: pts,
        assigneeId: td.assigneeId ?? null,
      };

      if (td.status === "DONE") {
        completedTasks.push(taskInfo);
        totalCompleted += pts;
        if (td.completedAt) {
          const created = new Date(task.createdAt).getTime();
          const completed = new Date(td.completedAt).getTime();
          totalCycleTimeMs += completed - created;
          completedCount++;
        }
      } else {
        remainingTasks.push(taskInfo);
      }
    }

    const avgCycleTimeDays =
      completedCount > 0
        ? totalCycleTimeMs / completedCount / (1000 * 60 * 60 * 24)
        : 0;

    const sprint = this.docToSprint(doc, data);
    const completionRate = totalCommitted > 0 ? (totalCompleted / totalCommitted) * 100 : 0;

    return {
      sprint,
      completedTasks,
      remainingTasks,
      scopeChanges: (data.scopeChanges ?? []) as ScopeChange[],
      totalCommitted,
      totalCompleted,
      completionRate: Math.round(completionRate * 100) / 100,
      avgCycleTimeDays: Math.round(avgCycleTimeDays * 100) / 100,
    };
  }

  // ── Backlog ───────────────────────────────────────────────

  async getBacklog(boardId: string): Promise<any[]> {
    const tasks = await prisma.generatedDocument.findMany({
      where: { category: "KANBAN_TASK", entityId: boardId },
      orderBy: { createdAt: "asc" },
    });

    return tasks
      .filter((t) => {
        const td = t.data as Record<string, any>;
        return !td.sprintId;
      })
      .map((t) => {
        const td = t.data as Record<string, any>;
        return {
          id: t.id,
          name: t.name,
          createdAt: t.createdAt.toISOString(),
          ...td,
        };
      });
  }

  // ── Plan Sprint ───────────────────────────────────────────

  async planSprint(sprintId: string, taskIds: string[]): Promise<{ added: number; skipped: number }> {
    let added = 0;
    let skipped = 0;

    for (const taskId of taskIds) {
      const success = await this.addTaskToSprint(sprintId, taskId);
      if (success) added++;
      else skipped++;
    }

    return { added, skipped };
  }

  // ── Velocity Trend ────────────────────────────────────────

  async getVelocityTrend(boardId: string, sprintCount: number): Promise<VelocityEntry[]> {
    const allVelocity = await this.getSprintVelocity(boardId);
    return allVelocity.slice(-sprintCount);
  }

  // ── All Sprints for Board ─────────────────────────────────

  async getBoardSprints(boardId: string): Promise<Sprint[]> {
    const docs = await prisma.generatedDocument.findMany({
      where: {
        category: "KANBAN_SPRINT",
        entityId: boardId,
      },
      orderBy: { createdAt: "desc" },
    });

    return docs.map((doc) => {
      const data = doc.data as Record<string, any>;
      return this.docToSprint(doc, data);
    });
  }

  // ── Helper: doc to Sprint ─────────────────────────────────

  private docToSprint(doc: any, data: Record<string, any>): Sprint {
    return {
      id: doc.id,
      boardId: data.boardId ?? doc.entityId ?? "",
      name: doc.name,
      goal: data.goal ?? "",
      status: data.status ?? "PLANNED",
      startDate: data.startDate ?? "",
      endDate: data.endDate ?? "",
      taskIds: (data.taskIds ?? []) as string[],
      velocity: data.velocity ?? null,
      scopeChanges: (data.scopeChanges ?? []) as ScopeChange[],
      createdAt: doc.createdAt.toISOString(),
      createdBy: doc.generatedBy,
    };
  }
}

export const sprintManagementService = new SprintManagementService();
