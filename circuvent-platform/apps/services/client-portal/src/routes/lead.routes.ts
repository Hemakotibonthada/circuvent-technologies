// ──────────────────────────────────────────────────────────────
// Enhanced Lead Routes — CRM pipeline with validation
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { HTTP_STATUS, successResponse, errorResponse, normalizePagination, buildPaginationMeta } from "@circuvent/shared";
import { LeadService } from "../services";
import { createLeadSchema, updateLeadStatusSchema, createActivitySchema } from "../validators";

const router = Router();

router.get("/pipeline/summary", async (_req: Request, res: Response) => {
  try {
    const summary = await LeadService.getPipelineSummary();
    res.json(successResponse(summary));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch pipeline"));
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const pagination = normalizePagination(req.query);
    const { status, source, assignedToId } = req.query;
    const { data, total } = await LeadService.list({ ...pagination, status: status as string, source: source as string, assignedToId: assignedToId as string });
    res.json(successResponse(data, undefined, buildPaginationMeta(total, pagination.page, pagination.limit)));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch leads"));
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = createLeadSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const createdById = (req as any).user?.userId;
    const lead = await LeadService.create(parsed.data, createdById);
    res.status(HTTP_STATUS.CREATED).json(successResponse(lead, "Lead created"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse(error.message || "Failed to create lead"));
  }
});

router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const parsed = updateLeadStatusSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const actorId = (req as any).user?.userId;
    const lead = await LeadService.updateStatus(req.params.id, parsed.data.status, actorId);
    res.json(successResponse(lead, "Lead status updated"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to update lead"));
  }
});

router.post("/:id/activities", async (req: Request, res: Response) => {
  try {
    const parsed = createActivitySchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const activity = await LeadService.addActivity(req.params.id, parsed.data);
    res.status(HTTP_STATUS.CREATED).json(successResponse(activity, "Activity added"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to add activity"));
  }
});

export { router as leadRouter };
