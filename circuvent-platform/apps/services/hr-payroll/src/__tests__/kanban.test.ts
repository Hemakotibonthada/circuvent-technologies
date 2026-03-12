// ──────────────────────────────────────────────────────────────
// KanbanService — Test Suite
// Tests for boards, columns, tasks, drag-drop, subtasks,
// time-logging, comments, labels, metrics, CFD, workload.
// ──────────────────────────────────────────────────────────────

const mockPrisma = {
  generatedDocument: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

import { KanbanService } from "../services/kanban.service";

// ══════════════════════════════════════════════════════════════
// Setup
// ══════════════════════════════════════════════════════════════

let service: KanbanService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new KanbanService();
});

// ══════════════════════════════════════════════════════════════
// Board CRUD
// ══════════════════════════════════════════════════════════════

describe("Board CRUD", () => {
  it("should create a board with default columns", async () => {
    const mockDoc = {
      id: "board-1",
      name: "Sprint Board",
      category: "KANBAN_BOARD",
      generatedBy: "user-1",
      createdAt: new Date("2026-03-01"),
      data: {
        boardId: "board-1",
        description: "Test board",
        projectId: null,
        columns: [],
        taskCounter: 0,
      },
    };

    mockPrisma.generatedDocument.create.mockResolvedValue(mockDoc);

    const board = await service.createBoard(
      "Sprint Board",
      "Test board",
      null,
      [
        { name: "To Do", color: "#3b82f6" },
        { name: "In Progress", color: "#f59e0b" },
        { name: "Done", color: "#10b981" },
      ],
      "user-1",
    );

    expect(board.name).toBe("Sprint Board");
    expect(board.description).toBe("Test board");
    expect(mockPrisma.generatedDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: "KANBAN_BOARD" }),
      }),
    );
  });

  it("should get a board by ID", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "board-1",
      name: "Sprint Board",
      category: "KANBAN_BOARD",
      generatedBy: "user-1",
      createdAt: new Date(),
      data: {
        description: "Test",
        projectId: null,
        columns: [{ id: "col-1", name: "To Do", color: "#3b82f6", wipLimit: 0, order: 0, taskIds: [] }],
      },
    });

    const board = await service.getBoard("board-1");
    expect(board).not.toBeNull();
    expect(board!.name).toBe("Sprint Board");
    expect(board!.columns).toHaveLength(1);
  });

  it("should return null for non-existent board", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);
    const board = await service.getBoard("nonexistent");
    expect(board).toBeNull();
  });

  it("should update board name and description", async () => {
    const existing = {
      id: "board-1",
      name: "Old Name",
      category: "KANBAN_BOARD",
      generatedBy: "user-1",
      createdAt: new Date(),
      data: { description: "Old desc", columns: [] },
    };

    mockPrisma.generatedDocument.findFirst.mockResolvedValue(existing);
    mockPrisma.generatedDocument.update.mockResolvedValue({
      ...existing,
      name: "New Name",
      data: { description: "New desc", columns: [] },
    });

    const board = await service.updateBoard("board-1", { name: "New Name", description: "New desc" });
    expect(board).not.toBeNull();
    expect(mockPrisma.generatedDocument.update).toHaveBeenCalled();
  });

  it("should delete a board and its tasks", async () => {
    mockPrisma.generatedDocument.deleteMany.mockResolvedValueOnce({ count: 3 }); // tasks
    mockPrisma.generatedDocument.deleteMany.mockResolvedValueOnce({ count: 1 }); // board

    const result = await service.deleteBoard("board-1");
    expect(result).toBe(true);
    expect(mockPrisma.generatedDocument.deleteMany).toHaveBeenCalledTimes(2);
  });

  it("should get all boards", async () => {
    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      { id: "b1", name: "Board 1", generatedBy: "u1", createdAt: new Date(), data: { columns: [] } },
      { id: "b2", name: "Board 2", generatedBy: "u1", createdAt: new Date(), data: { columns: [] } },
    ]);

    const boards = await service.getAllBoards();
    expect(boards).toHaveLength(2);
  });
});

// ══════════════════════════════════════════════════════════════
// Column Management
// ══════════════════════════════════════════════════════════════

