// ──────────────────────────────────────────────────────────────
// SprintManagementService — Test Suite
// Tests for sprints, burndown, velocity, backlog, planning.
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

import { SprintManagementService } from "../services/sprint-management.service";

// ══════════════════════════════════════════════════════════════
// Setup
// ══════════════════════════════════════════════════════════════

let service: SprintManagementService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new SprintManagementService();
});

// ══════════════════════════════════════════════════════════════
// Sprint CRUD
// ══════════════════════════════════════════════════════════════

describe("Sprint CRUD", () => {
  it("should create a sprint", async () => {
    mockPrisma.generatedDocument.create.mockResolvedValue({
      id: "sprint-1",
      name: "Sprint 1",
      category: "KANBAN_SPRINT",
      entityId: "board-1",
      generatedBy: "u1",
      createdAt: new Date("2026-03-01"),
      data: {
        boardId: "board-1",
        goal: "Complete auth",
        status: "PLANNED",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
        taskIds: [],
        velocity: null,
        scopeChanges: [],
      },
    });

    const sprint = await service.createSprint("board-1", "Sprint 1", "Complete auth", "2026-03-01", "2026-03-14", "u1");
    expect(sprint.name).toBe("Sprint 1");
    expect(sprint.status).toBe("PLANNED");
    expect(sprint.taskIds).toHaveLength(0);
    expect(mockPrisma.generatedDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ category: "KANBAN_SPRINT" }) }),
    );
  });

  it("should start a sprint", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "sprint-1",
      name: "Sprint 1",
      entityId: "board-1",
      generatedBy: "u1",
      createdAt: new Date("2026-03-01"),
      data: {
        boardId: "board-1",
        status: "PLANNED",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
        taskIds: ["task-1"],
        scopeChanges: [],
      },
    });

    // No active sprint
    mockPrisma.generatedDocument.findMany.mockResolvedValue([]);

    // Task for initial snapshot
    mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce({
      id: "sprint-1",
      name: "Sprint 1",
      entityId: "board-1",
      generatedBy: "u1",
      createdAt: new Date("2026-03-01"),
      data: {
        boardId: "board-1",
        status: "PLANNED",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
        taskIds: ["task-1"],
        scopeChanges: [],
      },
    });

    mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce({
      id: "task-1",
      data: { storyPoints: 5 },
    });

    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const sprint = await service.startSprint("sprint-1");
    expect(sprint).not.toBeNull();
    expect(mockPrisma.generatedDocument.update).toHaveBeenCalled();
  });

  it("should throw when starting a sprint if one is already active", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "sprint-2",
      name: "Sprint 2",
      entityId: "board-1",
      generatedBy: "u1",
      createdAt: new Date(),
      data: { boardId: "board-1", status: "PLANNED", taskIds: [], scopeChanges: [] },
    });

    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      {
        id: "sprint-1",
        data: { status: "ACTIVE" },
      },
    ]);

    await expect(service.startSprint("sprint-2")).rejects.toThrow("Another sprint is already active");
  });

  it("should complete a sprint", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce({
      id: "sprint-1",
      name: "Sprint 1",
      entityId: "board-1",
      generatedBy: "u1",
      createdAt: new Date(),
      data: { boardId: "board-1", status: "ACTIVE", taskIds: ["task-1", "task-2"], scopeChanges: [] },
    });

    // task-1 done, task-2 remaining
    mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce({
      id: "task-1",
      data: { status: "DONE", storyPoints: 5 },
    });
    mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce({
      id: "task-2",
      data: { status: "IN_PROGRESS", storyPoints: 3, sprintId: "sprint-1" },
    });

    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const result = await service.completeSprint("sprint-1", null);
    expect(result.completed).toContain("task-1");
    expect(result.moved).toContain("task-2");
  });
});

// ══════════════════════════════════════════════════════════════
// Sprint Task Management
// ══════════════════════════════════════════════════════════════

describe("Sprint Task Management", () => {
  it("should add a task to sprint", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce({
      id: "sprint-1",
      data: { taskIds: [], scopeChanges: [] },
    });

    mockPrisma.generatedDocument.update.mockResolvedValue({});

    mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce({
      id: "task-1",
      data: { sprintId: null },
    });

    const success = await service.addTaskToSprint("sprint-1", "task-1");
    expect(success).toBe(true);
    expect(mockPrisma.generatedDocument.update).toHaveBeenCalledTimes(2);
  });

  it("should not duplicate task in sprint", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "sprint-1",
      data: { taskIds: ["task-1"], scopeChanges: [] },
    });

    const success = await service.addTaskToSprint("sprint-1", "task-1");
    expect(success).toBe(true);
    expect(mockPrisma.generatedDocument.update).not.toHaveBeenCalled();
  });

  it("should remove a task from sprint", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce({
      id: "sprint-1",
      data: { taskIds: ["task-1", "task-2"], scopeChanges: [] },
    });

    mockPrisma.generatedDocument.update.mockResolvedValue({});

    mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce({
      id: "task-1",
      data: { sprintId: "sprint-1" },
    });

    const success = await service.removeTaskFromSprint("sprint-1", "task-1");
    expect(success).toBe(true);
  });

  it("should bulk plan sprint tasks", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "sprint-1",
      data: { taskIds: [], scopeChanges: [] },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const result = await service.planSprint("sprint-1", ["task-1", "task-2"]);
    expect(result.added).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════
// Burndown
// ══════════════════════════════════════════════════════════════

describe("Sprint Burndown", () => {
  it("should calculate burndown entries", async () => {
    const startDate = new Date("2026-03-01");
    const endDate = new Date("2026-03-07");

    mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce({
      id: "sprint-1",
      data: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        taskIds: ["task-1"],
        committedPoints: 10,
      },
    });

    // For each day, findFirst is called per task
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "task-1",
      data: { status: "TODO", storyPoints: 10, completedAt: null },
    });

    const burndown = await service.getSprintBurndown("sprint-1");
    expect(burndown.length).toBeGreaterThan(0);
    expect(burndown[0].remainingPoints).toBe(10);
    expect(burndown[0].idealRemaining).toBeDefined();
  });

  it("should return empty for non-existent sprint", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);
    const burndown = await service.getSprintBurndown("nonexistent");
    expect(burndown).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Velocity
