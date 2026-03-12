// ──────────────────────────────────────────────────────────────
// HR Payroll — DevFlow Service
// Azure DevOps-like CI/CD management: pipelines, runs, stages,
// environments, releases, test plans, code reviews, artifacts,
// velocity analytics, quality metrics, deployment metrics.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type PipelineStatus = "IDLE" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "PARTIALLY_SUCCEEDED";
export type StageStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED" | "CANCELLED";
export type StepStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED" | "CANCELLED";
export type EnvironmentType = "DEVELOPMENT" | "STAGING" | "PRODUCTION" | "QA" | "UAT" | "DR";
export type ReleaseStatus = "DRAFT" | "ACTIVE" | "DEPLOYED" | "ROLLED_BACK" | "ARCHIVED";
export type TestRunStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ABORTED";
export type TestResultStatus = "PASSED" | "FAILED" | "BLOCKED" | "NOT_RUN" | "SKIPPED";
export type ReviewStatus = "OPEN" | "APPROVED" | "CHANGES_REQUESTED" | "MERGED" | "CLOSED";
export type TriggerType = "MANUAL" | "CI" | "SCHEDULE" | "WEBHOOK" | "PR";

interface PipelineStep {
  id: string;
  name: string;
  type: "SCRIPT" | "TASK" | "BUILD" | "TEST" | "DEPLOY" | "APPROVAL";
  command?: string;
  timeout: number;
  retryCount: number;
  continueOnError: boolean;
  condition?: string;
  environment?: Record<string, string>;
}

interface PipelineStage {
  id: string;
  name: string;
  dependsOn: string[];
  steps: PipelineStep[];
  condition?: string;
  environment?: string;
}

interface PipelineVariable {
  name: string;
  value: string;
  isSecret: boolean;
  allowOverride: boolean;
}

interface PipelineTrigger {
  type: TriggerType;
  branches?: string[];
  paths?: string[];
  schedule?: string;
  webhookUrl?: string;
}

interface Pipeline {
  id: string;
  name: string;
  description: string;
  repositoryUrl: string;
  defaultBranch: string;
  stages: PipelineStage[];
  triggers: PipelineTrigger[];
  variables: PipelineVariable[];
  status: PipelineStatus;
  lastRunId: string | null;
  runCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  yaml?: string;
}

interface StepResult {
  stepId: string;
  status: StepStatus;
  startedAt: string;
  completedAt: string | null;
  duration: number;
  logs: string[];
  exitCode: number | null;
  errorMessage?: string;
}

interface StageResult {
  stageId: string;
  stageName: string;
  status: StageStatus;
  startedAt: string;
  completedAt: string | null;
  duration: number;
  steps: StepResult[];
}

interface PipelineRun {
  id: string;
  pipelineId: string;
  pipelineName: string;
  runNumber: number;
  status: PipelineStatus;
  trigger: TriggerType;
  branch: string;
  commitHash: string;
  commitMessage: string;
  environment: string;
  stages: StageResult[];
  startedAt: string;
  completedAt: string | null;
  duration: number;
  queuedAt: string;
  triggeredBy: string;
  variables: Record<string, string>;
  artifacts: string[];
}

interface DeploymentEnvironment {
  id: string;
  name: string;
  type: EnvironmentType;
  url: string;
  variables: Record<string, string>;
  lastDeployedAt: string | null;
  lastDeployedRelease: string | null;
  status: "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN";
  approvers: string[];
  createdAt: string;
  healthCheckUrl?: string;
}

interface Release {
  id: string;
  name: string;
  version: string;
  pipelineId: string;
  pipelineName: string;
  status: ReleaseStatus;
  artifacts: ReleaseArtifact[];
  deployments: ReleaseDeployment[];
  releaseNotes: string;
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  tags: string[];
}

interface ReleaseArtifact {
  name: string;
  version: string;
  type: "BUILD" | "PACKAGE" | "CONTAINER" | "FILE";
  source: string;
  hash: string;
}

interface ReleaseDeployment {
  environmentId: string;
  environmentName: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "ROLLED_BACK";
  deployedAt: string | null;
  deployedBy: string | null;
  duration: number;
  logs: string[];
}

interface TestPlan {
  id: string;
  name: string;
  description: string;
  suites: TestSuite[];
  totalCases: number;
  passedCases: number;
  failedCases: number;
  status: TestRunStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  assignedTo: string[];
}

interface TestSuite {
  id: string;
  name: string;
  cases: TestCase[];
}

interface TestCase {
  id: string;
  title: string;
  description: string;
  priority: "P0" | "P1" | "P2" | "P3";
  automated: boolean;
  expectedResult: string;
  steps: string[];
}

interface TestRun {
  id: string;
  planId: string;
  planName: string;
  status: TestRunStatus;
  configuration: TestConfiguration;
  results: TestResult[];
  totalTests: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  passRate: number;
  startedAt: string;
  completedAt: string | null;
  duration: number;
  runBy: string;
}

interface TestConfiguration {
  browser?: string;
  os?: string;
  environment: string;
  buildNumber?: string;
  tags: string[];
}

interface TestResult {
  caseId: string;
  caseTitle: string;
  status: TestResultStatus;
  duration: number;
  errorMessage?: string;
  stackTrace?: string;
  attachments: string[];
  comment?: string;
  runAt: string;
}

