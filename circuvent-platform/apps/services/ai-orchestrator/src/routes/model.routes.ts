// ──────────────────────────────────────────────────────────────
// AI Orchestrator — Model Registry Routes
// REST endpoints for model listing, comparison,
// version history, and registry stats.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { ModelRegistryService } from "../services/model-registry.service";

function jsonOk(res: Response, data: unknown, message?: string, status = 200) {
  res.status(status).json({ success: true, data, message });
}
function jsonErr(res: Response, error: string, status = 500) {
  res.status(status).json({ success: false, error });
}

const router = Router();

// ── GET /api/models/stats — Registry stats ──
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await ModelRegistryService.getStats();
    jsonOk(res, stats);
  } catch (error: any) { jsonErr(res, error.message); }
});

// ── GET /api/models — List models ──
router.get("/", async (req: Request, res: Response) => {
  try {
    const { framework, modelName, page, limit } = req.query;
    const result = await ModelRegistryService.listModels({
      framework: framework as string,
      modelName: modelName as string,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
    jsonOk(res, result);
  } catch (error: any) { jsonErr(res, error.message); }
});

// ── GET /api/models/:jobCode — Get model by job code ──
router.get("/:jobCode", async (req: Request, res: Response) => {
  try {
    const model = await ModelRegistryService.getModel(req.params.jobCode);
    if (!model) { jsonErr(res, "Model not found", 404); return; }
    jsonOk(res, model);
  } catch (error: any) { jsonErr(res, error.message); }
});

// ── GET /api/models/:modelName/history — Version history ──
router.get("/:modelName/history", async (req: Request, res: Response) => {
  try {
    const history = await ModelRegistryService.getModelHistory(req.params.modelName);
    jsonOk(res, history);
  } catch (error: any) { jsonErr(res, error.message); }
});

// ── POST /api/models/compare — Compare two models ──
router.post("/compare", async (req: Request, res: Response) => {
  try {
    const { jobCode1, jobCode2 } = req.body;
    if (!jobCode1 || !jobCode2) { jsonErr(res, "jobCode1 and jobCode2 required", 400); return; }
    const comparison = await ModelRegistryService.compareModels(jobCode1, jobCode2);
    jsonOk(res, comparison);
  } catch (error: any) {
    jsonErr(res, error.message, error.message.includes("not found") ? 404 : 500);
  }
});

export { router as modelRouter };
