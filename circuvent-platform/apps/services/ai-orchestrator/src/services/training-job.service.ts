// ──────────────────────────────────────────────────────────────
// AI Orchestrator — Training Job Service
// Manages ML training job lifecycle: submit, schedule,
// monitor, checkpoint, and completion tracking.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

export class TrainingJobService {
  static async list(params: {
    status?: string; requestedById?: string; page: number; limit: number;
  }) {
    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.requestedById) where.requestedById = params.requestedById;

    const [data, total] = await Promise.all([
      prisma.trainingJob.findMany({
        where,
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: {
          resource: { select: { id: true, name: true, type: true, model: true } },
          _count: { select: { checkpoints: true } },
        },
      }),
      prisma.trainingJob.count({ where }),
    ]);
    return { data, total };
  }

  static async getById(id: string) {
    return prisma.trainingJob.findUnique({
      where: { id },
      include: {
        resource: true,
        checkpoints: { orderBy: { epoch: "desc" }, take: 20 },
      },
    });
  }

  static async submit(data: any, userId: string) {
    const count = await prisma.trainingJob.count();
    const jobCode = `TJ-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;

    const job = await prisma.trainingJob.create({
      data: {
        jobCode,
        name: data.name,
        description: data.description,
        modelName: data.modelName,
        framework: data.framework,
        resourceId: data.resourceId || null,
        requestedById: userId,
        priority: data.priority || 5,
        datasetPath: data.datasetPath,
        configJson: data.configJson || {},
        epochsTotal: data.epochsTotal || data.configJson?.epochs,
        outputPath: data.outputPath,
        status: data.resourceId ? "PREPARING" : "QUEUED",
      },
      include: { resource: { select: { name: true, type: true } } },
    });

    // If resource specified and available, allocate it
    if (data.resourceId) {
      await prisma.computeResource.update({
        where: { id: data.resourceId },
        data: { status: "ALLOCATED" },
      });

      await prisma.resourceAllocation.create({
        data: {
          resourceId: data.resourceId,
          allocatedToId: userId,
          purpose: "TRAINING",
          priority: data.priority || 5,
        },
      });
    }

    await createAuditLog({ userId, action: "JOB_SUBMIT", entity: "TrainingJob", entityId: job.id, newValue: { jobCode, modelName: data.modelName, framework: data.framework } });
    return job;
  }

  static async updateStatus(id: string, data: { status: string; metricsJson?: any; epochsCompleted?: number; errorLog?: string }, userId: string) {
    const updateData: any = { status: data.status };

    if (data.status === "RUNNING" && !updateData.startedAt) {
      updateData.startedAt = new Date();
    }
    if (data.status === "COMPLETED" || data.status === "FAILED") {
      updateData.completedAt = new Date();
    }
    if (data.metricsJson) updateData.metricsJson = data.metricsJson;
    if (data.epochsCompleted !== undefined) updateData.epochsCompleted = data.epochsCompleted;
    if (data.errorLog) updateData.errorLog = data.errorLog;

    const job = await prisma.trainingJob.update({
      where: { id },
      data: updateData,
    });

    // Release resource on completion/failure/cancellation
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(data.status) && job.resourceId) {
      await prisma.computeResource.update({
        where: { id: job.resourceId },
        data: { status: "AVAILABLE" },
      });

      await prisma.resourceAllocation.updateMany({
        where: { resourceId: job.resourceId, status: "ACTIVE" },
        data: { status: data.status === "COMPLETED" ? "COMPLETED" : "FAILED", endedAt: new Date() },
      });
    }

    await createAuditLog({ userId, action: "UPDATE", entity: "TrainingJob", entityId: id, newValue: { status: data.status } });
    return job;
  }

  static async addCheckpoint(jobId: string, data: { epoch: number; stepNumber?: number; metricsJson?: any; checkpointPath: string; sizeBytes?: number }) {
    const checkpoint = await prisma.modelCheckpoint.create({
      data: { jobId, ...data, sizeBytes: data.sizeBytes ? BigInt(data.sizeBytes) : null },
    });

    // Update job epoch count
    await prisma.trainingJob.update({
      where: { id: jobId },
      data: { epochsCompleted: data.epoch, metricsJson: data.metricsJson || undefined },
    });

    return { ...checkpoint, sizeBytes: checkpoint.sizeBytes?.toString() };
  }

  static async cancel(id: string, userId: string) {
    const job = await prisma.trainingJob.findUnique({ where: { id } });
    if (!job) throw new Error("Job not found");

    const cancelableStates = ["QUEUED", "PREPARING", "RUNNING", "PAUSED"];
    if (!cancelableStates.includes(job.status)) {
      throw new Error(`Cannot cancel job in ${job.status} state`);
    }

    return this.updateStatus(id, { status: "CANCELLED" }, userId);
  }

  static async getDashboard() {
    const [total, byStatus, recentJobs, avgDuration] = await Promise.all([
      prisma.trainingJob.count(),
      prisma.trainingJob.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.trainingJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { resource: { select: { name: true, type: true } } },
      }),
      prisma.trainingJob.findMany({
        where: { status: "COMPLETED", startedAt: { not: null }, completedAt: { not: null } },
        select: { startedAt: true, completedAt: true },
        take: 50,
        orderBy: { completedAt: "desc" },
      }),
    ]);

    const avgMinutes = avgDuration.length > 0
      ? avgDuration.reduce((sum, j) => {
          const start = j.startedAt?.getTime() || 0;
          const end = j.completedAt?.getTime() || 0;
          return sum + (end - start) / 60000;
        }, 0) / avgDuration.length
      : 0;

    return {
      total,
      byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count.id])),
      recentJobs,
      averageDurationMinutes: Math.round(avgMinutes),
    };
  }
}