interface CodeReview {
  id: string;
  title: string;
  description: string;
  status: ReviewStatus;
  sourceBranch: string;
  targetBranch: string;
  author: string;
  reviewers: ReviewerEntry[];
  comments: ReviewComment[];
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  mergedBy: string | null;
  labels: string[];
  linkedWorkItems: string[];
}

interface ReviewerEntry {
  userId: string;
  status: "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | "DECLINED";
  reviewedAt: string | null;
  comments: string[];
}

interface ReviewComment {
  id: string;
  userId: string;
  filePath: string;
  lineNumber: number;
  content: string;
  resolved: boolean;
  createdAt: string;
  replies: ReviewComment[];
}

interface Artifact {
  id: string;
  name: string;
  version: string;
  feed: string;
  type: "NPM" | "NUGET" | "MAVEN" | "PIP" | "DOCKER" | "GENERIC";
  size: number;
  hash: string;
  downloads: number;
  createdBy: string;
  createdAt: string;
  tags: string[];
  metadata: Record<string, string>;
}

interface VelocityMetrics {
  period: string;
  deploymentsPerDay: number;
  buildsPerDay: number;
  avgBuildDuration: number;
  avgDeployDuration: number;
  successRate: number;
  throughput: number;
  leadTime: number;
  cycleTime: number;
  changeFailureRate: number;
  mttr: number;
  trendData: Array<{ date: string; deployments: number; builds: number; successRate: number }>;
}

interface QualityMetrics {
  period: string;
  codeCoverage: number;
  testPassRate: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  bugDensity: number;
  duplicateRate: number;
  technicalDebtHours: number;
  securityVulnerabilities: { critical: number; high: number; medium: number; low: number };
  codeSmells: number;
  trendData: Array<{ date: string; coverage: number; passRate: number; bugs: number }>;
}

interface DeploymentMetrics {
  period: string;
  totalDeployments: number;
  successfulDeployments: number;
  failedDeployments: number;
  rolledBack: number;
  deployFrequency: number;
  avgLeadTime: number;
  avgMTTR: number;
  changeFailureRate: number;
  environmentBreakdown: Array<{ environment: string; deployments: number; successRate: number; avgDuration: number }>;
  trendData: Array<{ date: string; deployments: number; failures: number }>;
}

interface DevFlowDashboard {
  totalPipelines: number;
  activePipelines: number;
  totalRuns: number;
  recentRuns: PipelineRun[];
  totalEnvironments: number;
  environmentStatuses: Array<{ name: string; type: string; status: string }>;
  totalReleases: number;
  recentReleases: Release[];
  testSummary: { totalPlans: number; passRate: number; totalCases: number };
  codeReviewSummary: { open: number; approved: number; changesRequested: number; merged: number };
  velocity: VelocityMetrics;
  quality: QualityMetrics;
  deployment: DeploymentMetrics;
  securityOverview: { vulnerabilities: number; lastScan: string; complianceScore: number };
  recentActivity: Array<{ type: string; message: string; timestamp: string; userId: string }>;
}

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateRunNumber(existingRuns: number): number {
  return existingRuns + 1;
}

function calculateDuration(start: string, end: string | null): number {
  if (!end) return Date.now() - new Date(start).getTime();
  return new Date(end).getTime() - new Date(start).getTime();
}

function simulateStepExecution(): { success: boolean; duration: number; logs: string[]; exitCode: number } {
  const success = Math.random() > 0.15;
  const duration = Math.floor(Math.random() * 30000) + 2000;
  const logs = [
    `[${new Date().toISOString()}] Step started`,
    `[${new Date().toISOString()}] Downloading dependencies...`,
    `[${new Date().toISOString()}] Running task...`,
    success
      ? `[${new Date().toISOString()}] Task completed successfully`
      : `[${new Date().toISOString()}] ERROR: Task failed with exit code 1`,
  ];
  return { success, duration, logs, exitCode: success ? 0 : 1 };
}

function generateTrendData(days: number): Array<{ date: string; deployments: number; builds: number; successRate: number }> {
  const data: Array<{ date: string; deployments: number; builds: number; successRate: number }> = [];
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toISOString().split("T")[0],
      deployments: Math.floor(Math.random() * 10) + 1,
      builds: Math.floor(Math.random() * 20) + 5,
      successRate: Math.round((Math.random() * 20 + 80) * 100) / 100,
    });
  }
  return data;
}

// ══════════════════════════════════════════════════════════════
// DevFlowService
// ══════════════════════════════════════════════════════════════

export class DevFlowService {
  // ────────────────────────────────────────────────────────────
  // Pipeline CRUD
  // ────────────────────────────────────────────────────────────

  async createPipeline(
    name: string,
    description: string,
    repositoryUrl: string,
    defaultBranch: string,
    stages: PipelineStage[],
    triggers: PipelineTrigger[],
    variables: PipelineVariable[],
    tags: string[],
    userId: string,
  ): Promise<Pipeline> {
    const pipeline: Pipeline = {
      id: generateId("pipe"),
      name,
      description,
      repositoryUrl,
      defaultBranch,
      stages,
      triggers,
      variables,
      status: "IDLE",
      lastRunId: null,
      runCount: 0,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags,
    };

    await prisma.generatedDocument.create({
      data: {
        name: `Pipeline: ${name}`,
        category: "DEVFLOW_PIPELINE",
        content: JSON.stringify(pipeline),
        generatedBy: userId,
        data: pipeline as any,
      },
    });

    return pipeline;
  }

