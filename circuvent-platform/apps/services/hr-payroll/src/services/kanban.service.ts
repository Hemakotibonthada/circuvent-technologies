// ──────────────────────────────────────────────────────────────
// HR Payroll — Kanban Board Service
// WorkStation board management: boards, columns, tasks,
// subtasks, time-logging, comments, labels, metrics, CFD.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface KanbanColumn {
  id: string;
  name: string;
  color: string;
  wipLimit: number;
  order: number;
  taskIds: string[];
}

interface KanbanBoard {
  id: string;
  name: string;
  description: string;
  projectId: string | null;
  columns: KanbanColumn[];
  createdAt: string;
  createdBy: string;
}

interface CreateTaskData {
  title: string;
  description?: string;
  type?: "BUG" | "STORY" | "TASK" | "EPIC";
  priority?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  assigneeId?: string;
  storyPoints?: number;
  labels?: string[];
  dueDate?: string;
}

interface UpdateTaskData {
  title?: string;
  description?: string;
  type?: string;
  priority?: string;
  assigneeId?: string | null;
  storyPoints?: number;
  labels?: string[];
  dueDate?: string | null;
  status?: string;
}

interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

interface TimeLog {
  id: string;
  hours: number;
  description: string;
  userId: string;
  createdAt: string;
}

interface Comment {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  editedAt?: string;
}

interface TaskHistoryEntry {
  field: string;
  from: string;
  to: string;
  changedBy: string;
  changedAt: string;
}

interface BoardMetrics {
  tasksPerColumn: Record<string, number>;
  totalTasks: number;
  completedTasks: number;
  avgCycleTimeDays: number;
  wipViolations: Array<{ columnId: string; columnName: string; current: number; limit: number }>;
  storyPointsCompleted: number;
  storyPointsRemaining: number;
}

interface CumulativeFlowEntry {
  date: string;
  columns: Record<string, number>;
}

interface TeamWorkloadEntry {
  assigneeId: string;
  taskCount: number;
  storyPoints: number;
  tasks: Array<{ id: string; title: string; priority: string }>;
}

// ══════════════════════════════════════════════════════════════
// Helper — generate cuid-like IDs
// ══════════════════════════════════════════════════════════════

