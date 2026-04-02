// ──────────────────────────────────────────────────────────────
// AI Orchestrator — Resource Scheduler
// Intelligent allocation of GPU/CPU resources to training
// jobs and trading bots with priority queuing, preemption,
// and cost optimization.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";
import { ComputeResourceEntity } from "../domain/ai.entities";

const prisma = new PrismaClient();

export interface ScheduleRequest {
  purpose: string;
  requiredVramGb?: number;
  preferredType: string;
  estimatedHours: number;
  priority: number;
  requestedById: string;
  jobId?: string;
  botId?: string;
}

export interface ScheduleDecision {
  allocated: boolean;
  resourceId?: string;
  resourceCode?: string;
  reason: string;
  estimatedWaitMinutes?: number;
  estimatedCost?: number;
  alternativeResources?: { id: string; code: string; type: string; vramGb: number | null; available: boolean }[];
}

export class ResourceSchedulerService {
  /**
   * Schedule a resource allocation based on priority and requirements.
   * Implements a priority-based first-fit algorithm.
   */
  static async schedule(request: ScheduleRequest): Promise<ScheduleDecision> {
    // 1. Find all available resources matching type
    const availableResources = await prisma.computeResource.findMany({
      where: {
        status: "AVAILABLE",
        ...(request.preferredType ? { type: request.preferredType as any } : {}),
      },
      orderBy: [
        { costPerHourINR: "asc" }, // Prefer cheapest first
      ],
    });

    // 2. Filter by VRAM requirement
    const candidates = availableResources.filter((r) => {
      if (!request.requiredVramGb) return true;
      return (r.vramGb || 0) >= request.requiredVramGb;
    });

    // 3. Get alternative resources for display
    const allResources = await prisma.computeResource.findMany({
      where: { type: request.preferredType as any },
      select: { id: true, resourceCode: true, type: true, vramGb: true, status: true },
    });
    const alternatives = allResources.map((r) => ({
      id: r.id, code: r.resourceCode, type: r.type, vramGb: r.vramGb,
      available: r.status === "AVAILABLE",
    }));

    // 4. If we have a candidate, allocate it
    if (candidates.length > 0) {
      const selected = candidates[0];
      const estimatedCost = selected.costPerHourINR
        ? Math.round(Number(selected.costPerHourINR) * request.estimatedHours)
        : 0;

      // Perform allocation
      const allocation = await prisma.resourceAllocation.create({
        data: {
          resourceId: selected.id,
          allocatedToId: request.requestedById,
          purpose: request.purpose,
          priority: request.priority,
          estimatedHours: request.estimatedHours,
        },
      });

      await prisma.computeResource.update({
        where: { id: selected.id },
        data: { status: "ALLOCATED" },
      });

      // Link to job if provided
      if (request.jobId) {
        await prisma.trainingJob.update({
          where: { id: request.jobId },
          data: { resourceId: selected.id, status: "PREPARING" },
        });
      }

      await createAuditLog({
        userId: request.requestedById,
        action: "RESOURCE_ALLOCATE",
        entity: "ResourceAllocation",
        entityId: allocation.id,
        newValue: { resourceId: selected.id, purpose: request.purpose, priority: request.priority },
      });

      return {
        allocated: true,
        resourceId: selected.id,
        resourceCode: selected.resourceCode,
        reason: `Allocated ${selected.resourceCode} (${selected.type}${selected.vramGb ? `, ${selected.vramGb}GB` : ""})`,
        estimatedCost,
        alternativeResources: alternatives,
      };
    }

    // 5. No available resource — check if preemption is possible
    if (request.priority <= 3) {
      const preemptable = await this.findPreemptableAllocation(request);
      if (preemptable) {
        return {
          allocated: false,
          reason: `No resource available. Preemption possible on ${preemptable.resourceCode} (P${preemptable.currentPriority} job). Use force-allocate to preempt.`,
          estimatedWaitMinutes: 5,
          alternativeResources: alternatives,
        };
      }
    }

    // 6. Estimate wait time based on queue
    const queuedJobs = await prisma.trainingJob.count({ where: { status: "QUEUED" } });
    const avgJobDurationMinutes = 120; // Placeholder
    const estimatedWait = queuedJobs * avgJobDurationMinutes;

    return {
      allocated: false,
      reason: `No ${request.preferredType} resource with ${request.requiredVramGb || 0}GB+ VRAM available. ${queuedJobs} jobs queued ahead.`,
      estimatedWaitMinutes: estimatedWait,
      alternativeResources: alternatives,
    };
  }