describe("Column Management", () => {
  const boardDoc = {
    id: "board-1",
    name: "Board",
    category: "KANBAN_BOARD",
    generatedBy: "u1",
    createdAt: new Date(),
    data: {
      columns: [
        { id: "col-1", name: "To Do", color: "#3b82f6", wipLimit: 5, order: 0, taskIds: [] },
        { id: "col-2", name: "Done", color: "#10b981", wipLimit: 0, order: 1, taskIds: [] },
      ],
    },
  };

  it("should add a column to a board", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({ ...boardDoc, data: { ...boardDoc.data, columns: [...boardDoc.data.columns] } });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const col = await service.addColumn("board-1", "In Progress", "#f59e0b", 3);
    expect(col).not.toBeNull();
    expect(col!.name).toBe("In Progress");
    expect(col!.order).toBe(2);
  });

  it("should reorder columns", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({ ...boardDoc, data: { ...boardDoc.data, columns: [...boardDoc.data.columns] } });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const success = await service.reorderColumns("board-1", ["col-2", "col-1"]);
    expect(success).toBe(true);
  });

  it("should delete a column", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      ...boardDoc,
      data: { ...boardDoc.data, columns: [{ ...boardDoc.data.columns[0], taskIds: [] }, boardDoc.data.columns[1]] },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const success = await service.deleteColumn("board-1", "col-1");
    expect(success).toBe(true);
  });

  it("should return false when deleting non-existent column", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue(boardDoc);
    const success = await service.deleteColumn("board-1", "nonexistent");
    expect(success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Task CRUD
// ══════════════════════════════════════════════════════════════

describe("Task CRUD", () => {
  it("should create a task with auto-generated code", async () => {
    const boardDoc = {
      id: "board-1",
      name: "Board",
      category: "KANBAN_BOARD",
      generatedBy: "u1",
      createdAt: new Date(),
      data: {
        taskCounter: 0,
        columns: [{ id: "col-1", name: "To Do", color: "#3b82f6", wipLimit: 5, order: 0, taskIds: [] }],
      },
    };

    mockPrisma.generatedDocument.findFirst.mockResolvedValue(boardDoc);
    mockPrisma.generatedDocument.create.mockResolvedValue({
      id: "task-1",
      name: "Fix login bug",
      category: "KANBAN_TASK",
      generatedBy: "u1",
      createdAt: new Date(),
      data: { taskCode: "WS-001", title: "Fix login bug" },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const task = await service.createTask("board-1", "col-1", { title: "Fix login bug", type: "BUG", priority: "HIGH" }, "u1");
    expect(task).not.toBeNull();
    expect(task.taskCode).toBe("WS-001");
    expect(mockPrisma.generatedDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: "KANBAN_TASK" }),
      }),
    );
  });

  it("should update a task and record history", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "task-1",
      name: "Fix bug",
      category: "KANBAN_TASK",
      createdAt: new Date(),
      data: { title: "Fix bug", priority: "MEDIUM", history: [], status: "TODO" },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const result = await service.updateTask("task-1", { priority: "HIGH" }, "u1");
    expect(result).not.toBeNull();
    expect(mockPrisma.generatedDocument.update).toHaveBeenCalled();
  });

  it("should mark task as done with completedAt", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "task-1",
      name: "Task",
      category: "KANBAN_TASK",
      createdAt: new Date(),
      data: { title: "Task", status: "IN_PROGRESS", history: [], completedAt: null },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const result = await service.updateTask("task-1", { status: "DONE" }, "u1");
    expect(result.completedAt).not.toBeNull();
  });

  it("should delete a task and remove from column", async () => {
    mockPrisma.generatedDocument.findFirst
      .mockResolvedValueOnce({
        id: "task-1",
        data: { boardId: "board-1", columnId: "col-1" },
      })
      .mockResolvedValueOnce({
        id: "board-1",
        data: { columns: [{ id: "col-1", taskIds: ["task-1", "task-2"] }] },
      });
    mockPrisma.generatedDocument.update.mockResolvedValue({});
    mockPrisma.generatedDocument.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.deleteTask("task-1");
    expect(result).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// Drag & Drop — Move Task
// ══════════════════════════════════════════════════════════════

describe("Move Task (Drag & Drop)", () => {
  it("should move a task between columns", async () => {
    mockPrisma.generatedDocument.findFirst
      .mockResolvedValueOnce({
        id: "task-1",
        data: { boardId: "board-1", columnId: "col-1", history: [] },
      })
      .mockResolvedValueOnce({
        id: "board-1",
        data: {
          columns: [
            { id: "col-1", name: "To Do", taskIds: ["task-1", "task-2"] },
            { id: "col-2", name: "In Progress", taskIds: ["task-3"] },
          ],
        },
      });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const success = await service.moveTask("task-1", "col-2", 0);
    expect(success).toBe(true);
    expect(mockPrisma.generatedDocument.update).toHaveBeenCalledTimes(2);
  });

  it("should return false for non-existent task", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);
    const success = await service.moveTask("nonexistent", "col-2", 0);
    expect(success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Subtasks
// ══════════════════════════════════════════════════════════════

describe("Subtasks", () => {
  it("should add a subtask", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "task-1",
      data: { subtasks: [] },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const subtask = await service.addSubtask("task-1", "Write tests");
    expect(subtask).not.toBeNull();
    expect(subtask!.title).toBe("Write tests");
    expect(subtask!.completed).toBe(false);
  });

  it("should toggle subtask completion", async () => {
    const subtaskId = "sub-1";
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "task-1",
      data: { subtasks: [{ id: subtaskId, title: "Test", completed: false }] },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const result = await service.toggleSubtask("task-1", subtaskId);
    expect(result).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// Time Logging & Comments
// ══════════════════════════════════════════════════════════════

describe("Time Logging", () => {
  it("should log time on a task", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "task-1",
      data: { timeLogs: [] },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const log = await service.logTime("task-1", 2.5, "Debugging", "u1");
    expect(log).not.toBeNull();
    expect(log!.hours).toBe(2.5);
    expect(log!.description).toBe("Debugging");
  });
});

describe("Comments", () => {
  it("should add a comment to a task", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "task-1",
      data: { comments: [] },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const comment = await service.addComment("task-1", "u1", "Looks good!");
    expect(comment).not.toBeNull();
    expect(comment!.content).toBe("Looks good!");
  });
});

// ══════════════════════════════════════════════════════════════
// Labels
// ══════════════════════════════════════════════════════════════

describe("Labels", () => {
  it("should add a label", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "task-1",
      data: { labels: ["bug"] },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const result = await service.addLabel("task-1", "frontend");
    expect(result).toBe(true);
  });

  it("should not duplicate labels", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "task-1",
      data: { labels: ["bug"] },
    });

    const result = await service.addLabel("task-1", "bug");
    expect(result).toBe(true);
    expect(mockPrisma.generatedDocument.update).not.toHaveBeenCalled();
  });

  it("should remove a label", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "task-1",
      data: { labels: ["bug", "frontend"] },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const result = await service.removeLabel("task-1", "bug");
    expect(result).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// Metrics
// ══════════════════════════════════════════════════════════════

describe("Board Metrics", () => {
  it("should calculate board metrics", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "board-1",
      name: "Board",
      generatedBy: "u1",
      createdAt: new Date(),
      data: {
        columns: [
          { id: "c1", name: "To Do", wipLimit: 2, taskIds: ["t1", "t2", "t3"] },
          { id: "c2", name: "Done", wipLimit: 0, taskIds: ["t4"] },
        ],
      },
    });

    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      { id: "t1", createdAt: new Date("2026-03-01"), data: { status: "TODO", storyPoints: 3 } },
      { id: "t2", createdAt: new Date("2026-03-01"), data: { status: "TODO", storyPoints: 5 } },
      { id: "t3", createdAt: new Date("2026-03-01"), data: { status: "TODO", storyPoints: 2 } },
      { id: "t4", createdAt: new Date("2026-03-01"), data: { status: "DONE", storyPoints: 8, completedAt: "2026-03-03T00:00:00.000Z" } },
    ]);

    const metrics = await service.getBoardMetrics("board-1");
    expect(metrics).not.toBeNull();
    expect(metrics!.totalTasks).toBe(4);
    expect(metrics!.completedTasks).toBe(1);
    expect(metrics!.storyPointsCompleted).toBe(8);
    expect(metrics!.wipViolations).toHaveLength(1);
    expect(metrics!.wipViolations[0].columnName).toBe("To Do");
  });

  it("should get team workload", async () => {
    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      { id: "t1", name: "Task 1", data: { assigneeId: "u1", storyPoints: 3, title: "Task 1", priority: "HIGH" } },
      { id: "t2", name: "Task 2", data: { assigneeId: "u1", storyPoints: 5, title: "Task 2", priority: "MEDIUM" } },
      { id: "t3", name: "Task 3", data: { assigneeId: "u2", storyPoints: 2, title: "Task 3", priority: "LOW" } },
    ]);

    const workload = await service.getTeamWorkload("board-1");
    expect(workload).toHaveLength(2);

    const u1 = workload.find((w) => w.assigneeId === "u1");
    expect(u1!.taskCount).toBe(2);
    expect(u1!.storyPoints).toBe(8);
  });

  it("should return empty metrics for non-existent board", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);
    const metrics = await service.getBoardMetrics("nonexistent");
    expect(metrics).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// Task History
// ══════════════════════════════════════════════════════════════

describe("Task History", () => {
  it("should return task change history", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "task-1",
      data: {
        history: [
          { field: "priority", from: "MEDIUM", to: "HIGH", changedBy: "u1", changedAt: "2026-03-01T00:00:00Z" },
          { field: "status", from: "TODO", to: "IN_PROGRESS", changedBy: "u1", changedAt: "2026-03-02T00:00:00Z" },
        ],
      },
    });

    const history = await service.getTaskHistory("task-1");
    expect(history).toHaveLength(2);
    expect(history[0].field).toBe("priority");
  });

  it("should return empty history for non-existent task", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);
    const history = await service.getTaskHistory("nonexistent");
    expect(history).toHaveLength(0);
  });
});
