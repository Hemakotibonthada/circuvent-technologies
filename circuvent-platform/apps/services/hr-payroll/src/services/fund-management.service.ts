// ──────────────────────────────────────────────────────────────
// HR & Payroll — Fund Management Service
// Complete fund lifecycle: Create → Allocate → Transact →
// Reconcile → Report. Supports spending limits, fund freeze,
// budget vs actual analysis, and auto-allocation.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type FundCategory =
  | "OPERATIONAL"
  | "CAPITAL"
  | "PROJECT"
  | "DEPARTMENT"
  | "EMERGENCY"
  | "PETTY_CASH"
  | "TRAVEL"
  | "TRAINING"
  | "RECRUITMENT"
  | "MARKETING"
  | "R_AND_D"
  | "INFRASTRUCTURE";

export type TransactionType = "CREDIT" | "DEBIT" | "TRANSFER" | "HOLD" | "RELEASE" | "REFUND";

export interface CreateFundInput {
  name: string;
  code: string;
  category: FundCategory;
  description?: string;
  totalBudget: number;
  currency?: string;
  fiscalYear?: string;
  department?: string;
  projectId?: string;
  startDate?: string;
  endDate?: string;
}

export interface FundStatement {
  fundId: string;
  fundName: string;
  startDate: string;
  endDate: string;
  openingBalance: number;
  closingBalance: number;
  totalCredits: number;
  totalDebits: number;
  transactions: any[];
}

export interface BudgetVsActualReport {
  fundId: string;
  fundName: string;
  period: string;
  budget: number;
  allocated: number;
  spent: number;
  remaining: number;
  utilizationPercentage: number;
  variance: number;
  variancePercentage: number;
  byCategory: Array<{ category: string; budget: number; actual: number; variance: number }>;
}

export interface FundDashboard {
  totalFunds: number;
  activeFunds: number;
  frozenFunds: number;
  totalBudget: number;
  totalAllocated: number;
  totalSpent: number;
  totalRemaining: number;
  utilizationPercentage: number;
  funds: any[];
  recentTransactions: any[];
}

export interface SpendingLimits {
  fundId: string;
  dailyLimit: number;
  monthlyLimit: number;
}

export interface FundReport {
  fundId: string;
  fundName: string;
  reportType: string;
  generatedAt: string;
  data: any;
}

export interface FiscalPeriodSummary {
  fundId: string;
  year: number;
  month: number;
  openingBalance: number;
  closingBalance: number;
  totalCredits: number;
  totalDebits: number;
  transactionCount: number;
}

// Spending limits stored in-memory (in production, use a separate table or fund metadata)
const spendingLimits = new Map<string, { dailyLimit: number; monthlyLimit: number }>();

// Frozen funds set
const frozenFunds = new Set<string>();

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function getCurrentFiscalYear(): string {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month >= 3) return `FY ${year}-${String(year + 1).slice(2)}`;
  return `FY ${year - 1}-${String(year).slice(2)}`;
}

async function getFundOrThrow(fundId: string) {
  const fund = await prisma.fund.findUnique({ where: { id: fundId } });
  if (!fund) throw new Error(`Fund not found: ${fundId}`);
  return fund;
}

// ══════════════════════════════════════════════════════════════
// Fund Management Service
// ══════════════════════════════════════════════════════════════

