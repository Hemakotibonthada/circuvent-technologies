// ──────────────────────────────────────────────────────────────
// Transaction Manager
// Provides explicit transaction boundaries for operations
// that span multiple repositories/models.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { getPrisma } from "./repository.base";

export type TransactionCallback<T> = (tx: PrismaClient) => Promise<T>;

export class TransactionManager {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrisma();
  }

  async execute<T>(callback: TransactionCallback<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => callback(tx as unknown as PrismaClient),
      {
        maxWait: 10000,
        timeout: 30000,
      }
    );
  }

  async executeSequential<T>(callbacks: TransactionCallback<T>[]): Promise<T[]> {
    return this.prisma.$transaction(async (tx) => {
      const results: T[] = [];
      for (const cb of callbacks) {
        results.push(await cb(tx as unknown as PrismaClient));
      }
      return results;
    });
  }
}

export const transactionManager = new TransactionManager();
