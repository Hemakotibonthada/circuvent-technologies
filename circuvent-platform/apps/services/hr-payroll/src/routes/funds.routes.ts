// ──────────────────────────────────────────────────────────────────────────────
// Funds & Budget Management Routes
// Complete lifecycle: Create Fund → Allocate → Transact → Reconcile → Report
// Company bank accounts, dashboard analytics, role-based access
// ──────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AUTHORIZED_ROLES = ["ADMIN", "SUPER_ADMIN", "CEO", "HR_MANAGER"] as const;
type AuthorizedRole = (typeof AUTHORIZED_ROLES)[number];

/** Resolve employee + user from JWT */
async function resolveEmployee(req: Request) {
  const userId = (req as any).user?.userId;
  if (!userId) return null;
  return prisma.employee.findUnique({
    where: { userId },
    include: { user: { select: { id: true, firstName: true, lastName: true, role: true, department: true } } },
  });
}

/** Check if user role is authorized for funds module */
function isAuthorizedRole(role: string): boolean {
  return (AUTHORIZED_ROLES as readonly string[]).includes(role);
}

// ─── Role-guard middleware applied to ALL routes ─────────────────────────────
router.use(async (req: Request, res: Response, next) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized — no user context" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || !isAuthorizedRole(user.role)) {
      res.status(403).json({
        success: false,
        error: "Access denied — only ADMIN, SUPER_ADMIN, CEO, and HR_MANAGER roles can access the funds module",
      });
      return;
    }

    next();
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Authorization check failed" });
  }
});

// ─── GET /funds/access-check ─────────────────────────────────────────────────
router.get("/access-check", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, firstName: true, lastName: true },
    });

    res.json({
      success: true,
      data: {
        hasAccess: true,
        role: user?.role,
        userName: user ? `${user.firstName} ${user.lastName}` : null,
        permissions: [
          "VIEW_FUNDS",
          "CREATE_FUNDS",
          "MANAGE_ALLOCATIONS",
          "PROCESS_TRANSACTIONS",
          "VIEW_DASHBOARD",
          "MANAGE_BANK_ACCOUNTS",
          "GENERATE_REPORTS",
        ],
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to check access" });
  }
});