export class FundManagementService {
  /**
   * Create a new fund with an initial balance transaction
   */
  static async createFund(
    name: string,
    type: FundCategory,
    initialBalance: number,
    manager: string
  ): Promise<any> {
    if (initialBalance < 0) throw new Error("Initial balance cannot be negative");

    const input: CreateFundInput = {
      name,
      code: `FND-${Date.now().toString(36).toUpperCase()}`,
      category: type,
      totalBudget: initialBalance,
    };

    const fund = await prisma.fund.create({
      data: {
        name: input.name,
        code: input.code,
        category: type as any,
        description: input.description || null,
        totalBudget: initialBalance,
        allocatedAmount: 0,
        spentAmount: 0,
        remainingAmount: initialBalance,
        currency: input.currency || "INR",
        fiscalYear: input.fiscalYear || getCurrentFiscalYear(),
        department: input.department || null,
        projectId: input.projectId || null,
        managerId: manager,
        startDate: input.startDate ? new Date(input.startDate) : new Date(),
        endDate: input.endDate ? new Date(input.endDate) : null,
      },
    });

    // Create initial credit transaction
    if (initialBalance > 0) {
      await prisma.fundTransaction.create({
        data: {
          fundId: fund.id,
          transactionType: "CREDIT",
          amount: initialBalance,
          description: "Initial fund balance",
          status: "COMPLETED",
          processedAt: new Date(),
          processedBy: manager,
          balanceBefore: 0,
          balanceAfter: initialBalance,
        },
      });
    }

    await createAuditLog({
      action: "CREATE",
      entity: "Fund",
      entityId: fund.id,
      userId: manager,
      metadata: { name, category: type, initialBalance },
    });

    return fund;
  }

  /**
   * Get real-time balance from transactions
   */
  static async getFundBalance(fundId: string): Promise<{ fundId: string; balance: number; allocated: number; spent: number; remaining: number }> {
    const fund = await getFundOrThrow(fundId);

    const creditResult = await prisma.fundTransaction.aggregate({
      where: { fundId, transactionType: { in: ["CREDIT", "REFUND"] }, status: "COMPLETED" },
      _sum: { amount: true },
    });

    const debitResult = await prisma.fundTransaction.aggregate({
      where: { fundId, transactionType: { in: ["DEBIT"] }, status: "COMPLETED" },
      _sum: { amount: true },
    });

    const totalCredits = creditResult._sum.amount || 0;
    const totalDebits = debitResult._sum.amount || 0;
    const balance = totalCredits - totalDebits;

    return {
      fundId,
      balance,
      allocated: fund.allocatedAmount,
      spent: totalDebits,
      remaining: balance,
    };
  }

  /**
   * Allocate funds to a department or project
   */
  static async allocateFunds(
    fundId: string,
    departmentOrProjectId: string,
    amount: number,
    purpose: string
  ): Promise<any> {
    const fund = await getFundOrThrow(fundId);
    if (frozenFunds.has(fundId)) throw new Error("Fund is frozen — cannot allocate");
    if (!fund.isActive) throw new Error("Fund is not active");
    if (fund.remainingAmount < amount) throw new Error("Insufficient fund balance for allocation");

    const allocation = await prisma.fundAllocation.create({
      data: {
        fundId,
        allocatedTo: departmentOrProjectId,
        allocationType: departmentOrProjectId.startsWith("proj") ? "PROJECT" : "DEPARTMENT",
        amount,
        purpose,
        approvedBy: fund.managerId,
        startDate: new Date(),
        isActive: true,
      },
    });

    await prisma.fund.update({
      where: { id: fundId },
      data: {
        allocatedAmount: { increment: amount },
        remainingAmount: { decrement: amount },
      },
    });

    await createAuditLog({
      action: "CREATE",
      entity: "FundAllocation",
      entityId: allocation.id,
      userId: fund.managerId,
      metadata: { fundId, allocatedTo: departmentOrProjectId, amount, purpose },
    });

    return allocation;
  }

