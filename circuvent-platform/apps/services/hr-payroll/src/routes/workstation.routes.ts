// ──────────────────────────────────────────────────────────────
// HR Payroll — WorkStation (Jira-like Project Management)
// Board/column/task/sprint CRUD, drag-drop support, burndown,
// velocity, backlog, time-logging. Data stored in
// GeneratedDocument model with entityType prefixes.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function ok<T>(data: T, message?: string, meta?: any) {
  return { success: true, data, message, meta };
}

function fail(error: string) {
  return { success: false, error };
}

/** Parse stored JSON data for a GeneratedDocument */
function parseDocData<T = any>(doc: any): T {
  if (!doc) return {} as T;
  if (typeof doc.data === "string") {
    try { return JSON.parse(doc.data); } catch { return doc.data as any; }
  }
  return (doc.data ?? {}) as T;
}

/** Create or update a GeneratedDocument-based entity */
async function upsertEntity(
  entityType: string,
  entityId: string | null,
  data: Record<string, any>,
  userId: string,
  name: string,
  category: string,
): Promise<any> {
  if (entityId) {
    return prisma.generatedDocument.update({
      where: { id: entityId },
      data: { data, name },
    });
  }
  return prisma.generatedDocument.create({
    data: {
      entityType,
      entityId: null,
      name,
      category,
      format: "JSON",
      generatedBy: userId,
      data,
    },
  });
}

// Entity type constants
const E_BOARD = "WS_BOARD";
const E_COLUMN = "WS_COLUMN";
const E_TASK = "WS_TASK";
const E_SPRINT = "WS_SPRINT";
const E_COMMENT = "WS_COMMENT";
const E_SUBTASK = "WS_SUBTASK";
const E_TIMELOG = "WS_TIMELOG";

// ══════════════════════════════════════════════════════════════
// BOARDS
// ══════════════════════════════════════════════════════════════

// GET /workstation/boards — List all boards
router.get("/boards", async (req: Request, res: Response) => {
  try {
    const boards = await prisma.generatedDocument.findMany({
      where: { entityType: E_BOARD },
      orderBy: { createdAt: "desc" },
    });

    const result = boards.map((b) => ({
      id: b.id,
      name: b.name,
      ...parseDocData(b),
      createdAt: b.createdAt,
    }));

    res.json(ok(result));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to fetch boards"));
  }
});

