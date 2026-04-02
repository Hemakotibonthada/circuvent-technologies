// ──────────────────────────────────────────────────────────────
// Project Tracker — BOM Export Routes
// REST endpoints for exporting BOM data in CSV, PDF, and JSON.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { BOMExportService } from "../services/bom-export.service";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

// ── GET /api/bom-export/:revisionId/csv ──
router.get("/:revisionId/csv", async (req: Request, res: Response) => {
  try {
    const { rndOnly } = req.query;
    const csv = await BOMExportService.exportCSV(req.params.revisionId, rndOnly === "true");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="BOM_${req.params.revisionId}.csv"`);
    res.send(csv);
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /api/bom-export/:revisionId/pdf ──
router.get("/:revisionId/pdf", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { buffer, filename, checksum } = await BOMExportService.exportPDF(req.params.revisionId, userId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Checksum-SHA256", checksum);
    res.send(buffer);
  } catch (error: any) {
    res.status(error.message.includes("not found") ? 404 : 500).json(errorResponse(error.message));
  }
});

// ── GET /api/bom-export/:revisionId/json ──
router.get("/:revisionId/json", async (req: Request, res: Response) => {
  try {
    const data = await BOMExportService.exportJSON(req.params.revisionId);
    res.json(successResponse(data));
  } catch (error: any) {
    res.status(error.message.includes("not found") ? 404 : 500).json(errorResponse(error.message));
  }
});

export { router as bomExportRouter };