  /**
   * Debit fund — create debit transaction
   */
  static async debitFund(
    fundId: string,
    amount: number,
    reference: string,
    category?: string
  ): Promise<any> {
    const fund = await getFundOrThrow(fundId);
    if (frozenFunds.has(fundId)) throw new Error("Fund is frozen — cannot debit");
    if (!fund.isActive) throw new Error("Fund is not active");
    if (fund.remainingAmount < amount) throw new Error("Insufficient fund balance");

    // Check spending limits
    await this.checkSpendingLimit(fundId, amount);

    const balanceBefore = fund.remainingAmount;
    const balanceAfter = balanceBefore - amount;

    const transaction = await prisma.fundTransaction.create({
      data: {
        fundId,
        transactionType: "DEBIT",
        amount,
        description: reference,
        referenceType: category || "General",
        status: "COMPLETED",
        processedAt: new Date(),
        processedBy: "system",
        balanceBefore,
        balanceAfter,
      },
    });

    await prisma.fund.update({
      where: { id: fundId },
      data: {
        spentAmount: { increment: amount },
        remainingAmount: { decrement: amount },
      },
    });

    await createAuditLog({
      action: "UPDATE",
      entity: "FundTransaction",
      entityId: transaction.id,
      userId: "system",
      metadata: { fundId, amount, reference },
    });

    return transaction;
  }

  /**
   * Credit fund — create credit transaction
   */
  static async creditFund(
    fundId: string,
    amount: number,
    reference: string,
    category?: string
  ): Promise<any> {
    const fund = await getFundOrThrow(fundId);
    if (frozenFunds.has(fundId)) throw new Error("Fund is frozen — cannot credit");
    if (!fund.isActive) throw new Error("Fund is not active");

    const balanceBefore = fund.remainingAmount;
    const balanceAfter = balanceBefore + amount;

    const transaction = await prisma.fundTransaction.create({
      data: {
        fundId,
        transactionType: "CREDIT",
        amount,
        description: reference,
        referenceType: category || "General",
        status: "COMPLETED",
        processedAt: new Date(),
        processedBy: "system",
        balanceBefore,
        balanceAfter,
      },
    });

    await prisma.fund.update({
      where: { id: fundId },
      data: {
        totalBudget: { increment: amount },
        remainingAmount: { increment: amount },
      },
    });

    await createAuditLog({
      action: "UPDATE",
      entity: "FundTransaction",
      entityId: transaction.id,
      userId: "system",
      metadata: { fundId, amount, reference },
    });

    return transaction;
  }

  /**
   * Transfer between funds
   */
  static async transferBetweenFunds(
    fromFundId: string,
    toFundId: string,
    amount: number,
    reason: string
  ): Promise<{ debitTxn: any; creditTxn: any }> {
    const fromFund = await getFundOrThrow(fromFundId);
    const toFund = await getFundOrThrow(toFundId);

    if (frozenFunds.has(fromFundId)) throw new Error("Source fund is frozen");
    if (frozenFunds.has(toFundId)) throw new Error("Destination fund is frozen");
    if (!fromFund.isActive) throw new Error("Source fund is not active");
    if (!toFund.isActive) throw new Error("Destination fund is not active");
    if (fromFund.remainingAmount < amount) throw new Error("Insufficient balance in source fund");

    // Debit source
    const debitTxn = await prisma.fundTransaction.create({
      data: {
        fundId: fromFundId,
        transactionType: "TRANSFER",
        amount,
        description: `Transfer to ${toFund.name}: ${reason}`,
        referenceType: "FundTransfer",
        referenceId: toFundId,
        status: "COMPLETED",
        processedAt: new Date(),
        processedBy: "system",
        balanceBefore: fromFund.remainingAmount,
        balanceAfter: fromFund.remainingAmount - amount,
      },
    });

    // Credit destination
    const creditTxn = await prisma.fundTransaction.create({
      data: {
        fundId: toFundId,
        transactionType: "TRANSFER",
        amount,
        description: `Transfer from ${fromFund.name}: ${reason}`,
        referenceType: "FundTransfer",
        referenceId: fromFundId,
        status: "COMPLETED",
        processedAt: new Date(),
        processedBy: "system",
        balanceBefore: toFund.remainingAmount,
        balanceAfter: toFund.remainingAmount + amount,
      },
    });

    // Update balances
    await prisma.fund.update({
      where: { id: fromFundId },
      data: { spentAmount: { increment: amount }, remainingAmount: { decrement: amount } },
    });
    await prisma.fund.update({
      where: { id: toFundId },
      data: { totalBudget: { increment: amount }, remainingAmount: { increment: amount } },
    });

    await createAuditLog({
      action: "UPDATE",
      entity: "Fund",
      entityId: fromFundId,
      userId: "system",
      metadata: { fromFundId, toFundId, amount, reason },
    });

    return { debitTxn, creditTxn };
  }

