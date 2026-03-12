// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Generic Repository Base
// Provides type-safe CRUD, pagination, soft-delete, and
// transaction support for all domain repositories.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalForPrisma.__prisma;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

export function normalizePaginationParams(query: Record<string, unknown>): PaginationParams {
  return {
    page: Math.max(1, Number(query.page) || 1),
    limit: Math.min(100, Math.max(1, Number(query.limit) || 20)),
    sortBy: (query.sortBy as string) || "createdAt",
    sortOrder: (query.sortOrder as "asc" | "desc") || "desc",
    search: (query.search as string) || undefined,
  };
}

/**
 * Generic repository base class.
 * Extend per-domain: `class UserRepository extends BaseRepository`
 */
export abstract class BaseRepository<TModel extends string> {
  protected prisma: PrismaClient;
  protected modelName: TModel;

  constructor(modelName: TModel) {
    this.prisma = getPrisma();
    this.modelName = modelName;
  }

  protected get model(): any {
    return (this.prisma as any)[this.modelName];
  }

  async findById(id: string, include?: Record<string, unknown>): Promise<any | null> {
    return this.model.findUnique({
      where: { id },
      ...(include ? { include } : {}),
    });
  }

  async findMany(params: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, unknown>;
    skip?: number;
    take?: number;
    include?: Record<string, unknown>;
    select?: Record<string, unknown>;
  }): Promise<any[]> {
    return this.model.findMany(params);
  }

  async count(where?: Record<string, unknown>): Promise<number> {
    return this.model.count({ where });
  }

  async create(data: Record<string, unknown>, include?: Record<string, unknown>): Promise<any> {
    return this.model.create({
      data,
      ...(include ? { include } : {}),
    });
  }

  async update(
    id: string,
    data: Record<string, unknown>,
    include?: Record<string, unknown>
  ): Promise<any> {
    return this.model.update({
      where: { id },
      data,
      ...(include ? { include } : {}),
    });
  }

  async delete(id: string): Promise<any> {
    return this.model.delete({ where: { id } });
  }

  async exists(where: Record<string, unknown>): Promise<boolean> {
    const count = await this.model.count({ where });
    return count > 0;
  }

  async findPaginated(
    pagination: PaginationParams,
    where?: Record<string, unknown>,
    include?: Record<string, unknown>
  ): Promise<PaginatedResult<any>> {
    const skip = (pagination.page - 1) * pagination.limit;

    const [data, total] = await Promise.all([
      this.model.findMany({
        where,
        orderBy: { [pagination.sortBy]: pagination.sortOrder },
        skip,
        take: pagination.limit,
        ...(include ? { include } : {}),
      }),
      this.model.count({ where }),
    ]);

    return buildPaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      return fn(tx as unknown as PrismaClient);
    });
  }
}
