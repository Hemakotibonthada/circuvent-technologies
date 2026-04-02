// ──────────────────────────────────────────────────────────────
// Lead Repository — CRM pipeline queries, conversion
// analytics, weighted pipeline value, and lead aging.
// ──────────────────────────────────────────────────────────────

import { BaseRepository, PaginationParams, PaginatedResult } from "../repository.base";

export class LeadRepository extends BaseRepository<"lead"> {
  constructor() { super("lead"); }

  async findByStatus(status: string, pagination: PaginationParams): Promise<PaginatedResult<any>> {
    return this.findPaginated(pagination, { status }, {
      client: { select: { id: true, companyName: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      assignedTo: { select: { firstName: true, lastName: true } },
      _count: { select: { activities: true } },
    });
  }

  async findByAssignee(userId: string): Promise<any[]> {
    return this.model.findMany({
      where: { assignedToId: userId, status: { notIn: ["WON", "LOST"] } },
      include: {
        client: { select: { companyName: true } },
        _count: { select: { activities: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getPipeline(): Promise<{
    stages: { status: string; count: number; totalValue: number; weightedValue: number }[];
    totalLeads: number;
    totalPipelineValue: number;
    weightedPipelineValue: number;
  }> {
    const pipeline = await this.model.groupBy({
      by: ["status"],
      _count: { id: true },
      _sum: { estimatedValue: true },
    });

    // Get all leads for weighted calculation
    const leads = await this.model.findMany({
      where: { status: { notIn: ["WON", "LOST"] } },
      select: { estimatedValue: true, probability: true, status: true },
    });

    const stages = pipeline.map((s: any) => {
      const stageLeads = leads.filter((l) => l.status === s.status);
      const weightedValue = stageLeads.reduce(
        (sum, l) => sum + (Number(l.estimatedValue || 0) * ((l.probability || 0) / 100)),
        0
      );

      return {
        status: s.status,
        count: s._count.id,
        totalValue: Number(s._sum.estimatedValue || 0),
        weightedValue: Math.round(weightedValue),
      };
    });

    const totalLeads = stages.reduce((sum, s) => sum + s.count, 0);
    const totalPipelineValue = stages.reduce((sum, s) => sum + s.totalValue, 0);
    const weightedPipelineValue = stages.reduce((sum, s) => sum + s.weightedValue, 0);

    return { stages, totalLeads, totalPipelineValue, weightedPipelineValue };
  }

  async getConversionMetrics(months = 12): Promise<{
    totalLeads: number;
    won: number;
    lost: number;
    conversionRate: number;
    averageDealSize: number;
    averageTimeToClose: number;
    bySource: { source: string; count: number; won: number; rate: number }[];
  }> {
    const since = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);

    const [totalLeads, won, lost, wonLeads, bySourceRaw] = await Promise.all([
      this.model.count({ where: { createdAt: { gte: since } } }),
      this.model.count({ where: { status: "WON", createdAt: { gte: since } } }),
      this.model.count({ where: { status: "LOST", createdAt: { gte: since } } }),
      this.model.findMany({
        where: { status: "WON", createdAt: { gte: since } },
        select: { estimatedValue: true, createdAt: true, updatedAt: true },
      }),
      this.model.groupBy({
        by: ["source"],
        where: { createdAt: { gte: since } },
        _count: { id: true },
      }),
    ]);

    const averageDealSize = wonLeads.length > 0
      ? Math.round(wonLeads.reduce((sum, l) => sum + Number(l.estimatedValue || 0), 0) / wonLeads.length)
      : 0;

    const averageTimeToClose = wonLeads.length > 0
      ? Math.round(wonLeads.reduce((sum, l) => {
          const days = (l.updatedAt.getTime() - l.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          return sum + days;
        }, 0) / wonLeads.length)
      : 0;

    // By source
    const bySource: any[] = [];
    for (const source of bySourceRaw) {
      const sourceWon = await this.model.count({
        where: { source: source.source as any, status: "WON", createdAt: { gte: since } },
      });
      bySource.push({
        source: source.source,
        count: source._count.id,
        won: sourceWon,
        rate: source._count.id > 0 ? Math.round((sourceWon / source._count.id) * 100) : 0,
      });
    }

    return {
      totalLeads, won, lost,
      conversionRate: totalLeads > 0 ? Math.round((won / totalLeads) * 100) : 0,
      averageDealSize,
      averageTimeToClose,
      bySource,
    };
  }

  async getLeadAging(): Promise<{
    fresh: number;       // < 7 days
    warm: number;        // 7-30 days
    cooling: number;     // 30-60 days
    cold: number;        // > 60 days
  }> {
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const d60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const openLeads = await this.model.findMany({
      where: { status: { notIn: ["WON", "LOST"] } },
      select: { updatedAt: true },
    });

    return {
      fresh: openLeads.filter((l) => l.updatedAt >= d7).length,
      warm: openLeads.filter((l) => l.updatedAt < d7 && l.updatedAt >= d30).length,
      cooling: openLeads.filter((l) => l.updatedAt < d30 && l.updatedAt >= d60).length,
      cold: openLeads.filter((l) => l.updatedAt < d60).length,
    };
  }
}

export const leadRepository = new LeadRepository();