  /**
   * Get fund statement — transaction history for a date range
   */
  static async getFundStatement(
    fundId: string,
    startDate: string,
    endDate: string
  ): Promise<FundStatement> {
    const fund = await getFundOrThrow(fundId);
    const start = new Date(startDate);
    const end = new Date(endDate);

    const transactions = await prisma.fundTransaction.findMany({
      where: {
        fundId,
        createdAt: { gte: start, lte: end },
      },
      orderBy: { createdAt: "asc" },
    });

    const creditResult = await prisma.fundTransaction.aggregate({
      where: { fundId, transactionType: { in: ["CREDIT", "REFUND"] }, createdAt: { gte: start, lte: end }, status: "COMPLETED" },
      _sum: { amount: true },
    });
    const debitResult = await prisma.fundTransaction.aggregate({
      where: { fundId, transactionType: "DEBIT", createdAt: { gte: start, lte: end }, status: "COMPLETED" },
      _sum: { amount: true },
    });

    const totalCredits = creditResult._sum.amount || 0;
    const totalDebits = debitResult._sum.amount || 0;

    // Compute opening balance from transactions before start date
    const priorCredits = await prisma.fundTransaction.aggregate({
      where: { fundId, transactionType: { in: ["CREDIT", "REFUND"] }, createdAt: { lt: start }, status: "COMPLETED" },
      _sum: { amount: true },
    });
    const priorDebits = await prisma.fundTransaction.aggregate({
      where: { fundId, transactionType: "DEBIT", createdAt: { lt: start }, status: "COMPLETED" },
      _sum: { amount: true },
    });

    const openingBalance = (priorCredits._sum.amount || 0) - (priorDebits._sum.amount || 0);
    const closingBalance = openingBalance + totalCredits - totalDebits;

    return {
      fundId,
      fundName: fund.name,
      startDate,
      endDate,
      openingBalance,
      closingBalance,
      totalCredits,
      totalDebits,
      transactions,
    };
  }

  /**
   * Reconcile fund — recalculate balance from all transactions
   */
  static async reconcileFund(fundId: string): Promise<{ balance: number; discrepancy: number }> {
    const fund = await getFundOrThrow(fundId);

    const creditResult = await prisma.fundTransaction.aggregate({
      where: { fundId, transactionType: { in: ["CREDIT", "REFUND"] }, status: "COMPLETED" },
      _sum: { amount: true },
    });
    const debitResult = await prisma.fundTransaction.aggregate({
      where: { fundId, transactionType: { in: ["DEBIT"] }, status: "COMPLETED" },
      _sum: { amount: true },
    });
    const transferOutResult = await prisma.fundTransaction.aggregate({
      where: { fundId, transactionType: "TRANSFER", referenceId: { not: fundId }, status: "COMPLETED" },
      _sum: { amount: true },
    });

    const totalCredits = creditResult._sum.amount || 0;
    const totalDebits = debitResult._sum.amount || 0;
    const totalTransferOut = transferOutResult._sum.amount || 0;

    const calculatedBalance = totalCredits - totalDebits;
    const discrepancy = calculatedBalance - fund.remainingAmount;

    // Update fund with reconciled values
    await prisma.fund.update({
      where: { id: fundId },
      data: {
        remainingAmount: calculatedBalance,
        spentAmount: totalDebits + totalTransferOut,
      },
    });

    await createAuditLog({
      action: "UPDATE",
      entity: "Fund",
      entityId: fundId,
      userId: "system",
      metadata: { previousBalance: fund.remainingAmount, newBalance: calculatedBalance, discrepancy },
    });

    return { balance: calculatedBalance, discrepancy };
  }

