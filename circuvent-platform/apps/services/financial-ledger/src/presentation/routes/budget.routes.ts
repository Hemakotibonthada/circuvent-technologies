// ══════════════════════════════════════════════════════════════════════════════
// Financial Ledger — Budget Routes
// Department-level budget tracking and variance reporting.
// ══════════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

/** GET / — List budgets */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { fiscalYear, department } = req.query;
    const where: any = {};
    if (fiscalYear) where.fiscalYear = fiscalYear;
    if (department) where.department = department;

    const budgets = await prisma.budget.findMany({ where, orderBy: { accountCode: "asc" } });

    const enriched = budgets.map(b => ({
      ...b,
      amount: Number(b.amount),
      spent: Number(b.spent),
      remaining: Number(b.amount) - Number(b.spent),
      utilization: Number(b.amount) > 0 ? Number(((Number(b.spent) / Number(b.amount)) * 100).toFixed(1)) : 0,
      isOverBudget: Number(b.spent) > Number(b.amount),
    }));

    res.json(successResponse(enriched));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** POST / — Create budget allocation */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { accountCode, fiscalYear, department, amount, notes } = req.body;
    if (!accountCode || !fiscalYear || !amount) {
      res.status(400).json(errorResponse("accountCode, fiscalYear, amount required"));
      return;
    }

    const budget = await prisma.budget.create({
      data: { accountCode, fiscalYear, department: department || null, amount, notes: notes || null },
    });
    res.status(201).json(successResponse(budget, "Budget allocated"));
  } catch (error: any) {
    if ((error as any).code === "P2002") {
      res.status(409).json(errorResponse("Budget already exists for this account/year/department"));
      return;
    }
    res.status(500).json(errorResponse(error.message));
  }
});

/** GET /variance — Budget vs actual variance report */
router.get("/variance", async (req: Request, res: Response) => {
  try {
    const { fiscalYear } = req.query;
    const fy = (fiscalYear as string) || "2025-26";

    const budgets = await prisma.budget.findMany({ where: { fiscalYear: fy } });
    const variance = budgets.map(b => ({
      accountCode: b.accountCode,
      department: b.department,
      budgeted: Number(b.amount),
      actual: Number(b.spent),
      variance: Number(b.amount) - Number(b.spent),
      variancePercent: Number(b.amount) > 0
        ? Number((((Number(b.amount) - Number(b.spent)) / Number(b.amount)) * 100).toFixed(1))
        : 0,
      status: Number(b.spent) > Number(b.amount) ? "OVER_BUDGET" :
              Number(b.spent) > Number(b.amount) * 0.9 ? "WARNING" : "ON_TRACK",
    }));

    const totalBudgeted = variance.reduce((s, v) => s + v.budgeted, 0);
    const totalActual = variance.reduce((s, v) => s + v.actual, 0);

    res.json(successResponse({
      fiscalYear: fy,
      items: variance,
      totalBudgeted,
      totalActual,
      totalVariance: totalBudgeted - totalActual,
      overBudgetCount: variance.filter(v => v.status === "OVER_BUDGET").length,
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

export { router as budgetRoutes };
