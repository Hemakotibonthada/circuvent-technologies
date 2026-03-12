// ──────────────────────────────────────────────────────────────
// Project Controller — separates HTTP concerns from business
// logic. Handles request parsing, validation, response
// formatting, and error classification.
// ──────────────────────────────────────────────────────────────

import { Request, Response } from "express";
import { ProjectService } from "../services";
import { ProjectEntity } from "../domain/project.entity";
import { createProjectSchema, updateProjectSchema, addMemberSchema } from "../validators";
import { normalizePagination, buildPaginationMeta, successResponse, errorResponse } from "@circuvent/shared";

export class ProjectController {
  static async list(req: Request, res: Response): Promise<void> {
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
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const project = await ProjectService.getById(req.params.id);
      if (!project) { res.status(404).json(errorResponse("Project not found")); return; }
      res.json(successResponse(project));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(errorResponse(parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ")));
        return;
      }
      const userId = (req as any).user?.userId;
      const project = await ProjectService.create(parsed.data, userId);
      res.status(201).json(successResponse(project, "Project created"));
    } catch (error: any) {
      res.status(error.message.includes("Duplicate") ? 409 : 500).json(errorResponse(error.message));
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(errorResponse(parsed.error.errors[0].message));
        return;
      }

      // Validate status transition if status is being changed
      if (parsed.data.status) {
        const existing = await ProjectService.getById(req.params.id);
        if (!existing) { res.status(404).json(errorResponse("Project not found")); return; }

        const entity = new ProjectEntity({
          id: existing.id, name: existing.name, code: existing.code,
          type: existing.type, status: existing.status,
          isRnD: existing.isRnD, budget: existing.budget ? Number(existing.budget) : undefined,
          budgetCurrency: existing.budgetCurrency,
          memberCount: existing.members?.length || 0,
          sprintCount: existing._count?.sprints || 0,
          hardwareRevisionCount: existing._count?.hardwareRevisions || 0,
        });

        if (!entity.canTransitionTo(parsed.data.status as any)) {
          res.status(400).json(errorResponse(
            `Invalid status transition: ${existing.status} → ${parsed.data.status}`
          ));
          return;
        }
      }

      const userId = (req as any).user?.userId;
      const project = await ProjectService.update(req.params.id, parsed.data, userId);
      res.json(successResponse(project, "Project updated"));
    } catch (error: any) {
      const status = error.message === "Project not found" ? 404 : 500;
      res.status(status).json(errorResponse(error.message));
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.userId;
      await ProjectService.delete(req.params.id, userId);
      res.json(successResponse(null, "Project deleted"));
    } catch (error: any) {
      const status = error.message === "Project not found" ? 404 : 500;
      res.status(status).json(errorResponse(error.message));
    }
  }

  static async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const dashboard = await ProjectService.getDashboard();
      res.json(successResponse(dashboard));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async addMember(req: Request, res: Response): Promise<void> {
    try {
      const parsed = addMemberSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json(errorResponse(parsed.error.errors[0].message)); return; }
      const actorId = (req as any).user?.userId;
      const member = await ProjectService.addMember(req.params.id, parsed.data.userId, parsed.data.role, actorId);
      res.status(201).json(successResponse(member, "Member added"));
    } catch (error: any) {
      res.status(error.message.includes("Unique constraint") ? 409 : 500).json(errorResponse(error.message));
    }
  }

  static async removeMember(req: Request, res: Response): Promise<void> {
    try {
      const actorId = (req as any).user?.userId;
      await ProjectService.removeMember(req.params.id, req.params.userId, actorId);
      res.json(successResponse(null, "Member removed"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getHealthScore(req: Request, res: Response): Promise<void> {
    try {
      const project = await ProjectService.getById(req.params.id);
      if (!project) { res.status(404).json(errorResponse("Project not found")); return; }

      const entity = new ProjectEntity({
        id: project.id, name: project.name, code: project.code,
        type: project.type, status: project.status,
        isRnD: project.isRnD, budget: project.budget ? Number(project.budget) : undefined,
        budgetCurrency: project.budgetCurrency,
        startDate: project.startDate ? new Date(project.startDate) : undefined,
        endDate: project.endDate ? new Date(project.endDate) : undefined,
        memberCount: project.members?.length || 0,
        sprintCount: project._count?.sprints || 0,
        hardwareRevisionCount: project._count?.hardwareRevisions || 0,
      });

      const health = entity.getHealthScore();
      res.json(successResponse({
        ...health,
        isOverdue: entity.isOverdue(),
        durationDays: entity.getDurationDays(),
        canAddSprint: entity.canAddSprint(),
        canAddHardwareRevision: entity.canAddHardwareRevision(),
      }));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }
}
