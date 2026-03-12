/// <reference types="jest" />
// ──────────────────────────────────────────────────────────────
// WorkflowEngine — Test Suite
// Tests for definition management, instance lifecycle, step
// execution (all types), expression evaluator, approval,
// cancel/pause/resume, analytics.
// ──────────────────────────────────────────────────────────────

import {
  WorkflowEngine,
  ExpressionEvaluator,
  WorkflowDefinition,
  WorkflowStep,
} from "../utils/workflow-engine";

// ══════════════════════════════════════════════════════════════
// Setup
// ══════════════════════════════════════════════════════════════

let engine: WorkflowEngine;

function createTestDefinition(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: "wf-test",
    name: "Test Workflow",
    description: "A test workflow",
    version: 1,
    steps: [
      {
        id: "step-1",
        name: "Notification Step",
        type: "NOTIFICATION",
        config: {
          type: "NOTIFICATION",
          notification: { channels: ["EMAIL"], recipients: ["user-001"], template: "test", variables: {} },
        },
      },
      {
        id: "step-2",
        name: "Action Step",
        type: "ACTION",
        config: {
          type: "ACTION",
          action: { handler: "testHandler", params: { key: "value" } },
        },
      },
    ],
    triggers: [{ type: "MANUAL" }],
    variables: { projectId: "proj-001" },
    createdBy: "user-001",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "ACTIVE",
    ...overrides,
  };
}

beforeEach(() => {
  engine = new WorkflowEngine();
  engine.registerAction("testHandler", async (params) => ({ result: "success", params }));
});

// ══════════════════════════════════════════════════════════════
// Expression Evaluator
// ══════════════════════════════════════════════════════════════