  /**
   * Close fiscal period — generate month-end summary
   */
  static async closeFiscalPeriod(
    fundId: string,
    year: number,
    month: number
  ): Promise<FiscalPeriodSummary> {
    const fund = await getFundOrThrow(fundId);

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const transactions = await prisma.fundTransaction.findMany({
      where: { fundId, createdAt: { gte: start, lte: end }, status: "COMPLETED" },
    });

    let totalCredits = 0;
    let totalDebits = 0;
    for (const txn of transactions) {
      if (txn.transactionType === "CREDIT" || txn.transactionType === "REFUND") {
        totalCredits += txn.amount;
      } else if (txn.transactionType === "DEBIT") {
        totalDebits += txn.amount;
      }
    }

    // Opening balance: sum of all transactions before this period
    const priorCredits = await prisma.fundTransaction.aggregate({
      where: { fundId, transactionType: { in: ["CREDIT", "REFUND"] }, createdAt: { lt: start }, status: "COMPLETED" },
      _sum: { amount: true },
    });
    const priorDebits = await prisma.fundTransaction.aggregate({
      where: { fundId, transactionType: "DEBIT", createdAt: { lt: start }, status: "COMPLETED" },
      _sum: { amount: true },
    });

    const openingBalance = (priorCredits._sum.amount || 0) - (priorDebits._sum.amount || 0);
    const closingBalance = openingBalance + totalCredits - totalDebits;

    await createAuditLog({
      action: "UPDATE",
      entity: "Fund",
      entityId: fundId,
      userId: "system",
      metadata: { year, month, openingBalance, closingBalance, totalCredits, totalDebits },
    });

    return {
      fundId,
      year,
      month,
      openingBalance,
      closingBalance,
      totalCredits,
      totalDebits,
      transactionCount: transactions.length,
    };
  }

  /**
   * Generate budget vs actual variance report
   */
  static async generateBudgetVsActualReport(
    fundId: string,
    period: string
  ): Promise<BudgetVsActualReport> {
    const fund = await getFundOrThrow(fundId);

    const balance = await this.getFundBalance(fundId);
    const utilizationPercentage = fund.totalBudget > 0
      ? Number(((balance.spent / fund.totalBudget) * 100).toFixed(2))
      : 0;
    const variance = fund.totalBudget - balance.spent;
    const variancePercentage = fund.totalBudget > 0
      ? Number(((variance / fund.totalBudget) * 100).toFixed(2))
      : 0;

    // Category breakdown from transactions
    const txnsByRef = await prisma.fundTransaction.groupBy({
      by: ["referenceType"],
      where: { fundId, transactionType: "DEBIT", status: "COMPLETED" },
      _sum: { amount: true },
    });

    const byCategory = txnsByRef.map((g) => ({
      category: g.referenceType || "Uncategorized",
      budget: 0, // Would need budget allocation per category
      actual: g._sum.amount || 0,
      variance: -(g._sum.amount || 0),
    }));

    return {
      fundId,
      fundName: fund.name,
      period,
      budget: fund.totalBudget,
      allocated: fund.allocatedAmount,
      spent: balance.spent,
      remaining: balance.remaining,
      utilizationPercentage,
      variance,
      variancePercentage,
      byCategory,
    };
  }

  /**
   * Set spending limits for a fund
   */
  static async setSpendingLimit(
    fundId: string,
    dailyLimit: number,
    monthlyLimit: number
  ): Promise<SpendingLimits> {
    await getFundOrThrow(fundId);
    spendingLimits.set(fundId, { dailyLimit, monthlyLimit });

    await createAuditLog({
      action: "UPDATE",
      entity: "Fund",
      entityId: fundId,
      userId: "system",
      metadata: { dailyLimit, monthlyLimit },
    });

    return { fundId, dailyLimit, monthlyLimit };
  }

