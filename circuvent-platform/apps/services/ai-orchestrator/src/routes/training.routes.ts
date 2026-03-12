// ──────────────────────────────────────────────────────────────
// AI Orchestrator — Training Job Routes
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { TrainingJobService } from "../services/training-job.service";
import { submitTrainingJobSchema, updateJobStatusSchema } from "../validators/ai.validators";

const router = Router();

router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const dashboard = await TrainingJobService.getDashboard();
    res.json({ success: true, data: dashboard });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const { status, requestedById, page, limit } = req.query;
    const result = await TrainingJobService.list({
      status: status as string, requestedById: requestedById as string,
      page: Number(page) || 1, limit: Number(limit) || 20,
    });
    res.json({ success: true, data: result.data, meta: { total: result.total } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const job = await TrainingJobService.getById(req.params.id);
    if (!job) { res.status(404).json({ success: false, error: "Job not found" }); return; }
    res.json({ success: true, data: job });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = submitTrainingJobSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
    const userId = (req as any).user?.userId;
    const job = await TrainingJobService.submit(parsed.data, userId);
    res.status(201).json({ success: true, data: job, message: "Training job submitted" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const parsed = updateJobStatusSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
    const userId = (req as any).user?.userId;
    const job = await TrainingJobService.updateStatus(req.params.id, parsed.data, userId);
    res.json({ success: true, data: job, message: "Job status updated" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/:id/checkpoints", async (req: Request, res: Response) => {
  try {
    const checkpoint = await TrainingJobService.addCheckpoint(req.params.id, req.body);
    res.status(201).json({ success: true, data: checkpoint, message: "Checkpoint saved" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/:id/cancel", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const job = await TrainingJobService.cancel(req.params.id, userId);
    res.json({ success: true, data: job, message: "Job cancelled" });
  } catch (error: any) {
    res.status(error.message.includes("Cannot cancel") ? 400 : 500).json({ success: false, error: error.message });
  }
});

export { router as trainingRouter };
