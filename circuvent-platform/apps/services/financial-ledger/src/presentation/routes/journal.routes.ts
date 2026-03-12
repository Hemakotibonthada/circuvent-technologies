// ══════════════════════════════════════════════════════════════════════════════
// Financial Ledger — Journal Entry Routes
// Create, validate, post, and reverse journal entries.
// ══════════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

/** GET / — List journal entries */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { status, source, fiscalPeriod, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (source) where.source = source;
    if (fiscalPeriod) where.fiscalPeriod = fiscalPeriod;

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          lines: { include: { account: { select: { name: true, type: true } } } },
          _count: { select: { lines: true } },
        },
        orderBy: { date: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.journalEntry.count({ where }),
    ]);

    res.json(successResponse(entries, undefined, {
      page: Number(page), limit: Number(limit), total,
      totalPages: Math.ceil(total / Number(limit)),
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** GET /:id — Get journal entry with all lines */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const entry = await prisma.journalEntry.findUnique({
      where: { id: req.params.id },
      include: { lines: { include: { account: { select: { name: true, type: true, code: true } } } } },
    });
    if (!entry) { res.status(404).json(errorResponse("Journal entry not found")); return; }
    res.json(successResponse(entry));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** POST / — Create a new journal entry */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { date, description, source, referenceId, lines } = req.body;
    if (!date || !description || !lines || !Array.isArray(lines) || lines.length < 2) {
      res.status(400).json(errorResponse("date, description, and at least 2 lines required"));
      return;
    }

    // Validate debits = credits
    const totalDebits = lines.reduce((s: number, l: any) => s + (Number(l.debit) || 0), 0);
    const totalCredits = lines.reduce((s: number, l: any) => s + (Number(l.credit) || 0), 0);
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      res.status(422).json(errorResponse(
        `Journal is unbalanced: debits=₹${totalDebits.toFixed(2)}, credits=₹${totalCredits.toFixed(2)}, difference=₹${Math.abs(totalDebits - totalCredits).toFixed(2)}`
      ));
      return;
    }

    // Validate all account codes exist
    const accountCodes = lines.map((l: any) => l.accountCode);
    const accounts = await prisma.ledgerAccount.findMany({
      where: { code: { in: accountCodes } },
    });
    const accountMap = new Map(accounts.map(a => [a.code, a]));
    for (const code of accountCodes) {
      if (!accountMap.has(code)) {
        res.status(400).json(errorResponse(`Account code '${code}' not found`));
        return;
      }
    }

    const entryDate = new Date(date);
    const fiscalPeriod = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, "0")}`;

    // Generate entry number
    const count = await prisma.journalEntry.count();
    const entryNumber = `JE-${entryDate.getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    const createdBy = (req as any).user?.userId || "system";

    const entry = await prisma.journalEntry.create({
      data: {
        entryNumber,
        date: entryDate,
        description,
        source: source || "MANUAL",
        referenceId: referenceId || null,
        fiscalPeriod,
        createdBy,
        lines: {
          create: lines.map((l: any) => ({
            accountCode: l.accountCode,
            accountId: accountMap.get(l.accountCode)!.id,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
            description: l.description || null,
            department: l.department || null,
            projectId: l.projectId || null,
          })),
        },
      },
      include: { lines: true },
    });

    res.status(201).json(successResponse(entry, `Journal ${entryNumber} created (DRAFT)`));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** POST /:id/post — Post a draft journal entry to the ledger */
router.post("/:id/post", async (req: Request, res: Response) => {
  try {
    const entry = await prisma.journalEntry.findUnique({
      where: { id: req.params.id },
      include: { lines: true },
    });

    if (!entry) { res.status(404).json(errorResponse("Journal entry not found")); return; }
    if (entry.status !== "DRAFT" && entry.status !== "PENDING_APPROVAL") {
      res.status(400).json(errorResponse(`Cannot post ${entry.status} journal`)); return;
    }

    // Check fiscal period is open
    const period = await prisma.fiscalPeriod.findUnique({ where: { period: entry.fiscalPeriod } });
    if (period?.isClosed) {
      res.status(400).json(errorResponse(`Fiscal period ${entry.fiscalPeriod} is closed`));
      return;
    }

    const userId = (req as any).user?.userId || "system";

    // Update account balances
    for (const line of entry.lines) {
      const account = await prisma.ledgerAccount.findUnique({ where: { id: line.accountId } });
      if (!account) continue;

      const isDebitNormal = account.type === "ASSET" || account.type === "EXPENSE";
      let balanceChange = Number(line.debit) - Number(line.credit);
      if (!isDebitNormal) balanceChange = -balanceChange; // Reverse for credit-normal accounts

      await prisma.ledgerAccount.update({
        where: { id: line.accountId },
        data: { balance: { increment: balanceChange } },
      });
    }

    // Mark as posted
    const posted = await prisma.journalEntry.update({
      where: { id: req.params.id },
      data: { status: "POSTED", postedBy: userId, postedAt: new Date() },
      include: { lines: { include: { account: { select: { name: true, code: true } } } } },
    });

    res.json(successResponse(posted, `Journal ${entry.entryNumber} posted to ledger`));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** POST /:id/reverse — Create a reversing journal entry */
router.post("/:id/reverse", async (req: Request, res: Response) => {
  try {
    const original = await prisma.journalEntry.findUnique({
      where: { id: req.params.id },
      include: { lines: true },
    });
    if (!original) { res.status(404).json(errorResponse("Not found")); return; }
    if (original.status !== "POSTED") {
      res.status(400).json(errorResponse("Can only reverse POSTED journals"));
      return;
    }

    const userId = (req as any).user?.userId || "system";
    const count = await prisma.journalEntry.count();
    const reversalNumber = `JE-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
    const now = new Date();
    const fp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Create reversal (swap debits and credits)
    const reversal = await prisma.journalEntry.create({
      data: {
        entryNumber: reversalNumber,
        date: now,
        description: `Reversal of ${original.entryNumber}: ${original.description}`,
        source: "ADJUSTMENT",
        referenceId: original.id,
        fiscalPeriod: fp,
        createdBy: userId,
        lines: {
          create: original.lines.map(l => ({
            accountCode: l.accountCode,
            accountId: l.accountId,
            debit: l.credit,  // Swapped!
            credit: l.debit,  // Swapped!
            description: `Reversal: ${l.description || ""}`,
            department: l.department,
            projectId: l.projectId,
          })),
        },
      },
      include: { lines: true },
    });

    // Mark original as reversed
    await prisma.journalEntry.update({
      where: { id: req.params.id },
      data: { status: "REVERSED", reversalEntryId: reversal.id },
    });

    res.status(201).json(successResponse(reversal, `Reversal ${reversalNumber} created`));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** DELETE /:id — Void a draft journal */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const entry = await prisma.journalEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) { res.status(404).json(errorResponse("Not found")); return; }
    if (entry.status === "POSTED") {
      res.status(400).json(errorResponse("Cannot delete posted journals — use reversal instead"));
      return;
    }
    await prisma.journalEntry.update({
      where: { id: req.params.id },
      data: { status: "VOID" },
    });
    res.json(successResponse(null, `Journal ${entry.entryNumber} voided`));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

export { router as journalRoutes };
