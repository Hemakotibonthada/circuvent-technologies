// ──────────────────────────────────────────────────────────────
// WorkStation Routes — Test Suite
// Tests for boards, columns, tasks, sprints, drag-drop,
// subtasks, time-logging, burndown, backlog, velocity.
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

import express from "express";
import request from "supertest";

const { workstationRouter } = require("../routes/workstation.routes");

const app = express();
app.use(express.json());
app.use("/workstation", workstationRouter);

// ══════════════════════════════════════════════════════════════
// Test Data
// ══════════════════════════════════════════════════════════════

const mockBoard = {
  id: "board-1",
  name: "Sprint Board",
  entityType: "WS_BOARD",
  category: "WORKSTATION",
  data: { description: "Main board", columnOrder: ["col-1", "col-2"] },
  createdAt: new Date("2026-03-01"),
  generatedBy: "user-1",
};

const mockColumn = {
  id: "col-1",
  name: "To Do",
  entityType: "WS_COLUMN",
  entityId: "board-1",
  category: "WORKSTATION",
  data: { order: 0, taskIds: [], boardId: "board-1" },
  createdAt: new Date("2026-03-01"),
  generatedBy: "user-1",
};

const mockTask = {
  id: "task-1",
  name: "Implement login",
  entityType: "WS_TASK",
  entityId: "col-1",
  category: "WORKSTATION",
  data: {
    taskCode: "TASK-00001",
    title: "Implement login",
    description: "Add OAuth2 login",
    type: "TASK",
    priority: "HIGH",
    status: "TODO",
    assigneeId: "user-1",
    sprintId: null,
    storyPoints: 5,
    labels: ["frontend"],
    createdBy: "user-1",
    completedAt: null,
    movedAt: new Date().toISOString(),
  },
  createdAt: new Date("2026-03-05"),
  generatedBy: "user-1",
};

