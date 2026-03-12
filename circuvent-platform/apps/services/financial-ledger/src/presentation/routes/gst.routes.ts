// ══════════════════════════════════════════════════════════════════════════════
// Financial Ledger — GST Routes
// GST computation, return filing summary, reconciliation.
// ══════════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

/** POST /calculate — Calculate GST on an amount */
router.post("/calculate", async (req: Request, res: Response) => {
  try {
    const { amount, rate, isInterState, hsnSacCode } = req.body;
    if (!amount || rate === undefined) {
      res.status(400).json(errorResponse("amount and rate required"));
      return;
    }

    const totalGST = amount * (rate / 100);
    let cgst = 0, sgst = 0, igst = 0;
    if (isInterState) {
      igst = totalGST;
    } else {
      cgst = totalGST / 2;
      sgst = totalGST / 2;
    }

    res.json(successResponse({
      baseAmount: amount,
      rate,
      isInterState: !!isInterState,
      cgst: Number(cgst.toFixed(2)),
      sgst: Number(sgst.toFixed(2)),
      igst: Number(igst.toFixed(2)),
      totalGST: Number(totalGST.toFixed(2)),
      grandTotal: Number((amount + totalGST).toFixed(2)),
      hsnSacCode: hsnSacCode || null,
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** POST /extract — Extract GST from inclusive amount */
router.post("/extract", async (req: Request, res: Response) => {
  try {
    const { inclusiveAmount, rate, isInterState } = req.body;
    if (!inclusiveAmount || rate === undefined) {
      res.status(400).json(errorResponse("inclusiveAmount and rate required"));
      return;
    }

    const baseAmount = inclusiveAmount / (1 + rate / 100);
    const totalGST = inclusiveAmount - baseAmount;
    let cgst = 0, sgst = 0, igst = 0;
    if (isInterState) {
      igst = totalGST;
    } else {
      cgst = totalGST / 2;
      sgst = totalGST / 2;
    }

    res.json(successResponse({
      inclusiveAmount,
      baseAmount: Number(baseAmount.toFixed(2)),
      rate,
      cgst: Number(cgst.toFixed(2)),
      sgst: Number(sgst.toFixed(2)),
      igst: Number(igst.toFixed(2)),
      totalGST: Number(totalGST.toFixed(2)),
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** GET /summary — GST summary for a period (output vs input) */
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const { period } = req.query;

    // Output GST = sum of credits in GST Output accounts
    const outputAccounts = await prisma.ledgerAccount.findMany({
      where: { subType: "GST_OUTPUT" },
    });
    const inputAccounts = await prisma.ledgerAccount.findMany({
      where: { subType: "GST_INPUT" },
    });

    const outputTotal = outputAccounts.reduce((s, a) => s + Math.abs(Number(a.balance)), 0);
    const inputTotal = inputAccounts.reduce((s, a) => s + Math.abs(Number(a.balance)), 0);
    const netLiability = Math.max(0, outputTotal - inputTotal);

    res.json(successResponse({
      period: period || "Current",
      outputTax: Number(outputTotal.toFixed(2)),
      inputCredit: Number(inputTotal.toFixed(2)),
      netLiability: Number(netLiability.toFixed(2)),
      refundable: outputTotal < inputTotal ? Number((inputTotal - outputTotal).toFixed(2)) : 0,
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** GET /rates — HSN/SAC rate lookup */
router.get("/rates", async (_req: Request, res: Response) => {
  try {
    const rates: Record<string, { code: string; description: string; rate: number }[]> = {
      electronics: [
        { code: "8542", description: "Electronic integrated circuits", rate: 18 },
        { code: "8543", description: "IoT devices & electrical machines", rate: 18 },
        { code: "8471", description: "Computers & PCBs", rate: 18 },
        { code: "8536", description: "Switches & connectors", rate: 28 },
      ],
      software: [
        { code: "998314", description: "IT software services", rate: 18 },
        { code: "998315", description: "IT infrastructure management", rate: 18 },
        { code: "998316", description: "IT consulting", rate: 18 },
      ],
      consulting: [
        { code: "998311", description: "Management consulting", rate: 18 },
        { code: "998313", description: "R&D services", rate: 18 },
      ],
    };
    res.json(successResponse(rates));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

export { router as gstRoutes };
