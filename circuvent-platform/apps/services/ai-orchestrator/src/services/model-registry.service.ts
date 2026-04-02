// ──────────────────────────────────────────────────────────────
// AI Orchestrator — Model Registry Service
// Manages trained model versions, checkpoints, deployment
// history, and A/B testing configurations.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

export interface ModelInfo {
  jobId: string;
  jobCode: string;
  modelName: string;
  framework: string;
  status: string;
  epochsCompleted: number;
  epochsTotal: number | null;
  metrics: Record<string, unknown> | null;
  checkpoints: {
    id: string;
    epoch: number;
    metrics: Record<string, unknown> | null;
    checkpointPath: string;
    createdAt: Date;
  }[];
  bestCheckpoint: {
    epoch: number;
    metrics: Record<string, unknown> | null;
    path: string;
  } | null;
}

export class ModelRegistryService {
  /**
   * List all models (completed training jobs).
   */
  static async listModels(params: {
    framework?: string;
    modelName?: string;
    page?: number;
    limit?: number;
  }): Promise<{ models: ModelInfo[]; total: number }> {
    const where: any = { status: "COMPLETED" };
    if (params.framework) where.framework = params.framework;
    if (params.modelName) where.modelName = { contains: params.modelName, mode: "insensitive" };

    const page = params.page || 1;
    const limit = params.limit || 20;

    const [jobs, total] = await Promise.all([
      prisma.trainingJob.findMany({
        where,
        orderBy: { completedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          checkpoints: { orderBy: { epoch: "desc" } },
          resource: { select: { name: true, type: true } },
        },
      }),
      prisma.trainingJob.count({ where }),
    ]);

    const models: ModelInfo[] = jobs.map((job) => {
      const checkpoints = job.checkpoints.map((cp) => ({
        id: cp.id,
        epoch: cp.epoch,
        metrics: cp.metricsJson as Record<string, unknown> | null,
        checkpointPath: cp.checkpointPath,
        createdAt: cp.createdAt,
      }));

      // Find best checkpoint based on metrics
      let bestCheckpoint = null;
      if (checkpoints.length > 0) {
        const config = job.configJson as any;
        const metricKey = config?.checkpointConfig?.metricToWatch || "val_loss";
        const direction = config?.checkpointConfig?.metricDirection || "minimize";

        const withMetric = checkpoints.filter((cp) => cp.metrics && (cp.metrics as any)[metricKey] !== undefined);
        if (withMetric.length > 0) {
          const best = direction === "minimize"
            ? withMetric.reduce((a, b) => ((a.metrics as any)[metricKey] < (b.metrics as any)[metricKey] ? a : b))
            : withMetric.reduce((a, b) => ((a.metrics as any)[metricKey] > (b.metrics as any)[metricKey] ? a : b));

          bestCheckpoint = { epoch: best.epoch, metrics: best.metrics, path: best.checkpointPath };
        }
      }

      return {
        jobId: job.id,
        jobCode: job.jobCode,
        modelName: job.modelName,
        framework: job.framework,
        status: job.status,
        epochsCompleted: job.epochsCompleted,
        epochsTotal: job.epochsTotal,
        metrics: job.metricsJson as Record<string, unknown> | null,
        checkpoints,
        bestCheckpoint,
      };
    });

    return { models, total };
  }

  /**
   * Get model details by job code.
   */
  static async getModel(jobCode: string): Promise<ModelInfo | null> {
    const job = await prisma.trainingJob.findUnique({
      where: { jobCode },
      include: {
        checkpoints: { orderBy: { epoch: "desc" } },
        resource: { select: { name: true, type: true } },
      },
    });

    if (!job) return null;

    const checkpoints = job.checkpoints.map((cp) => ({
      id: cp.id,
      epoch: cp.epoch,
      metrics: cp.metricsJson as Record<string, unknown> | null,
      checkpointPath: cp.checkpointPath,
      createdAt: cp.createdAt,
    }));

    return {
      jobId: job.id,
      jobCode: job.jobCode,
      modelName: job.modelName,
      framework: job.framework,
      status: job.status,
      epochsCompleted: job.epochsCompleted,
      epochsTotal: job.epochsTotal,
      metrics: job.metricsJson as Record<string, unknown> | null,
      checkpoints,
      bestCheckpoint: checkpoints.length > 0
        ? { epoch: checkpoints[0].epoch, metrics: checkpoints[0].metrics, path: checkpoints[0].checkpointPath }
        : null,
    };
  }

