// ──────────────────────────────────────────────────────────────
// Project Repository — project-specific queries, R&D roll-up,
// sprint analytics, and cross-module data aggregation.
// ──────────────────────────────────────────────────────────────

import { BaseRepository, PaginationParams, PaginatedResult } from "../repository.base";

export class ProjectRepository extends BaseRepository<"project"> {
  constructor() { super("project"); }

  async findByCode(code: string): Promise<any | null> {
    return this.model.findUnique({
      where: { code },
      include: {
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
        _count: { select: { sprints: true, hardwareRevisions: true, devices: true } },
      },
    });
  }

  async findActive(pagination: PaginationParams): Promise<PaginatedResult<any>> {
    return this.findPaginated(pagination, { status: "ACTIVE" }, {
      members: { include: { user: { select: { firstName: true, lastName: true } } } },
      _count: { select: { sprints: true, hardwareRevisions: true, devices: true } },
    });
  }

  async findRnDProjects(): Promise<any[]> {
    return this.model.findMany({
      where: { isRnD: true, status: { not: "ARCHIVED" } },
      include: { _count: { select: { sprints: true, hardwareRevisions: true } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getProjectTimeline(id: string): Promise<{
    sprints: any[];
    hardwareRevisions: any[];
    deviceCount: number;
    totalBOMCost: number;
  }> {
    const [sprints, revisions, deviceCount, bomCost] = await Promise.all([
      this.prisma.sprint.findMany({
        where: { projectId: id },
        orderBy: { sprintNumber: "asc" },
        include: { _count: { select: { tasks: true } } },
      }),
      this.prisma.hardwareRevision.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "asc" },
        include: {
          bomItems: { select: { unitPrice: true, quantity: true } },
          _count: { select: { bomItems: true } },
        },
      }),
      this.prisma.ioTDevice.count({ where: { projectId: id } }),
      this.prisma.bOMItem.findMany({
        where: { revision: { projectId: id } },
        select: { unitPrice: true, quantity: true },
      }),
    ]);

    const totalBOMCost = bomCost.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);

    return { sprints, hardwareRevisions: revisions, deviceCount, totalBOMCost };
  }

  async getBudgetUtilization(): Promise<{ projectId: string; code: string; name: string; budget: number; spent: number; utilization: number }[]> {
    const projects = await this.model.findMany({
      where: { budget: { not: null }, status: { in: ["ACTIVE", "PLANNING"] } },
      select: { id: true, code: true, name: true, budget: true },
    });

    const results: any[] = [];
    for (const p of projects) {
      const bomCost = await this.prisma.bOMItem.aggregate({
        where: { revision: { projectId: p.id } },
        _sum: { unitPrice: true },
      });
      const spent = Number(bomCost._sum.unitPrice || 0);
      const budget = Number(p.budget);

      results.push({
        projectId: p.id,
        code: p.code,
        name: p.name,
        budget,
        spent,
        utilization: budget > 0 ? Math.round((spent / budget) * 10000) / 100 : 0,
      });
    }

    return results;
  }

  async getSprintVelocityTrend(projectId: string, lastN = 10): Promise<{ sprintNumber: number; name: string; velocity: number; taskCount: number }[]> {
    const sprints = await this.prisma.sprint.findMany({
      where: { projectId, status: "COMPLETED" },
      orderBy: { sprintNumber: "desc" },
      take: lastN,
      include: {
        tasks: { select: { status: true, storyPoints: true } },
      },
    });

    return sprints.reverse().map((s) => ({
      sprintNumber: s.sprintNumber,
      name: s.name,
      velocity: s.tasks
        .filter((t) => t.status === "DONE")
        .reduce((sum, t) => sum + (t.storyPoints || 0), 0),
      taskCount: s.tasks.length,
    }));
  }

  async getStatusDistribution(): Promise<Record<string, number>> {
    const groups = await this.model.groupBy({
      by: ["status"],
      _count: { id: true },
    });
    return Object.fromEntries(groups.map((g: any) => [g.status, g._count.id]));
  }

  async getTypeDistribution(): Promise<Record<string, number>> {
    const groups = await this.model.groupBy({
      by: ["type"],
      _count: { id: true },
    });
    return Object.fromEntries(groups.map((g: any) => [g.type, g._count.id]));
  }
}

export const projectRepository = new ProjectRepository();
