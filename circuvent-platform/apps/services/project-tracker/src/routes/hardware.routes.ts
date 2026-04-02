// ──────────────────────────────────────────────────────────────
// Enhanced Hardware Routes — BOM management with validation
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { HTTP_STATUS, successResponse, errorResponse } from "@circuvent/shared";
import { HardwareService } from "../services";
import { createRevisionSchema, createBOMItemSchema } from "../validators";

const router = Router();

router.get("/revisions", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    if (!projectId) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse("projectId required")); return; }
    const revisions = await HardwareService.listRevisions(projectId as string);
    res.json(successResponse(revisions));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch revisions"));
  }
});

router.post("/revisions", async (req: Request, res: Response) => {
  try {
    const parsed = createRevisionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const userId = (req as any).user?.userId;
    const revision = await HardwareService.createRevision(parsed.data, userId);
    res.status(HTTP_STATUS.CREATED).json(successResponse(revision, "Revision created"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to create revision"));
  }
});

router.patch("/revisions/:id/status", async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const userId = (req as any).user?.userId;
    const revision = await HardwareService.updateRevisionStatus(req.params.id, status, userId);
    res.json(successResponse(revision, "Revision status updated"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to update revision"));
  }
});

router.get("/revisions/:revisionId/bom", async (req: Request, res: Response) => {
  try {
    const summary = await HardwareService.getBOMSummary(req.params.revisionId);
    res.json(successResponse(summary));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch BOM"));
  }
});

router.post("/revisions/:revisionId/bom", async (req: Request, res: Response) => {
  try {
    const parsed = createBOMItemSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const userId = (req as any).user?.userId;
    const item = await HardwareService.addBOMItem(req.params.revisionId, parsed.data, userId);
    res.status(HTTP_STATUS.CREATED).json(successResponse(item, "BOM item added"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to add BOM item"));
  }
});

router.put("/bom/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const item = await HardwareService.updateBOMItem(req.params.id, req.body, userId);
    res.json(successResponse(item, "BOM item updated"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to update BOM item"));
  }
});

router.delete("/bom/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    await HardwareService.deleteBOMItem(req.params.id, userId);
    res.json(successResponse(null, "BOM item deleted"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to delete BOM item"));
  }
});

export { router as hardwareRouter };
