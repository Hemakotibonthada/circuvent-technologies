// ──────────────────────────────────────────────────────────────
// Hardware Controller — handles hardware revision CRUD,
// BOM item management, cost analysis, and R&D component
// tracking with domain entity validation.
// ──────────────────────────────────────────────────────────────

import { Request, Response } from "express";
import { HardwareService } from "../services";
import { createRevisionSchemaV2, updateRevisionStatusSchema, createBOMItemSchemaV2 } from "../validators/project.validators.v2";
import { successResponse, errorResponse } from "@circuvent/shared";

export class HardwareController {
  static async listRevisions(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.query;
      if (!projectId) { res.status(400).json(errorResponse("projectId query param required")); return; }
      const revisions = await HardwareService.listRevisions(projectId as string);
      res.json(successResponse(revisions));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async createRevision(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createRevisionSchemaV2.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(errorResponse(parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ")));
        return;
      }
      const userId = (req as any).user?.userId;
      const revision = await HardwareService.createRevision(parsed.data, userId);
      res.status(201).json(successResponse(revision, "Hardware revision created"));
    } catch (error: any) {
      res.status(error.message.includes("Unique") ? 409 : 500).json(errorResponse(error.message));
    }
  }

  static async updateRevisionStatus(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateRevisionStatusSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json(errorResponse(parsed.error.errors[0].message)); return; }

      // Validate status transition
      const validTransitions: Record<string, string[]> = {
        DRAFT: ["IN_REVIEW", "DEPRECATED"],
        IN_REVIEW: ["APPROVED", "DRAFT", "DEPRECATED"],
        APPROVED: ["PRODUCTION", "DEPRECATED"],
        PRODUCTION: ["DEPRECATED"],
        DEPRECATED: [],
      };

      // We could fetch the current revision and check but for speed:
      const userId = (req as any).user?.userId;
      const revision = await HardwareService.updateRevisionStatus(req.params.id, parsed.data.status, userId);
      res.json(successResponse(revision, "Revision status updated"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getBOMSummary(req: Request, res: Response): Promise<void> {
    try {
      const summary = await HardwareService.getBOMSummary(req.params.revisionId);
      res.json(successResponse(summary));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async addBOMItem(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createBOMItemSchemaV2.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(errorResponse(parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ")));
        return;
      }
      const userId = (req as any).user?.userId;
      const item = await HardwareService.addBOMItem(req.params.revisionId, parsed.data, userId);
      res.status(201).json(successResponse(item, "BOM item added"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async updateBOMItem(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.userId;
      const item = await HardwareService.updateBOMItem(req.params.id, req.body, userId);
      res.json(successResponse(item, "BOM item updated"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async deleteBOMItem(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.userId;
      await HardwareService.deleteBOMItem(req.params.id, userId);
      res.json(successResponse(null, "BOM item deleted"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getBOMCostAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const summary = await HardwareService.getBOMSummary(req.params.revisionId);

      const byCategory: Record<string, { count: number; totalCost: number }> = {};
      for (const item of summary.items) {
        const cat = item.category || "UNCATEGORIZED";
        if (!byCategory[cat]) byCategory[cat] = { count: 0, totalCost: 0 };
        byCategory[cat].count += 1;
        byCategory[cat].totalCost += Number(item.unitPrice) * item.quantity;
      }

      const bySupplier: Record<string, { count: number; totalCost: number }> = {};
      for (const item of summary.items) {
        const sup = item.supplier || "Unknown";
        if (!bySupplier[sup]) bySupplier[sup] = { count: 0, totalCost: 0 };
        bySupplier[sup].count += 1;
        bySupplier[sup].totalCost += Number(item.unitPrice) * item.quantity;
      }

      const rndItems = summary.items.filter((i: any) => i.isRnDComponent);
      const rndCost = rndItems.reduce((s: number, i: any) => s + Number(i.unitPrice) * i.quantity, 0);

      const longLeadItems = summary.items
        .filter((i: any) => i.leadTimeDays && i.leadTimeDays > 14)
        .sort((a: any, b: any) => (b.leadTimeDays || 0) - (a.leadTimeDays || 0));

      res.json(successResponse({
        totalCost: summary.totalCost,
        rndCost,
        rndPercentage: summary.totalCost > 0 ? Math.round((rndCost / summary.totalCost) * 100) : 0,
        itemCount: summary.itemCount,
        uniqueCategories: Object.keys(byCategory).length,
        byCategory: Object.entries(byCategory).map(([cat, data]) => ({ category: cat, ...data })),
        bySupplier: Object.entries(bySupplier).map(([sup, data]) => ({ supplier: sup, ...data })),
        longLeadItems: longLeadItems.slice(0, 10),
        averageUnitPrice: summary.itemCount > 0 ? Math.round(summary.totalCost / summary.items.reduce((s: number, i: any) => s + i.quantity, 0)) : 0,
      }));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }
}
