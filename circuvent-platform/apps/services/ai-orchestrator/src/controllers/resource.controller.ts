// ──────────────────────────────────────────────────────────────
// AI Orchestrator — Resource Controller
// Handles compute resource CRUD, allocation, release,
// scheduling, and dashboard with domain entity validation.
// ──────────────────────────────────────────────────────────────

import { Request, Response } from "express";
import { ResourcePoolService } from "../services/resource-pool.service";
import { ResourceSchedulerService } from "../services/resource-scheduler.service";
import { ComputeResourceEntity } from "../domain/ai.entities";
import { createResourceSchema, updateResourceStatusSchema, allocateResourceSchema } from "../validators/ai.validators";

function jsonOk(res: Response, data: unknown, message?: string, status = 200) {
  res.status(status).json({ success: true, data, message });
}
function jsonErr(res: Response, error: string, status = 500) {
  res.status(status).json({ success: false, error });
}

export class ResourceController {
  static async getDashboard(_req: Request, res: Response): Promise<void> {
    try {
      const dashboard = await ResourcePoolService.getDashboard();
      jsonOk(res, dashboard);
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { type, status, page, limit } = req.query;
      const result = await ResourcePoolService.listResources({
        type: type as string, status: status as string,
        page: Number(page) || 1, limit: Number(limit) || 20,
      });
      jsonOk(res, result.data, undefined);
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const resource = await ResourcePoolService.getById(req.params.id);
      if (!resource) { jsonErr(res, "Resource not found", 404); return; }

      const entity = new ComputeResourceEntity(
        resource.id, resource.resourceCode, resource.type,
        resource.status, resource.vramGb, resource.costPerHourINR ? Number(resource.costPerHourINR) : null,
      );

      jsonOk(res, {
        ...resource,
        _analysis: {
          isAvailable: entity.isAvailable(),
          estimatedCostFor8Hours: entity.estimateCost(8),
        },
      });
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createResourceSchema.safeParse(req.body);
      if (!parsed.success) { jsonErr(res, parsed.error.errors[0].message, 400); return; }
      const userId = (req as any).user?.userId;
      const resource = await ResourcePoolService.create(parsed.data, userId);
      jsonOk(res, resource, "Resource registered", 201);
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateResourceStatusSchema.safeParse(req.body);
      if (!parsed.success) { jsonErr(res, parsed.error.errors[0].message, 400); return; }

      // Validate transition with domain entity
      const existing = await ResourcePoolService.getById(req.params.id);
      if (!existing) { jsonErr(res, "Resource not found", 404); return; }

      const entity = new ComputeResourceEntity(
        existing.id, existing.resourceCode, existing.type,
        existing.status, existing.vramGb, null,
      );

      if (!entity.canTransitionTo(parsed.data.status as any)) {
        jsonErr(res, `Invalid status transition: ${existing.status} → ${parsed.data.status}`, 400);
        return;
      }

      const userId = (req as any).user?.userId;
      const resource = await ResourcePoolService.updateStatus(req.params.id, parsed.data.status, userId);
      jsonOk(res, resource, "Status updated");
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async allocate(req: Request, res: Response): Promise<void> {
    try {
      const parsed = allocateResourceSchema.safeParse(req.body);
      if (!parsed.success) { jsonErr(res, parsed.error.errors[0].message, 400); return; }
      const userId = (req as any).user?.userId;
      const allocation = await ResourcePoolService.allocate(parsed.data, userId);
      jsonOk(res, allocation, "Resource allocated", 201);
    } catch (error: any) {
      jsonErr(res, error.message, error.message.includes("cannot allocate") ? 409 : 500);
    }
  }

  static async release(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.userId;
      const result = await ResourcePoolService.release(req.params.id, userId);
      jsonOk(res, result, "Resource released");
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async schedule(req: Request, res: Response): Promise<void> {
    try {
      const decision = await ResourceSchedulerService.schedule(req.body);
      jsonOk(res, decision, decision.allocated ? "Resource scheduled" : "No resource available");
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async forceAllocate(req: Request, res: Response): Promise<void> {
    try {
      const decision = await ResourceSchedulerService.forceAllocate(req.body);
      jsonOk(res, decision, decision.allocated ? "Resource force-allocated (preempted)" : "Force allocation failed");
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async processQueue(_req: Request, res: Response): Promise<void> {
    try {
      const result = await ResourceSchedulerService.processQueue();
      jsonOk(res, result, `Queue processed: ${result.assigned} assigned, ${result.remaining} remaining`);
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async getQueueStatus(_req: Request, res: Response): Promise<void> {
    try {
      const status = await ResourceSchedulerService.getQueueStatus();
      jsonOk(res, status);
    } catch (error: any) { jsonErr(res, error.message); }
  }
}
