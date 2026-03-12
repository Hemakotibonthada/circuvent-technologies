// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Sprint Entity (Project Tracker Domain)
// ══════════════════════════════════════════════════════════════════════════════

import { SprintEntity, SprintStatus, TaskStatus, SprintTask } from "../../../src/domain/entities/sprint.entity";

function createSprint(overrides?: Partial<ConstructorParameters<typeof SprintEntity>[0]>): SprintEntity {
  return new SprintEntity({
    id: "sprint-001",
    sprintNumber: 1,
    name: "Sprint 1",
    projectId: "proj-001",
    startDate: new Date("2026-03-01"),
    endDate: new Date("2026-03-14"),
    goal: "Complete MVP features",
    ...overrides,
  });
}

function createTask(overrides?: Partial<SprintTask>): SprintTask {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    title: "Test Task",
    description: null,
    status: TaskStatus.TODO,
    priority: "MEDIUM",
    storyPoints: 3,
    assigneeId: null,
    type: "FEATURE",
    createdAt: new Date(),
    completedAt: null,
    ...overrides,
  };
}

describe("SprintEntity", () => {
  describe("Creation", () => {
    it("should create a sprint with valid data", () => {
      const sprint = createSprint();
      expect(sprint.status).toBe(SprintStatus.PLANNING);
      expect(sprint.durationDays).toBe(13);
    });

    it("should reject end date before start date", () => {
      expect(() => createSprint({
        startDate: new Date("2026-03-14"),
        endDate: new Date("2026-03-01"),
      })).toThrow("end date cannot be before start date");
    });
  });

  describe("Velocity Metrics", () => {
    it("should calculate planned and completed points", () => {
      const sprint = createSprint();
      sprint.addTask(createTask({ storyPoints: 5, status: TaskStatus.DONE, completedAt: new Date() }));
      sprint.addTask(createTask({ storyPoints: 3, status: TaskStatus.IN_PROGRESS }));
      sprint.addTask(createTask({ storyPoints: 8, status: TaskStatus.TODO }));

      expect(sprint.plannedPoints).toBe(16);
      expect(sprint.completedPoints).toBe(5);
      expect(sprint.remainingPoints).toBe(11);
    });

    it("should calculate completion rate", () => {
      const sprint = createSprint();
      sprint.addTask(createTask({ storyPoints: 5, status: TaskStatus.DONE, completedAt: new Date() }));
      sprint.addTask(createTask({ storyPoints: 5, status: TaskStatus.TODO }));

      expect(sprint.completionRate).toBe(50);
    });

    it("should handle empty sprint", () => {
      const sprint = createSprint();
      expect(sprint.plannedPoints).toBe(0);
      expect(sprint.completionRate).toBe(0);
    });
  });

  describe("Sprint Lifecycle", () => {
    it("should start sprint from PLANNING", () => {
      const sprint = createSprint();
      sprint.addTask(createTask());
      sprint.start();
      expect(sprint.status).toBe(SprintStatus.ACTIVE);
    });

    it("should not start sprint with no tasks", () => {
      const sprint = createSprint();
      expect(() => sprint.start()).toThrow("no tasks");
    });

    it("should complete sprint from ACTIVE", () => {
      const sprint = createSprint();
      sprint.addTask(createTask({ storyPoints: 5, status: TaskStatus.DONE, completedAt: new Date() }));
      sprint.start();
      sprint.complete();
      expect(sprint.status).toBe(SprintStatus.COMPLETED);
    });

    it("should not complete PLANNING sprint", () => {
      const sprint = createSprint();
      expect(() => sprint.complete()).toThrow("Cannot complete");
    });

    it("should not add tasks to COMPLETED sprint", () => {
      const sprint = createSprint();
      sprint.addTask(createTask());
      sprint.start();
      sprint.complete();
      expect(() => sprint.addTask(createTask())).toThrow("Cannot add tasks");
    });
  });

  describe("Task Management", () => {
    it("should move task status", () => {
      const sprint = createSprint();
      const task = createTask({ id: "t-1" });
      sprint.addTask(task);
      sprint.moveTask("t-1", TaskStatus.IN_PROGRESS);
      expect(sprint.tasks[0].status).toBe(TaskStatus.IN_PROGRESS);
    });

    it("should set completedAt when task moves to DONE", () => {
      const sprint = createSprint();
      const task = createTask({ id: "t-1" });
      sprint.addTask(task);
      sprint.moveTask("t-1", TaskStatus.DONE);
      expect(sprint.tasks[0].completedAt).not.toBeNull();
    });

    it("should throw for unknown task", () => {
      const sprint = createSprint();
      expect(() => sprint.moveTask("nonexistent", TaskStatus.DONE)).toThrow("not found");
    });

    it("should generate task breakdown", () => {
      const sprint = createSprint();
      sprint.addTask(createTask({ storyPoints: 3, status: TaskStatus.TODO }));
      sprint.addTask(createTask({ storyPoints: 5, status: TaskStatus.DONE, completedAt: new Date() }));
      sprint.addTask(createTask({ storyPoints: 2, status: TaskStatus.DONE, completedAt: new Date() }));

      const breakdown = sprint.getTaskBreakdown();
      expect(breakdown.TODO).toEqual({ count: 1, points: 3 });
      expect(breakdown.DONE).toEqual({ count: 2, points: 7 });
    });
  });

  describe("Burndown Data", () => {
    it("should generate burndown chart data", () => {
      const sprint = createSprint({
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-03-05"),
      });
      sprint.addTask(createTask({ storyPoints: 10, status: TaskStatus.DONE, completedAt: new Date("2026-03-03") }));
      sprint.addTask(createTask({ storyPoints: 5, status: TaskStatus.TODO }));

      const data = sprint.getBurndownData();
      expect(data.length).toBeGreaterThan(0);
      expect(data[0].ideal).toBe(15); // Total points at day 0
      expect(data[0].actual).toBe(15);
    });
  });

  describe("Domain Events", () => {
    it("should produce events on start", () => {
      const sprint = createSprint();
      sprint.addTask(createTask());
      sprint.start();
      expect(sprint.events.some((e: any) => e.type === "SprintStarted")).toBe(true);
    });

    it("should produce events on completion with metrics", () => {
      const sprint = createSprint();
      sprint.addTask(createTask({ storyPoints: 5, status: TaskStatus.DONE, completedAt: new Date() }));
      sprint.start();
      sprint.complete();
      const event = sprint.events.find((e: any) => e.type === "SprintCompleted");
      expect(event).toBeDefined();
      expect(event?.payload.completedPoints).toBe(5);
    });
  });
});
