// ──────────────────────────────────────────────────────────────
// User Repository — extends BaseRepository with user-specific
// queries, search, and role-based filtering.
// ──────────────────────────────────────────────────────────────

import { BaseRepository, PaginationParams, PaginatedResult } from "../repository.base";

export class UserRepository extends BaseRepository<"user"> {
  constructor() { super("user"); }

  async findByEmail(email: string): Promise<any | null> {
    return this.model.findUnique({ where: { email } });
  }

  async findByRole(role: string): Promise<any[]> {
    return this.model.findMany({ where: { role }, orderBy: { createdAt: "desc" } });
  }

  async findActiveUsers(pagination: PaginationParams): Promise<PaginatedResult<any>> {
    const where = { status: "ACTIVE" };
    return this.findPaginated(pagination, where);
  }

  async searchUsers(query: string, pagination: PaginationParams): Promise<PaginatedResult<any>> {
    const where = {
      OR: [
        { firstName: { contains: query, mode: "insensitive" as const } },
        { lastName: { contains: query, mode: "insensitive" as const } },
        { email: { contains: query, mode: "insensitive" as const } },
      ],
    };
    return this.findPaginated(pagination, where);
  }

  async updateStatus(id: string, status: string): Promise<any> {
    return this.update(id, { status });
  }

  async getUserWithEmployee(id: string): Promise<any | null> {
    return this.model.findUnique({
      where: { id },
      include: {
        employee: true,
        clientProfile: true,
      },
    });
  }

  async countByRole(): Promise<{ role: string; count: number }[]> {
    const result = await this.model.groupBy({
      by: ["role"],
      _count: { id: true },
    });
    return result.map((r: any) => ({ role: r.role, count: r._count.id }));
  }

  async getRecentlyCreated(limit = 10): Promise<any[]> {
    return this.model.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, status: true, createdAt: true,
      },
    });
  }
}

export const userRepository = new UserRepository();
