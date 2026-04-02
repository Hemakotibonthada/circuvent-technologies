// ──────────────────────────────────────────────────────────────
// HR Payroll — DevFlow Routes (Azure DevOps-like CI/CD)
// Full CI/CD management: pipelines, runs, stages, environments,
// releases, test plans, code reviews, artifacts, analytics.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { DevFlowService } from "../services/devflow.service";

const router = Router();
const devflowService = new DevFlowService();

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function successResponse<T>(data: T, message?: string, meta?: any) {
  return { success: true, data, message, meta };
}

function errorResponse(error: string) {
  return { success: false, error };
}

function getUserId(req: Request): string {
  return (req as any).user?.id || "system";
}

function parseDateRange(req: Request): { start: string; end: string } {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    start: (req.query.start as string) || thirtyDaysAgo.toISOString(),
    end: (req.query.end as string) || now.toISOString(),
  };
}

// ══════════════════════════════════════════════════════════════
// Dashboard
// ══════════════════════════════════════════════════════════════

/**
 * GET /devflow/dashboard
 * Overview metrics, recent activity, security overview
 */
router.get("/devflow/dashboard", async (req: Request, res: Response) => {
  try {
    const dashboard = await devflowService.getDashboard();
    res.json(successResponse(dashboard, "DevFlow dashboard loaded"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to load dashboard"));
  }
});

// ══════════════════════════════════════════════════════════════
// Pipeline CRUD
// ══════════════════════════════════════════════════════════════

/**
 * GET /devflow/pipelines
 * List all pipelines with optional filtering
 */
router.get("/devflow/pipelines", async (req: Request, res: Response) => {
  try {
    const { status, tag, search } = req.query;
    const pipelines = await devflowService.listPipelines({
      status: status as any,
      tag: tag as string,
      search: search as string,
    });
    res.json(
      successResponse(pipelines, "Pipelines listed", {
        total: pipelines.length,
        running: pipelines.filter((p) => p.status === "RUNNING").length,
        succeeded: pipelines.filter((p) => p.status === "SUCCEEDED").length,
        failed: pipelines.filter((p) => p.status === "FAILED").length,
        idle: pipelines.filter((p) => p.status === "IDLE").length,
      }),
    );
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to list pipelines"));
  }
});

/**
 * POST /devflow/pipelines
 * Create a new pipeline with stages and steps
 */
router.post("/devflow/pipelines", async (req: Request, res: Response) => {
  try {
    const { name, description, repositoryUrl, defaultBranch, stages, triggers, variables, tags } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json(errorResponse("Pipeline name is required"));
    }
    if (!stages || !Array.isArray(stages) || stages.length === 0) {
      return res.status(400).json(errorResponse("At least one stage is required"));
    }

    for (const stage of stages) {
      if (!stage.name || !stage.name.trim()) {
        return res.status(400).json(errorResponse("Each stage must have a name"));
      }
      if (!stage.steps || !Array.isArray(stage.steps) || stage.steps.length === 0) {
        return res.status(400).json(errorResponse(`Stage "${stage.name}" must have at least one step`));
      }
      for (const step of stage.steps) {
        if (!step.name || !step.name.trim()) {
          return res.status(400).json(errorResponse(`Steps in stage "${stage.name}" must have a name`));
        }
        if (!step.type) {
          return res.status(400).json(errorResponse(`Step "${step.name}" must have a type`));
        }
      }
    }

    const userId = getUserId(req);
    const pipeline = await devflowService.createPipeline(
      name.trim(),
      description || "",
      repositoryUrl || "",
      defaultBranch || "main",
      stages.map((s: any, idx: number) => ({
        id: s.id || `stage-${idx}`,
        name: s.name,
        dependsOn: s.dependsOn || [],
        steps: s.steps.map((st: any, sIdx: number) => ({
          id: st.id || `step-${idx}-${sIdx}`,
          name: st.name,
          type: st.type || "TASK",
          command: st.command,
          timeout: st.timeout || 600,
          retryCount: st.retryCount || 0,
          continueOnError: st.continueOnError || false,
          condition: st.condition,
          environment: st.environment,
        })),
        condition: s.condition,
        environment: s.environment,
      })),
      triggers || [{ type: "MANUAL" }],
      variables || [],
      tags || [],
      userId,
    );

    res.status(201).json(successResponse(pipeline, "Pipeline created"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to create pipeline"));
  }
});

/**
 * GET /devflow/pipelines/:id
 * Pipeline detail
 */
router.get("/devflow/pipelines/:id", async (req: Request, res: Response) => {
  try {
    const pipeline = await devflowService.getPipeline(req.params.id);
    if (!pipeline) {
      return res.status(404).json(errorResponse("Pipeline not found"));
    }

    const runs = await devflowService.listRuns(req.params.id, 10);
    res.json(
      successResponse(
        { ...pipeline, recentRuns: runs },
        "Pipeline detail loaded",
        {
          totalStages: pipeline.stages.length,
          totalSteps: pipeline.stages.reduce((acc, s) => acc + s.steps.length, 0),
          totalRuns: pipeline.runCount,
        },
      ),
    );
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to load pipeline"));
  }
});

/**
 * PUT /devflow/pipelines/:id
 * Update pipeline
 */
router.put("/devflow/pipelines/:id", async (req: Request, res: Response) => {
  try {
    const { name, description, repositoryUrl, defaultBranch, stages, triggers, variables, tags } = req.body;
    const userId = getUserId(req);

    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description;
    if (repositoryUrl !== undefined) updates.repositoryUrl = repositoryUrl;
    if (defaultBranch !== undefined) updates.defaultBranch = defaultBranch;
    if (stages !== undefined) {
      if (!Array.isArray(stages) || stages.length === 0) {
        return res.status(400).json(errorResponse("At least one stage is required"));
      }
      updates.stages = stages.map((s: any, idx: number) => ({
        id: s.id || `stage-${idx}`,
        name: s.name,
        dependsOn: s.dependsOn || [],
        steps: (s.steps || []).map((st: any, sIdx: number) => ({
          id: st.id || `step-${idx}-${sIdx}`,
          name: st.name,
          type: st.type || "TASK",
          command: st.command,
          timeout: st.timeout || 600,
          retryCount: st.retryCount || 0,
          continueOnError: st.continueOnError || false,
          condition: st.condition,
          environment: st.environment,
        })),
        condition: s.condition,
        environment: s.environment,
      }));
    }
    if (triggers !== undefined) updates.triggers = triggers;
    if (variables !== undefined) updates.variables = variables;
    if (tags !== undefined) updates.tags = tags;

    const updated = await devflowService.updatePipeline(req.params.id, updates, userId);
    if (!updated) {
      return res.status(404).json(errorResponse("Pipeline not found"));
    }

    res.json(successResponse(updated, "Pipeline updated"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to update pipeline"));
  }
});

/**
 * DELETE /devflow/pipelines/:id
 * Delete pipeline
 */
router.delete("/devflow/pipelines/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await devflowService.deletePipeline(req.params.id);
    if (!deleted) {
      return res.status(404).json(errorResponse("Pipeline not found"));
    }
    res.json(successResponse(null, "Pipeline deleted"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to delete pipeline"));
  }
});

/**
 * POST /devflow/pipelines/:id/trigger
 * Trigger a pipeline run
 */
router.post("/devflow/pipelines/:id/trigger", async (req: Request, res: Response) => {
  try {
    const { environment, commitHash, commitMessage, branch, variables } = req.body;
    const userId = getUserId(req);

    if (!environment) {
      return res.status(400).json(errorResponse("Environment is required"));
    }

    const run = await devflowService.triggerPipeline(
      req.params.id,
      environment,
      commitHash || "HEAD",
      commitMessage || "Manual trigger",
      branch || "main",
      userId,
      variables,
    );

    if (!run) {
      return res.status(404).json(errorResponse("Pipeline not found"));
    }

    res.status(201).json(successResponse(run, "Pipeline triggered"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to trigger pipeline"));
  }
});

/**
 * GET /devflow/pipelines/:id/runs
 * List pipeline runs
 */
router.get("/devflow/pipelines/:id/runs", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const runs = await devflowService.listRuns(req.params.id, limit);
    res.json(
      successResponse(runs, "Pipeline runs listed", {
        total: runs.length,
        succeeded: runs.filter((r) => r.status === "SUCCEEDED").length,
        failed: runs.filter((r) => r.status === "FAILED").length,
        running: runs.filter((r) => r.status === "RUNNING").length,
        cancelled: runs.filter((r) => r.status === "CANCELLED").length,
      }),
    );
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to list runs"));
  }
});

// ══════════════════════════════════════════════════════════════
// Pipeline Runs
// ══════════════════════════════════════════════════════════════

/**
 * GET /devflow/runs/:id
 * Run detail with stage/step statuses
 */
router.get("/devflow/runs/:id", async (req: Request, res: Response) => {
  try {
    const run = await devflowService.getRun(req.params.id);
    if (!run) {
      return res.status(404).json(errorResponse("Run not found"));
    }

    const totalSteps = run.stages.reduce((acc, s) => acc + s.steps.length, 0);
    const completedSteps = run.stages.reduce(
      (acc, s) => acc + s.steps.filter((st) => st.status === "SUCCEEDED" || st.status === "FAILED").length,
      0,
    );
    const failedSteps = run.stages.reduce(
      (acc, s) => acc + s.steps.filter((st) => st.status === "FAILED").length,
      0,
    );

    res.json(
      successResponse(run, "Run detail loaded", {
        totalStages: run.stages.length,
        completedStages: run.stages.filter((s) => s.status === "SUCCEEDED" || s.status === "FAILED").length,
        totalSteps,
        completedSteps,
        failedSteps,
        progress: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
      }),
    );
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to load run"));
  }
});

/**
 * POST /devflow/runs/:id/cancel
 * Cancel a running pipeline
 */
router.post("/devflow/runs/:id/cancel", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const run = await devflowService.cancelRun(req.params.id, userId);
    if (!run) {
      return res.status(404).json(errorResponse("Run not found"));
    }
    if (run.status !== "CANCELLED") {
      return res.status(400).json(errorResponse("Run is not in a cancellable state"));
    }
    res.json(successResponse(run, "Run cancelled"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to cancel run"));
  }
});

/**
 * POST /devflow/runs/:id/retry
 * Retry failed run steps
 */
router.post("/devflow/runs/:id/retry", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const run = await devflowService.retryFailedSteps(req.params.id, userId);
    if (!run) {
      return res.status(404).json(errorResponse("Run not found"));
    }
    res.json(successResponse(run, "Failed steps retried"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to retry run"));
  }
});

// ══════════════════════════════════════════════════════════════
// Environments
// ══════════════════════════════════════════════════════════════

/**
 * GET /devflow/environments
 * List deployment environments
 */
router.get("/devflow/environments", async (req: Request, res: Response) => {
  try {
    const environments = await devflowService.listEnvironments();
    const statusCounts = environments.reduce(
      (acc, e) => {
        acc[e.status] = (acc[e.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    res.json(
      successResponse(environments, "Environments listed", {
        total: environments.length,
        statusCounts,
        byType: environments.reduce(
          (acc, e) => {
            acc[e.type] = (acc[e.type] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      }),
    );
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to list environments"));
  }
});

/**
 * POST /devflow/environments
 * Create a deployment environment
 */
router.post("/devflow/environments", async (req: Request, res: Response) => {
  try {
    const { name, type, url, variables, approvers, healthCheckUrl } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json(errorResponse("Environment name is required"));
    }
    if (!type) {
      return res.status(400).json(errorResponse("Environment type is required"));
    }

    const validTypes = ["DEVELOPMENT", "STAGING", "PRODUCTION", "QA", "UAT", "DR"];
    if (!validTypes.includes(type)) {
      return res.status(400).json(errorResponse(`Invalid environment type. Must be one of: ${validTypes.join(", ")}`));
    }

    const userId = getUserId(req);
    const env = await devflowService.createEnvironment(
      name.trim(),
      type,
      url || "",
      variables || {},
      approvers || [],
      healthCheckUrl,
      userId,
    );

    res.status(201).json(successResponse(env, "Environment created"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to create environment"));
  }
});

// ══════════════════════════════════════════════════════════════
// Releases
// ══════════════════════════════════════════════════════════════

/**
 * GET /devflow/releases
 * List releases with optional filtering
 */
router.get("/devflow/releases", async (req: Request, res: Response) => {
  try {
    const { status, pipelineId } = req.query;
    const releases = await devflowService.listReleases({
      status: status as any,
      pipelineId: pipelineId as string,
    });

    res.json(
      successResponse(releases, "Releases listed", {
        total: releases.length,
        draft: releases.filter((r) => r.status === "DRAFT").length,
        active: releases.filter((r) => r.status === "ACTIVE").length,
        deployed: releases.filter((r) => r.status === "DEPLOYED").length,
        archived: releases.filter((r) => r.status === "ARCHIVED").length,
      }),
    );
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to list releases"));
  }
});

/**
 * POST /devflow/releases
 * Create a new release
 */
router.post("/devflow/releases", async (req: Request, res: Response) => {
  try {
    const { name, version, pipelineId, releaseNotes, artifacts, tags } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json(errorResponse("Release name is required"));
    }
    if (!version || !version.trim()) {
      return res.status(400).json(errorResponse("Release version is required"));
    }
    if (!pipelineId) {
      return res.status(400).json(errorResponse("Pipeline ID is required"));
    }

    const userId = getUserId(req);
    const release = await devflowService.createRelease(
      name.trim(),
      version.trim(),
      pipelineId,
      releaseNotes || "",
      artifacts || [],
      tags || [],
      userId,
    );

    res.status(201).json(successResponse(release, "Release created"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to create release"));
  }
});

/**
 * POST /devflow/releases/:id/deploy
 * Deploy a release to an environment
 */
router.post("/devflow/releases/:id/deploy", async (req: Request, res: Response) => {
  try {
    const { environmentId } = req.body;

    if (!environmentId) {
      return res.status(400).json(errorResponse("Environment ID is required"));
    }

    const userId = getUserId(req);
    const release = await devflowService.deployRelease(req.params.id, environmentId, userId);
    if (!release) {
      return res.status(404).json(errorResponse("Release or environment not found"));
    }

    const lastDeployment = release.deployments.find((d) => d.environmentId === environmentId);
    res.json(
      successResponse(release, `Deployment ${lastDeployment?.status === "SUCCEEDED" ? "succeeded" : "failed"}`, {
        deploymentStatus: lastDeployment?.status,
        deploymentDuration: lastDeployment?.duration,
      }),
    );
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to deploy release"));
  }
});

// ══════════════════════════════════════════════════════════════
// Test Plans & Runs
// ══════════════════════════════════════════════════════════════

/**
 * GET /devflow/test-plans
 * List test plans
 */
router.get("/devflow/test-plans", async (req: Request, res: Response) => {
  try {
    const plans = await devflowService.listTestPlans();
    const totalCases = plans.reduce((acc, p) => acc + p.totalCases, 0);
    const passedCases = plans.reduce((acc, p) => acc + p.passedCases, 0);

    res.json(
      successResponse(plans, "Test plans listed", {
        total: plans.length,
        totalCases,
        passedCases,
        overallPassRate: totalCases > 0 ? Math.round((passedCases / totalCases) * 100) : 0,
      }),
    );
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to list test plans"));
  }
});

/**
 * POST /devflow/test-plans
 * Create a test plan
 */
router.post("/devflow/test-plans", async (req: Request, res: Response) => {
  try {
    const { name, description, suites, assignedTo } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json(errorResponse("Test plan name is required"));
    }
    if (!suites || !Array.isArray(suites) || suites.length === 0) {
      return res.status(400).json(errorResponse("At least one test suite is required"));
    }

    for (const suite of suites) {
      if (!suite.name || !suite.name.trim()) {
        return res.status(400).json(errorResponse("Each test suite must have a name"));
      }
      if (!suite.cases || !Array.isArray(suite.cases) || suite.cases.length === 0) {
        return res.status(400).json(errorResponse(`Test suite "${suite.name}" must have at least one test case`));
      }
    }

    const userId = getUserId(req);
    const normalizedSuites = suites.map((s: any, idx: number) => ({
      id: s.id || `suite-${idx}`,
      name: s.name,
      cases: s.cases.map((c: any, cIdx: number) => ({
        id: c.id || `case-${idx}-${cIdx}`,
        title: c.title || `Test Case ${cIdx + 1}`,
        description: c.description || "",
        priority: c.priority || "P2",
        automated: c.automated || false,
        expectedResult: c.expectedResult || "",
        steps: c.steps || [],
      })),
    }));

    const plan = await devflowService.createTestPlan(
      name.trim(),
      description || "",
      normalizedSuites,
      assignedTo || [],
      userId,
    );

    res.status(201).json(successResponse(plan, "Test plan created"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to create test plan"));
  }
});

/**
 * POST /devflow/test-plans/:id/runs
 * Create a test run for a test plan
 */
router.post("/devflow/test-plans/:id/runs", async (req: Request, res: Response) => {
  try {
    const { configuration } = req.body;
    const userId = getUserId(req);

    const config = {
      browser: configuration?.browser,
      os: configuration?.os,
      environment: configuration?.environment || "development",
      buildNumber: configuration?.buildNumber,
      tags: configuration?.tags || [],
    };

    const testRun = await devflowService.createTestRun(req.params.id, config, userId);
    if (!testRun) {
      return res.status(404).json(errorResponse("Test plan not found"));
    }

    res.status(201).json(successResponse(testRun, "Test run created"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to create test run"));
  }
});

/**
 * POST /devflow/test-runs/:id/results
 * Record test results
 */
router.post("/devflow/test-runs/:id/results", async (req: Request, res: Response) => {
  try {
    const { caseId, caseTitle, status, duration, errorMessage, stackTrace, comment } = req.body;

    if (!caseId) {
      return res.status(400).json(errorResponse("Case ID is required"));
    }
    if (!status) {
      return res.status(400).json(errorResponse("Test result status is required"));
    }

    const validStatuses = ["PASSED", "FAILED", "BLOCKED", "NOT_RUN", "SKIPPED"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json(errorResponse(`Invalid status. Must be one of: ${validStatuses.join(", ")}`));
    }

    const updated = await devflowService.recordTestResult(
      req.params.id,
      caseId,
      caseTitle || "",
      status,
      duration || 0,
      errorMessage,
      stackTrace,
      comment,
    );

    if (!updated) {
      return res.status(404).json(errorResponse("Test run not found"));
    }

    res.json(
      successResponse(updated, "Test result recorded", {
        passed: updated.passed,
        failed: updated.failed,
        blocked: updated.blocked,
        skipped: updated.skipped,
        passRate: updated.passRate,
        remaining: updated.totalTests - updated.results.length,
      }),
    );
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to record test result"));
  }
});

// ══════════════════════════════════════════════════════════════
// Code Reviews
// ══════════════════════════════════════════════════════════════

/**
 * GET /devflow/code-reviews
 * List code reviews with optional filtering
 */
router.get("/devflow/code-reviews", async (req: Request, res: Response) => {
  try {
    const { status, author } = req.query;
    const reviews = await devflowService.listCodeReviews({
      status: status as any,
      author: author as string,
    });

    res.json(
      successResponse(reviews, "Code reviews listed", {
        total: reviews.length,
        open: reviews.filter((r) => r.status === "OPEN").length,
        approved: reviews.filter((r) => r.status === "APPROVED").length,
        changesRequested: reviews.filter((r) => r.status === "CHANGES_REQUESTED").length,
        merged: reviews.filter((r) => r.status === "MERGED").length,
        closed: reviews.filter((r) => r.status === "CLOSED").length,
      }),
    );
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to list code reviews"));
  }
});

/**
 * POST /devflow/code-reviews
 * Create a code review (pull request)
 */
router.post("/devflow/code-reviews", async (req: Request, res: Response) => {
  try {
    const {
      title, description, sourceBranch, targetBranch, reviewers,
      filesChanged, linesAdded, linesRemoved, labels, linkedWorkItems,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json(errorResponse("Code review title is required"));
    }
    if (!sourceBranch || !sourceBranch.trim()) {
      return res.status(400).json(errorResponse("Source branch is required"));
    }
    if (!targetBranch || !targetBranch.trim()) {
      return res.status(400).json(errorResponse("Target branch is required"));
    }
    if (sourceBranch === targetBranch) {
      return res.status(400).json(errorResponse("Source and target branches must be different"));
    }
    if (!reviewers || !Array.isArray(reviewers) || reviewers.length === 0) {
      return res.status(400).json(errorResponse("At least one reviewer is required"));
    }

    const userId = getUserId(req);
    const review = await devflowService.createCodeReview(
      title.trim(),
      description || "",
      sourceBranch.trim(),
      targetBranch.trim(),
      reviewers,
      filesChanged || 0,
      linesAdded || 0,
      linesRemoved || 0,
      labels || [],
      linkedWorkItems || [],
      userId,
    );

    res.status(201).json(successResponse(review, "Code review created"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to create code review"));
  }
});

/**
 * POST /devflow/code-reviews/:id/approve
 * Approve a code review
 */
router.post("/devflow/code-reviews/:id/approve", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const review = await devflowService.approveCodeReview(req.params.id, userId);
    if (!review) {
      return res.status(404).json(errorResponse("Code review not found"));
    }

    res.json(
      successResponse(review, "Code review approved", {
        approvedBy: review.reviewers.filter((r) => r.status === "APPROVED").length,
        totalReviewers: review.reviewers.length,
        allApproved: review.status === "APPROVED",
      }),
    );
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to approve code review"));
  }
});

/**
 * POST /devflow/code-reviews/:id/request-changes
 * Request changes on a code review
 */
router.post("/devflow/code-reviews/:id/request-changes", async (req: Request, res: Response) => {
  try {
    const { comments } = req.body;
    const userId = getUserId(req);

    if (!comments || !Array.isArray(comments) || comments.length === 0) {
      return res.status(400).json(errorResponse("At least one comment is required when requesting changes"));
    }

    const review = await devflowService.requestChanges(req.params.id, userId, comments);
    if (!review) {
      return res.status(404).json(errorResponse("Code review not found"));
    }

    res.json(successResponse(review, "Changes requested on code review"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to request changes"));
  }
});

// ══════════════════════════════════════════════════════════════
// Artifacts
// ══════════════════════════════════════════════════════════════

/**
 * GET /devflow/artifacts
 * List artifact feeds
 */
router.get("/devflow/artifacts", async (req: Request, res: Response) => {
  try {
    const { feed } = req.query;
    const artifacts = await devflowService.listArtifacts(feed as string);

    const feeds = new Map<string, number>();
    artifacts.forEach((a) => {
      feeds.set(a.feed, (feeds.get(a.feed) || 0) + 1);
    });

    res.json(
      successResponse(artifacts, "Artifacts listed", {
        total: artifacts.length,
        feeds: Object.fromEntries(feeds),
        totalDownloads: artifacts.reduce((acc, a) => acc + a.downloads, 0),
        totalSize: artifacts.reduce((acc, a) => acc + a.size, 0),
      }),
    );
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to list artifacts"));
  }
});

/**
 * POST /devflow/artifacts
 * Create/publish an artifact
 */
router.post("/devflow/artifacts", async (req: Request, res: Response) => {
  try {
    const { name, version, feed, type, size, hash, tags, metadata } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json(errorResponse("Artifact name is required"));
    }
    if (!version || !version.trim()) {
      return res.status(400).json(errorResponse("Artifact version is required"));
    }
    if (!feed || !feed.trim()) {
      return res.status(400).json(errorResponse("Artifact feed is required"));
    }

    const validTypes = ["NPM", "NUGET", "MAVEN", "PIP", "DOCKER", "GENERIC"];
    if (type && !validTypes.includes(type)) {
      return res.status(400).json(errorResponse(`Invalid artifact type. Must be one of: ${validTypes.join(", ")}`));
    }

    const userId = getUserId(req);
    const artifact = await devflowService.createArtifact(
      name.trim(),
      version.trim(),
      feed.trim(),
      type || "GENERIC",
      size || 0,
      hash || "",
      tags || [],
      metadata || {},
      userId,
    );

    res.status(201).json(successResponse(artifact, "Artifact published"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to create artifact"));
  }
});

// ══════════════════════════════════════════════════════════════
// Analytics
// ══════════════════════════════════════════════════════════════

/**
 * GET /devflow/analytics/velocity
 * Velocity analytics — builds/day, deploys/day, success rate, DORA metrics
 */
router.get("/devflow/analytics/velocity", async (req: Request, res: Response) => {
  try {
    const dateRange = parseDateRange(req);
    const metrics = await devflowService.getVelocityMetrics(dateRange);
    res.json(successResponse(metrics, "Velocity metrics loaded"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to load velocity metrics"));
  }
});

/**
 * GET /devflow/analytics/quality
 * Quality metrics — coverage, test pass rate, vulnerabilities
 */
router.get("/devflow/analytics/quality", async (req: Request, res: Response) => {
  try {
    const dateRange = parseDateRange(req);
    const metrics = await devflowService.getQualityMetrics(dateRange);
    res.json(successResponse(metrics, "Quality metrics loaded"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to load quality metrics"));
  }
});

/**
 * GET /devflow/analytics/deployment
 * Deployment metrics — frequency, lead time, MTTR, change failure rate
 */
router.get("/devflow/analytics/deployment", async (req: Request, res: Response) => {
  try {
    const dateRange = parseDateRange(req);
    const metrics = await devflowService.getDeploymentMetrics(dateRange);
    res.json(successResponse(metrics, "Deployment metrics loaded"));
  } catch (err: any) {
    res.status(500).json(errorResponse(err.message || "Failed to load deployment metrics"));
  }
});

// ══════════════════════════════════════════════════════════════
// Export
// ══════════════════════════════════════════════════════════════

export const devflowRouter = router;
