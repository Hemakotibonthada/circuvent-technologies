// ──────────────────────────────────────────────────────────────
// Enhanced Sprint Routes — sprints + task board
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { HTTP_STATUS, successResponse, errorResponse } from "@circuvent/shared";
import { SprintService } from "../services";
import { createSprintSchema, createTaskSchema, updateTaskSchema } from "../validators";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    if (!projectId) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse("projectId required")); return; }
    const sprints = await SprintService.listByProject(projectId as string);
    res.json(successResponse(sprints));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch sprints"));
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = createSprintSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const userId = (req as any).user?.userId;
    const sprint = await SprintService.create(parsed.data, userId);
    res.status(HTTP_STATUS.CREATED).json(successResponse(sprint, "Sprint created"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to create sprint"));
  }
});

router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const { status, velocity } = req.body;
    const sprint = await SprintService.updateStatus(req.params.id, status, velocity);
    res.json(successResponse(sprint, "Sprint status updated"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to update sprint"));
  }
});

router.get("/:id/board", async (req: Request, res: Response) => {
  try {
    const board = await SprintService.getSprintBoard(req.params.id);
    res.json(successResponse(board));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch board"));
  }
});

router.post("/:sprintId/tasks", async (req: Request, res: Response) => {
  try {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const creatorId = (req as any).user?.userId;
    const task = await SprintService.createTask(req.params.sprintId, parsed.data, creatorId);
    res.status(HTTP_STATUS.CREATED).json(successResponse(task, "Task created"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to create task"));
  }
});

router.patch("/tasks/:taskId", async (req: Request, res: Response) => {
  try {
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const userId = (req as any).user?.userId;
    const task = await SprintService.updateTask(req.params.taskId, parsed.data, userId);
    res.json(successResponse(task, "Task updated"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to update task"));
  }
});

router.delete("/tasks/:taskId", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    await SprintService.deleteTask(req.params.taskId, userId);
    res.json(successResponse(null, "Task deleted"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to delete task"));
  }
});

export { router as sprintRouter };
