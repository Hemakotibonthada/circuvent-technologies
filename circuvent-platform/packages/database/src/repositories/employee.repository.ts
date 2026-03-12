// ──────────────────────────────────────────────────────────────
// Employee Repository — HR-specific queries, department
// aggregation, tenure calculations, and statutory lookups.
// ──────────────────────────────────────────────────────────────

import { BaseRepository, PaginationParams, PaginatedResult } from "../repository.base";

export class EmployeeRepository extends BaseRepository<"employee"> {
  constructor() { super("employee"); }

  async findByUserId(userId: string): Promise<any | null> {
    return this.model.findUnique({
      where: { userId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
    });
  }

  async findByCode(code: string): Promise<any | null> {
    return this.model.findUnique({ where: { employeeCode: code } });
  }

  async findActiveEmployees(pagination: PaginationParams): Promise<PaginatedResult<any>> {
    const where = { dateOfLeaving: null };
    return this.findPaginated(pagination, where, {
      user: { select: { firstName: true, lastName: true, email: true } },
    });
  }

  async findByDepartment(department: string): Promise<any[]> {
    return this.model.findMany({
      where: { department, dateOfLeaving: null },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { dateOfJoining: "asc" },
    });
  }

  async getDepartmentSummary(): Promise<{ department: string; count: number; totalCTC: number }[]> {
    const result = await this.model.groupBy({
      by: ["department"],
      where: { dateOfLeaving: null },
      _count: { id: true },
      _sum: { baseSalary: true },
    });
    return result.map((r: any) => ({
      department: r.department,
      count: r._count.id,
      totalCTC: Number(r._sum.baseSalary || 0),
    }));
  }

  async findJoinedInRange(startDate: Date, endDate: Date): Promise<any[]> {
    return this.model.findMany({
      where: { dateOfJoining: { gte: startDate, lte: endDate } },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { dateOfJoining: "desc" },
    });
  }

  async findExitedInRange(startDate: Date, endDate: Date): Promise<any[]> {
    return this.model.findMany({
      where: { dateOfLeaving: { gte: startDate, lte: endDate } },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { dateOfLeaving: "desc" },
    });
  }

  async getAttritionRate(months = 12): Promise<number> {
    const startDate = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);
    const [exits, avgHeadcount] = await Promise.all([
      this.model.count({ where: { dateOfLeaving: { gte: startDate } } }),
      this.model.count({ where: { dateOfLeaving: null } }),
    ]);
    return avgHeadcount > 0 ? Math.round((exits / avgHeadcount) * 10000) / 100 : 0;
  }

  async getHeadcountTrend(months = 12): Promise<{ month: string; count: number }[]> {
    const trend: { month: string; count: number }[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const count = await this.model.count({
        where: {
          dateOfJoining: { lte: endOfMonth },
          OR: [{ dateOfLeaving: null }, { dateOfLeaving: { gt: endOfMonth } }],
        },
      });
      trend.push({
        month: date.toLocaleString("en", { month: "short", year: "numeric" }),
        count,
      });
    }

    return trend;
  }
}

export const employeeRepository = new EmployeeRepository();
