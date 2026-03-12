export { PrismaClient } from "@prisma/client";
export * from "@prisma/client";

import { PrismaClient } from "@prisma/client";

// Singleton pattern for Prisma Client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;

// Phase 2 exports
export { BaseRepository, getPrisma, buildPaginatedResult, normalizePaginationParams } from "./repository.base";
export type { PaginationParams, PaginatedResult } from "./repository.base";
export { TransactionManager, transactionManager } from "./transaction.manager";