const mockSprint = {
  id: "sprint-1",
  name: "Sprint 1",
  entityType: "WS_SPRINT",
  entityId: "board-1",
  category: "WORKSTATION",
  data: {
    goal: "Complete auth module",
    startDate: "2026-03-01",
    endDate: "2026-03-15",
    status: "PLANNED",
    boardId: "board-1",
    velocity: 0,
    startedAt: null,
    completedAt: null,
  },
  createdAt: new Date("2026-03-01"),
  generatedBy: "user-1",
};

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("WorkStation Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Boards ─────────────────────────────────────────────

  describe("GET /workstation/boards", () => {
    it("should list all boards", async () => {
      mockPrisma.generatedDocument.findMany.mockResolvedValue([mockBoard]);

      const res = await request(app).get("/workstation/boards");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0].name).toBe("Sprint Board");
    });
  });

  describe("POST /workstation/boards", () => {
    it("should create a board with default columns", async () => {
      mockPrisma.generatedDocument.create.mockResolvedValue(mockBoard);
      mockPrisma.generatedDocument.update.mockResolvedValue(mockBoard);

      const res = await request(app).post("/workstation/boards").send({
        name: "New Board",
        userId: "user-1",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Sprint Board");
    });

    it("should reject missing name or userId", async () => {
      const res = await request(app).post("/workstation/boards").send({});

      expect(res.status).toBe(400);
    });
  });

  describe("GET /workstation/boards/:id", () => {
    it("should return board detail with columns and tasks", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.generatedDocument.findMany.mockResolvedValue([mockColumn]);

      const res = await request(app).get("/workstation/boards/board-1");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("columns");
    });

    it("should return 404 for non-existent board", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(null);

      const res = await request(app).get("/workstation/boards/bad-id");

      expect(res.status).toBe(404);
    });
  });

  describe("PUT /workstation/boards/:id", () => {
    it("should update board name", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.generatedDocument.update.mockResolvedValue({ ...mockBoard, name: "Updated" });

      const res = await request(app).put("/workstation/boards/board-1").send({ name: "Updated" });

      expect(res.status).toBe(200);
    });
  });

  // ── Columns ────────────────────────────────────────────

  describe("POST /workstation/boards/:id/columns", () => {
    it("should add a column to the board", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockBoard);
      mockPrisma.generatedDocument.count.mockResolvedValue(2);
      mockPrisma.generatedDocument.create.mockResolvedValue({ ...mockColumn, id: "col-3" });
      mockPrisma.generatedDocument.update.mockResolvedValue(mockBoard);

      const res = await request(app).post("/workstation/boards/board-1/columns").send({
        name: "Testing",
        userId: "user-1",
      });

      expect(res.status).toBe(201);
    });
  });

  describe("PUT /workstation/columns/:id", () => {
    it("should update column name and order", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.generatedDocument.update.mockResolvedValue({ ...mockColumn, name: "Done" });

      const res = await request(app).put("/workstation/columns/col-1").send({ name: "Done", order: 3 });

      expect(res.status).toBe(200);
    });
  });

  describe("DELETE /workstation/columns/:id", () => {
    it("should delete column and its tasks", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockColumn);
      mockPrisma.generatedDocument.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.generatedDocument.delete.mockResolvedValue(mockColumn);

      const res = await request(app).delete("/workstation/columns/col-1");

      expect(res.status).toBe(200);
    });
  });

  // ── Tasks ──────────────────────────────────────────────

  describe("GET /workstation/tasks", () => {
    it("should list tasks", async () => {
      mockPrisma.generatedDocument.findMany.mockResolvedValue([mockTask]);

      const res = await request(app).get("/workstation/tasks");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("should filter by boardId", async () => {
      mockPrisma.generatedDocument.findMany
        .mockResolvedValueOnce([{ id: "col-1" }])
        .mockResolvedValueOnce([mockTask]);

      const res = await request(app).get("/workstation/tasks?boardId=board-1");

      expect(res.status).toBe(200);
    });
  });

  describe("POST /workstation/tasks", () => {
    it("should create a task", async () => {
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(mockColumn);
      mockPrisma.generatedDocument.create.mockResolvedValue(mockTask);

      const res = await request(app).post("/workstation/tasks").send({
        title: "Implement login",
        type: "TASK",
        priority: "HIGH",
        storyPoints: 5,
        boardId: "board-1",
        userId: "user-1",
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty("taskCode");
    });

    it("should reject without title or userId", async () => {
      const res = await request(app).post("/workstation/tasks").send({});

      expect(res.status).toBe(400);
    });
  });

  describe("GET /workstation/tasks/:id", () => {
    it("should return task detail with comments, subtasks, logs", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockTask);
      mockPrisma.generatedDocument.findMany.mockResolvedValue([]);

      const res = await request(app).get("/workstation/tasks/task-1");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("comments");
      expect(res.body.data).toHaveProperty("subtasks");
      expect(res.body.data).toHaveProperty("timeLogs");
    });
  });

  describe("PUT /workstation/tasks/:id", () => {
    it("should update task fields", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockTask);
      mockPrisma.generatedDocument.update.mockResolvedValue(mockTask);

      const res = await request(app).put("/workstation/tasks/task-1").send({
        status: "IN_PROGRESS",
        priority: "CRITICAL",
      });

      expect(res.status).toBe(200);
    });
  });

  describe("DELETE /workstation/tasks/:id", () => {
    it("should delete a task and its associated data", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockTask);
      mockPrisma.generatedDocument.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.generatedDocument.delete.mockResolvedValue(mockTask);

      const res = await request(app).delete("/workstation/tasks/task-1");

      expect(res.status).toBe(200);
    });
  });

  // ── Move Task ──────────────────────────────────────────

  describe("POST /workstation/tasks/:id/move", () => {
    it("should move task to another column", async () => {
      mockPrisma.generatedDocument.findUnique
        .mockResolvedValueOnce(mockTask)
        .mockResolvedValueOnce({ ...mockColumn, id: "col-2" });
      mockPrisma.generatedDocument.update.mockResolvedValue({ ...mockTask, entityId: "col-2" });

      const res = await request(app).post("/workstation/tasks/task-1/move").send({
        targetColumnId: "col-2",
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("moved");
    });

    it("should reject without targetColumnId", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockTask);

      const res = await request(app).post("/workstation/tasks/task-1/move").send({});

      expect(res.status).toBe(400);
    });
  });

  // ── Comments & Subtasks ────────────────────────────────

  describe("POST /workstation/tasks/:id/comments", () => {
    it("should add a comment to a task", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockTask);
      mockPrisma.generatedDocument.create.mockResolvedValue({
        id: "cmt-1", entityType: "WS_COMMENT", data: { content: "Nice work", userId: "user-1" }, createdAt: new Date(),
      });

      const res = await request(app).post("/workstation/tasks/task-1/comments").send({
        content: "Nice work",
        userId: "user-1",
      });

      expect(res.status).toBe(201);
    });
  });

  describe("POST /workstation/tasks/:id/subtasks", () => {
    it("should add a subtask", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockTask);
      mockPrisma.generatedDocument.create.mockResolvedValue({
        id: "sub-1", entityType: "WS_SUBTASK", data: { title: "Design UI", completed: false }, createdAt: new Date(),
      });

      const res = await request(app).post("/workstation/tasks/task-1/subtasks").send({
        title: "Design UI",
        userId: "user-1",
      });

      expect(res.status).toBe(201);
    });
  });

  describe("POST /workstation/tasks/:id/time-log", () => {
    it("should log time", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockTask);
      mockPrisma.generatedDocument.create.mockResolvedValue({
        id: "tl-1", entityType: "WS_TIMELOG", data: { minutes: 60, userId: "user-1" }, createdAt: new Date(),
      });

      const res = await request(app).post("/workstation/tasks/task-1/time-log").send({
        minutes: 60,
        description: "Working on auth flow",
        userId: "user-1",
      });

      expect(res.status).toBe(201);
    });
  });

  // ── Sprints ────────────────────────────────────────────

  describe("GET /workstation/sprints", () => {
    it("should list sprints", async () => {
      mockPrisma.generatedDocument.findMany.mockResolvedValue([mockSprint]);

      const res = await request(app).get("/workstation/sprints");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe("POST /workstation/sprints", () => {
    it("should create a sprint", async () => {
      mockPrisma.generatedDocument.create.mockResolvedValue(mockSprint);

      const res = await request(app).post("/workstation/sprints").send({
        name: "Sprint 1",
        goal: "Auth module",
        startDate: "2026-03-01",
        endDate: "2026-03-15",
        userId: "user-1",
      });

      expect(res.status).toBe(201);
    });

    it("should reject missing fields", async () => {
      const res = await request(app).post("/workstation/sprints").send({ name: "Sprint" });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /workstation/sprints/:id/start", () => {
    it("should start a sprint", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockSprint);
      mockPrisma.generatedDocument.update.mockResolvedValue({
        ...mockSprint, data: { ...mockSprint.data, status: "ACTIVE" },
      });

      const res = await request(app).post("/workstation/sprints/sprint-1/start");

      expect(res.status).toBe(200);
    });
  });

  describe("POST /workstation/sprints/:id/complete", () => {
    it("should complete a sprint with summary", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({
        ...mockSprint, data: { ...mockSprint.data, status: "ACTIVE" },
      });
      mockPrisma.generatedDocument.findMany.mockResolvedValue([
        { ...mockTask, data: { ...mockTask.data, sprintId: "sprint-1", status: "DONE", storyPoints: 5 } },
      ]);
      mockPrisma.generatedDocument.update.mockResolvedValue(mockSprint);

      const res = await request(app).post("/workstation/sprints/sprint-1/complete");

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("completed");
    });
  });

  describe("GET /workstation/sprints/:id/burndown", () => {
    it("should return burndown data", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockSprint);
      mockPrisma.generatedDocument.findMany.mockResolvedValue([]);

      const res = await request(app).get("/workstation/sprints/sprint-1/burndown");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("totalPoints");
      expect(res.body.data).toHaveProperty("burndown");
    });
  });

  // ── Dashboard & Reports ────────────────────────────────

  describe("GET /workstation/dashboard", () => {
    it("should return overview metrics", async () => {
      mockPrisma.generatedDocument.findMany.mockResolvedValue([]);
      mockPrisma.generatedDocument.count.mockResolvedValue(0);

      const res = await request(app).get("/workstation/dashboard");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("totalTasks");
      expect(res.body.data).toHaveProperty("tasksByStatus");
      expect(res.body.data).toHaveProperty("avgVelocity");
    });
  });

  describe("GET /workstation/backlog", () => {
    it("should return tasks not in any sprint", async () => {
      mockPrisma.generatedDocument.findMany.mockResolvedValue([
        { ...mockTask, data: { ...mockTask.data, sprintId: null } },
      ]);

      const res = await request(app).get("/workstation/backlog");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe("GET /workstation/reports/velocity", () => {
    it("should return velocity chart data", async () => {
      mockPrisma.generatedDocument.findMany.mockResolvedValue([
        { ...mockSprint, data: { ...mockSprint.data, status: "COMPLETED", velocity: 25 } },
      ]);

      const res = await request(app).get("/workstation/reports/velocity");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("sprints");
      expect(res.body.data).toHaveProperty("averageVelocity");
    });
  });

  describe("GET /workstation/reports/cycle-time", () => {
    it("should return cycle time data", async () => {
      mockPrisma.generatedDocument.findMany.mockResolvedValue([
        {
          ...mockTask,
          data: {
            ...mockTask.data,
            status: "DONE",
            completedAt: "2026-03-10T14:00:00Z",
            taskCode: "TASK-00001",
          },
        },
      ]);

      const res = await request(app).get("/workstation/reports/cycle-time");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("totalCompleted");
      expect(res.body.data).toHaveProperty("averageCycleDays");
    });
  });

  // ── Labels ─────────────────────────────────────────────

  describe("POST /workstation/tasks/:id/labels", () => {
    it("should add a label", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockTask);
      mockPrisma.generatedDocument.update.mockResolvedValue(mockTask);

      const res = await request(app).post("/workstation/tasks/task-1/labels").send({ label: "urgent" });

      expect(res.status).toBe(200);
    });

    it("should reject without label", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockTask);

      const res = await request(app).post("/workstation/tasks/task-1/labels").send({});

      expect(res.status).toBe(400);
    });
  });
});