// ─── GET /funds/dashboard ────────────────────────────────────────────────────
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      allFunds,
      recentTransactions,
      monthlyTransactions,
    ] = await Promise.all([
      prisma.fund.findMany({
        where: { isActive: true },
        include: {
          allocations: { where: { isActive: true } },
          _count: { select: { transactions: true } },
        },
      }),
      prisma.fundTransaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { fund: { select: { name: true, code: true } } },
      }),
      prisma.fundTransaction.findMany({
        where: { createdAt: { gte: sixMonthsAgo } },
        select: { amount: true, transactionType: true, createdAt: true },
      }),
    ]);

    // Summary totals
    const totalFundsCount = allFunds.length;
    const totalBudget = allFunds.reduce((s, f) => s + f.totalBudget, 0);
    const totalSpent = allFunds.reduce((s, f) => s + f.spentAmount, 0);
    const totalRemaining = allFunds.reduce((s, f) => s + f.remainingAmount, 0);
    const budgetUtilization = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 10000) / 100 : 0;

    // By category breakdown
    const categoryMap: Record<string, { count: number; budget: number; spent: number; remaining: number }> = {};
    allFunds.forEach((f) => {
      if (!categoryMap[f.category]) {
        categoryMap[f.category] = { count: 0, budget: 0, spent: 0, remaining: 0 };
      }
      categoryMap[f.category].count++;
      categoryMap[f.category].budget += f.totalBudget;
      categoryMap[f.category].spent += f.spentAmount;
      categoryMap[f.category].remaining += f.remainingAmount;
    });

    const byCategory = Object.entries(categoryMap).map(([category, data]) => ({
      category,
      ...data,
      utilization: data.budget > 0 ? Math.round((data.spent / data.budget) * 10000) / 100 : 0,
    }));

    // By department breakdown
    const deptMap: Record<string, { count: number; budget: number; spent: number; remaining: number }> = {};
    allFunds.forEach((f) => {
      const dept = f.department || "Unassigned";
      if (!deptMap[dept]) {
        deptMap[dept] = { count: 0, budget: 0, spent: 0, remaining: 0 };
      }
      deptMap[dept].count++;
      deptMap[dept].budget += f.totalBudget;
      deptMap[dept].spent += f.spentAmount;
      deptMap[dept].remaining += f.remainingAmount;
    });

    const byDepartment = Object.entries(deptMap).map(([department, data]) => ({
      department,
      ...data,
      utilization: data.budget > 0 ? Math.round((data.spent / data.budget) * 10000) / 100 : 0,
    }));

    // Top spending funds
    const topSpendingFunds = [...allFunds]
      .sort((a, b) => b.spentAmount - a.spentAmount)
      .slice(0, 10)
      .map((f) => ({
        id: f.id,
        name: f.name,
        code: f.code,
        category: f.category,
        totalBudget: f.totalBudget,
        spentAmount: f.spentAmount,
        remainingAmount: f.remainingAmount,
        utilization: f.totalBudget > 0 ? Math.round((f.spentAmount / f.totalBudget) * 10000) / 100 : 0,
      }));

    // Over-budget alerts
    const overBudgetAlerts = allFunds
      .filter((f) => f.spentAmount > f.totalBudget)
      .map((f) => ({
        id: f.id,
        name: f.name,
        code: f.code,
        totalBudget: f.totalBudget,
        spentAmount: f.spentAmount,
        overBy: f.spentAmount - f.totalBudget,
        overByPercent: f.totalBudget > 0 ? Math.round(((f.spentAmount - f.totalBudget) / f.totalBudget) * 10000) / 100 : 0,
      }));

    // Monthly spending trend (last 6 months)
    const monthlyTrend: Record<string, { debits: number; credits: number; net: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyTrend[key] = { debits: 0, credits: 0, net: 0 };
    }

    monthlyTransactions.forEach((t) => {
      const d = new Date(t.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (monthlyTrend[key]) {
        if (t.transactionType === "DEBIT") {
          monthlyTrend[key].debits += t.amount;
        } else if (t.transactionType === "CREDIT") {
          monthlyTrend[key].credits += t.amount;
        }
        monthlyTrend[key].net = monthlyTrend[key].credits - monthlyTrend[key].debits;
      }
    });

    const monthlySpendingTrend = Object.entries(monthlyTrend).map(([month, data]) => ({
      month,
      ...data,
    }));

    res.json({
      success: true,
      data: {
        summary: {
          totalFundsCount,
          totalBudget,
          totalSpent,
          totalRemaining,
          budgetUtilization,
        },
        byCategory,
        byDepartment,
        topSpendingFunds,
        recentTransactions: recentTransactions.map((t) => ({
          id: t.id,
          fundName: t.fund.name,
          fundCode: t.fund.code,
          type: t.transactionType,
          amount: t.amount,
          description: t.description,
          status: t.status,
          createdAt: t.createdAt,
        })),
        overBudgetAlerts,
        monthlySpendingTrend,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to load dashboard" });
  }
});

// ─── GET /funds/company-accounts ─────────────────────────────────────────────
router.get("/company-accounts", async (req: Request, res: Response) => {
  try {
    const accounts = await prisma.companyBankAccount.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { bankName: "asc" }],
    });

    res.json({ success: true, data: accounts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch company accounts" });
  }
});

