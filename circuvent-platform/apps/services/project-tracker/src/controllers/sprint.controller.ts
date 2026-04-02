// ──────────────────────────────────────────────────────────────
// Sprint Controller — handles sprint CRUD, task board,
// burndown data, and velocity tracking.
// ──────────────────────────────────────────────────────────────

import { Request, Response } from "express";
import { SprintService } from "../services";
import { SprintEntity } from "../domain/project.entity";
import { createSprintSchema, createTaskSchema, updateTaskSchema } from "../validators";
import { successResponse, errorResponse } from "@circuvent/shared";

export class SprintController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.query;
      if (!projectId) { res.status(400).json(errorResponse("projectId required")); return; }
      const sprints = await SprintService.listByProject(projectId as string);
      res.json(successResponse(sprints));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createSprintSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json(errorResponse(parsed.error.errors[0].message)); return; }
      const userId = (req as any).user?.userId;
      const sprint = await SprintService.create(parsed.data, userId);
      res.status(201).json(successResponse(sprint, "Sprint created"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const { status, velocity } = req.body;
      const sprint = await SprintService.updateStatus(req.params.id, status, velocity);
      res.json(successResponse(sprint, "Sprint status updated"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getBoard(req: Request, res: Response): Promise<void> {
    try {
      const board = await SprintService.getSprintBoard(req.params.id);
      res.json(successResponse(board));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async createTask(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createTaskSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json(errorResponse(parsed.error.errors[0].message)); return; }
      const creatorId = (req as any).user?.userId;
      const task = await SprintService.createTask(req.params.sprintId, parsed.data, creatorId);
      res.status(201).json(successResponse(task, "Task created"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async updateTask(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateTaskSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json(errorResponse(parsed.error.errors[0].message)); return; }
      const userId = (req as any).user?.userId;
      const task = await SprintService.updateTask(req.params.taskId, parsed.data, userId);
      res.json(successResponse(task, "Task updated"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async deleteTask(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.userId;
      await SprintService.deleteTask(req.params.taskId, userId);
      res.json(successResponse(null, "Task deleted"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getBurndown(req: Request, res: Response): Promise<void> {
    try {
      const board = await SprintService.getSprintBoard(req.params.id);
      const allTasks = Object.values(board.columns).flat() as any[];

      const entity = new SprintEntity(
        req.params.id,
        "", // name not needed for computation
        "ACTIVE",
        new Date(), new Date(),
        allTasks.map((t: any) => ({ status: t.status, storyPoints: t.storyPoints }))
      );

      res.json(successResponse({
        ...entity.getBurndownData(),
        completionPercentage: entity.getCompletionPercentage(),
        velocity: entity.getVelocity(),
        blockedTasks: entity.getBlockedTasks(),
        isAtRisk: entity.isAtRisk(),
      }));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }
}