  /**
   * Compare two models based on their metrics.
   */
  static async compareModels(jobCode1: string, jobCode2: string): Promise<{
    model1: { jobCode: string; modelName: string; metrics: Record<string, unknown> | null };
    model2: { jobCode: string; modelName: string; metrics: Record<string, unknown> | null };
    winner: string;
    comparisonMetric: string;
    difference: number;
  }> {
    const [m1, m2] = await Promise.all([
      this.getModel(jobCode1),
      this.getModel(jobCode2),
    ]);

    if (!m1) throw new Error(`Model ${jobCode1} not found`);
    if (!m2) throw new Error(`Model ${jobCode2} not found`);

    const metrics1 = m1.bestCheckpoint?.metrics || m1.metrics || {};
    const metrics2 = m2.bestCheckpoint?.metrics || m2.metrics || {};

    // Compare on val_loss (lower is better)
    const valLoss1 = (metrics1 as any).val_loss ?? (metrics1 as any).validationLoss ?? Infinity;
    const valLoss2 = (metrics2 as any).val_loss ?? (metrics2 as any).validationLoss ?? Infinity;

    return {
      model1: { jobCode: jobCode1, modelName: m1.modelName, metrics: metrics1 as any },
      model2: { jobCode: jobCode2, modelName: m2.modelName, metrics: metrics2 as any },
      winner: valLoss1 <= valLoss2 ? jobCode1 : jobCode2,
      comparisonMetric: "val_loss",
      difference: Math.abs(valLoss1 - valLoss2),
    };
  }

  /**
   * Get model training history for a model name.
   */
  static async getModelHistory(modelName: string): Promise<{
    versions: { jobCode: string; status: string; epochs: number; bestMetric: number | null; completedAt: Date | null }[];
    totalTrainingHours: number;
    totalVersions: number;
  }> {
    const jobs = await prisma.trainingJob.findMany({
      where: { modelName },
      orderBy: { createdAt: "desc" },
      select: {
        jobCode: true, status: true, epochsCompleted: true,
        metricsJson: true, completedAt: true, startedAt: true,
      },
    });

    let totalHours = 0;
    const versions = jobs.map((j) => {
      if (j.startedAt && j.completedAt) {
        totalHours += (j.completedAt.getTime() - j.startedAt.getTime()) / 3600000;
      }
      const metrics = j.metricsJson as any;
      return {
        jobCode: j.jobCode,
        status: j.status,
        epochs: j.epochsCompleted,
        bestMetric: metrics?.val_loss ?? metrics?.validationLoss ?? null,
        completedAt: j.completedAt,
      };
    });

    return { versions, totalTrainingHours: Math.round(totalHours * 10) / 10, totalVersions: versions.length };
  }

  /**
   * Get registry stats.
   */
  static async getStats(): Promise<{
    totalModels: number;
    totalCheckpoints: number;
    totalTrainingHours: number;
    byFramework: Record<string, number>;
    recentModels: any[];
  }> {
    const [totalModels, totalCheckpoints, byFramework, recentModels] = await Promise.all([
      prisma.trainingJob.count({ where: { status: "COMPLETED" } }),
      prisma.modelCheckpoint.count(),
      prisma.trainingJob.groupBy({
        by: ["framework"],
        where: { status: "COMPLETED" },
        _count: { id: true },
      }),
      prisma.trainingJob.findMany({
        where: { status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        take: 5,
        select: { jobCode: true, modelName: true, framework: true, epochsCompleted: true, completedAt: true },
      }),
    ]);

    return {
      totalModels,
      totalCheckpoints,
      totalTrainingHours: 0, // Would need aggregation of all completed jobs
      byFramework: Object.fromEntries(byFramework.map((f: any) => [f.framework, f._count.id])),
      recentModels,
    };
  }
}