// ─── POST /funds/company-accounts ────────────────────────────────────────────
router.post("/company-accounts", async (req: Request, res: Response) => {
  try {
    const { bankName, accountNumber, ifscCode, branchName, accountType, balance, currency, isDefault } = req.body;

    if (!bankName || !accountNumber || !ifscCode || !branchName) {
      res.status(400).json({ success: false, error: "bankName, accountNumber, ifscCode, and branchName are required" });
      return;
    }

    // If setting as default, unset any existing default
    if (isDefault) {
      await prisma.companyBankAccount.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const account = await prisma.companyBankAccount.create({
      data: {
        bankName,
        accountNumber,
        ifscCode,
        branchName,
        accountType: accountType || "CURRENT",
        balance: balance != null ? parseFloat(balance) : 0,
        currency: currency || "INR",
        isDefault: isDefault || false,
      },
    });

    res.status(201).json({ success: true, data: account, message: "Company bank account created" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to create bank account" });
  }
});

// ─── PUT /funds/company-accounts/:id ─────────────────────────────────────────
router.put("/company-accounts/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.companyBankAccount.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, error: "Bank account not found" });
      return;
    }

    const { bankName, accountNumber, ifscCode, branchName, accountType, balance, currency, isActive } = req.body;

    const updated = await prisma.companyBankAccount.update({
      where: { id: req.params.id },
      data: {
        ...(bankName && { bankName }),
        ...(accountNumber && { accountNumber }),
        ...(ifscCode && { ifscCode }),
        ...(branchName && { branchName }),
        ...(accountType && { accountType }),
        ...(balance != null && { balance: parseFloat(balance) }),
        ...(currency && { currency }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({ success: true, data: updated, message: "Bank account updated" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to update bank account" });
  }
});

// ─── POST /funds/company-accounts/:id/set-default ────────────────────────────
router.post("/company-accounts/:id/set-default", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.companyBankAccount.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, error: "Bank account not found" });
      return;
    }

    if (!existing.isActive) {
      res.status(400).json({ success: false, error: "Cannot set an inactive account as default" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.companyBankAccount.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
      await tx.companyBankAccount.update({
        where: { id: req.params.id },
        data: { isDefault: true },
      });
    });

    const updated = await prisma.companyBankAccount.findUnique({ where: { id: req.params.id } });

    res.json({ success: true, data: updated, message: "Default bank account updated" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to set default account" });
  }
});

// ─── POST /funds/auto-reconcile ──────────────────────────────────────────────
router.post("/auto-reconcile", async (req: Request, res: Response) => {
  try {
    const funds = await prisma.fund.findMany({
      where: { isActive: true },
      include: { transactions: true, allocations: { where: { isActive: true } } },
    });

    const corrections: any[] = [];

    for (const fund of funds) {
      // Sum up all transactions
      let calculatedSpent = 0;
      fund.transactions.forEach((t) => {
        if (t.status !== "COMPLETED") return;
        switch (t.transactionType) {
          case "DEBIT":
            calculatedSpent += t.amount;
            break;
          case "CREDIT":
            calculatedSpent -= t.amount;
            break;
          case "REFUND":
            calculatedSpent -= t.amount;
            break;
          default:
            break;
        }
      });
      calculatedSpent = Math.max(0, calculatedSpent);

      const calculatedAllocated = fund.allocations.reduce((s, a) => s + a.amount, 0);
      const calculatedRemaining = fund.totalBudget - calculatedSpent;

      const needsUpdate =
        Math.abs(fund.spentAmount - calculatedSpent) > 0.01 ||
        Math.abs(fund.allocatedAmount - calculatedAllocated) > 0.01 ||
        Math.abs(fund.remainingAmount - calculatedRemaining) > 0.01;

      if (needsUpdate) {
        await prisma.fund.update({
          where: { id: fund.id },
          data: {
            spentAmount: calculatedSpent,
            allocatedAmount: calculatedAllocated,
            remainingAmount: calculatedRemaining,
          },
        });

        corrections.push({
          fundId: fund.id,
          fundCode: fund.code,
          fundName: fund.name,
          before: {
            spentAmount: fund.spentAmount,
            allocatedAmount: fund.allocatedAmount,
            remainingAmount: fund.remainingAmount,
          },
          after: {
            spentAmount: calculatedSpent,
            allocatedAmount: calculatedAllocated,
            remainingAmount: calculatedRemaining,
          },
        });
      }
    }

    res.json({
      success: true,
      data: {
        totalFundsChecked: funds.length,
        correctionsMade: corrections.length,
        corrections,
      },
      message: corrections.length > 0
        ? `Reconciled ${corrections.length} fund(s) with discrepancies`
        : "All funds are balanced — no corrections needed",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to auto-reconcile" });
  }
});

// ─── POST /funds/generate-report ─────────────────────────────────────────────
router.post("/generate-report", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, fundIds, categories, departments } = req.body;

    if (!startDate || !endDate) {
      res.status(400).json({ success: false, error: "startDate and endDate are required" });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Build fund filter
    const fundWhere: any = { isActive: true };
    if (fundIds && fundIds.length > 0) fundWhere.id = { in: fundIds };
    if (categories && categories.length > 0) fundWhere.category = { in: categories };
    if (departments && departments.length > 0) fundWhere.department = { in: departments };

    const funds = await prisma.fund.findMany({
      where: fundWhere,
      include: {
        transactions: {
          where: { createdAt: { gte: start, lte: end } },
          orderBy: { createdAt: "asc" },
        },
        allocations: { where: { isActive: true } },
      },
    });

    const reportData = funds.map((fund) => {
      const debits = fund.transactions
        .filter((t) => t.transactionType === "DEBIT" && t.status === "COMPLETED")
        .reduce((s, t) => s + t.amount, 0);
      const credits = fund.transactions
        .filter((t) => t.transactionType === "CREDIT" && t.status === "COMPLETED")
        .reduce((s, t) => s + t.amount, 0);
      const refunds = fund.transactions
        .filter((t) => t.transactionType === "REFUND" && t.status === "COMPLETED")
        .reduce((s, t) => s + t.amount, 0);

      return {
        fundId: fund.id,
        fundCode: fund.code,
        fundName: fund.name,
        category: fund.category,
        department: fund.department,
        totalBudget: fund.totalBudget,
        spentAmount: fund.spentAmount,
        remainingAmount: fund.remainingAmount,
        periodDebits: debits,
        periodCredits: credits,
        periodRefunds: refunds,
        periodNet: credits - debits + refunds,
        transactionCount: fund.transactions.length,
        activeAllocations: fund.allocations.length,
        utilization: fund.totalBudget > 0 ? Math.round((fund.spentAmount / fund.totalBudget) * 10000) / 100 : 0,
      };
    });

    const totals = {
      totalBudget: reportData.reduce((s, r) => s + r.totalBudget, 0),
      totalSpent: reportData.reduce((s, r) => s + r.spentAmount, 0),
      totalRemaining: reportData.reduce((s, r) => s + r.remainingAmount, 0),
      periodDebits: reportData.reduce((s, r) => s + r.periodDebits, 0),
      periodCredits: reportData.reduce((s, r) => s + r.periodCredits, 0),
      periodRefunds: reportData.reduce((s, r) => s + r.periodRefunds, 0),
      periodNet: reportData.reduce((s, r) => s + r.periodNet, 0),
      totalTransactions: reportData.reduce((s, r) => s + r.transactionCount, 0),
    };

    res.json({
      success: true,
      data: {
        reportPeriod: { startDate: start, endDate: end },
        generatedAt: new Date(),
        fundsCount: reportData.length,
        totals,
        funds: reportData,
      },
      message: "Financial report generated",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to generate report" });
  }
});

// ─── GET /funds ──────────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const where: any = {};
    if (req.query.category) where.category = req.query.category;
    if (req.query.department) where.department = req.query.department;
    if (req.query.fiscalYear) where.fiscalYear = req.query.fiscalYear;
    if (req.query.isActive !== undefined) where.isActive = req.query.isActive === "true";
    if (req.query.search) {
      where.OR = [
        { name: { contains: req.query.search as string, mode: "insensitive" } },
        { code: { contains: req.query.search as string, mode: "insensitive" } },
        { description: { contains: req.query.search as string, mode: "insensitive" } },
      ];
    }

    const funds = await prisma.fund.findMany({
      where,
      include: {
        _count: { select: { transactions: true, allocations: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Attach utilization percentage
    const enriched = funds.map((f) => ({
      ...f,
      utilization: f.totalBudget > 0 ? Math.round((f.spentAmount / f.totalBudget) * 10000) / 100 : 0,
      isOverBudget: f.spentAmount > f.totalBudget,
    }));

    res.json({ success: true, data: enriched, count: enriched.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch funds" });
  }
});

// ─── GET /funds/:id ──────────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const fund = await prisma.fund.findUnique({
      where: { id: req.params.id },
      include: {
        transactions: { orderBy: { createdAt: "desc" }, take: 50 },
        allocations: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!fund) {
      res.status(404).json({ success: false, error: "Fund not found" });
      return;
    }

    // Resolve manager name
    const manager = await prisma.employee.findUnique({
      where: { id: fund.managerId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });

    res.json({
      success: true,
      data: {
        ...fund,
        utilization: fund.totalBudget > 0 ? Math.round((fund.spentAmount / fund.totalBudget) * 10000) / 100 : 0,
        isOverBudget: fund.spentAmount > fund.totalBudget,
        manager: manager
          ? {
              id: manager.id,
              employeeCode: manager.employeeCode,
              name: `${manager.user.firstName} ${manager.user.lastName}`,
              email: manager.user.email,
            }
          : null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch fund" });
  }
});

// ─── POST /funds ─────────────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      code,
      name,
      category,
      description,
      totalBudget,
      managerId,
      currency,
      fiscalYear,
      department,
      projectId,
      startDate,
      endDate,
    } = req.body;

    if (!code || !name || !category || totalBudget == null || !managerId) {
      res.status(400).json({ success: false, error: "code, name, category, totalBudget, and managerId are required" });
      return;
    }

    // Check for duplicate code
    const existing = await prisma.fund.findUnique({ where: { code } });
    if (existing) {
      res.status(409).json({ success: false, error: `Fund with code "${code}" already exists` });
      return;
    }

    // Verify manager exists
    const manager = await prisma.employee.findUnique({ where: { id: managerId } });
    if (!manager) {
      res.status(404).json({ success: false, error: "Manager employee not found" });
      return;
    }

    const budget = parseFloat(totalBudget);

    const fund = await prisma.fund.create({
      data: {
        code,
        name,
        category,
        description: description || null,
        totalBudget: budget,
        allocatedAmount: 0,
        spentAmount: 0,
        remainingAmount: budget,
        currency: currency || "INR",
        fiscalYear: fiscalYear || `FY ${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(-2)}`,
        department: department || null,
        projectId: projectId || null,
        managerId,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    });

    res.status(201).json({ success: true, data: fund, message: "Fund created" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to create fund" });
  }
});

// ─── PUT /funds/:id ──────────────────────────────────────────────────────────
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.fund.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, error: "Fund not found" });
      return;
    }

    const {
      name,
      description,
      category,
      totalBudget,
      currency,
      fiscalYear,
      department,
      projectId,
      managerId,
      isActive,
      startDate,
      endDate,
    } = req.body;

    // If totalBudget changes, recalculate remainingAmount
    let newRemaining = existing.remainingAmount;
    if (totalBudget != null) {
      const newBudget = parseFloat(totalBudget);
      newRemaining = newBudget - existing.spentAmount;
    }

    const updated = await prisma.fund.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(category && { category }),
        ...(totalBudget != null && { totalBudget: parseFloat(totalBudget), remainingAmount: newRemaining }),
        ...(currency && { currency }),
        ...(fiscalYear && { fiscalYear }),
        ...(department !== undefined && { department }),
        ...(projectId !== undefined && { projectId }),
        ...(managerId && { managerId }),
        ...(isActive !== undefined && { isActive }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      },
    });

    res.json({ success: true, data: updated, message: "Fund updated" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to update fund" });
  }
});

// ─── POST /funds/:id/allocate ────────────────────────────────────────────────
router.post("/:id/allocate", async (req: Request, res: Response) => {
  try {
    const fund = await prisma.fund.findUnique({ where: { id: req.params.id } });
    if (!fund) {
      res.status(404).json({ success: false, error: "Fund not found" });
      return;
    }

    const employee = await resolveEmployee(req);
    if (!employee) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const { allocatedTo, allocationType, amount, purpose, startDate, endDate } = req.body;

    if (!allocatedTo || !allocationType || amount == null || !purpose) {
      res.status(400).json({
        success: false,
        error: "allocatedTo, allocationType, amount, and purpose are required",
      });
      return;
    }

    const allocationAmount = parseFloat(amount);

    // Check if allocation exceeds remaining budget
    if (allocationAmount > fund.remainingAmount) {
      res.status(400).json({
        success: false,
        error: `Allocation amount (₹${allocationAmount.toLocaleString()}) exceeds remaining budget (₹${fund.remainingAmount.toLocaleString()})`,
      });
      return;
    }

    const allocation = await prisma.$transaction(async (tx) => {
      const alloc = await tx.fundAllocation.create({
        data: {
          fundId: fund.id,
          allocatedTo,
          allocationType,
          amount: allocationAmount,
          purpose,
          approvedBy: employee.id,
          startDate: startDate ? new Date(startDate) : new Date(),
          endDate: endDate ? new Date(endDate) : null,
        },
      });

      await tx.fund.update({
        where: { id: fund.id },
        data: {
          allocatedAmount: { increment: allocationAmount },
        },
      });

      return alloc;
    });

    res.status(201).json({ success: true, data: allocation, message: "Allocation created" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to create allocation" });
  }
});

// ─── PUT /funds/allocations/:id ──────────────────────────────────────────────
router.put("/allocations/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.fundAllocation.findUnique({
      where: { id: req.params.id },
      include: { fund: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, error: "Allocation not found" });
      return;
    }

    const { allocatedTo, allocationType, amount, purpose, startDate, endDate } = req.body;

    // If amount changed, adjust fund's allocatedAmount
    let amountDiff = 0;
    if (amount != null) {
      amountDiff = parseFloat(amount) - existing.amount;
    }

    await prisma.$transaction(async (tx) => {
      await tx.fundAllocation.update({
        where: { id: req.params.id },
        data: {
          ...(allocatedTo && { allocatedTo }),
          ...(allocationType && { allocationType }),
          ...(amount != null && { amount: parseFloat(amount) }),
          ...(purpose && { purpose }),
          ...(startDate !== undefined && { startDate: new Date(startDate) }),
          ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        },
      });

      if (amountDiff !== 0) {
        await tx.fund.update({
          where: { id: existing.fundId },
          data: {
            allocatedAmount: { increment: amountDiff },
          },
        });
      }
    });

    const updated = await prisma.fundAllocation.findUnique({ where: { id: req.params.id } });

    res.json({ success: true, data: updated, message: "Allocation updated" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to update allocation" });
  }
});

// ─── DELETE /funds/allocations/:id ───────────────────────────────────────────
router.delete("/allocations/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.fundAllocation.findUnique({
      where: { id: req.params.id },
      include: { fund: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, error: "Allocation not found" });
      return;
    }

    if (!existing.isActive) {
      res.status(400).json({ success: false, error: "Allocation is already inactive" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.fundAllocation.update({
        where: { id: req.params.id },
        data: { isActive: false },
      });

      await tx.fund.update({
        where: { id: existing.fundId },
        data: {
          allocatedAmount: { decrement: existing.amount },
        },
      });
    });

    res.json({ success: true, message: "Allocation deactivated" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to deactivate allocation" });
  }
});

// ─── GET /funds/:id/transactions ─────────────────────────────────────────────
router.get("/:id/transactions", async (req: Request, res: Response) => {
  try {
    const fund = await prisma.fund.findUnique({ where: { id: req.params.id } });
    if (!fund) {
      res.status(404).json({ success: false, error: "Fund not found" });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const where: any = { fundId: req.params.id };
    if (req.query.transactionType) where.transactionType = req.query.transactionType;
    if (req.query.status) where.status = req.query.status;
    if (req.query.referenceType) where.referenceType = req.query.referenceType;
    if (req.query.startDate && req.query.endDate) {
      where.createdAt = {
        gte: new Date(req.query.startDate as string),
        lte: new Date(req.query.endDate as string),
      };
    }

    const [transactions, total] = await Promise.all([
      prisma.fundTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          purchaseRequest: { select: { requestNumber: true, title: true, status: true } },
        },
      }),
      prisma.fundTransaction.count({ where }),
    ]);

    res.json({
      success: true,
      data: transactions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch transactions" });
  }
});

// ─── POST /funds/:id/transactions ────────────────────────────────────────────
router.post("/:id/transactions", async (req: Request, res: Response) => {
  try {
    const fund = await prisma.fund.findUnique({ where: { id: req.params.id } });
    if (!fund) {
      res.status(404).json({ success: false, error: "Fund not found" });
      return;
    }

    const employee = await resolveEmployee(req);
    if (!employee) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const {
      transactionType,
      amount,
      description,
      referenceType,
      referenceId,
      purchaseRequestId,
      bankAccount,
      beneficiaryAccount,
      beneficiaryName,
      transferRef,
      notes,
    } = req.body;

    if (!transactionType || amount == null || !description) {
      res.status(400).json({ success: false, error: "transactionType, amount, and description are required" });
      return;
    }

    const validTypes = ["CREDIT", "DEBIT", "TRANSFER", "HOLD", "RELEASE", "REFUND"];
    if (!validTypes.includes(transactionType)) {
      res.status(400).json({ success: false, error: `Invalid transactionType. Must be one of: ${validTypes.join(", ")}` });
      return;
    }

    const txnAmount = parseFloat(amount);
    const balanceBefore = fund.remainingAmount;
    let balanceAfter = balanceBefore;

    // Calculate balance changes based on transaction type
    switch (transactionType) {
      case "CREDIT":
        balanceAfter = balanceBefore + txnAmount;
        break;
      case "DEBIT":
        balanceAfter = balanceBefore - txnAmount;
        break;
      case "TRANSFER":
        balanceAfter = balanceBefore - txnAmount;
        break;
      case "HOLD":
        balanceAfter = balanceBefore - txnAmount;
        break;
      case "RELEASE":
        balanceAfter = balanceBefore + txnAmount;
        break;
      case "REFUND":
        balanceAfter = balanceBefore + txnAmount;
        break;
    }

    const transaction = await prisma.$transaction(async (tx) => {
      const txn = await tx.fundTransaction.create({
        data: {
          fundId: fund.id,
          transactionType: transactionType as any,
          amount: txnAmount,
          description,
          referenceType: referenceType || null,
          referenceId: referenceId || null,
          purchaseRequestId: purchaseRequestId || null,
          bankAccount: bankAccount || null,
          beneficiaryAccount: beneficiaryAccount || null,
          beneficiaryName: beneficiaryName || null,
          transferRef: transferRef || null,
          status: "COMPLETED",
          processedBy: employee.id,
          processedAt: new Date(),
          balanceBefore,
          balanceAfter,
          notes: notes || null,
        },
      });

      // Auto-update fund's spentAmount and remainingAmount
      const updateData: any = {};
      switch (transactionType) {
        case "CREDIT":
          updateData.remainingAmount = { increment: txnAmount };
          break;
        case "DEBIT":
          updateData.spentAmount = { increment: txnAmount };
          updateData.remainingAmount = { decrement: txnAmount };
          break;
        case "TRANSFER":
          updateData.spentAmount = { increment: txnAmount };
          updateData.remainingAmount = { decrement: txnAmount };
          break;
        case "HOLD":
          updateData.remainingAmount = { decrement: txnAmount };
          break;
        case "RELEASE":
          updateData.remainingAmount = { increment: txnAmount };
          break;
        case "REFUND":
          updateData.spentAmount = { decrement: txnAmount };
          updateData.remainingAmount = { increment: txnAmount };
          break;
      }

      if (Object.keys(updateData).length > 0) {
        await tx.fund.update({ where: { id: fund.id }, data: updateData });
      }

      return txn;
    });

    res.status(201).json({
      success: true,
      data: transaction,
      balanceBefore,
      balanceAfter,
      message: `${transactionType} transaction of ₹${txnAmount.toLocaleString()} recorded`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to create transaction" });
  }
});

export { router as fundsRouter };