  /**
   * Check if a transaction would exceed spending limits
   */
  static async checkSpendingLimit(
    fundId: string,
    amount: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    const limits = spendingLimits.get(fundId);
    if (!limits) return { allowed: true };

    // Daily spending check
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const dailySpent = await prisma.fundTransaction.aggregate({
      where: {
        fundId,
        transactionType: "DEBIT",
        status: "COMPLETED",
        createdAt: { gte: todayStart, lte: todayEnd },
      },
      _sum: { amount: true },
    });

    const currentDailySpend = (dailySpent._sum.amount || 0) + amount;
    if (currentDailySpend > limits.dailyLimit) {
      throw new Error(`Daily spending limit exceeded. Limit: ₹${limits.dailyLimit.toLocaleString("en-IN")}, Current + requested: ₹${currentDailySpend.toLocaleString("en-IN")}`);
    }

    // Monthly spending check
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);

    const monthlySpent = await prisma.fundTransaction.aggregate({
      where: {
        fundId,
        transactionType: "DEBIT",
        status: "COMPLETED",
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
    });

    const currentMonthlySpend = (monthlySpent._sum.amount || 0) + amount;
    if (currentMonthlySpend > limits.monthlyLimit) {
      throw new Error(`Monthly spending limit exceeded. Limit: ₹${limits.monthlyLimit.toLocaleString("en-IN")}, Current + requested: ₹${currentMonthlySpend.toLocaleString("en-IN")}`);
    }

    return { allowed: true };
  }