// ══════════════════════════════════════════════════════════════

describe("Sprint Velocity", () => {
  it("should calculate velocity for completed sprints", async () => {
    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      { id: "s1", name: "Sprint 1", createdAt: new Date("2026-01-01"), data: { status: "COMPLETED", velocity: 20, committedPoints: 25 } },
      { id: "s2", name: "Sprint 2", createdAt: new Date("2026-02-01"), data: { status: "COMPLETED", velocity: 30, committedPoints: 30 } },
      { id: "s3", name: "Sprint 3", createdAt: new Date("2026-03-01"), data: { status: "ACTIVE", velocity: null } },
    ]);

    const velocity = await service.getSprintVelocity("board-1");
    expect(velocity).toHaveLength(2);
    expect(velocity[0].completedPoints).toBe(20);
    expect(velocity[1].completedPoints).toBe(30);
  });

  it("should get velocity trend for last N sprints", async () => {
    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      { id: "s1", name: "S1", createdAt: new Date("2026-01-01"), data: { status: "COMPLETED", velocity: 10, committedPoints: 15 } },
      { id: "s2", name: "S2", createdAt: new Date("2026-02-01"), data: { status: "COMPLETED", velocity: 20, committedPoints: 20 } },
      { id: "s3", name: "S3", createdAt: new Date("2026-03-01"), data: { status: "COMPLETED", velocity: 30, committedPoints: 35 } },
    ]);

    const trend = await service.getVelocityTrend("board-1", 2);
    expect(trend).toHaveLength(2);
    expect(trend[0].sprintName).toBe("S2");
  });
});

// ══════════════════════════════════════════════════════════════
// Backlog & Current Sprint
// ══════════════════════════════════════════════════════════════

describe("Backlog", () => {
  it("should return tasks not in any sprint", async () => {
    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      { id: "t1", name: "Task 1", createdAt: new Date(), data: { sprintId: null, title: "Task 1" } },
      { id: "t2", name: "Task 2", createdAt: new Date(), data: { sprintId: "sprint-1", title: "Task 2" } },
      { id: "t3", name: "Task 3", createdAt: new Date(), data: { sprintId: null, title: "Task 3" } },
    ]);

    const backlog = await service.getBacklog("board-1");
    expect(backlog).toHaveLength(2);
    expect(backlog[0].title).toBe("Task 1");
  });
});

describe("Current Sprint", () => {
  it("should return the active sprint", async () => {
    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      { id: "s1", name: "Sprint 1", entityId: "b1", generatedBy: "u1", createdAt: new Date(), data: { status: "COMPLETED", boardId: "b1", taskIds: [] } },
      { id: "s2", name: "Sprint 2", entityId: "b1", generatedBy: "u1", createdAt: new Date(), data: { status: "ACTIVE", boardId: "b1", taskIds: ["t1"] } },
    ]);

    const current = await service.getCurrentSprint("b1");
    expect(current).not.toBeNull();
    expect(current!.name).toBe("Sprint 2");
    expect(current!.status).toBe("ACTIVE");
  });

  it("should return null when no active sprint", async () => {
    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      { id: "s1", name: "S1", data: { status: "COMPLETED" } },
    ]);

    const current = await service.getCurrentSprint("b1");
    expect(current).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// Sprint Report
// ══════════════════════════════════════════════════════════════

describe("Sprint Report", () => {
  it("should generate sprint report", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce({
      id: "sprint-1",
      name: "Sprint 1",
      entityId: "board-1",
      generatedBy: "u1",
      createdAt: new Date("2026-03-01"),
      data: {
        boardId: "board-1",
        status: "COMPLETED",
        taskIds: ["task-1", "task-2"],
        scopeChanges: [],
        startDate: "2026-03-01",
        endDate: "2026-03-14",
      },
    });

    mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce({
      id: "task-1",
      name: "Task 1",
      createdAt: new Date("2026-03-01"),
      data: { taskCode: "WS-001", title: "Task 1", status: "DONE", storyPoints: 5, completedAt: "2026-03-10T00:00:00Z" },
    });

    mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce({
      id: "task-2",
      name: "Task 2",
      createdAt: new Date("2026-03-01"),
      data: { taskCode: "WS-002", title: "Task 2", status: "IN_PROGRESS", storyPoints: 3, completedAt: null },
    });

    const report = await service.getSprintReport("sprint-1");
    expect(report).not.toBeNull();
    expect(report!.completedTasks).toHaveLength(1);
    expect(report!.remainingTasks).toHaveLength(1);
    expect(report!.totalCompleted).toBe(5);
    expect(report!.totalCommitted).toBe(8);
    expect(report!.completionRate).toBeCloseTo(62.5, 1);
  });

  it("should return null for non-existent sprint", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);
    const report = await service.getSprintReport("nonexistent");
    expect(report).toBeNull();
  });
});
