// ══════════════════════════════════════════════════════════════════════════════
// Financial Ledger — Chart of Accounts Routes
// CRUD for ledger accounts with hierarchical numbering.
// ══════════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

/** GET / — List all accounts (optionally filtered by type) */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { type, active, parentCode } = req.query;
    const where: any = {};
    if (type) where.type = type;
    if (active !== undefined) where.isActive = active === "true";
    if (parentCode) where.parentCode = parentCode;

    const accounts = await prisma.ledgerAccount.findMany({
      where,
      orderBy: { code: "asc" },
      include: { _count: { select: { journalLines: true } } },
    });
    res.json(successResponse(accounts));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** GET /tree — Hierarchical tree view of accounts */
router.get("/tree", async (_req: Request, res: Response) => {
  try {
    const accounts = await prisma.ledgerAccount.findMany({
      orderBy: { code: "asc" },
    });

    // Build tree by parentCode
    const byType: Record<string, any[]> = {};
    for (const acc of accounts) {
      if (!byType[acc.type]) byType[acc.type] = [];
      byType[acc.type].push({
        code: acc.code,
        name: acc.name,
        balance: Number(acc.balance),
        isPostable: acc.isPostable,
        isActive: acc.isActive,
        subType: acc.subType,
      });
    }
    res.json(successResponse(byType));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** GET /summary — Account type totals for dashboard */
router.get("/summary", async (_req: Request, res: Response) => {
  try {
    const totals = await prisma.ledgerAccount.groupBy({
      by: ["type"],
      _sum: { balance: true },
      _count: true,
      where: { isActive: true, isPostable: true },
    });
    const summary = totals.map(t => ({
      type: t.type,
      totalBalance: Number(t._sum.balance || 0),
      accountCount: t._count,
    }));
    res.json(successResponse(summary));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** POST / — Create a new account */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { code, name, type, subType, parentCode, isPostable, description, currency } = req.body;
    if (!code || !name || !type || !subType) {
      res.status(400).json(errorResponse("code, name, type, subType required"));
      return;
    }

    const existing = await prisma.ledgerAccount.findUnique({ where: { code } });
    if (existing) {
      res.status(409).json(errorResponse(`Account with code '${code}' already exists`));
      return;
    }

    const account = await prisma.ledgerAccount.create({
      data: {
        code, name, type, subType,
        parentCode: parentCode || null,
        isPostable: isPostable !== false,
        description: description || null,
        currency: currency || "INR",
      },
    });
    res.status(201).json(successResponse(account, "Account created"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** PUT /:code — Update account */
router.put("/:code", async (req: Request, res: Response) => {
  try {
    const { name, description, isActive } = req.body;
    const account = await prisma.ledgerAccount.update({
      where: { code: req.params.code },
      data: { name, description, isActive },
    });
    res.json(successResponse(account, "Account updated"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** GET /:code/ledger — Account ledger (all transactions) */
router.get("/:code/ledger", async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const where: any = { accountCode: req.params.code };
    if (from || to) {
      where.journal = { date: {} };
      if (from) where.journal.date.gte = new Date(from as string);
      if (to) where.journal.date.lte = new Date(to as string);
    }

    const lines = await prisma.journalLine.findMany({
      where,
      include: { journal: { select: { entryNumber: true, date: true, description: true, source: true, status: true } } },
      orderBy: { createdAt: "asc" },
    });

    let runningBalance = 0;
    const ledger = lines.map(l => {
      runningBalance += Number(l.debit) - Number(l.credit);
      return {
        date: l.journal.date,
        entryNumber: l.journal.entryNumber,
        description: l.description || l.journal.description,
        source: l.journal.source,
        debit: Number(l.debit),
        credit: Number(l.credit),
        balance: runningBalance,
      };
    });

    res.json(successResponse(ledger));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

export { router as accountRoutes };