describe("ExpressionEvaluator", () => {
  it("should evaluate simple equality", () => {
    expect(ExpressionEvaluator.evaluate("{{status}} == \"ACTIVE\"", { status: "ACTIVE" })).toBe(true);
    expect(ExpressionEvaluator.evaluate("{{status}} == \"INACTIVE\"", { status: "ACTIVE" })).toBe(false);
  });

  it("should evaluate numeric comparisons", () => {
    expect(ExpressionEvaluator.evaluate("{{count}} > 5", { count: 10 })).toBe(true);
    expect(ExpressionEvaluator.evaluate("{{count}} < 5", { count: 10 })).toBe(false);
    expect(ExpressionEvaluator.evaluate("{{count}} >= 10", { count: 10 })).toBe(true);
    expect(ExpressionEvaluator.evaluate("{{count}} <= 9", { count: 10 })).toBe(false);
  });

  it("should evaluate logical AND", () => {
    expect(ExpressionEvaluator.evaluate("{{a}} > 1 && {{b}} > 1", { a: 5, b: 3 })).toBe(true);
    expect(ExpressionEvaluator.evaluate("{{a}} > 1 && {{b}} > 5", { a: 5, b: 3 })).toBe(false);
  });

  it("should evaluate logical OR", () => {
    expect(ExpressionEvaluator.evaluate("{{a}} > 10 || {{b}} > 1", { a: 5, b: 3 })).toBe(true);
  });

  it("should evaluate NOT", () => {
    expect(ExpressionEvaluator.evaluate("!false", {})).toBe(true);
    expect(ExpressionEvaluator.evaluate("!true", {})).toBe(false);
  });

  it("should evaluate inequality", () => {
    expect(ExpressionEvaluator.evaluate("{{x}} != 0", { x: 5 })).toBe(true);
    expect(ExpressionEvaluator.evaluate("{{x}} != 5", { x: 5 })).toBe(false);
  });

  it("should resolve nested paths", () => {
    expect(ExpressionEvaluator.evaluate("{{user.age}} > 18", { user: { age: 25 } })).toBe(true);
  });

  it("should handle boolean literals", () => {
    expect(ExpressionEvaluator.evaluate("true", {})).toBe(true);
    expect(ExpressionEvaluator.evaluate("false", {})).toBe(false);
  });

  it("should handle null values", () => {
    expect(ExpressionEvaluator.evaluate("{{missing}} == null", {})).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// Definition Management
// ══════════════════════════════════════════════════════════════

describe("Definition Management", () => {
  it("should register and retrieve a definition", () => {
    const def = createTestDefinition();
    engine.registerDefinition(def);
    const found = engine.getDefinition("wf-test");
    expect(found).toBeDefined();
    expect(found?.name).toBe("Test Workflow");
  });

  it("should list definitions", () => {
    engine.registerDefinition(createTestDefinition({ id: "wf-1", name: "WF 1" }));
    engine.registerDefinition(createTestDefinition({ id: "wf-2", name: "WF 2" }));
    expect(engine.listDefinitions().length).toBe(2);
  });

  it("should update a definition", () => {
    engine.registerDefinition(createTestDefinition());
    const updated = engine.updateDefinition("wf-test", { name: "Updated Name" });
    expect(updated?.name).toBe("Updated Name");
  });

  it("should delete a definition", () => {
    engine.registerDefinition(createTestDefinition());
    expect(engine.deleteDefinition("wf-test")).toBe(true);
    expect(engine.getDefinition("wf-test")).toBeUndefined();
  });

  it("should return null updating non-existent definition", () => {
    expect(engine.updateDefinition("non-existent", {})).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// Instance Management
// ══════════════════════════════════════════════════════════════

describe("Instance Management", () => {
  it("should create a workflow instance", () => {
    engine.registerDefinition(createTestDefinition());
    const instance = engine.createInstance("wf-test", "user-001");
    expect(instance).toBeDefined();
    expect(instance?.status).toBe("RUNNING");
    expect(instance?.currentStepId).toBe("step-1");
  });

  it("should not create instance for non-existent definition", () => {
    expect(engine.createInstance("non-existent", "user-001")).toBeNull();
  });

  it("should not create instance for DRAFT definition", () => {
    engine.registerDefinition(createTestDefinition({ status: "DRAFT" }));
    expect(engine.createInstance("wf-test", "user-001")).toBeNull();
  });

  it("should list instances", () => {
    engine.registerDefinition(createTestDefinition());
    engine.createInstance("wf-test", "user-001");
    engine.createInstance("wf-test", "user-002");
    expect(engine.listInstances().length).toBe(2);
    expect(engine.listInstances("wf-test").length).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════
// Step Execution
// ══════════════════════════════════════════════════════════════

describe("Step Execution", () => {
  it("should execute a notification step", async () => {
    engine.registerDefinition(createTestDefinition());
    const instance = engine.createInstance("wf-test", "user-001")!;
    const result = await engine.executeStep(instance.id);

    expect(result).toBeDefined();
    expect(result?.status).toBe("COMPLETED");
    expect(result?.type).toBe("NOTIFICATION");
  });

  it("should execute an action step", async () => {
    engine.registerDefinition(createTestDefinition());
    const instance = engine.createInstance("wf-test", "user-001")!;

    await engine.executeStep(instance.id); // notification
    const result = await engine.executeStep(instance.id); // action

    expect(result?.status).toBe("COMPLETED");
    expect(result?.type).toBe("ACTION");
  });

  it("should complete workflow after all steps", async () => {
    engine.registerDefinition(createTestDefinition());
    const instance = engine.createInstance("wf-test", "user-001")!;

    await engine.executeStep(instance.id);
    await engine.executeStep(instance.id);

    const updated = engine.getInstance(instance.id);
    expect(updated?.status).toBe("COMPLETED");
    expect(updated?.completedAt).toBeTruthy();
  });

  it("should skip step when condition is false", async () => {
    const def = createTestDefinition({
      steps: [
        {
          id: "cond-step",
          name: "Conditional",
          type: "NOTIFICATION",
          condition: "{{enabled}} == true",
          config: {
            type: "NOTIFICATION",
            notification: { channels: ["EMAIL"], recipients: ["user-001"], template: "t", variables: {} },
          },
        },
      ],
    });
    engine.registerDefinition(def);
    const instance = engine.createInstance("wf-test", "user-001", { enabled: false })!;
    const result = await engine.executeStep(instance.id);
    expect(result?.status).toBe("SKIPPED");
  });

  it("should fail on unregistered action handler", async () => {
    const def = createTestDefinition({
      steps: [
        {
          id: "bad-action",
          name: "Bad Action",
          type: "ACTION",
          config: { type: "ACTION", action: { handler: "nonexistent", params: {} } },
        },
      ],
    });
    engine.registerDefinition(def);
    const instance = engine.createInstance("wf-test", "user-001")!;
    const result = await engine.executeStep(instance.id);
    expect(result?.status).toBe("FAILED");
  });
});

// ══════════════════════════════════════════════════════════════
// Cancel / Pause / Resume
// ══════════════════════════════════════════════════════════════

describe("Cancel / Pause / Resume", () => {
  it("should cancel a running instance", () => {
    engine.registerDefinition(createTestDefinition());
    const instance = engine.createInstance("wf-test", "user-001")!;
    expect(engine.cancelInstance(instance.id)).toBe(true);
    expect(engine.getInstance(instance.id)?.status).toBe("CANCELLED");
  });

  it("should pause and resume an instance", () => {
    engine.registerDefinition(createTestDefinition());
    const instance = engine.createInstance("wf-test", "user-001")!;
    expect(engine.pauseInstance(instance.id)).toBe(true);
    expect(engine.getInstance(instance.id)?.status).toBe("PAUSED");
    expect(engine.resumeInstance(instance.id)).toBe(true);
    expect(engine.getInstance(instance.id)?.status).toBe("RUNNING");
  });

  it("should not cancel a completed instance", async () => {
    engine.registerDefinition(createTestDefinition());
    const instance = engine.createInstance("wf-test", "user-001")!;
    await engine.executeStep(instance.id);
    await engine.executeStep(instance.id);
    expect(engine.cancelInstance(instance.id)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Approval
// ══════════════════════════════════════════════════════════════

describe("Approval", () => {
  it("should submit an approval record", async () => {
    const def = createTestDefinition({
      steps: [
        {
          id: "approval-step",
          name: "Approval",
          type: "APPROVAL",
          config: {
            type: "APPROVAL",
            approval: { approvers: ["mgr-001"], requiredApprovals: 1 },
          },
        },
      ],
    });
    engine.registerDefinition(def);
    const instance = engine.createInstance("wf-test", "user-001")!;
    await engine.executeStep(instance.id);

    const result = engine.submitApproval(instance.id, "approval-step", {
      approverId: "mgr-001",
      approverName: "Manager",
      decision: "APPROVED",
      comment: "Good to go",
      decidedAt: new Date().toISOString(),
    });
    expect(result).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// Analytics
// ══════════════════════════════════════════════════════════════

describe("Analytics", () => {
  it("should return workflow stats", async () => {
    engine.registerDefinition(createTestDefinition());
    const inst = engine.createInstance("wf-test", "user-001")!;
    await engine.executeStep(inst.id);
    await engine.executeStep(inst.id);

    const stats = engine.getWorkflowStats();
    expect(stats.totalInstances).toBeGreaterThan(0);
    expect(stats.completed).toBeGreaterThan(0);
  });

  it("should filter stats by definition", () => {
    engine.registerDefinition(createTestDefinition());
    engine.createInstance("wf-test", "user-001");

    const stats = engine.getWorkflowStats("wf-test");
    expect(stats.totalInstances).toBe(1);

    const otherStats = engine.getWorkflowStats("non-existent");
    expect(otherStats.totalInstances).toBe(0);
  });
});
