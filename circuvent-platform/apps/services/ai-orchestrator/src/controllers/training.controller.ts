// ──────────────────────────────────────────────────────────────
// AI Orchestrator — Training Job Controller
// Handles job submission, status updates, checkpoints,
// cancellation, and dashboard with domain entity validation.
// ──────────────────────────────────────────────────────────────

import { Request, Response } from "express";
import { TrainingJobService } from "../services/training-job.service";
import { TrainingJobEntity } from "../domain/ai.entities";
import { submitTrainingJobSchema, updateJobStatusSchema } from "../validators/ai.validators";

function jsonOk(res: Response, data: unknown, message?: string, status = 200) {
  res.status(status).json({ success: true, data, message });
}
function jsonErr(res: Response, error: string, status = 500) {
  res.status(status).json({ success: false, error });
}

export class TrainingController {
  static async getDashboard(_req: Request, res: Response): Promise<void> {
    try {
      const dashboard = await TrainingJobService.getDashboard();
      jsonOk(res, dashboard);
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { status, requestedById, page, limit } = req.query;
      const result = await TrainingJobService.list({
        status: status as string, requestedById: requestedById as string,
        page: Number(page) || 1, limit: Number(limit) || 20,
      });
      jsonOk(res, result.data, undefined);
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const job = await TrainingJobService.getById(req.params.id);
      if (!job) { jsonErr(res, "Training job not found", 404); return; }

      const entity = new TrainingJobEntity(
        job.id, job.jobCode, job.status, job.modelName,
        job.framework, job.epochsTotal, job.epochsCompleted, job.resourceId,
      );

      jsonOk(res, {
        ...job,
        _analysis: {
          progressPercent: entity.getProgressPercent(),
          isTerminal: entity.isTerminal(),
          needsResource: entity.needsResource(),
          canCancel: entity.canCancel(),
          estimatedRemainingMinutes: entity.estimateRemainingMinutes(5),
        },
      });
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async submit(req: Request, res: Response): Promise<void> {
    try {
      const parsed = submitTrainingJobSchema.safeParse(req.body);
      if (!parsed.success) { jsonErr(res, parsed.error.errors[0].message, 400); return; }
      const userId = (req as any).user?.userId;
      const job = await TrainingJobService.submit(parsed.data, userId);
      jsonOk(res, job, "Training job submitted", 201);
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateJobStatusSchema.safeParse(req.body);
      if (!parsed.success) { jsonErr(res, parsed.error.errors[0].message, 400); return; }

      // Validate transition with domain entity
      const existing = await TrainingJobService.getById(req.params.id);
      if (!existing) { jsonErr(res, "Job not found", 404); return; }

      const entity = new TrainingJobEntity(
        existing.id, existing.jobCode, existing.status, existing.modelName,
        existing.framework, existing.epochsTotal, existing.epochsCompleted, existing.resourceId,
      );

      if (!entity.canTransitionTo(parsed.data.status as any)) {
        jsonErr(res, `Invalid job status transition: ${existing.status} → ${parsed.data.status}`, 400);
        return;
      }

      const userId = (req as any).user?.userId;
      const job = await TrainingJobService.updateStatus(req.params.id, parsed.data, userId);
      jsonOk(res, job, "Job status updated");
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async addCheckpoint(req: Request, res: Response): Promise<void> {
    try {
      const { epoch, stepNumber, metricsJson, checkpointPath, sizeBytes } = req.body;
      if (!epoch || !checkpointPath) { jsonErr(res, "epoch and checkpointPath required", 400); return; }

      const checkpoint = await TrainingJobService.addCheckpoint(req.params.id, {
        epoch, stepNumber, metricsJson, checkpointPath, sizeBytes,
      });
      jsonOk(res, checkpoint, "Checkpoint saved", 201);
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async cancel(req: Request, res: Response): Promise<void> {
    try {
      const existing = await TrainingJobService.getById(req.params.id);
      if (!existing) { jsonErr(res, "Job not found", 404); return; }

      const entity = new TrainingJobEntity(
        existing.id, existing.jobCode, existing.status, existing.modelName,
        existing.framework, existing.epochsTotal, existing.epochsCompleted, existing.resourceId,
      );

      if (!entity.canCancel()) {
        jsonErr(res, `Cannot cancel job in ${existing.status} state`, 400);
        return;
      }

      const userId = (req as any).user?.userId;
      const job = await TrainingJobService.cancel(req.params.id, userId);
      jsonOk(res, job, "Job cancelled");
    } catch (error: any) { jsonErr(res, error.message); }
  }
}
