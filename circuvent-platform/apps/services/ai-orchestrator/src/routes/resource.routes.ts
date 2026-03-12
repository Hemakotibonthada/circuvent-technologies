// ──────────────────────────────────────────────────────────────
// AI Orchestrator — Resource Routes
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { ResourcePoolService } from "../services/resource-pool.service";
import { createResourceSchema, updateResourceStatusSchema, allocateResourceSchema } from "../validators/ai.validators";

const router = Router();

router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const dashboard = await ResourcePoolService.getDashboard();
    res.json({ success: true, data: dashboard });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const { type, status, page, limit } = req.query;
    const result = await ResourcePoolService.listResources({
      type: type as string, status: status as string,
      page: Number(page) || 1, limit: Number(limit) || 20,
    });
    res.json({ success: true, data: result.data, meta: { total: result.total, page: Number(page) || 1, limit: Number(limit) || 20 } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const resource = await ResourcePoolService.getById(req.params.id);
    if (!resource) { res.status(404).json({ success: false, error: "Resource not found" }); return; }
    res.json({ success: true, data: resource });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = createResourceSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
    const userId = (req as any).user?.userId;
    const resource = await ResourcePoolService.create(parsed.data, userId);
    res.status(201).json({ success: true, data: resource, message: "Resource created" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const parsed = updateResourceStatusSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
    const userId = (req as any).user?.userId;
    const resource = await ResourcePoolService.updateStatus(req.params.id, parsed.data.status, userId);
    res.json({ success: true, data: resource, message: "Status updated" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/allocate", async (req: Request, res: Response) => {
  try {
    const parsed = allocateResourceSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
    const userId = (req as any).user?.userId;
    const allocation = await ResourcePoolService.allocate(parsed.data, userId);
    res.status(201).json({ success: true, data: allocation, message: "Resource allocated" });
  } catch (error: any) {
    res.status(error.message.includes("cannot allocate") ? 409 : 500).json({ success: false, error: error.message });
  }
});

router.post("/allocations/:id/release", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const result = await ResourcePoolService.release(req.params.id, userId);
    res.json({ success: true, data: result, message: "Resource released" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export { router as resourceRouter };
