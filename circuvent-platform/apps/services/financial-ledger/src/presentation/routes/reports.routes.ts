// ══════════════════════════════════════════════════════════════════════════════
// Financial Ledger — Financial Reports Routes
// Trial Balance, P&L, Balance Sheet, Cash Flow statement
// ══════════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

/** GET /trial-balance — Generate trial balance */
router.get("/trial-balance", async (req: Request, res: Response) => {
  try {
    const accounts = await prisma.ledgerAccount.findMany({
      where: { isPostable: true, isActive: true },
      orderBy: { code: "asc" },
    });

    const entries = accounts.map(acc => {
      const bal = Number(acc.balance);
      const isDebitNormal = acc.type === "ASSET" || acc.type === "EXPENSE";
      return {
        code: acc.code,
        name: acc.name,
        type: acc.type,
        debit: (isDebitNormal && bal >= 0) || (!isDebitNormal && bal < 0) ? Math.abs(bal) : 0,
        credit: (!isDebitNormal && bal >= 0) || (isDebitNormal && bal < 0) ? Math.abs(bal) : 0,
      };
    });

    const totalDebits = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredits = entries.reduce((s, e) => s + e.credit, 0);

    res.json(successResponse({
      asOf: new Date().toISOString(),
      entries,
      totalDebits: Number(totalDebits.toFixed(2)),
      totalCredits: Number(totalCredits.toFixed(2)),
      isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
      difference: Number(Math.abs(totalDebits - totalCredits).toFixed(2)),
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** GET /profit-loss — Profit & Loss statement */
router.get("/profit-loss", async (req: Request, res: Response) => {
  try {
    const { period } = req.query;

    const revenueAccounts = await prisma.ledgerAccount.findMany({
      where: { type: "REVENUE", isPostable: true, isActive: true },
      orderBy: { code: "asc" },
    });
    const expenseAccounts = await prisma.ledgerAccount.findMany({
      where: { type: "EXPENSE", isPostable: true, isActive: true },
      orderBy: { code: "asc" },
    });

    const revenue = revenueAccounts.map(a => ({ code: a.code, name: a.name, amount: Math.abs(Number(a.balance)) }));
    const expenses = expenseAccounts.map(a => ({ code: a.code, name: a.name, amount: Math.abs(Number(a.balance)) }));

    const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const netProfit = totalRevenue - totalExpenses;

    res.json(successResponse({
      period: period || "Current",
      revenue,
      expenses,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalExpenses: Number(totalExpenses.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      netProfitMargin: totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(2)) : 0,
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** GET /balance-sheet — Balance sheet */
router.get("/balance-sheet", async (req: Request, res: Response) => {
  try {
    const accounts = await prisma.ledgerAccount.findMany({
      where: { isPostable: true, isActive: true, type: { in: ["ASSET", "LIABILITY", "EQUITY"] } },
      orderBy: { code: "asc" },
    });

    const assets = accounts.filter(a => a.type === "ASSET").map(a => ({ code: a.code, name: a.name, amount: Number(a.balance) }));
    const liabilities = accounts.filter(a => a.type === "LIABILITY").map(a => ({ code: a.code, name: a.name, amount: Math.abs(Number(a.balance)) }));
    const equity = accounts.filter(a => a.type === "EQUITY").map(a => ({ code: a.code, name: a.name, amount: Math.abs(Number(a.balance)) }));

    const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + l.amount, 0);
    const totalEquity = equity.reduce((s, e) => s + e.amount, 0);

    // Add retained earnings (net income) to equity
    const revenueTotal = (await prisma.ledgerAccount.aggregate({
      where: { type: "REVENUE", isPostable: true },
      _sum: { balance: true },
    }))._sum.balance || 0;
    const expenseTotal = (await prisma.ledgerAccount.aggregate({
      where: { type: "EXPENSE", isPostable: true },
      _sum: { balance: true },
    }))._sum.balance || 0;
    const retainedEarnings = Math.abs(Number(revenueTotal)) - Math.abs(Number(expenseTotal));

    res.json(successResponse({
      asOf: new Date().toISOString(),
      assets,
      liabilities,
      equity: [...equity, { code: "RE", name: "Retained Earnings (P&L)", amount: Number(retainedEarnings.toFixed(2)) }],
      totalAssets: Number(totalAssets.toFixed(2)),
      totalLiabilities: Number(totalLiabilities.toFixed(2)),
      totalEquity: Number((totalEquity + retainedEarnings).toFixed(2)),
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity + retainedEarnings)) < 0.01,
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** GET /dashboard — Financial overview for dashboard widget */
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const [accountCount, journalCount, postedCount, recentJournals] = await Promise.all([
      prisma.ledgerAccount.count({ where: { isActive: true } }),
      prisma.journalEntry.count(),
      prisma.journalEntry.count({ where: { status: "POSTED" } }),
      prisma.journalEntry.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { entryNumber: true, description: true, source: true, status: true, date: true },
      }),
    ]);

    const typeTotals = await prisma.ledgerAccount.groupBy({
      by: ["type"],
      _sum: { balance: true },
      where: { isActive: true, isPostable: true },
    });

    const totals: Record<string, number> = {};
    for (const t of typeTotals) {
      totals[t.type] = Math.abs(Number(t._sum.balance || 0));
    }

    res.json(successResponse({
      accountCount,
      journalCount,
      postedCount,
      totalAssets: totals.ASSET || 0,
      totalLiabilities: totals.LIABILITY || 0,
      totalRevenue: totals.REVENUE || 0,
      totalExpenses: totals.EXPENSE || 0,
      netProfit: (totals.REVENUE || 0) - (totals.EXPENSE || 0),
      recentJournals,
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

export { router as reportRoutes };