function generateId(): string {
  return `kb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ══════════════════════════════════════════════════════════════
// KanbanService
// ══════════════════════════════════════════════════════════════

export class KanbanService {
  // ── Board CRUD ────────────────────────────────────────────

  async createBoard(
    name: string,
    description: string,
    projectId: string | null,
    columns: Array<{ name: string; color: string; wipLimit?: number }>,
    createdBy: string,
  ): Promise<KanbanBoard> {
    const boardId = generateId();

    const boardColumns: KanbanColumn[] = columns.map((col, index) => ({
      id: generateId(),
      name: col.name,
      color: col.color,
      wipLimit: col.wipLimit ?? 0,
      order: index,
      taskIds: [],
    }));

    const doc = await prisma.generatedDocument.create({
      data: {
        name,
        category: "KANBAN_BOARD",
        entityType: "WS_BOARD",
        entityId: projectId ?? undefined,
        generatedBy: createdBy,
        format: "JSON",
        data: {
          boardId,
          description,
          projectId,
          columns: boardColumns,
          taskCounter: 0,
          cfdSnapshots: [],
        } as any,
      },
    });

    return {
      id: doc.id,
      name: doc.name,
      description,
      projectId,
      columns: boardColumns,
      createdAt: doc.createdAt.toISOString(),
      createdBy,
    };
  }

  async getBoard(boardId: string): Promise<KanbanBoard | null> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: boardId, category: "KANBAN_BOARD" },
    });

    if (!doc || !doc.data) return null;
    const data = doc.data as Record<string, any>;

    return {
      id: doc.id,
      name: doc.name,
      description: data.description ?? "",
      projectId: data.projectId ?? null,
      columns: (data.columns ?? []) as KanbanColumn[],
      createdAt: doc.createdAt.toISOString(),
      createdBy: doc.generatedBy,
    };
  }

  async updateBoard(boardId: string, updates: { name?: string; description?: string }): Promise<KanbanBoard | null> {
    const existing = await prisma.generatedDocument.findFirst({
      where: { id: boardId, category: "KANBAN_BOARD" },
    });
    if (!existing || !existing.data) return null;

    const data = existing.data as Record<string, any>;
    if (updates.description !== undefined) data.description = updates.description;

    const doc = await prisma.generatedDocument.update({
      where: { id: boardId },
      data: {
        name: updates.name ?? existing.name,
        data: data,
      },
    });

    return {
      id: doc.id,
      name: doc.name,
      description: data.description ?? "",
      projectId: data.projectId ?? null,
      columns: (data.columns ?? []) as KanbanColumn[],
      createdAt: doc.createdAt.toISOString(),
      createdBy: doc.generatedBy,
    };
  }

  async deleteBoard(boardId: string): Promise<boolean> {
    // Delete all tasks belonging to board
    await prisma.generatedDocument.deleteMany({
      where: { category: "KANBAN_TASK", entityId: boardId },
    });
    // Delete board
    const result = await prisma.generatedDocument.deleteMany({
      where: { id: boardId, category: "KANBAN_BOARD" },
    });
    return result.count > 0;
  }

  // ── Column Management ────────────────────────────────────

  async addColumn(
    boardId: string,
    name: string,
    color: string,
    wipLimit: number,
  ): Promise<KanbanColumn | null> {
    const existing = await prisma.generatedDocument.findFirst({
      where: { id: boardId, category: "KANBAN_BOARD" },
    });
    if (!existing || !existing.data) return null;

    const data = existing.data as Record<string, any>;
    const columns = (data.columns ?? []) as KanbanColumn[];

    const newColumn: KanbanColumn = {
      id: generateId(),
      name,
      color,
      wipLimit,
      order: columns.length,
      taskIds: [],
    };
    columns.push(newColumn);
    data.columns = columns;

    await prisma.generatedDocument.update({
      where: { id: boardId },
      data: { data },
    });

    return newColumn;
  }

  async reorderColumns(boardId: string, columnOrder: string[]): Promise<boolean> {
    const existing = await prisma.generatedDocument.findFirst({
      where: { id: boardId, category: "KANBAN_BOARD" },
    });
    if (!existing || !existing.data) return false;

    const data = existing.data as Record<string, any>;
    const columns = (data.columns ?? []) as KanbanColumn[];

    const reordered: KanbanColumn[] = [];
    for (let i = 0; i < columnOrder.length; i++) {
      const col = columns.find((c) => c.id === columnOrder[i]);
      if (col) {
        col.order = i;
        reordered.push(col);
      }
    }
    // Append any columns not listed in the order
    for (const col of columns) {
      if (!columnOrder.includes(col.id)) {
        col.order = reordered.length;
        reordered.push(col);
      }
    }
    data.columns = reordered;

    await prisma.generatedDocument.update({
      where: { id: boardId },
      data: { data },
    });

    return true;
  }

  async deleteColumn(boardId: string, columnId: string): Promise<boolean> {
    const existing = await prisma.generatedDocument.findFirst({
      where: { id: boardId, category: "KANBAN_BOARD" },
    });
    if (!existing || !existing.data) return false;

    const data = existing.data as Record<string, any>;
    const columns = (data.columns ?? []) as KanbanColumn[];
    const colIndex = columns.findIndex((c) => c.id === columnId);
    if (colIndex === -1) return false;

    const removedCol = columns[colIndex];

    // Delete tasks in this column
    for (const taskId of removedCol.taskIds) {
      await prisma.generatedDocument.deleteMany({
        where: { id: taskId, category: "KANBAN_TASK" },
      });
    }

    columns.splice(colIndex, 1);
    // Re-index remaining columns
    columns.forEach((c, i) => (c.order = i));
    data.columns = columns;

    await prisma.generatedDocument.update({
      where: { id: boardId },
      data: { data },
    });

    return true;
  }

  // ── Task CRUD ─────────────────────────────────────────────

  async createTask(
    boardId: string,
    columnId: string,
    taskData: CreateTaskData,
    createdBy: string,
  ): Promise<any> {
    const board = await prisma.generatedDocument.findFirst({
      where: { id: boardId, category: "KANBAN_BOARD" },
    });
    if (!board || !board.data) return null;

    const data = board.data as Record<string, any>;
    const columns = (data.columns ?? []) as KanbanColumn[];
    const column = columns.find((c) => c.id === columnId);
    if (!column) return null;

    // Auto-generate task code
    const counter = (data.taskCounter ?? 0) + 1;
    const taskCode = `WS-${String(counter).padStart(3, "0")}`;
    data.taskCounter = counter;

    const task = await prisma.generatedDocument.create({
      data: {
        name: taskData.title,
        category: "KANBAN_TASK",
        entityType: "WS_TASK",
        entityId: boardId,
        generatedBy: createdBy,
        format: "JSON",
        data: {
          taskCode,
          title: taskData.title,
          description: taskData.description ?? "",
          type: taskData.type ?? "TASK",
          priority: taskData.priority ?? "MEDIUM",
          assigneeId: taskData.assigneeId ?? null,
          storyPoints: taskData.storyPoints ?? 0,
          labels: taskData.labels ?? [],
          dueDate: taskData.dueDate ?? null,
          columnId,
          boardId,
          subtasks: [],
          timeLogs: [],
          comments: [],
          history: [],
          status: "TODO",
          completedAt: null,
          sprintId: null,
        },
      },
    });

    // Add task ID to column
    column.taskIds.push(task.id);
    data.columns = columns;

    await prisma.generatedDocument.update({
      where: { id: boardId },
      data: { data },
    });

    return { id: task.id, taskCode, ...taskData, columnId, boardId };
  }

  async updateTask(taskId: string, updates: UpdateTaskData, updatedBy: string): Promise<any> {
    const task = await prisma.generatedDocument.findFirst({
      where: { id: taskId, category: "KANBAN_TASK" },
    });
    if (!task || !task.data) return null;

    const taskData = task.data as Record<string, any>;
    const history = (taskData.history ?? []) as TaskHistoryEntry[];

    // Record changes in history
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && taskData[key] !== value) {
        history.push({
          field: key,
          from: String(taskData[key] ?? ""),
          to: String(value ?? ""),
          changedBy: updatedBy,
          changedAt: new Date().toISOString(),
        });
        taskData[key] = value;
      }
    }

    taskData.history = history;

    // Track completion
    if (updates.status === "DONE" && !taskData.completedAt) {
      taskData.completedAt = new Date().toISOString();
    } else if (updates.status && updates.status !== "DONE") {
      taskData.completedAt = null;
    }

    await prisma.generatedDocument.update({
      where: { id: taskId },
      data: {
        name: updates.title ?? task.name,
        data: taskData,
      },
    });

    return { id: taskId, ...taskData };
  }

  async moveTask(taskId: string, toColumnId: string, position: number): Promise<boolean> {
    const task = await prisma.generatedDocument.findFirst({
      where: { id: taskId, category: "KANBAN_TASK" },
    });
    if (!task || !task.data) return false;

    const taskData = task.data as Record<string, any>;
    const boardId = taskData.boardId;
    const fromColumnId = taskData.columnId;

    const board = await prisma.generatedDocument.findFirst({
      where: { id: boardId, category: "KANBAN_BOARD" },
    });
    if (!board || !board.data) return false;

    const boardData = board.data as Record<string, any>;
    const columns = (boardData.columns ?? []) as KanbanColumn[];

    const fromCol = columns.find((c) => c.id === fromColumnId);
    const toCol = columns.find((c) => c.id === toColumnId);
    if (!toCol) return false;

    // Remove from source column
    if (fromCol) {
      fromCol.taskIds = fromCol.taskIds.filter((id) => id !== taskId);
    }

    // Insert at position in target column
    const clampedPos = Math.min(Math.max(0, position), toCol.taskIds.length);
    toCol.taskIds.splice(clampedPos, 0, taskId);

    boardData.columns = columns;

    // Record move in task history
    const history = (taskData.history ?? []) as TaskHistoryEntry[];
    history.push({
      field: "columnId",
      from: fromColumnId,
      to: toColumnId,
      changedBy: taskData.assigneeId ?? "system",
      changedAt: new Date().toISOString(),
    });
    taskData.columnId = toColumnId;
    taskData.history = history;

    await Promise.all([
      prisma.generatedDocument.update({ where: { id: boardId }, data: { data: boardData } }),
      prisma.generatedDocument.update({ where: { id: taskId }, data: { data: taskData } }),
    ]);

    return true;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const task = await prisma.generatedDocument.findFirst({
      where: { id: taskId, category: "KANBAN_TASK" },
    });
    if (!task || !task.data) return false;

    const taskData = task.data as Record<string, any>;
    const boardId = taskData.boardId;
    const columnId = taskData.columnId;

    // Remove from column
    const board = await prisma.generatedDocument.findFirst({
      where: { id: boardId, category: "KANBAN_BOARD" },
    });
    if (board?.data) {
      const boardData = board.data as Record<string, any>;
      const columns = (boardData.columns ?? []) as KanbanColumn[];
      const col = columns.find((c) => c.id === columnId);
      if (col) {
        col.taskIds = col.taskIds.filter((id) => id !== taskId);
        boardData.columns = columns;
        await prisma.generatedDocument.update({ where: { id: boardId }, data: { data: boardData } });
      }
    }

    const result = await prisma.generatedDocument.deleteMany({
      where: { id: taskId, category: "KANBAN_TASK" },
    });
    return result.count > 0;
  }

  // ── Subtasks ──────────────────────────────────────────────

  async addSubtask(taskId: string, title: string): Promise<Subtask | null> {
    const task = await prisma.generatedDocument.findFirst({
      where: { id: taskId, category: "KANBAN_TASK" },
    });
    if (!task || !task.data) return null;

    const taskData = task.data as Record<string, any>;
    const subtasks = (taskData.subtasks ?? []) as Subtask[];

    const subtask: Subtask = {
      id: generateId(),
      title,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    subtasks.push(subtask);
    taskData.subtasks = subtasks;

    await prisma.generatedDocument.update({
      where: { id: taskId },
      data: { data: taskData },
    });

    return subtask;
  }

  async toggleSubtask(taskId: string, subtaskId: string): Promise<boolean> {
    const task = await prisma.generatedDocument.findFirst({
      where: { id: taskId, category: "KANBAN_TASK" },
    });
    if (!task || !task.data) return false;

    const taskData = task.data as Record<string, any>;
    const subtasks = (taskData.subtasks ?? []) as Subtask[];
    const subtask = subtasks.find((s) => s.id === subtaskId);
    if (!subtask) return false;

    subtask.completed = !subtask.completed;
    taskData.subtasks = subtasks;

    await prisma.generatedDocument.update({
      where: { id: taskId },
      data: { data: taskData },
    });

    return true;
  }

  // ── Time Logging ──────────────────────────────────────────

  async logTime(taskId: string, hours: number, description: string, userId: string): Promise<TimeLog | null> {
    const task = await prisma.generatedDocument.findFirst({
      where: { id: taskId, category: "KANBAN_TASK" },
    });
    if (!task || !task.data) return null;

    const taskData = task.data as Record<string, any>;
    const timeLogs = (taskData.timeLogs ?? []) as TimeLog[];

    const log: TimeLog = {
      id: generateId(),
      hours,
      description,
      userId,
      createdAt: new Date().toISOString(),
    };
    timeLogs.push(log);
    taskData.timeLogs = timeLogs;

    await prisma.generatedDocument.update({
      where: { id: taskId },
      data: { data: taskData },
    });

    return log;
  }

  // ── Comments ──────────────────────────────────────────────

  async addComment(taskId: string, userId: string, content: string): Promise<Comment | null> {
    const task = await prisma.generatedDocument.findFirst({
      where: { id: taskId, category: "KANBAN_TASK" },
    });
    if (!task || !task.data) return null;

    const taskData = task.data as Record<string, any>;
    const comments = (taskData.comments ?? []) as Comment[];

    const comment: Comment = {
      id: generateId(),
      userId,
      content,
      createdAt: new Date().toISOString(),
    };
    comments.push(comment);
    taskData.comments = comments;

    await prisma.generatedDocument.update({
      where: { id: taskId },
      data: { data: taskData },
    });

    return comment;
  }

  // ── Labels ────────────────────────────────────────────────

  async addLabel(taskId: string, label: string): Promise<boolean> {
    const task = await prisma.generatedDocument.findFirst({
      where: { id: taskId, category: "KANBAN_TASK" },
    });
    if (!task || !task.data) return false;

    const taskData = task.data as Record<string, any>;
    const labels = (taskData.labels ?? []) as string[];
    if (labels.includes(label)) return true;

    labels.push(label);
    taskData.labels = labels;

    await prisma.generatedDocument.update({
      where: { id: taskId },
      data: { data: taskData },
    });

    return true;
  }

  async removeLabel(taskId: string, label: string): Promise<boolean> {
    const task = await prisma.generatedDocument.findFirst({
      where: { id: taskId, category: "KANBAN_TASK" },
    });
    if (!task || !task.data) return false;

    const taskData = task.data as Record<string, any>;
    const labels = (taskData.labels ?? []) as string[];
    const index = labels.indexOf(label);
    if (index === -1) return false;

    labels.splice(index, 1);
    taskData.labels = labels;

    await prisma.generatedDocument.update({
      where: { id: taskId },
      data: { data: taskData },
    });

    return true;
  }

  // ── Task History ──────────────────────────────────────────

  async getTaskHistory(taskId: string): Promise<TaskHistoryEntry[]> {
    const task = await prisma.generatedDocument.findFirst({
      where: { id: taskId, category: "KANBAN_TASK" },
    });
    if (!task || !task.data) return [];

    const taskData = task.data as Record<string, any>;
    return (taskData.history ?? []) as TaskHistoryEntry[];
  }

  // ── Board Metrics ─────────────────────────────────────────

  async getBoardMetrics(boardId: string): Promise<BoardMetrics | null> {
    const board = await this.getBoard(boardId);
    if (!board) return null;

    const tasks = await prisma.generatedDocument.findMany({
      where: { category: "KANBAN_TASK", entityId: boardId },
    });

    const tasksPerColumn: Record<string, number> = {};
    const wipViolations: BoardMetrics["wipViolations"] = [];

    for (const column of board.columns) {
      const count = column.taskIds.length;
      tasksPerColumn[column.name] = count;

      if (column.wipLimit > 0 && count > column.wipLimit) {
        wipViolations.push({
          columnId: column.id,
          columnName: column.name,
          current: count,
          limit: column.wipLimit,
        });
      }
    }

    let totalCycleTimeMs = 0;
    let completedCount = 0;
    let storyPointsCompleted = 0;
    let storyPointsRemaining = 0;

    for (const t of tasks) {
      const td = t.data as Record<string, any>;
      if (td.status === "DONE" && td.completedAt) {
        completedCount++;
        const created = new Date(t.createdAt).getTime();
        const completed = new Date(td.completedAt).getTime();
        totalCycleTimeMs += completed - created;
        storyPointsCompleted += td.storyPoints ?? 0;
      } else {
        storyPointsRemaining += td.storyPoints ?? 0;
      }
    }

    const avgCycleTimeDays =
      completedCount > 0
        ? totalCycleTimeMs / completedCount / (1000 * 60 * 60 * 24)
        : 0;

    return {
      tasksPerColumn,
      totalTasks: tasks.length,
      completedTasks: completedCount,
      avgCycleTimeDays: Math.round(avgCycleTimeDays * 100) / 100,
      wipViolations,
      storyPointsCompleted,
      storyPointsRemaining,
    };
  }

  // ── Cumulative Flow Data ──────────────────────────────────

  async getCumulativeFlowData(boardId: string): Promise<CumulativeFlowEntry[]> {
    const board = await this.getBoard(boardId);
    if (!board) return [];

    const tasks = await prisma.generatedDocument.findMany({
      where: { category: "KANBAN_TASK", entityId: boardId },
      orderBy: { createdAt: "asc" },
    });

    if (tasks.length === 0) return [];

    const earliest = tasks[0].createdAt;
    const today = new Date();
    const entries: CumulativeFlowEntry[] = [];

    const columnNames = board.columns.map((c) => c.name);
    const dayMs = 24 * 60 * 60 * 1000;

    for (let d = new Date(earliest); d <= today; d = new Date(d.getTime() + dayMs)) {
      const dateStr = d.toISOString().split("T")[0];
      const columnsCount: Record<string, number> = {};
      for (const name of columnNames) columnsCount[name] = 0;

      for (const t of tasks) {
        if (new Date(t.createdAt) > d) continue;
        const td = t.data as Record<string, any>;

        // Check history to determine column as of this date
        const history = (td.history ?? []) as TaskHistoryEntry[];
        let currentCol = td.columnId;

        for (const h of history) {
          if (h.field === "columnId" && new Date(h.changedAt) <= d) {
            currentCol = h.to;
          }
        }

        const col = board.columns.find((c) => c.id === currentCol);
        if (col) columnsCount[col.name] = (columnsCount[col.name] ?? 0) + 1;
      }

      entries.push({ date: dateStr, columns: columnsCount });
    }

    return entries;
  }

  // ── Team Workload ─────────────────────────────────────────

  async getTeamWorkload(boardId: string): Promise<TeamWorkloadEntry[]> {
    const tasks = await prisma.generatedDocument.findMany({
      where: { category: "KANBAN_TASK", entityId: boardId },
    });

    const workloadMap = new Map<
      string,
      { taskCount: number; storyPoints: number; tasks: Array<{ id: string; title: string; priority: string }> }
    >();

    for (const t of tasks) {
      const td = t.data as Record<string, any>;
      const assigneeId = td.assigneeId ?? "unassigned";

      if (!workloadMap.has(assigneeId)) {
        workloadMap.set(assigneeId, { taskCount: 0, storyPoints: 0, tasks: [] });
      }
      const entry = workloadMap.get(assigneeId)!;
      entry.taskCount++;
      entry.storyPoints += td.storyPoints ?? 0;
      entry.tasks.push({
        id: t.id,
        title: td.title ?? t.name,
        priority: td.priority ?? "MEDIUM",
      });
    }

    return Array.from(workloadMap.entries()).map(([assigneeId, data]) => ({
      assigneeId,
      ...data,
    }));
  }

  // ── Utility: Get board tasks ──────────────────────────────

  async getBoardTasks(boardId: string): Promise<any[]> {
    const tasks = await prisma.generatedDocument.findMany({
      where: { category: "KANBAN_TASK", entityId: boardId },
      orderBy: { createdAt: "asc" },
    });

    return tasks.map((t) => {
      const td = t.data as Record<string, any>;
      return {
        id: t.id,
        name: t.name,
        createdAt: t.createdAt.toISOString(),
        ...td,
      };
    });
  }

  // ── Utility: Get all boards ───────────────────────────────

  async getAllBoards(): Promise<KanbanBoard[]> {
    const docs = await prisma.generatedDocument.findMany({
      where: { category: "KANBAN_BOARD" },
      orderBy: { createdAt: "desc" },
    });

    return docs.map((doc) => {
      const data = doc.data as Record<string, any>;
      return {
        id: doc.id,
        name: doc.name,
        description: data.description ?? "",
        projectId: data.projectId ?? null,
        columns: (data.columns ?? []) as KanbanColumn[],
        createdAt: doc.createdAt.toISOString(),
        createdBy: doc.generatedBy,
      };
    });
  }

  // ── Utility: Take CFD Snapshot ────────────────────────────

  async takeCFDSnapshot(boardId: string): Promise<void> {
    const board = await prisma.generatedDocument.findFirst({
      where: { id: boardId, category: "KANBAN_BOARD" },
    });
    if (!board || !board.data) return;

    const data = board.data as Record<string, any>;
    const columns = (data.columns ?? []) as KanbanColumn[];
    const snapshots = (data.cfdSnapshots ?? []) as CumulativeFlowEntry[];

    const today = new Date().toISOString().split("T")[0];
    const columnsCount: Record<string, number> = {};

    for (const col of columns) {
      columnsCount[col.name] = col.taskIds.length;
    }

    // Avoid duplicate snapshot for same day
    if (snapshots.length > 0 && snapshots[snapshots.length - 1].date === today) {
      snapshots[snapshots.length - 1].columns = columnsCount;
    } else {
      snapshots.push({ date: today, columns: columnsCount });
    }

    data.cfdSnapshots = snapshots;

    await prisma.generatedDocument.update({
      where: { id: boardId },
      data: { data },
    });
  }
}

export const kanbanService = new KanbanService();
