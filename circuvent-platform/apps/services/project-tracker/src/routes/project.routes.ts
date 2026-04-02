// ──────────────────────────────────────────────────────────────
// Enhanced Project Routes — full CRUD with validation
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { HTTP_STATUS, successResponse, errorResponse, normalizePagination, buildPaginationMeta } from "@circuvent/shared";
import { ProjectService } from "../services";
import { createProjectSchema, updateProjectSchema, addMemberSchema } from "../validators";

const router = Router();

router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const dashboard = await ProjectService.getDashboard();
    res.json(successResponse(dashboard));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch dashboard"));
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const pagination = normalizePagination(req.query);
    const { type, status, isRnD } = req.query;
    const { data, total } = await ProjectService.list({
      ...pagination,
      type: type as string,
      status: status as string,
      isRnD: isRnD !== undefined ? isRnD === "true" : undefined,
    });
    res.json(successResponse(data, undefined, buildPaginationMeta(total, pagination.page, pagination.limit)));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch projects"));
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const project = await ProjectService.getById(req.params.id);
    if (!project) { res.status(HTTP_STATUS.NOT_FOUND).json(errorResponse("Project not found")); return; }
    res.json(successResponse(project));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch project"));
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const userId = (req as any).user?.userId;
    const project = await ProjectService.create(parsed.data, userId);
    res.status(HTTP_STATUS.CREATED).json(successResponse(project, "Project created"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse(error.message || "Failed to create project"));
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const userId = (req as any).user?.userId;
    const project = await ProjectService.update(req.params.id, parsed.data, userId);
    res.json(successResponse(project, "Project updated"));
  } catch (error: any) {
    if (error.message === "Project not found") { res.status(HTTP_STATUS.NOT_FOUND).json(errorResponse(error.message)); return; }
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to update project"));
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    await ProjectService.delete(req.params.id, userId);
    res.json(successResponse(null, "Project deleted"));
  } catch (error: any) {
    if (error.message === "Project not found") { res.status(HTTP_STATUS.NOT_FOUND).json(errorResponse(error.message)); return; }
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to delete project"));
  }
});

router.post("/:id/members", async (req: Request, res: Response) => {
  try {
    const parsed = addMemberSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const actorId = (req as any).user?.userId;
    const member = await ProjectService.addMember(req.params.id, parsed.data.userId, parsed.data.role, actorId);
    res.status(HTTP_STATUS.CREATED).json(successResponse(member, "Member added"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to add member"));
  }
});

router.delete("/:id/members/:userId", async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).user?.userId;
    await ProjectService.removeMember(req.params.id, req.params.userId, actorId);
    res.json(successResponse(null, "Member removed"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to remove member"));
  }
});

export { router as projectRouter };
