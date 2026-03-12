// ──────────────────────────────────────────────────────────────
// AI Orchestrator — Resource Pool Service
// Manages GPU/CPU resources, allocation, scheduling, and
// cost tracking for internal AI workloads.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

export class ResourcePoolService {
  static async listResources(params: {
    type?: string; status?: string; page: number; limit: number;
  }) {
    const where: any = {};
    if (params.type) where.type = params.type;
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      prisma.computeResource.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: {
          allocations: { where: { status: "ACTIVE" }, take: 1 },
          _count: { select: { allocations: true, trainingJobs: true } },
        },
      }),
      prisma.computeResource.count({ where }),
    ]);
    return { data, total };
  }

  static async getById(id: string) {
    return prisma.computeResource.findUnique({
      where: { id },
      include: {
        allocations: { orderBy: { startedAt: "desc" }, take: 20 },
        trainingJobs: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
  }

  static async create(data: any, userId: string) {
    const count = await prisma.computeResource.count();
    const typePrefix = data.type === "GPU" ? "GPU" : data.type === "TPU" ? "TPU" : "CPU";
    const resourceCode = `${typePrefix}-${String(count + 1).padStart(3, "0")}`;

    const resource = await prisma.computeResource.create({
      data: { ...data, resourceCode },
    });

    await createAuditLog({ userId, action: "CREATE", entity: "ComputeResource", entityId: resource.id, newValue: { resourceCode, type: data.type } });
    return resource;
  }

  static async updateStatus(id: string, status: string, userId: string) {
    const resource = await prisma.computeResource.update({
      where: { id },
      data: { status: status as any },
    });

    // If going offline/maintenance, release active allocations
    if (status === "OFFLINE" || status === "MAINTENANCE") {
      await prisma.resourceAllocation.updateMany({
        where: { resourceId: id, status: "ACTIVE" },
        data: { status: "PREEMPTED", endedAt: new Date() },
      });
    }

    await createAuditLog({ userId, action: "UPDATE", entity: "ComputeResource", entityId: id, newValue: { status } });
    return resource;
  }

  static async allocate(data: { resourceId: string; purpose: string; priority: number; estimatedHours?: number }, userId: string) {
    const resource = await prisma.computeResource.findUnique({ where: { id: data.resourceId } });
    if (!resource) throw new Error("Resource not found");
    if (resource.status !== "AVAILABLE") throw new Error(`Resource is ${resource.status}, cannot allocate`);

    const allocation = await prisma.resourceAllocation.create({
      data: {
        resourceId: data.resourceId,
        allocatedToId: userId,
        purpose: data.purpose,
        priority: data.priority,
        estimatedHours: data.estimatedHours,
      },
    });

    await prisma.computeResource.update({
      where: { id: data.resourceId },
      data: { status: "ALLOCATED" },
    });

    await createAuditLog({ userId, action: "RESOURCE_ALLOCATE", entity: "ResourceAllocation", entityId: allocation.id, newValue: { resourceId: data.resourceId, purpose: data.purpose } });
    return allocation;
  }

  static async release(allocationId: string, userId: string) {
    const allocation = await prisma.resourceAllocation.findUnique({ where: { id: allocationId } });
    if (!allocation) throw new Error("Allocation not found");

    const startedAt = allocation.startedAt.getTime();
    const actualHours = (Date.now() - startedAt) / (1000 * 60 * 60);

    const resource = await prisma.computeResource.findUnique({ where: { id: allocation.resourceId } });
    const costINR = resource?.costPerHourINR ? Number(resource.costPerHourINR) * actualHours : 0;

    await prisma.resourceAllocation.update({
      where: { id: allocationId },
      data: { status: "COMPLETED", endedAt: new Date(), actualHours, costINR },
    });

    await prisma.computeResource.update({
      where: { id: allocation.resourceId },
      data: { status: "AVAILABLE" },
    });

    await createAuditLog({ userId, action: "RESOURCE_RELEASE", entity: "ResourceAllocation", entityId: allocationId });
    return { allocationId, actualHours: Math.round(actualHours * 100) / 100, costINR: Math.round(costINR) };
  }

  static async getDashboard() {
    const [total, available, allocated, maintenance, offline, resources, activeAllocations] = await Promise.all([
      prisma.computeResource.count(),
      prisma.computeResource.count({ where: { status: "AVAILABLE" } }),
      prisma.computeResource.count({ where: { status: "ALLOCATED" } }),
      prisma.computeResource.count({ where: { status: "MAINTENANCE" } }),
      prisma.computeResource.count({ where: { status: "OFFLINE" } }),
      prisma.computeResource.findMany({ select: { type: true, status: true, vramGb: true, costPerHourINR: true } }),
      prisma.resourceAllocation.findMany({ where: { status: "ACTIVE" }, include: { resource: { select: { name: true, type: true } } } }),
    ]);

    const totalVramGb = resources.reduce((sum, r) => sum + (r.vramGb || 0), 0);
    const availableVramGb = resources.filter(r => r.status === "AVAILABLE").reduce((sum, r) => sum + (r.vramGb || 0), 0);
    const totalCostPerHour = resources.filter(r => r.status === "ALLOCATED").reduce((sum, r) => sum + Number(r.costPerHourINR || 0), 0);

    const byType = ["GPU", "CPU", "TPU"].map(type => ({
      type,
      count: resources.filter(r => r.type === type).length,
      available: resources.filter(r => r.type === type && r.status === "AVAILABLE").length,
    }));

    return {
      total, available, allocated, maintenance, offline,
      utilizationPercent: total > 0 ? Math.round((allocated / total) * 100) : 0,
      totalVramGb, availableVramGb, totalCostPerHour, byType,
      activeAllocations,
    };
  }
}