  async getPipeline(pipelineId: string): Promise<Pipeline | null> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { category: "DEVFLOW_PIPELINE", data: { path: ["id"], equals: pipelineId } },
    });
    return doc ? (doc.data as unknown as Pipeline) : null;
  }

  async listPipelines(filters?: { status?: PipelineStatus; tag?: string; search?: string }): Promise<Pipeline[]> {
    const docs = await prisma.generatedDocument.findMany({
      where: { category: "DEVFLOW_PIPELINE" },
      orderBy: { createdAt: "desc" },
    });

    let pipelines = docs.map((d) => d.data as unknown as Pipeline);

    if (filters?.status) {
      pipelines = pipelines.filter((p) => p.status === filters.status);
    }
    if (filters?.tag) {
      pipelines = pipelines.filter((p) => p.tags.includes(filters.tag!));
    }
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      pipelines = pipelines.filter(
        (p) => p.name.toLowerCase().includes(s) || p.description.toLowerCase().includes(s),
      );
    }

    return pipelines;
  }

  async updatePipeline(pipelineId: string, updates: Partial<Pipeline>, userId: string): Promise<Pipeline | null> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { category: "DEVFLOW_PIPELINE", data: { path: ["id"], equals: pipelineId } },
    });
    if (!doc) return null;

    const existing = doc.data as unknown as Pipeline;
    const updated: Pipeline = {
      ...existing,
      ...updates,
      id: pipelineId,
      updatedAt: new Date().toISOString(),
    };

    await prisma.generatedDocument.update({
      where: { id: doc.id },
      data: {
        name: `Pipeline: ${updated.name}`,
        content: JSON.stringify(updated),
        data: updated as any,
      },
    });

    return updated;
  }

  async deletePipeline(pipelineId: string): Promise<boolean> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { category: "DEVFLOW_PIPELINE", data: { path: ["id"], equals: pipelineId } },
    });
    if (!doc) return false;
    await prisma.generatedDocument.delete({ where: { id: doc.id } });
    return true;
  }

  // ────────────────────────────────────────────────────────────
  // Pipeline Runs
  // ────────────────────────────────────────────────────────────

  async triggerPipeline(
    pipelineId: string,
    environment: string,
    commitHash: string,
    commitMessage: string,
    branch: string,
    triggeredBy: string,
    variableOverrides?: Record<string, string>,
  ): Promise<PipelineRun | null> {
    const pipeline = await this.getPipeline(pipelineId);
    if (!pipeline) return null;

    const runNumber = generateRunNumber(pipeline.runCount);
    const now = new Date().toISOString();

    const stageResults: StageResult[] = pipeline.stages.map((stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      status: "PENDING" as StageStatus,
      startedAt: now,
      completedAt: null,
      duration: 0,
      steps: stage.steps.map((step) => ({
        stepId: step.id,
        status: "PENDING" as StepStatus,
        startedAt: now,
        completedAt: null,
        duration: 0,
        logs: [],
        exitCode: null,
      })),
    }));

    const mergedVars: Record<string, string> = {};
    pipeline.variables.forEach((v) => {
      if (!v.isSecret) mergedVars[v.name] = v.value;
    });
    if (variableOverrides) {
      pipeline.variables.forEach((v) => {
        if (v.allowOverride && variableOverrides[v.name]) {
          mergedVars[v.name] = variableOverrides[v.name];
        }
      });
    }

    const run: PipelineRun = {
      id: generateId("run"),
      pipelineId,
      pipelineName: pipeline.name,
      runNumber,
      status: "RUNNING",
      trigger: "MANUAL",
      branch,
      commitHash,
      commitMessage,
      environment,
      stages: stageResults,
      startedAt: now,
      completedAt: null,
      duration: 0,
      queuedAt: now,
      triggeredBy,
      variables: mergedVars,
      artifacts: [],
    };

    await prisma.generatedDocument.create({
      data: {
        name: `Run #${runNumber}: ${pipeline.name}`,
        category: "DEVFLOW_RUN",
        content: JSON.stringify(run),
        generatedBy: triggeredBy,
        data: run as any,
      },
    });

    await this.updatePipeline(pipelineId, { status: "RUNNING", lastRunId: run.id, runCount: runNumber }, triggeredBy);

    return run;
  }

  async executePipelineStep(runId: string, stageIndex: number, stepIndex: number): Promise<PipelineRun | null> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { category: "DEVFLOW_RUN", data: { path: ["id"], equals: runId } },
    });
    if (!doc) return null;

    const run = doc.data as unknown as PipelineRun;
    const stage = run.stages[stageIndex];
    if (!stage) return null;
    const step = stage.steps[stepIndex];
    if (!step) return null;

    const result = simulateStepExecution();
    const now = new Date().toISOString();

    step.status = result.success ? "SUCCEEDED" : "FAILED";
    step.completedAt = now;
    step.duration = result.duration;
    step.logs = result.logs;
    step.exitCode = result.exitCode;
    if (!result.success) step.errorMessage = "Step execution failed";

    if (stage.status === "PENDING") {
      stage.status = "RUNNING";
    }

    const allStepsDone = stage.steps.every((s) => s.status !== "PENDING" && s.status !== "RUNNING");
    if (allStepsDone) {
      const anyFailed = stage.steps.some((s) => s.status === "FAILED");
      stage.status = anyFailed ? "FAILED" : "SUCCEEDED";
      stage.completedAt = now;
      stage.duration = calculateDuration(stage.startedAt, now);
    }

    const allStagesDone = run.stages.every((s) => s.status !== "PENDING" && s.status !== "RUNNING");
    if (allStagesDone) {
      const anyFailed = run.stages.some((s) => s.status === "FAILED");
      run.status = anyFailed ? "FAILED" : "SUCCEEDED";
      run.completedAt = now;
      run.duration = calculateDuration(run.startedAt, now);
      await this.updatePipeline(run.pipelineId, { status: run.status }, run.triggeredBy);
    }

    await prisma.generatedDocument.update({
      where: { id: doc.id },
      data: { content: JSON.stringify(run), data: run as any },
    });

    return run;
  }

  async getRun(runId: string): Promise<PipelineRun | null> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { category: "DEVFLOW_RUN", data: { path: ["id"], equals: runId } },
    });
    return doc ? (doc.data as unknown as PipelineRun) : null;
  }

  async listRuns(pipelineId: string, limit = 20): Promise<PipelineRun[]> {
    const docs = await prisma.generatedDocument.findMany({
      where: { category: "DEVFLOW_RUN", data: { path: ["pipelineId"], equals: pipelineId } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return docs.map((d) => d.data as unknown as PipelineRun);
  }

  async cancelRun(runId: string, userId: string): Promise<PipelineRun | null> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { category: "DEVFLOW_RUN", data: { path: ["id"], equals: runId } },
    });
    if (!doc) return null;

    const run = doc.data as unknown as PipelineRun;
    if (run.status !== "RUNNING") return run;

    const now = new Date().toISOString();
    run.status = "CANCELLED";
    run.completedAt = now;
    run.duration = calculateDuration(run.startedAt, now);

    run.stages.forEach((stage) => {
      if (stage.status === "PENDING" || stage.status === "RUNNING") {
        stage.status = "CANCELLED";
        stage.completedAt = now;
        stage.steps.forEach((step) => {
          if (step.status === "PENDING" || step.status === "RUNNING") {
            step.status = "CANCELLED";
            step.completedAt = now;
          }
        });
      }
    });

    await prisma.generatedDocument.update({
      where: { id: doc.id },
      data: { content: JSON.stringify(run), data: run as any },
    });

    await this.updatePipeline(run.pipelineId, { status: "CANCELLED" }, userId);
    return run;
  }

  async retryFailedSteps(runId: string, userId: string): Promise<PipelineRun | null> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { category: "DEVFLOW_RUN", data: { path: ["id"], equals: runId } },
    });
    if (!doc) return null;

    const run = doc.data as unknown as PipelineRun;
    if (run.status !== "FAILED") return run;

    run.status = "RUNNING";
    run.completedAt = null;
    const now = new Date().toISOString();

    run.stages.forEach((stage) => {
      if (stage.status === "FAILED") {
        stage.status = "RUNNING";
        stage.completedAt = null;
        stage.steps.forEach((step) => {
          if (step.status === "FAILED") {
            step.status = "PENDING";
            step.completedAt = null;
            step.logs = [];
            step.exitCode = null;
            step.errorMessage = undefined;
          }
        });
      }
    });

    await prisma.generatedDocument.update({
      where: { id: doc.id },
      data: { content: JSON.stringify(run), data: run as any },
    });

    await this.updatePipeline(run.pipelineId, { status: "RUNNING" }, userId);
    return run;
  }

  // ────────────────────────────────────────────────────────────
  // Environments
  // ────────────────────────────────────────────────────────────

  async createEnvironment(
    name: string,
    type: EnvironmentType,
    url: string,
    variables: Record<string, string>,
    approvers: string[],
    healthCheckUrl: string | undefined,
    userId: string,
  ): Promise<DeploymentEnvironment> {
    const env: DeploymentEnvironment = {
      id: generateId("env"),
      name,
      type,
      url,
      variables,
      lastDeployedAt: null,
      lastDeployedRelease: null,
      status: "UNKNOWN",
      approvers,
      createdAt: new Date().toISOString(),
      healthCheckUrl,
    };

    await prisma.generatedDocument.create({
      data: {
        name: `Environment: ${name}`,
        category: "DEVFLOW_ENVIRONMENT",
        content: JSON.stringify(env),
        generatedBy: userId,
        data: env as any,
      },
    });

    return env;
  }

  async listEnvironments(): Promise<DeploymentEnvironment[]> {
    const docs = await prisma.generatedDocument.findMany({
      where: { category: "DEVFLOW_ENVIRONMENT" },
      orderBy: { createdAt: "desc" },
    });
    return docs.map((d) => d.data as unknown as DeploymentEnvironment);
  }

  async getEnvironment(envId: string): Promise<DeploymentEnvironment | null> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { category: "DEVFLOW_ENVIRONMENT", data: { path: ["id"], equals: envId } },
    });
    return doc ? (doc.data as unknown as DeploymentEnvironment) : null;
  }

  // ────────────────────────────────────────────────────────────
  // Releases
  // ────────────────────────────────────────────────────────────

  async createRelease(
    name: string,
    version: string,
    pipelineId: string,
    releaseNotes: string,
    artifacts: ReleaseArtifact[],
    tags: string[],
    userId: string,
  ): Promise<Release> {
    const pipeline = await this.getPipeline(pipelineId);
    const release: Release = {
      id: generateId("rel"),
      name,
      version,
      pipelineId,
      pipelineName: pipeline?.name || "Unknown",
      status: "DRAFT",
      artifacts,
      deployments: [],
      releaseNotes,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null,
      tags,
    };

    await prisma.generatedDocument.create({
      data: {
        name: `Release: ${name} v${version}`,
        category: "DEVFLOW_RELEASE",
        content: JSON.stringify(release),
        generatedBy: userId,
        data: release as any,
      },
    });

    return release;
  }

  async listReleases(filters?: { status?: ReleaseStatus; pipelineId?: string }): Promise<Release[]> {
    const docs = await prisma.generatedDocument.findMany({
      where: { category: "DEVFLOW_RELEASE" },
      orderBy: { createdAt: "desc" },
    });

    let releases = docs.map((d) => d.data as unknown as Release);
    if (filters?.status) releases = releases.filter((r) => r.status === filters.status);
    if (filters?.pipelineId) releases = releases.filter((r) => r.pipelineId === filters.pipelineId);

    return releases;
  }

  async deployRelease(releaseId: string, environmentId: string, userId: string): Promise<Release | null> {
    const relDoc = await prisma.generatedDocument.findFirst({
      where: { category: "DEVFLOW_RELEASE", data: { path: ["id"], equals: releaseId } },
    });
    if (!relDoc) return null;

    const env = await this.getEnvironment(environmentId);
    if (!env) return null;

    const release = relDoc.data as unknown as Release;
    const now = new Date().toISOString();

    const deployment: ReleaseDeployment = {
      environmentId,
      environmentName: env.name,
      status: "IN_PROGRESS",
      deployedAt: now,
      deployedBy: userId,
      duration: 0,
      logs: [
        `[${now}] Starting deployment to ${env.name}...`,
        `[${now}] Pulling artifacts...`,
        `[${now}] Running pre-deployment checks...`,
      ],
    };

    const success = Math.random() > 0.1;
    const deployDuration = Math.floor(Math.random() * 120000) + 30000;
    const endTime = new Date(Date.now() + deployDuration).toISOString();

    deployment.status = success ? "SUCCEEDED" : "FAILED";
    deployment.duration = deployDuration;
    deployment.logs.push(
      success
        ? `[${endTime}] Deployment to ${env.name} completed successfully`
        : `[${endTime}] ERROR: Deployment to ${env.name} failed — health check timeout`,
    );

    const existingIdx = release.deployments.findIndex((d) => d.environmentId === environmentId);
    if (existingIdx >= 0) {
      release.deployments[existingIdx] = deployment;
    } else {
      release.deployments.push(deployment);
    }

    if (success) {
      release.status = "DEPLOYED";
    }

    await prisma.generatedDocument.update({
      where: { id: relDoc.id },
      data: { content: JSON.stringify(release), data: release as any },
    });

    if (success) {
      const envDoc = await prisma.generatedDocument.findFirst({
        where: { category: "DEVFLOW_ENVIRONMENT", data: { path: ["id"], equals: environmentId } },
      });
      if (envDoc) {
        const envData = envDoc.data as unknown as DeploymentEnvironment;
        envData.lastDeployedAt = now;
        envData.lastDeployedRelease = `${release.name} v${release.version}`;
        envData.status = "HEALTHY";
        await prisma.generatedDocument.update({
          where: { id: envDoc.id },
          data: { content: JSON.stringify(envData), data: envData as any },
        });
      }
    }

    return release;
  }

  // ────────────────────────────────────────────────────────────
  // Test Plans & Runs
  // ────────────────────────────────────────────────────────────

  async createTestPlan(
    name: string,
    description: string,
    suites: TestSuite[],
    assignedTo: string[],
    userId: string,
  ): Promise<TestPlan> {
    const totalCases = suites.reduce((acc, s) => acc + s.cases.length, 0);
    const plan: TestPlan = {
      id: generateId("tplan"),
      name,
      description,
      suites,
      totalCases,
      passedCases: 0,
      failedCases: 0,
      status: "NOT_STARTED",
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedTo,
    };

    await prisma.generatedDocument.create({
      data: {
        name: `Test Plan: ${name}`,
        category: "DEVFLOW_TEST_PLAN",
        content: JSON.stringify(plan),
        generatedBy: userId,
        data: plan as any,
      },
    });

    return plan;
  }

  async listTestPlans(): Promise<TestPlan[]> {
    const docs = await prisma.generatedDocument.findMany({
      where: { category: "DEVFLOW_TEST_PLAN" },
      orderBy: { createdAt: "desc" },
    });
    return docs.map((d) => d.data as unknown as TestPlan);
  }

  async createTestRun(planId: string, configuration: TestConfiguration, userId: string): Promise<TestRun | null> {
    const planDoc = await prisma.generatedDocument.findFirst({
      where: { category: "DEVFLOW_TEST_PLAN", data: { path: ["id"], equals: planId } },
    });
    if (!planDoc) return null;

    const plan = planDoc.data as unknown as TestPlan;
    const totalTests = plan.suites.reduce((acc, s) => acc + s.cases.length, 0);
    const now = new Date().toISOString();

    const testRun: TestRun = {
      id: generateId("trun"),
      planId,
      planName: plan.name,
      status: "IN_PROGRESS",
      configuration,
      results: [],
      totalTests,
      passed: 0,
      failed: 0,
      blocked: 0,
      skipped: 0,
      passRate: 0,
      startedAt: now,
      completedAt: null,
      duration: 0,
      runBy: userId,
    };

    await prisma.generatedDocument.create({
      data: {
        name: `Test Run: ${plan.name}`,
        category: "DEVFLOW_TEST_RUN",
        content: JSON.stringify(testRun),
        generatedBy: userId,
        data: testRun as any,
      },
    });

    return testRun;
  }

  async recordTestResult(
    runId: string,
    caseId: string,
    caseTitle: string,
    status: TestResultStatus,
    duration: number,
    errorMessage?: string,
    stackTrace?: string,
    comment?: string,
  ): Promise<TestRun | null> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { category: "DEVFLOW_TEST_RUN", data: { path: ["id"], equals: runId } },
    });
    if (!doc) return null;

    const run = doc.data as unknown as TestRun;
    const result: TestResult = {
      caseId,
      caseTitle,
      status,
      duration,
      errorMessage,
      stackTrace,
      attachments: [],
      comment,
      runAt: new Date().toISOString(),
    };

    const existingIdx = run.results.findIndex((r) => r.caseId === caseId);
    if (existingIdx >= 0) {
      run.results[existingIdx] = result;
    } else {
      run.results.push(result);
    }

    run.passed = run.results.filter((r) => r.status === "PASSED").length;
    run.failed = run.results.filter((r) => r.status === "FAILED").length;
    run.blocked = run.results.filter((r) => r.status === "BLOCKED").length;
    run.skipped = run.results.filter((r) => r.status === "SKIPPED").length;
    run.passRate = run.results.length > 0 ? Math.round((run.passed / run.results.length) * 100) : 0;

    if (run.results.length >= run.totalTests) {
      run.status = "COMPLETED";
      run.completedAt = new Date().toISOString();
      run.duration = calculateDuration(run.startedAt, run.completedAt);
    }

    await prisma.generatedDocument.update({
      where: { id: doc.id },
      data: { content: JSON.stringify(run), data: run as any },
    });

    return run;
  }

  // ────────────────────────────────────────────────────────────
  // Code Reviews
  // ────────────────────────────────────────────────────────────

  async createCodeReview(
    title: string,
    description: string,
    sourceBranch: string,
    targetBranch: string,
    reviewers: string[],
    filesChanged: number,
    linesAdded: number,
    linesRemoved: number,
    labels: string[],
    linkedWorkItems: string[],
    userId: string,
  ): Promise<CodeReview> {
    const review: CodeReview = {
      id: generateId("cr"),
      title,
      description,
      status: "OPEN",
      sourceBranch,
      targetBranch,
      author: userId,
      reviewers: reviewers.map((r) => ({
        userId: r,
        status: "PENDING" as const,
        reviewedAt: null,
        comments: [],
      })),
      comments: [],
      filesChanged,
      linesAdded,
      linesRemoved,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mergedAt: null,
      mergedBy: null,
      labels,
      linkedWorkItems,
    };

    await prisma.generatedDocument.create({
      data: {
        name: `Code Review: ${title}`,
        category: "DEVFLOW_CODE_REVIEW",
        content: JSON.stringify(review),
        generatedBy: userId,
        data: review as any,
      },
    });

    return review;
  }

  async listCodeReviews(filters?: { status?: ReviewStatus; author?: string }): Promise<CodeReview[]> {
    const docs = await prisma.generatedDocument.findMany({
      where: { category: "DEVFLOW_CODE_REVIEW" },
      orderBy: { createdAt: "desc" },
    });

    let reviews = docs.map((d) => d.data as unknown as CodeReview);
    if (filters?.status) reviews = reviews.filter((r) => r.status === filters.status);
    if (filters?.author) reviews = reviews.filter((r) => r.author === filters.author);

    return reviews;
  }

  async approveCodeReview(reviewId: string, approverId: string): Promise<CodeReview | null> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { category: "DEVFLOW_CODE_REVIEW", data: { path: ["id"], equals: reviewId } },
    });
    if (!doc) return null;

    const review = doc.data as unknown as CodeReview;
    const reviewer = review.reviewers.find((r) => r.userId === approverId);
    if (reviewer) {
      reviewer.status = "APPROVED";
      reviewer.reviewedAt = new Date().toISOString();
    }

    const allApproved = review.reviewers.every((r) => r.status === "APPROVED");
    if (allApproved) {
      review.status = "APPROVED";
    }
    review.updatedAt = new Date().toISOString();

    await prisma.generatedDocument.update({
      where: { id: doc.id },
      data: { content: JSON.stringify(review), data: review as any },
    });

    return review;
  }

  async requestChanges(reviewId: string, reviewerId: string, comments: string[]): Promise<CodeReview | null> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { category: "DEVFLOW_CODE_REVIEW", data: { path: ["id"], equals: reviewId } },
    });
    if (!doc) return null;

    const review = doc.data as unknown as CodeReview;
    const reviewer = review.reviewers.find((r) => r.userId === reviewerId);
    if (reviewer) {
      reviewer.status = "CHANGES_REQUESTED";
      reviewer.reviewedAt = new Date().toISOString();
      reviewer.comments = comments;
    }

    review.status = "CHANGES_REQUESTED";
    review.updatedAt = new Date().toISOString();

    await prisma.generatedDocument.update({
      where: { id: doc.id },
      data: { content: JSON.stringify(review), data: review as any },
    });

    return review;
  }

  // ────────────────────────────────────────────────────────────
  // Artifacts
  // ────────────────────────────────────────────────────────────

  async createArtifact(
    name: string,
    version: string,
    feed: string,
    type: Artifact["type"],
    size: number,
    hash: string,
    tags: string[],
    metadata: Record<string, string>,
    userId: string,
  ): Promise<Artifact> {
    const artifact: Artifact = {
      id: generateId("art"),
      name,
      version,
      feed,
      type,
      size,
      hash,
      downloads: 0,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      tags,
      metadata,
    };

    await prisma.generatedDocument.create({
      data: {
        name: `Artifact: ${name}@${version}`,
        category: "DEVFLOW_ARTIFACT",
        content: JSON.stringify(artifact),
        generatedBy: userId,
        data: artifact as any,
      },
    });

    return artifact;
  }

  async listArtifacts(feed?: string): Promise<Artifact[]> {
    const docs = await prisma.generatedDocument.findMany({
      where: { category: "DEVFLOW_ARTIFACT" },
      orderBy: { createdAt: "desc" },
    });
    let artifacts = docs.map((d) => d.data as unknown as Artifact);
    if (feed) artifacts = artifacts.filter((a) => a.feed === feed);
    return artifacts;
  }

  // ────────────────────────────────────────────────────────────
  // Analytics & Metrics
  // ────────────────────────────────────────────────────────────

  async getVelocityMetrics(dateRange: { start: string; end: string }): Promise<VelocityMetrics> {
    const runs = await prisma.generatedDocument.findMany({
      where: { category: "DEVFLOW_RUN" },
    });
    const allRuns = runs.map((d) => d.data as unknown as PipelineRun);

    const startDate = new Date(dateRange.start).getTime();
    const endDate = new Date(dateRange.end).getTime();
    const filteredRuns = allRuns.filter((r) => {
      const ts = new Date(r.startedAt).getTime();
      return ts >= startDate && ts <= endDate;
    });

    const days = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));
    const deployRuns = filteredRuns.filter((r) => r.stages.some((s) => s.steps?.some((st) => st.stepId.includes("deploy"))));
    const successful = filteredRuns.filter((r) => r.status === "SUCCEEDED");
    const failed = filteredRuns.filter((r) => r.status === "FAILED");
    const avgBuildDuration = filteredRuns.length > 0
      ? filteredRuns.reduce((acc, r) => acc + r.duration, 0) / filteredRuns.length
      : 0;

    return {
      period: `${dateRange.start} to ${dateRange.end}`,
      deploymentsPerDay: Math.round((deployRuns.length / days) * 100) / 100,
      buildsPerDay: Math.round((filteredRuns.length / days) * 100) / 100,
      avgBuildDuration: Math.round(avgBuildDuration),
      avgDeployDuration: Math.round(avgBuildDuration * 1.5),
      successRate: filteredRuns.length > 0
        ? Math.round((successful.length / filteredRuns.length) * 100)
        : 0,
      throughput: successful.length,
      leadTime: Math.round(avgBuildDuration * 2),
      cycleTime: Math.round(avgBuildDuration * 1.2),
      changeFailureRate: filteredRuns.length > 0
        ? Math.round((failed.length / filteredRuns.length) * 100)
        : 0,
      mttr: Math.round(avgBuildDuration * 0.3),
      trendData: generateTrendData(Math.min(days, 30)),
    };
  }

  async getQualityMetrics(dateRange: { start: string; end: string }): Promise<QualityMetrics> {
    const testRunDocs = await prisma.generatedDocument.findMany({
      where: { category: "DEVFLOW_TEST_RUN" },
    });
    const testRuns = testRunDocs.map((d) => d.data as unknown as TestRun);

    const totalTests = testRuns.reduce((acc, r) => acc + r.totalTests, 0);
    const passedTests = testRuns.reduce((acc, r) => acc + r.passed, 0);
    const failedTests = testRuns.reduce((acc, r) => acc + r.failed, 0);
    const skippedTests = testRuns.reduce((acc, r) => acc + r.skipped, 0);

    const days = Math.max(1, (new Date(dateRange.end).getTime() - new Date(dateRange.start).getTime()) / (1000 * 60 * 60 * 24));

    return {
      period: `${dateRange.start} to ${dateRange.end}`,
      codeCoverage: Math.round((Math.random() * 20 + 70) * 100) / 100,
      testPassRate: totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0,
      totalTests,
      passedTests,
      failedTests,
      skippedTests,
      bugDensity: Math.round((failedTests / Math.max(1, days)) * 100) / 100,
      duplicateRate: Math.round(Math.random() * 10 * 100) / 100,
      technicalDebtHours: Math.round(Math.random() * 200 + 50),
      securityVulnerabilities: {
        critical: Math.floor(Math.random() * 2),
        high: Math.floor(Math.random() * 5),
        medium: Math.floor(Math.random() * 15),
        low: Math.floor(Math.random() * 30),
      },
      codeSmells: Math.floor(Math.random() * 100) + 20,
      trendData: Array.from({ length: Math.min(days, 30) }, (_, i) => {
        const date = new Date(dateRange.start);
        date.setDate(date.getDate() + i);
        return {
          date: date.toISOString().split("T")[0],
          coverage: Math.round((Math.random() * 5 + 75) * 100) / 100,
          passRate: Math.round((Math.random() * 10 + 85) * 100) / 100,
          bugs: Math.floor(Math.random() * 5),
        };
      }),
    };
  }

  async getDeploymentMetrics(dateRange: { start: string; end: string }): Promise<DeploymentMetrics> {
    const relDocs = await prisma.generatedDocument.findMany({
      where: { category: "DEVFLOW_RELEASE" },
    });
    const releases = relDocs.map((d) => d.data as unknown as Release);

    const allDeployments = releases.flatMap((r) => r.deployments);
    const successful = allDeployments.filter((d) => d.status === "SUCCEEDED");
    const failed = allDeployments.filter((d) => d.status === "FAILED");
    const rolledBack = allDeployments.filter((d) => d.status === "ROLLED_BACK");

    const days = Math.max(1, (new Date(dateRange.end).getTime() - new Date(dateRange.start).getTime()) / (1000 * 60 * 60 * 24));
    const avgLeadTime = allDeployments.length > 0
      ? allDeployments.reduce((acc, d) => acc + d.duration, 0) / allDeployments.length
      : 0;

    const envGroups = new Map<string, typeof allDeployments>();
    allDeployments.forEach((d) => {
      const list = envGroups.get(d.environmentName) || [];
      list.push(d);
      envGroups.set(d.environmentName, list);
    });

    return {
      period: `${dateRange.start} to ${dateRange.end}`,
      totalDeployments: allDeployments.length,
      successfulDeployments: successful.length,
      failedDeployments: failed.length,
      rolledBack: rolledBack.length,
      deployFrequency: Math.round((allDeployments.length / days) * 100) / 100,
      avgLeadTime: Math.round(avgLeadTime),
      avgMTTR: Math.round(avgLeadTime * 0.3),
      changeFailureRate: allDeployments.length > 0
        ? Math.round((failed.length / allDeployments.length) * 100)
        : 0,
      environmentBreakdown: Array.from(envGroups.entries()).map(([env, deps]) => ({
        environment: env,
        deployments: deps.length,
        successRate: Math.round((deps.filter((d) => d.status === "SUCCEEDED").length / deps.length) * 100),
        avgDuration: Math.round(deps.reduce((a, d) => a + d.duration, 0) / deps.length),
      })),
      trendData: Array.from({ length: Math.min(days, 30) }, (_, i) => {
        const date = new Date(dateRange.start);
        date.setDate(date.getDate() + i);
        return {
          date: date.toISOString().split("T")[0],
          deployments: Math.floor(Math.random() * 5) + 1,
          failures: Math.floor(Math.random() * 2),
        };
      }),
    };
  }

  // ────────────────────────────────────────────────────────────
  // Dashboard
  // ────────────────────────────────────────────────────────────

  async getDashboard(): Promise<DevFlowDashboard> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dateRange = { start: thirtyDaysAgo.toISOString(), end: now.toISOString() };

    const [pipelines, environments, releases, testPlans, codeReviews, velocity, quality, deployment] = await Promise.all([
      this.listPipelines(),
      this.listEnvironments(),
      this.listReleases(),
      this.listTestPlans(),
      this.listCodeReviews(),
      this.getVelocityMetrics(dateRange),
      this.getQualityMetrics(dateRange),
      this.getDeploymentMetrics(dateRange),
    ]);

    const recentRunDocs = await prisma.generatedDocument.findMany({
      where: { category: "DEVFLOW_RUN" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    const recentRuns = recentRunDocs.map((d) => d.data as unknown as PipelineRun);

    const openReviews = codeReviews.filter((r) => r.status === "OPEN").length;
    const approvedReviews = codeReviews.filter((r) => r.status === "APPROVED").length;
    const changesRequested = codeReviews.filter((r) => r.status === "CHANGES_REQUESTED").length;
    const mergedReviews = codeReviews.filter((r) => r.status === "MERGED").length;

    const totalCases = testPlans.reduce((acc, p) => acc + p.totalCases, 0);
    const passedCases = testPlans.reduce((acc, p) => acc + p.passedCases, 0);

    const recentActivity: DevFlowDashboard["recentActivity"] = [];
    recentRuns.slice(0, 5).forEach((run) => {
      recentActivity.push({
        type: "pipeline_run",
        message: `Pipeline "${run.pipelineName}" run #${run.runNumber} ${run.status.toLowerCase()}`,
        timestamp: run.startedAt,
        userId: run.triggeredBy,
      });
    });
    releases.slice(0, 3).forEach((rel) => {
      recentActivity.push({
        type: "release",
        message: `Release "${rel.name}" v${rel.version} created`,
        timestamp: rel.createdAt,
        userId: rel.createdBy,
      });
    });

    return {
      totalPipelines: pipelines.length,
      activePipelines: pipelines.filter((p) => p.status === "RUNNING").length,
      totalRuns: recentRuns.length,
      recentRuns,
      totalEnvironments: environments.length,
      environmentStatuses: environments.map((e) => ({ name: e.name, type: e.type, status: e.status })),
      totalReleases: releases.length,
      recentReleases: releases.slice(0, 5),
      testSummary: {
        totalPlans: testPlans.length,
        passRate: totalCases > 0 ? Math.round((passedCases / totalCases) * 100) : 0,
        totalCases,
      },
      codeReviewSummary: { open: openReviews, approved: approvedReviews, changesRequested, merged: mergedReviews },
      velocity,
      quality,
      deployment,
      securityOverview: {
        vulnerabilities: quality.securityVulnerabilities.critical + quality.securityVulnerabilities.high,
        lastScan: new Date().toISOString(),
        complianceScore: Math.round(Math.random() * 15 + 85),
      },
      recentActivity: recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    };
  }
}
