// ──────────────────────────────────────────────────────────────
// DevFlowService — Test Suite
// Tests for pipeline lifecycle, runs, environments, releases,
// test management, code reviews, analytics.
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

import { DevFlowService } from "../services/devflow.service";

// ══════════════════════════════════════════════════════════════
// Setup
// ══════════════════════════════════════════════════════════════

let service: DevFlowService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new DevFlowService();
});

// ══════════════════════════════════════════════════════════════
// Pipeline CRUD
// ══════════════════════════════════════════════════════════════

describe("Pipeline CRUD", () => {
  it("should create a new pipeline with valid input", async () => {
    const pipeline = await service.createPipeline(
      "Build API",
      "CI pipeline for API service",
      "https://github.com/circuvent/api",
      "main",
      [],
      [],
      [],
      ["api", "production"],
      "user-001",
    );

    expect(pipeline).toBeDefined();
    expect(pipeline.id).toBeTruthy();
    expect(pipeline.name).toBe("Build API");
    expect(pipeline.status).toBe("IDLE");
    expect(pipeline.runCount).toBe(0);
    expect(pipeline.tags).toEqual(["api", "production"]);
  });

  it("should list all pipelines", async () => {
    await service.createPipeline("Pipeline A", "", "", "main", [], [], [], [], "user-001");
    await service.createPipeline("Pipeline B", "", "", "main", [], [], [], [], "user-001");

    const pipelines = await service.listPipelines();
    expect(pipelines.length).toBeGreaterThanOrEqual(2);
  });

  it("should get a pipeline by id", async () => {
    const created = await service.createPipeline("Test Pipeline", "", "", "main", [], [], [], [], "user-001");
    const found = await service.getPipeline(created.id);
    expect(found).toBeDefined();
    expect(found?.name).toBe("Test Pipeline");
  });

  it("should update a pipeline", async () => {
    const created = await service.createPipeline("Old Name", "", "", "main", [], [], [], [], "user-001");
    const updated = await service.updatePipeline(created.id, { name: "New Name", description: "Updated desc" }, "user-001");
    expect(updated?.name).toBe("New Name");
    expect(updated?.description).toBe("Updated desc");
  });

  it("should delete a pipeline", async () => {
    const created = await service.createPipeline("To Delete", "", "", "main", [], [], [], [], "user-001");
    const result = await service.deletePipeline(created.id);
    expect(result).toBe(true);
    const found = await service.getPipeline(created.id);
    expect(found).toBeNull();
  });

  it("should return false deleting non-existent pipeline", async () => {
    expect(await service.deletePipeline("non-existent")).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Pipeline Runs
// ══════════════════════════════════════════════════════════════

describe("Pipeline Runs", () => {
  it("should trigger a pipeline run", async () => {
    const pipeline = await service.createPipeline("Trigger Test", "", "", "main", [], [], [], [], "user-001");
    const run = await service.triggerPipeline(pipeline.id, "development", "abc123", "test commit", "main", "user-001");
    expect(run).toBeDefined();
    expect(run?.pipelineId).toBe(pipeline.id);
    expect(run?.status).toBe("RUNNING");
    expect(run?.trigger).toBe("MANUAL");
  });

  it("should return null triggering non-existent pipeline", async () => {
    const run = await service.triggerPipeline("non-existent", "development", "abc123", "test commit", "main", "user-001");
    expect(run).toBeNull();
  });

  it("should list runs for a pipeline", async () => {
    const pipeline = await service.createPipeline("Runs Test", "", "", "main", [], [], [], [], "user-001");
    await service.triggerPipeline(pipeline.id, "development", "abc123", "commit 1", "main", "ci");
    await service.triggerPipeline(pipeline.id, "development", "def456", "commit 2", "develop", "ci");

    const runs = await service.listRuns(pipeline.id);
    expect(runs.length).toBe(2);
  });

  it("should cancel a running pipeline", async () => {
    const pipeline = await service.createPipeline("Cancel Test", "", "", "main", [], [], [], [], "user-001");
    const run = await service.triggerPipeline(pipeline.id, "development", "abc123", "test commit", "main", "user-001");
    if (run) {
      const cancelled = await service.cancelRun(run.id, "user-001");
      expect(cancelled).toBeDefined();
    }
  });
});

// ══════════════════════════════════════════════════════════════
// Environments
// ══════════════════════════════════════════════════════════════

describe("Environments", () => {
  it("should create an environment", async () => {
    const env = await service.createEnvironment(
      "Production",
      "PRODUCTION",
      "https://api.circuvent.com",
      {},
      ["user-001"],
      undefined,
      "user-001",
    );

    expect(env).toBeDefined();
    expect(env.name).toBe("Production");
    expect(env.type).toBe("PRODUCTION");
  });

  it("should list environments", async () => {
    await service.createEnvironment("Dev", "DEVELOPMENT", "http://localhost:3000", {}, [], undefined, "user-001");
    await service.createEnvironment("Staging", "STAGING", "https://staging.circuvent.com", {}, [], undefined, "user-001");

    const envs = await service.listEnvironments();
    expect(envs.length).toBeGreaterThanOrEqual(2);
  });
});

// ══════════════════════════════════════════════════════════════
// Releases
// ══════════════════════════════════════════════════════════════

describe("Releases", () => {
  it("should create a release", async () => {
    const pipeline = await service.createPipeline("Release Pipeline", "", "", "main", [], [], [], [], "user-001");
    const release = await service.createRelease(
      "v1.0.0",
      "1.0.0",
      pipeline.id,
      "Initial release",
      [],
      ["major"],
      "user-001",
    );

    expect(release).toBeDefined();
    expect(release.name).toBe("v1.0.0");
    expect(release.status).toBe("DRAFT");
  });

  it("should list releases", async () => {
    const releases = await service.listReleases();
    expect(Array.isArray(releases)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// Test Plans
// ══════════════════════════════════════════════════════════════

describe("Test Plans", () => {
  it("should create a test plan", async () => {
    const plan = await service.createTestPlan(
      "Regression Suite",
      "Full regression test suite",
      [],
      [],
      "user-001",
    );

    expect(plan).toBeDefined();
    expect(plan.name).toBe("Regression Suite");
    expect(plan.status).toBe("NOT_STARTED");
  });

  it("should list test plans", async () => {
    await service.createTestPlan("Unit Tests", "", [], [], "user-001");
    const plans = await service.listTestPlans();
    expect(plans.length).toBeGreaterThanOrEqual(1);
  });
});

// ══════════════════════════════════════════════════════════════
// Code Reviews
// ══════════════════════════════════════════════════════════════

describe("Code Reviews", () => {
  it("should create a code review", async () => {
    const review = await service.createCodeReview(
      "Add authentication middleware",
      "Implements JWT-based auth",
      "feature/auth",
      "main",
      ["user-002", "user-003"],
      5, 120, 30, [], [],
      "user-001",
    );

    expect(review).toBeDefined();
    expect(review.title).toBe("Add authentication middleware");
    expect(review.status).toBe("OPEN");
  });

  it("should approve a code review", async () => {
    const review = await service.createCodeReview(
      "Fix bug",
      "Bug fix",
      "fix/bug",
      "main",
      ["user-002"],
      2, 10, 5, [], [],
      "user-001",
    );

    const result = await service.approveCodeReview(review.id, "user-002");
    expect(result).toBeDefined();
  });

  it("should request changes on a review", async () => {
    const review = await service.createCodeReview(
      "Refactor module",
      "Cleanup",
      "refactor/module",
      "main",
      ["user-002"],
      3, 50, 20, [], [],
      "user-001",
    );

    const result = await service.requestChanges(review.id, "user-002", ["Needs more tests"]);
    expect(result).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════
// Analytics
// ══════════════════════════════════════════════════════════════

describe("Analytics", () => {
  it("should return velocity metrics", async () => {
    const velocity = await service.getVelocityMetrics({ start: "2026-01-01", end: "2026-03-11" });
    expect(velocity).toBeDefined();
    expect(velocity).toHaveProperty("avgBuildTime");
    expect(velocity).toHaveProperty("deploymentFrequency");
    expect(velocity).toHaveProperty("successRate");
  });

  it("should return quality metrics", async () => {
    const quality = await service.getQualityMetrics({ start: "2026-01-01", end: "2026-03-11" });
    expect(quality).toBeDefined();
    expect(quality).toHaveProperty("codeCoverage");
    expect(quality).toHaveProperty("bugRate");
  });

  it("should return deployment metrics (DORA)", async () => {
    const deployment = await service.getDeploymentMetrics({ start: "2026-01-01", end: "2026-03-11" });
    expect(deployment).toBeDefined();
    expect(deployment).toHaveProperty("totalDeployments");
    expect(deployment).toHaveProperty("mttr");
  });
});

// ══════════════════════════════════════════════════════════════
// Artifacts
// ══════════════════════════════════════════════════════════════

describe("Artifacts", () => {
  it("should return artifact list", async () => {
    const artifacts = await service.listArtifacts();
    expect(Array.isArray(artifacts)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// Dashboard
// ══════════════════════════════════════════════════════════════

describe("Dashboard", () => {
  it("should return dashboard data", async () => {
    const dashboard = await service.getDashboard();
    expect(dashboard).toBeDefined();
    expect(dashboard).toHaveProperty("pipelineCount");
    expect(dashboard).toHaveProperty("recentActivity");
  });
});
