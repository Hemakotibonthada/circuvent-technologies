// ──────────────────────────────────────────────────────────────
// GPU Resource Repository — compute resource queries,
// utilization analytics, cost tracking, and scheduling data.
// ──────────────────────────────────────────────────────────────

import { BaseRepository, PaginationParams, PaginatedResult } from "../repository.base";

export class GPUResourceRepository extends BaseRepository<"computeResource"> {
  constructor() { super("computeResource"); }

  async findByCode(code: string): Promise<any | null> {
    return this.model.findUnique({
      where: { resourceCode: code },
      include: {
        allocations: { where: { status: "ACTIVE" }, take: 1 },
        trainingJobs: { where: { status: { in: ["RUNNING", "PREPARING"] } }, take: 5 },
      },
    });
  }

  async findAvailable(type?: string, minVramGb?: number): Promise<any[]> {
    const where: any = { status: "AVAILABLE" };
    if (type) where.type = type;
    if (minVramGb) where.vramGb = { gte: minVramGb };
    return this.model.findMany({
      where,
      orderBy: { costPerHourINR: "asc" },
    });
  }

  async getUtilizationHistory(days = 30): Promise<{
    date: string;
    totalResources: number;
    allocated: number;
    utilizationPercent: number;
  }[]> {
    const history: any[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const totalResources = await this.count();
      const allocated = await this.prisma.resourceAllocation.count({
        where: {
          startedAt: { lte: nextDate },
          OR: [
            { endedAt: null },
            { endedAt: { gte: date } },
          ],
          status: { in: ["ACTIVE", "COMPLETED"] },
        },
      });

      history.push({
        date: date.toISOString().split("T")[0],
        totalResources,
        allocated: Math.min(allocated, totalResources),
        utilizationPercent: totalResources > 0 ? Math.round((Math.min(allocated, totalResources) / totalResources) * 100) : 0,
      });
    }

    return history;
  }

  async getCostAnalysis(startDate: Date, endDate: Date): Promise<{
    totalCost: number;
    byResource: { resourceCode: string; type: string; hours: number; cost: number }[];
    byPurpose: { purpose: string; hours: number; cost: number }[];
    averageCostPerHour: number;
  }> {
    const allocations = await this.prisma.resourceAllocation.findMany({
      where: {
        startedAt: { gte: startDate },
        endedAt: { lte: endDate },
        status: "COMPLETED",
      },
      include: { resource: { select: { resourceCode: true, type: true } } },
    });

    const byResource: Record<string, { resourceCode: string; type: string; hours: number; cost: number }> = {};
    const byPurpose: Record<string, { purpose: string; hours: number; cost: number }> = {};
    let totalCost = 0;
    let totalHours = 0;

    for (const alloc of allocations) {
      const hours = Number(alloc.actualHours || 0);
      const cost = Number(alloc.costINR || 0);
      totalCost += cost;
      totalHours += hours;

      const rKey = alloc.resource.resourceCode;
      if (!byResource[rKey]) byResource[rKey] = { resourceCode: rKey, type: alloc.resource.type, hours: 0, cost: 0 };
      byResource[rKey].hours += hours;
      byResource[rKey].cost += cost;

      if (!byPurpose[alloc.purpose]) byPurpose[alloc.purpose] = { purpose: alloc.purpose, hours: 0, cost: 0 };
      byPurpose[alloc.purpose].hours += hours;
      byPurpose[alloc.purpose].cost += cost;
    }

    return {
      totalCost: Math.round(totalCost),
      byResource: Object.values(byResource).map((r) => ({ ...r, hours: Math.round(r.hours * 10) / 10, cost: Math.round(r.cost) })),
      byPurpose: Object.values(byPurpose).map((p) => ({ ...p, hours: Math.round(p.hours * 10) / 10, cost: Math.round(p.cost) })),
      averageCostPerHour: totalHours > 0 ? Math.round(totalCost / totalHours) : 0,
    };
  }

  async getTypeBreakdown(): Promise<{ type: string; total: number; available: number; allocated: number; vramTotal: number }[]> {
    const resources = await this.model.findMany({
      select: { type: true, status: true, vramGb: true },
    });

    const types = ["GPU", "CPU", "TPU"];
    return types.map((type) => {
      const filtered = resources.filter((r: any) => r.type === type);
      return {
        type,
        total: filtered.length,
        available: filtered.filter((r: any) => r.status === "AVAILABLE").length,
        allocated: filtered.filter((r: any) => r.status === "ALLOCATED").length,
        vramTotal: filtered.reduce((sum: number, r: any) => sum + (r.vramGb || 0), 0),
      };
    }).filter((t) => t.total > 0);
  }
}

export const gpuResourceRepository = new GPUResourceRepository();