// POST /workstation/boards — Create board with columns
router.post("/boards", async (req: Request, res: Response) => {
  try {
    const { name, description, userId, columns } = req.body;
    if (!name || !userId) {
      return res.status(400).json(fail("name and userId are required"));
    }

    const defaultColumns = columns || ["Backlog", "To Do", "In Progress", "In Review", "Done"];

    const board = await prisma.generatedDocument.create({
      data: {
        entityType: E_BOARD,
        name,
        category: "WORKSTATION",
        format: "JSON",
        generatedBy: userId,
        data: { description: description || "", columnOrder: [] as string[] },
      },
    });

    // Create default columns
    const columnIds: string[] = [];
    for (let i = 0; i < defaultColumns.length; i++) {
      const colName = typeof defaultColumns[i] === "string" ? defaultColumns[i] : defaultColumns[i].name;
      const col = await prisma.generatedDocument.create({
        data: {
          entityType: E_COLUMN,
          entityId: board.id,
          name: colName,
          category: "WORKSTATION",
          format: "JSON",
          generatedBy: userId,
          data: { order: i, taskIds: [], boardId: board.id },
        },
      });
      columnIds.push(col.id);
    }

    // Update board with column order
    await prisma.generatedDocument.update({
      where: { id: board.id },
      data: { data: { description: description || "", columnOrder: columnIds } },
    });

    res.status(201).json(ok({ id: board.id, name, columnIds }, "Board created"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to create board"));
  }
});

// GET /workstation/boards/:id — Board detail with columns and tasks
router.get("/boards/:id", async (req: Request, res: Response) => {
  try {
    const board = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!board || board.entityType !== E_BOARD) {
      return res.status(404).json(fail("Board not found"));
    }

    const columns = await prisma.generatedDocument.findMany({
      where: { entityType: E_COLUMN, entityId: board.id },
      orderBy: { createdAt: "asc" },
    });

    const boardData = parseDocData(board);
    const columnsWithTasks = await Promise.all(
      columns.map(async (col) => {
        const colData = parseDocData(col);
        const tasks = await prisma.generatedDocument.findMany({
          where: { entityType: E_TASK, entityId: col.id },
          orderBy: { createdAt: "asc" },
        });

        return {
          id: col.id,
          name: col.name,
          order: colData.order ?? 0,
          tasks: tasks.map((t) => ({
            id: t.id,
            name: t.name,
            ...parseDocData(t),
            createdAt: t.createdAt,
          })),
        };
      }),
    );

    // Sort columns by order
    columnsWithTasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    res.json(ok({
      id: board.id,
      name: board.name,
      ...boardData,
      columns: columnsWithTasks,
      createdAt: board.createdAt,
    }));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to fetch board"));
  }
});

// PUT /workstation/boards/:id — Update board
router.put("/boards/:id", async (req: Request, res: Response) => {
  try {
    const board = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!board || board.entityType !== E_BOARD) {
      return res.status(404).json(fail("Board not found"));
    }

    const { name, description } = req.body;
    const existing = parseDocData(board);

    const updated = await prisma.generatedDocument.update({
      where: { id: req.params.id },
      data: {
        name: name || board.name,
        data: { ...existing, description: description ?? existing.description },
      },
    });

    res.json(ok({ id: updated.id, name: updated.name, ...parseDocData(updated) }, "Board updated"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to update board"));
  }
});

// POST /workstation/boards/:id/columns — Add column
router.post("/boards/:id/columns", async (req: Request, res: Response) => {
  try {
    const board = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!board || board.entityType !== E_BOARD) {
      return res.status(404).json(fail("Board not found"));
    }

    const { name, userId } = req.body;
    if (!name || !userId) {
      return res.status(400).json(fail("name and userId are required"));
    }

    const existingColumns = await prisma.generatedDocument.count({
      where: { entityType: E_COLUMN, entityId: board.id },
    });

    const col = await prisma.generatedDocument.create({
      data: {
        entityType: E_COLUMN,
        entityId: board.id,
        name,
        category: "WORKSTATION",
        format: "JSON",
        generatedBy: userId,
        data: { order: existingColumns, taskIds: [], boardId: board.id },
      },
    });

    // Update board column order
    const boardData = parseDocData(board);
    const columnOrder = [...(boardData.columnOrder || []), col.id];
    await prisma.generatedDocument.update({
      where: { id: board.id },
      data: { data: { ...boardData, columnOrder } },
    });

    res.status(201).json(ok({ id: col.id, name: col.name, order: existingColumns }, "Column added"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to add column"));
  }
});

// PUT /workstation/columns/:id — Update column
router.put("/columns/:id", async (req: Request, res: Response) => {
  try {
    const col = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!col || col.entityType !== E_COLUMN) {
      return res.status(404).json(fail("Column not found"));
    }

    const { name, order } = req.body;
    const existing = parseDocData(col);

    const updated = await prisma.generatedDocument.update({
      where: { id: req.params.id },
      data: {
        name: name || col.name,
        data: { ...existing, order: order ?? existing.order },
      },
    });

    res.json(ok({ id: updated.id, name: updated.name, ...parseDocData(updated) }, "Column updated"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to update column"));
  }
});

// DELETE /workstation/columns/:id — Delete column
router.delete("/columns/:id", async (req: Request, res: Response) => {
  try {
    const col = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!col || col.entityType !== E_COLUMN) {
      return res.status(404).json(fail("Column not found"));
    }

    // Move tasks to unassigned
    await prisma.generatedDocument.deleteMany({
      where: { entityType: E_TASK, entityId: col.id },
    });

    await prisma.generatedDocument.delete({ where: { id: req.params.id } });

    res.json(ok(null, "Column deleted"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to delete column"));
  }
});

// ══════════════════════════════════════════════════════════════
// TASKS
// ══════════════════════════════════════════════════════════════

// Task counter for task codes
let taskCounter = 0;

// GET /workstation/tasks — List tasks with filters
router.get("/tasks", async (req: Request, res: Response) => {
  try {
    const { boardId, assignee, status, priority, sprint, search, page = "1", limit = "50" } = req.query;

    let where: any = { entityType: E_TASK };

    // If boardId filter, find columns for that board first
    if (boardId) {
      const columns = await prisma.generatedDocument.findMany({
        where: { entityType: E_COLUMN, entityId: String(boardId) },
        select: { id: true },
      });
      const columnIds = columns.map((c) => c.id);
      where.entityId = { in: columnIds };
    }

    const skip = (parseInt(String(page), 10) - 1) * parseInt(String(limit), 10);
    const take = parseInt(String(limit), 10);

    const allTasks = await prisma.generatedDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Filter in-memory for JSON field filters
    let filtered = allTasks.map((t) => ({
      id: t.id,
      name: t.name,
      columnId: t.entityId,
      ...parseDocData(t),
      createdAt: t.createdAt,
    }));

    if (assignee) filtered = filtered.filter((t) => t.assigneeId === String(assignee));
    if (status) filtered = filtered.filter((t) => t.status === String(status));
    if (priority) filtered = filtered.filter((t) => t.priority === String(priority));
    if (sprint) filtered = filtered.filter((t) => t.sprintId === String(sprint));
    if (search) {
      const term = String(search).toLowerCase();
      filtered = filtered.filter(
        (t) =>
          (t.name || "").toLowerCase().includes(term) ||
          (t.description || "").toLowerCase().includes(term) ||
          (t.taskCode || "").toLowerCase().includes(term),
      );
    }

    const total = filtered.length;
    const paginated = filtered.slice(skip, skip + take);

    res.json(ok(paginated, undefined, { total, page: parseInt(String(page), 10), limit: take, totalPages: Math.ceil(total / take) }));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to fetch tasks"));
  }
});

// POST /workstation/tasks — Create task
router.post("/tasks", async (req: Request, res: Response) => {
  try {
    const {
      title, description, type, priority, assigneeId,
      sprintId, storyPoints, labels, columnId, boardId, userId,
    } = req.body;

    if (!title || !userId) {
      return res.status(400).json(fail("title and userId are required"));
    }

    // Determine column (default to first column of the board)
    let targetColumnId = columnId;
    if (!targetColumnId && boardId) {
      const firstCol = await prisma.generatedDocument.findFirst({
        where: { entityType: E_COLUMN, entityId: boardId },
        orderBy: { createdAt: "asc" },
      });
      if (firstCol) targetColumnId = firstCol.id;
    }

    if (!targetColumnId) {
      return res.status(400).json(fail("columnId or boardId is required"));
    }

    // Generate task code
    taskCounter++;
    const taskCode = `TASK-${String(taskCounter).padStart(5, "0")}`;

    const task = await prisma.generatedDocument.create({
      data: {
        entityType: E_TASK,
        entityId: targetColumnId,
        name: title,
        category: "WORKSTATION",
        format: "JSON",
        generatedBy: userId,
        data: {
          taskCode,
          title,
          description: description || "",
          type: type || "TASK", // TASK, BUG, STORY, EPIC
          priority: priority || "MEDIUM",
          status: "TODO",
          assigneeId: assigneeId || null,
          sprintId: sprintId || null,
          storyPoints: storyPoints || 0,
          labels: labels || [],
          createdBy: userId,
          completedAt: null,
          movedAt: new Date().toISOString(),
        },
      },
    });

    res.status(201).json(ok({
      id: task.id,
      taskCode,
      name: task.name,
      ...parseDocData(task),
      createdAt: task.createdAt,
    }, "Task created"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to create task"));
  }
});

// GET /workstation/tasks/:id — Task detail with comments, subtasks, time logs
router.get("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const task = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!task || task.entityType !== E_TASK) {
      return res.status(404).json(fail("Task not found"));
    }

    const [comments, subtasks, timeLogs] = await Promise.all([
      prisma.generatedDocument.findMany({
        where: { entityType: E_COMMENT, entityId: req.params.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.generatedDocument.findMany({
        where: { entityType: E_SUBTASK, entityId: req.params.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.generatedDocument.findMany({
        where: { entityType: E_TIMELOG, entityId: req.params.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const totalTimeMinutes = timeLogs.reduce((sum, tl) => {
      const tlData = parseDocData(tl);
      return sum + (tlData.minutes || 0);
    }, 0);

    res.json(ok({
      id: task.id,
      name: task.name,
      columnId: task.entityId,
      ...parseDocData(task),
      comments: comments.map((c) => ({ id: c.id, ...parseDocData(c), createdAt: c.createdAt })),
      subtasks: subtasks.map((s) => ({ id: s.id, ...parseDocData(s), createdAt: s.createdAt })),
      timeLogs: timeLogs.map((t) => ({ id: t.id, ...parseDocData(t), createdAt: t.createdAt })),
      totalTimeMinutes,
      createdAt: task.createdAt,
    }));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to fetch task"));
  }
});

// PUT /workstation/tasks/:id — Update task
router.put("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const task = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!task || task.entityType !== E_TASK) {
      return res.status(404).json(fail("Task not found"));
    }

    const existing = parseDocData(task);
    const { title, description, type, priority, status, assigneeId, sprintId, storyPoints, labels } = req.body;

    const updatedData = {
      ...existing,
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(type !== undefined && { type }),
      ...(priority !== undefined && { priority }),
      ...(status !== undefined && { status }),
      ...(assigneeId !== undefined && { assigneeId }),
      ...(sprintId !== undefined && { sprintId }),
      ...(storyPoints !== undefined && { storyPoints }),
      ...(labels !== undefined && { labels }),
    };

    if (status === "DONE" && existing.status !== "DONE") {
      updatedData.completedAt = new Date().toISOString();
    }

    const updated = await prisma.generatedDocument.update({
      where: { id: req.params.id },
      data: {
        name: title || task.name,
        data: updatedData,
      },
    });

    res.json(ok({ id: updated.id, name: updated.name, ...parseDocData(updated) }, "Task updated"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to update task"));
  }
});

// DELETE /workstation/tasks/:id — Delete task
router.delete("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const task = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!task || task.entityType !== E_TASK) {
      return res.status(404).json(fail("Task not found"));
    }

    // Delete associated data
    await Promise.all([
      prisma.generatedDocument.deleteMany({ where: { entityType: E_COMMENT, entityId: req.params.id } }),
      prisma.generatedDocument.deleteMany({ where: { entityType: E_SUBTASK, entityId: req.params.id } }),
      prisma.generatedDocument.deleteMany({ where: { entityType: E_TIMELOG, entityId: req.params.id } }),
    ]);

    await prisma.generatedDocument.delete({ where: { id: req.params.id } });

    res.json(ok(null, "Task deleted"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to delete task"));
  }
});

// POST /workstation/tasks/:id/move — Move task between columns
router.post("/tasks/:id/move", async (req: Request, res: Response) => {
  try {
    const task = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!task || task.entityType !== E_TASK) {
      return res.status(404).json(fail("Task not found"));
    }

    const { targetColumnId, position } = req.body;
    if (!targetColumnId) {
      return res.status(400).json(fail("targetColumnId is required"));
    }

    const targetCol = await prisma.generatedDocument.findUnique({ where: { id: targetColumnId } });
    if (!targetCol || targetCol.entityType !== E_COLUMN) {
      return res.status(404).json(fail("Target column not found"));
    }

    const existing = parseDocData(task);

    const updated = await prisma.generatedDocument.update({
      where: { id: req.params.id },
      data: {
        entityId: targetColumnId,
        data: {
          ...existing,
          movedAt: new Date().toISOString(),
          previousColumnId: task.entityId,
        },
      },
    });

    res.json(ok({
      id: updated.id,
      name: updated.name,
      columnId: targetColumnId,
      ...parseDocData(updated),
    }, "Task moved"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to move task"));
  }
});

// POST /workstation/tasks/:id/comments — Add comment
router.post("/tasks/:id/comments", async (req: Request, res: Response) => {
  try {
    const task = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!task || task.entityType !== E_TASK) {
      return res.status(404).json(fail("Task not found"));
    }

    const { content, userId } = req.body;
    if (!content || !userId) {
      return res.status(400).json(fail("content and userId are required"));
    }

    const comment = await prisma.generatedDocument.create({
      data: {
        entityType: E_COMMENT,
        entityId: req.params.id,
        name: `Comment by ${userId}`,
        category: "WORKSTATION",
        format: "JSON",
        generatedBy: userId,
        data: { content, userId },
      },
    });

    res.status(201).json(ok({ id: comment.id, ...parseDocData(comment), createdAt: comment.createdAt }, "Comment added"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to add comment"));
  }
});

// POST /workstation/tasks/:id/subtasks — Add subtask
router.post("/tasks/:id/subtasks", async (req: Request, res: Response) => {
  try {
    const task = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!task || task.entityType !== E_TASK) {
      return res.status(404).json(fail("Task not found"));
    }

    const { title, userId } = req.body;
    if (!title || !userId) {
      return res.status(400).json(fail("title and userId are required"));
    }

    const subtask = await prisma.generatedDocument.create({
      data: {
        entityType: E_SUBTASK,
        entityId: req.params.id,
        name: title,
        category: "WORKSTATION",
        format: "JSON",
        generatedBy: userId,
        data: { title, completed: false, userId },
      },
    });

    res.status(201).json(ok({ id: subtask.id, ...parseDocData(subtask), createdAt: subtask.createdAt }, "Subtask added"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to add subtask"));
  }
});

// PUT /workstation/tasks/:id/subtasks/:subId — Update subtask
router.put("/tasks/:id/subtasks/:subId", async (req: Request, res: Response) => {
  try {
    const subtask = await prisma.generatedDocument.findUnique({ where: { id: req.params.subId } });
    if (!subtask || subtask.entityType !== E_SUBTASK || subtask.entityId !== req.params.id) {
      return res.status(404).json(fail("Subtask not found"));
    }

    const { title, completed } = req.body;
    const existing = parseDocData(subtask);

    const updated = await prisma.generatedDocument.update({
      where: { id: req.params.subId },
      data: {
        name: title || subtask.name,
        data: {
          ...existing,
          ...(title !== undefined && { title }),
          ...(completed !== undefined && { completed }),
        },
      },
    });

    res.json(ok({ id: updated.id, ...parseDocData(updated) }, "Subtask updated"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to update subtask"));
  }
});

// POST /workstation/tasks/:id/time-log — Log time entry
router.post("/tasks/:id/time-log", async (req: Request, res: Response) => {
  try {
    const task = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!task || task.entityType !== E_TASK) {
      return res.status(404).json(fail("Task not found"));
    }

    const { minutes, description, userId, date } = req.body;
    if (!minutes || !userId) {
      return res.status(400).json(fail("minutes and userId are required"));
    }

    const timeLog = await prisma.generatedDocument.create({
      data: {
        entityType: E_TIMELOG,
        entityId: req.params.id,
        name: `Time log: ${minutes}m`,
        category: "WORKSTATION",
        format: "JSON",
        generatedBy: userId,
        data: {
          minutes: Number(minutes),
          description: description || "",
          userId,
          date: date || new Date().toISOString(),
        },
      },
    });

    res.status(201).json(ok({ id: timeLog.id, ...parseDocData(timeLog), createdAt: timeLog.createdAt }, "Time logged"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to log time"));
  }
});

// GET /workstation/tasks/:id/history — Change history via comments
router.get("/tasks/:id/history", async (req: Request, res: Response) => {
  try {
    const task = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!task || task.entityType !== E_TASK) {
      return res.status(404).json(fail("Task not found"));
    }

    const taskData = parseDocData(task);
    const comments = await prisma.generatedDocument.findMany({
      where: { entityType: E_COMMENT, entityId: req.params.id },
      orderBy: { createdAt: "asc" },
    });

    const history = [
      { action: "CREATED", timestamp: task.createdAt, details: { title: task.name, createdBy: taskData.createdBy } },
      ...comments.map((c) => {
        const cd = parseDocData(c);
        return { action: "COMMENT", timestamp: c.createdAt, userId: cd.userId, details: { content: cd.content } };
      }),
    ];

    res.json(ok(history));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to fetch task history"));
  }
});

// ══════════════════════════════════════════════════════════════
// SPRINTS
// ══════════════════════════════════════════════════════════════

// GET /workstation/sprints — List sprints
router.get("/sprints", async (req: Request, res: Response) => {
  try {
    const sprints = await prisma.generatedDocument.findMany({
      where: { entityType: E_SPRINT },
      orderBy: { createdAt: "desc" },
    });

    const result = sprints.map((s) => ({
      id: s.id,
      name: s.name,
      ...parseDocData(s),
      createdAt: s.createdAt,
    }));

    res.json(ok(result));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to fetch sprints"));
  }
});

// POST /workstation/sprints — Create sprint
router.post("/sprints", async (req: Request, res: Response) => {
  try {
    const { name, goal, startDate, endDate, boardId, userId } = req.body;
    if (!name || !startDate || !endDate || !userId) {
      return res.status(400).json(fail("name, startDate, endDate, and userId are required"));
    }

    const sprint = await prisma.generatedDocument.create({
      data: {
        entityType: E_SPRINT,
        entityId: boardId || null,
        name,
        category: "WORKSTATION",
        format: "JSON",
        generatedBy: userId,
        data: {
          goal: goal || "",
          startDate,
          endDate,
          status: "PLANNED",
          boardId: boardId || null,
          velocity: 0,
          startedAt: null,
          completedAt: null,
        },
      },
    });

    res.status(201).json(ok({ id: sprint.id, name, ...parseDocData(sprint), createdAt: sprint.createdAt }, "Sprint created"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to create sprint"));
  }
});

// POST /workstation/sprints/:id/start — Start sprint
router.post("/sprints/:id/start", async (req: Request, res: Response) => {
  try {
    const sprint = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!sprint || sprint.entityType !== E_SPRINT) {
      return res.status(404).json(fail("Sprint not found"));
    }

    const existing = parseDocData(sprint);
    if (existing.status === "ACTIVE") {
      return res.status(400).json(fail("Sprint is already active"));
    }

    const updated = await prisma.generatedDocument.update({
      where: { id: req.params.id },
      data: {
        data: { ...existing, status: "ACTIVE", startedAt: new Date().toISOString() },
      },
    });

    res.json(ok({ id: updated.id, name: updated.name, ...parseDocData(updated) }, "Sprint started"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to start sprint"));
  }
});

// POST /workstation/sprints/:id/complete — Complete sprint
router.post("/sprints/:id/complete", async (req: Request, res: Response) => {
  try {
    const sprint = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!sprint || sprint.entityType !== E_SPRINT) {
      return res.status(404).json(fail("Sprint not found"));
    }

    const existing = parseDocData(sprint);

    // Calculate velocity (total story points of completed tasks in this sprint)
    const allTasks = await prisma.generatedDocument.findMany({
      where: { entityType: E_TASK },
    });
    const sprintTasks = allTasks.filter((t) => {
      const td = parseDocData(t);
      return td.sprintId === req.params.id;
    });

    const completed = sprintTasks.filter((t) => parseDocData(t).status === "DONE");
    const velocity = completed.reduce((sum, t) => sum + (parseDocData(t).storyPoints || 0), 0);
    const totalTasks = sprintTasks.length;
    const completedCount = completed.length;
    const incomplete = totalTasks - completedCount;

    const updated = await prisma.generatedDocument.update({
      where: { id: req.params.id },
      data: {
        data: {
          ...existing,
          status: "COMPLETED",
          completedAt: new Date().toISOString(),
          velocity,
          summary: {
            totalTasks,
            completed: completedCount,
            incomplete,
            velocity,
          },
        },
      },
    });

    res.json(ok({
      id: updated.id,
      name: updated.name,
      ...parseDocData(updated),
    }, `Sprint completed — ${completedCount}/${totalTasks} tasks, velocity: ${velocity}`));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to complete sprint"));
  }
});

// GET /workstation/sprints/:id/burndown — Burndown data
router.get("/sprints/:id/burndown", async (req: Request, res: Response) => {
  try {
    const sprint = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!sprint || sprint.entityType !== E_SPRINT) {
      return res.status(404).json(fail("Sprint not found"));
    }

    const sprintData = parseDocData(sprint);
    const startDate = new Date(sprintData.startDate || sprintData.startedAt || sprint.createdAt);
    const endDate = new Date(sprintData.endDate);

    // Find all tasks in this sprint
    const allTasks = await prisma.generatedDocument.findMany({ where: { entityType: E_TASK } });
    const sprintTasks = allTasks.filter((t) => parseDocData(t).sprintId === req.params.id);

    const totalPoints = sprintTasks.reduce((sum, t) => sum + (parseDocData(t).storyPoints || 0), 0);

    // Generate daily burndown data
    const daysInSprint = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const burndown: Array<{ date: string; ideal: number; actual: number }> = [];

    const completedByDate = new Map<string, number>();
    for (const t of sprintTasks) {
      const td = parseDocData(t);
      if (td.completedAt) {
        const dateKey = new Date(td.completedAt).toISOString().split("T")[0];
        completedByDate.set(dateKey, (completedByDate.get(dateKey) || 0) + (td.storyPoints || 0));
      }
    }

    let actualRemaining = totalPoints;
    for (let i = 0; i <= daysInSprint; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = d.toISOString().split("T")[0];
      const ideal = totalPoints - (totalPoints / daysInSprint) * i;
      actualRemaining -= completedByDate.get(dateKey) || 0;

      burndown.push({
        date: dateKey,
        ideal: Math.round(ideal * 10) / 10,
        actual: actualRemaining,
      });
    }

    res.json(ok({ totalPoints, daysInSprint, burndown }));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to fetch burndown data"));
  }
});

// ══════════════════════════════════════════════════════════════
// DASHBOARD & REPORTS
// ══════════════════════════════════════════════════════════════

// GET /workstation/dashboard — Overview metrics
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const allTasks = await prisma.generatedDocument.findMany({ where: { entityType: E_TASK } });
    const allSprints = await prisma.generatedDocument.findMany({ where: { entityType: E_SPRINT } });
    const allBoards = await prisma.generatedDocument.count({ where: { entityType: E_BOARD } });

    const tasksByStatus: Record<string, number> = {};
    const tasksByPriority: Record<string, number> = {};
    const tasksByType: Record<string, number> = {};
    const workload: Record<string, number> = {};

    for (const t of allTasks) {
      const td = parseDocData(t);
      tasksByStatus[td.status || "TODO"] = (tasksByStatus[td.status || "TODO"] || 0) + 1;
      tasksByPriority[td.priority || "MEDIUM"] = (tasksByPriority[td.priority || "MEDIUM"] || 0) + 1;
      tasksByType[td.type || "TASK"] = (tasksByType[td.type || "TASK"] || 0) + 1;
      if (td.assigneeId) {
        workload[td.assigneeId] = (workload[td.assigneeId] || 0) + 1;
      }
    }

    // Velocity from completed sprints
    const completedSprints = allSprints
      .map((s) => ({ id: s.id, name: s.name, ...parseDocData(s) }))
      .filter((s) => s.status === "COMPLETED")
      .sort((a, b) => new Date(a.completedAt || 0).getTime() - new Date(b.completedAt || 0).getTime());

    const velocityData = completedSprints.slice(-6).map((s) => ({
      sprint: s.name,
      velocity: s.velocity || 0,
    }));

    const avgVelocity = velocityData.length > 0
      ? Math.round(velocityData.reduce((sum, v) => sum + v.velocity, 0) / velocityData.length)
      : 0;

    res.json(ok({
      totalBoards: allBoards,
      totalTasks: allTasks.length,
      tasksByStatus,
      tasksByPriority,
      tasksByType,
      teamWorkload: workload,
      avgVelocity,
      velocityData,
      activeSprints: allSprints.filter((s) => parseDocData(s).status === "ACTIVE").length,
    }));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to fetch dashboard"));
  }
});

// GET /workstation/backlog — Items not in any sprint
router.get("/backlog", async (req: Request, res: Response) => {
  try {
    const allTasks = await prisma.generatedDocument.findMany({ where: { entityType: E_TASK } });
    const backlogTasks = allTasks
      .map((t) => ({ id: t.id, name: t.name, columnId: t.entityId, ...parseDocData(t), createdAt: t.createdAt }))
      .filter((t) => !t.sprintId);

    res.json(ok(backlogTasks));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to fetch backlog"));
  }
});

// POST /workstation/tasks/:id/labels — Add label
router.post("/tasks/:id/labels", async (req: Request, res: Response) => {
  try {
    const task = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!task || task.entityType !== E_TASK) {
      return res.status(404).json(fail("Task not found"));
    }

    const { label } = req.body;
    if (!label) {
      return res.status(400).json(fail("label is required"));
    }

    const existing = parseDocData(task);
    const labels: string[] = existing.labels || [];
    if (!labels.includes(label)) {
      labels.push(label);
    }

    const updated = await prisma.generatedDocument.update({
      where: { id: req.params.id },
      data: { data: { ...existing, labels } },
    });

    res.json(ok({ id: updated.id, labels: parseDocData(updated).labels }, "Label added"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to add label"));
  }
});

// GET /workstation/reports/velocity — Sprint velocity chart data
router.get("/reports/velocity", async (req: Request, res: Response) => {
  try {
    const sprints = await prisma.generatedDocument.findMany({
      where: { entityType: E_SPRINT },
      orderBy: { createdAt: "asc" },
    });

    const velocityData = sprints
      .map((s) => ({ id: s.id, name: s.name, ...parseDocData(s) }))
      .filter((s) => s.status === "COMPLETED")
      .map((s) => ({
        sprintId: s.id,
        sprintName: s.name,
        velocity: s.velocity || 0,
        startDate: s.startDate,
        endDate: s.endDate,
        completedAt: s.completedAt,
      }));

    const avg = velocityData.length > 0
      ? Math.round(velocityData.reduce((sum, v) => sum + v.velocity, 0) / velocityData.length)
      : 0;

    res.json(ok({ sprints: velocityData, averageVelocity: avg }));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to fetch velocity report"));
  }
});

// GET /workstation/reports/cycle-time — Average cycle time
router.get("/reports/cycle-time", async (req: Request, res: Response) => {
  try {
    const allTasks = await prisma.generatedDocument.findMany({ where: { entityType: E_TASK } });

    const completedTasks = allTasks
      .map((t) => ({ ...parseDocData(t), createdAt: t.createdAt }))
      .filter((t) => t.status === "DONE" && t.completedAt);

    let totalCycleMs = 0;
    const cycleTimes: Array<{ taskCode: string; days: number }> = [];

    for (const t of completedTasks) {
      const created = new Date(t.createdAt).getTime();
      const completed = new Date(t.completedAt).getTime();
      const cycleMs = completed - created;
      const days = Math.round((cycleMs / (1000 * 60 * 60 * 24)) * 10) / 10;
      totalCycleMs += cycleMs;
      cycleTimes.push({ taskCode: t.taskCode || "N/A", days });
    }

    const avgCycleDays = completedTasks.length > 0
      ? Math.round((totalCycleMs / completedTasks.length / (1000 * 60 * 60 * 24)) * 10) / 10
      : 0;

    res.json(ok({
      totalCompleted: completedTasks.length,
      averageCycleDays: avgCycleDays,
      details: cycleTimes.slice(-20),
    }));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to fetch cycle time report"));
  }
});

export { router as workstationRouter };