  /**
   * Force-allocate by preempting a lower-priority allocation.
   */
  static async forceAllocate(request: ScheduleRequest): Promise<ScheduleDecision> {
    const preemptable = await this.findPreemptableAllocation(request);
    if (!preemptable) {
      return { allocated: false, reason: "No preemptable allocation found" };
    }

    // Preempt the existing allocation
    await prisma.resourceAllocation.update({
      where: { id: preemptable.allocationId },
      data: { status: "PREEMPTED", endedAt: new Date() },
    });

    // If it was linked to a job, pause that job
    const linkedJob = await prisma.trainingJob.findFirst({
      where: { resourceId: preemptable.resourceId, status: "RUNNING" },
    });
    if (linkedJob) {
      await prisma.trainingJob.update({
        where: { id: linkedJob.id },
        data: { status: "PAUSED" },
      });
    }

    // Now allocate to the new request
    return this.schedule(request);
  }

  /**
   * Auto-assign resources to queued jobs based on priority.
   * Should be called periodically (e.g., every 5 minutes).
   */
  static async processQueue(): Promise<{ assigned: number; remaining: number }> {
    const queuedJobs = await prisma.trainingJob.findMany({
      where: { status: "QUEUED", resourceId: null },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });

    let assigned = 0;

    for (const job of queuedJobs) {
      const config = job.configJson as any;
      const decision = await this.schedule({
        purpose: "TRAINING",
        requiredVramGb: config?.resourceRequirements?.minVramGb,
        preferredType: "GPU",
        estimatedHours: (job.estimatedTimeMin || 60) / 60,
        priority: job.priority,
        requestedById: job.requestedById,
        jobId: job.id,
      });

      if (decision.allocated) assigned++;
    }

    const remaining = queuedJobs.length - assigned;
    return { assigned, remaining };
  }

  /**
   * Get scheduler queue status.
   */
  static async getQueueStatus(): Promise<{
    queueDepth: number;
    runningJobs: number;
    availableResources: number;
    estimatedClearTimeMinutes: number;
    queuedByPriority: { priority: number; count: number }[];
  }> {
    const [queueDepth, runningJobs, availableResources, queuedByPriority] = await Promise.all([
      prisma.trainingJob.count({ where: { status: "QUEUED" } }),
      prisma.trainingJob.count({ where: { status: "RUNNING" } }),
      prisma.computeResource.count({ where: { status: "AVAILABLE" } }),
      prisma.trainingJob.groupBy({
        by: ["priority"],
        where: { status: "QUEUED" },
        _count: { id: true },
        orderBy: { priority: "asc" },
      }),
    ]);

    const avgJobMinutes = 120;
    const parallelCapacity = Math.max(availableResources, 1);
    const estimatedClearTime = Math.ceil((queueDepth * avgJobMinutes) / parallelCapacity);

    return {
      queueDepth,
      runningJobs,
      availableResources,
      estimatedClearTimeMinutes: estimatedClearTime,
      queuedByPriority: queuedByPriority.map((p: any) => ({ priority: p.priority, count: p._count.id })),
    };
  }

  private static async findPreemptableAllocation(request: ScheduleRequest): Promise<{
    allocationId: string;
    resourceId: string;
    resourceCode: string;
    currentPriority: number;
  } | null> {
    // Find allocated resources with lower priority (higher number = lower priority)
    const allocations = await prisma.resourceAllocation.findMany({
      where: {
        status: "ACTIVE",
        priority: { gt: request.priority },
        resource: {
          type: request.preferredType as any,
          ...(request.requiredVramGb ? { vramGb: { gte: request.requiredVramGb } } : {}),
        },
      },
      include: { resource: { select: { id: true, resourceCode: true } } },
      orderBy: { priority: "desc" }, // Preempt lowest priority first
      take: 1,
    });

    if (allocations.length === 0) return null;

    return {
      allocationId: allocations[0].id,
      resourceId: allocations[0].resourceId,
      resourceCode: allocations[0].resource.resourceCode,
      currentPriority: allocations[0].priority,
    };
  }
}