  /**
   * Get fund dashboard — all funds summary
   */
  static async getFundDashboard(): Promise<FundDashboard> {
    const funds = await prisma.fund.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { transactions: true, allocations: true } } },
    });

    const activeFunds = funds.filter((f) => f.isActive && !frozenFunds.has(f.id));
    const frozenCount = funds.filter((f) => frozenFunds.has(f.id)).length;

    const totalBudget = funds.reduce((sum, f) => sum + f.totalBudget, 0);
    const totalAllocated = funds.reduce((sum, f) => sum + f.allocatedAmount, 0);
    const totalSpent = funds.reduce((sum, f) => sum + f.spentAmount, 0);
    const totalRemaining = funds.reduce((sum, f) => sum + f.remainingAmount, 0);

    const recentTransactions = await prisma.fundTransaction.findMany({
      take: 15,
      orderBy: { createdAt: "desc" },
      include: { fund: { select: { name: true, code: true } } },
    });

    return {
      totalFunds: funds.length,
      activeFunds: activeFunds.length,
      frozenFunds: frozenCount,
      totalBudget,
      totalAllocated,
      totalSpent,
      totalRemaining,
      utilizationPercentage: totalBudget > 0 ? Number(((totalSpent / totalBudget) * 100).toFixed(2)) : 0,
      funds: funds.map((f) => ({
        ...f,
        isFrozen: frozenFunds.has(f.id),
      })),
      recentTransactions,
    };
  }

  /**
   * Get department spending for a period
   */
  static async getDepartmentSpending(
    department: string,
    period: string
  ): Promise<{ department: string; period: string; totalSpent: number; transactions: any[]; byCategory: any[] }> {
    const departmentFunds = await prisma.fund.findMany({
      where: { department, isActive: true },
      select: { id: true },
    });

    const fundIds = departmentFunds.map((f) => f.id);
    if (fundIds.length === 0) return { department, period, totalSpent: 0, transactions: [], byCategory: [] };

    // Parse period (e.g., "2026-03" or "2026-Q1")
    let start: Date;
    let end: Date;
    if (period.includes("Q")) {
      const [yearStr, qStr] = period.split("-");
      const quarter = parseInt(qStr.replace("Q", ""));
      const year = parseInt(yearStr);
      start = new Date(year, (quarter - 1) * 3, 1);
      end = new Date(year, quarter * 3, 0, 23, 59, 59, 999);
    } else {
      const [yearStr, monthStr] = period.split("-");
      start = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
      end = new Date(parseInt(yearStr), parseInt(monthStr), 0, 23, 59, 59, 999);
    }

    const transactions = await prisma.fundTransaction.findMany({
      where: { fundId: { in: fundIds }, transactionType: "DEBIT", createdAt: { gte: start, lte: end }, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    });

    const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);

    const catMap = new Map<string, number>();
    for (const t of transactions) {
      const cat = t.referenceType || "Uncategorized";
      catMap.set(cat, (catMap.get(cat) || 0) + t.amount);
    }

    return {
      department,
      period,
      totalSpent,
      transactions,
      byCategory: Array.from(catMap.entries()).map(([category, amount]) => ({ category, amount })),
    };
  }

  /**
   * Get project spending — project budget consumption
   */
  static async getProjectSpending(projectId: string): Promise<{ projectId: string; totalBudget: number; totalSpent: number; remaining: number; transactions: any[] }> {
    const fund = await prisma.fund.findFirst({
      where: { projectId, isActive: true },
    });

    if (!fund) return { projectId, totalBudget: 0, totalSpent: 0, remaining: 0, transactions: [] };

    const transactions = await prisma.fundTransaction.findMany({
      where: { fundId: fund.id, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    });

    return {
      projectId,
      totalBudget: fund.totalBudget,
      totalSpent: fund.spentAmount,
      remaining: fund.remainingAmount,
      transactions,
    };
  }

  /**
   * Freeze a fund — prevent any transactions
   */
  static async freezeFund(fundId: string, reason: string): Promise<any> {
    const fund = await getFundOrThrow(fundId);
    frozenFunds.add(fundId);

    await createAuditLog({
      action: "UPDATE",
      entity: "Fund",
      entityId: fundId,
      userId: "system",
      metadata: { reason, balance: fund.remainingAmount },
    });

    return { fundId, name: fund.name, status: "FROZEN", reason };
  }

  /**
   * Unfreeze a fund
   */
  static async unfreezeFund(fundId: string): Promise<any> {
    const fund = await getFundOrThrow(fundId);
    frozenFunds.delete(fundId);

    await createAuditLog({
      action: "UPDATE",
      entity: "Fund",
      entityId: fundId,
      userId: "system",
      metadata: { balance: fund.remainingAmount },
    });

    return { fundId, name: fund.name, status: "ACTIVE" };
  }

  /**
   * Get audit trail for a fund
   */
  static async getAuditTrail(fundId: string): Promise<any[]> {
    await getFundOrThrow(fundId);

    const transactions = await prisma.fundTransaction.findMany({
      where: { fundId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const allocations = await prisma.fundAllocation.findMany({
      where: { fundId },
      orderBy: { createdAt: "desc" },
    });

    // Combine and sort chronologically
    const trail = [
      ...transactions.map((t) => ({
        type: "TRANSACTION",
        action: t.transactionType,
        amount: t.amount,
        description: t.description,
        status: t.status,
        processedBy: t.processedBy,
        date: t.createdAt,
        balanceBefore: t.balanceBefore,
        balanceAfter: t.balanceAfter,
      })),
      ...allocations.map((a) => ({
        type: "ALLOCATION",
        action: "ALLOCATED",
        amount: a.amount,
        description: `Allocated to ${a.allocatedTo}: ${a.purpose}`,
        status: a.isActive ? "ACTIVE" : "INACTIVE",
        processedBy: a.approvedBy,
        date: a.createdAt,
        balanceBefore: null,
        balanceAfter: null,
      })),
    ];

    trail.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return trail;
  }

  /**
   * Generate fund report — balance sheet or P&L style
   */
  static async generateFundReport(
    fundId: string,
    reportType: "BALANCE_SHEET" | "INCOME_EXPENSE" | "SUMMARY"
  ): Promise<FundReport> {
    const fund = await getFundOrThrow(fundId);
    const balance = await this.getFundBalance(fundId);

    let data: any;

    switch (reportType) {
      case "BALANCE_SHEET": {
        const allocations = await prisma.fundAllocation.findMany({
          where: { fundId, isActive: true },
        });
        data = {
          assets: {
            totalBudget: fund.totalBudget,
            remainingBalance: balance.remaining,
          },
          liabilities: {
            allocatedAmount: fund.allocatedAmount,
            activeAllocations: allocations.length,
            allocations: allocations.map((a) => ({
              allocatedTo: a.allocatedTo,
              amount: a.amount,
              purpose: a.purpose,
            })),
          },
          equity: {
            netPosition: balance.remaining - fund.allocatedAmount,
          },
        };
        break;
      }

      case "INCOME_EXPENSE": {
        const credits = await prisma.fundTransaction.findMany({
          where: { fundId, transactionType: { in: ["CREDIT", "REFUND"] }, status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
          take: 50,
        });
        const debits = await prisma.fundTransaction.findMany({
          where: { fundId, transactionType: "DEBIT", status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
          take: 50,
        });
        data = {
          income: {
            total: credits.reduce((sum, c) => sum + c.amount, 0),
            entries: credits,
          },
          expenses: {
            total: debits.reduce((sum, d) => sum + d.amount, 0),
            entries: debits,
          },
          netIncome: credits.reduce((s, c) => s + c.amount, 0) - debits.reduce((s, d) => s + d.amount, 0),
        };
        break;
      }

      case "SUMMARY":
      default: {
        data = {
          fundName: fund.name,
          category: fund.category,
          fiscalYear: fund.fiscalYear,
          totalBudget: fund.totalBudget,
          allocated: fund.allocatedAmount,
          spent: balance.spent,
          remaining: balance.remaining,
          utilization: fund.totalBudget > 0 ? `${((balance.spent / fund.totalBudget) * 100).toFixed(1)}%` : "0%",
          manager: fund.managerId,
          department: fund.department,
          isActive: fund.isActive,
          isFrozen: frozenFunds.has(fundId),
        };
        break;
      }
    }

    return {
      fundId,
      fundName: fund.name,
      reportType,
      generatedAt: new Date().toISOString(),
      data,
    };
  }

  /**
   * Auto-allocate monthly budgets based on last month's pattern
   */
  static async autoAllocateMonthlyBudgets(): Promise<{ allocationsCreated: number; totalAllocated: number }> {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Get last month's allocations grouped by fund
    const lastMonthAllocations = await prisma.fundAllocation.findMany({
      where: {
        createdAt: { gte: lastMonth, lte: lastMonthEnd },
        isActive: true,
      },
    });

    let allocationsCreated = 0;
    let totalAllocated = 0;

    for (const alloc of lastMonthAllocations) {
      const fund = await prisma.fund.findUnique({ where: { id: alloc.fundId } });
      if (!fund || !fund.isActive || frozenFunds.has(fund.id)) continue;
      if (fund.remainingAmount < alloc.amount) continue;

      try {
        await this.allocateFunds(alloc.fundId, alloc.allocatedTo, alloc.amount, `Auto-allocated (based on ${lastMonth.toLocaleString("en-IN", { month: "long", year: "numeric" })} pattern): ${alloc.purpose}`);
        allocationsCreated++;
        totalAllocated += alloc.amount;
      } catch {
        // Skip if allocation fails (e.g., insufficient balance)
      }
    }

    await createAuditLog({
      action: "CREATE",
      entity: "Fund",
      entityId: "batch",
      userId: "system",
      metadata: { allocationsCreated, totalAllocated, basedOnMonth: lastMonth.toISOString() },
    });

    return { allocationsCreated, totalAllocated };
  }
}
