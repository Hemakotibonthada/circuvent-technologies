// ──────────────────────────────────────────────────────────────
// IoT Registry — Provisioning Routes
// REST endpoints for device provisioning, bulk onboarding,
// activation, and decommissioning.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { DeviceProvisioningService } from "../services/provisioning.service";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

// ── POST /api/provisioning/provision — Provision single device ──
router.post("/provision", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const result = await DeviceProvisioningService.provision({ ...req.body, registeredById: userId });
    res.status(201).json(successResponse(result, "Device provisioned"));
  } catch (error: any) {
    res.status(error.message.includes("Unique") ? 409 : 500).json(errorResponse(error.message));
  }
});

// ── POST /api/provisioning/bulk — Bulk provision ──
router.post("/bulk", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const result = await DeviceProvisioningService.bulkProvision({ ...req.body, registeredById: userId });
    res.json(successResponse(result, `${result.provisioned.length} devices provisioned, ${result.errors.length} errors`));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── POST /api/provisioning/:deviceId/activate — Device activation ──
router.post("/:deviceId/activate", async (req: Request, res: Response) => {
  try {
    const device = await DeviceProvisioningService.activate(req.params.deviceId, req.body);
    res.json(successResponse(device, "Device activated"));
  } catch (error: any) {
    const status = error.message.includes("not found") ? 404 : error.message.includes("cannot") ? 400 : 500;
    res.status(status).json(errorResponse(error.message));
  }
});

// ── GET /api/provisioning/templates — Config templates ──
router.get("/templates", (_req: Request, res: Response) => {
  const templates = DeviceProvisioningService.getConfigTemplates();
  res.json(successResponse(templates));
});

// ── POST /api/provisioning/status — Batch status check ──
router.post("/status", async (req: Request, res: Response) => {
  try {
    const { deviceIds } = req.body;
    if (!Array.isArray(deviceIds)) { res.status(400).json(errorResponse("deviceIds array required")); return; }
    const status = await DeviceProvisioningService.getProvisioningStatus(deviceIds);
    res.json(successResponse(status));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── POST /api/provisioning/:deviceId/decommission — Decommission ──
router.post("/:deviceId/decommission", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { reason } = req.body;
    if (!reason) { res.status(400).json(errorResponse("Decommission reason required")); return; }
    const device = await DeviceProvisioningService.decommission(req.params.deviceId, reason, userId);
    res.json(successResponse(device, "Device decommissioned"));
  } catch (error: any) {
    const status = error.message.includes("not found") ? 404 : error.message.includes("Already") ? 400 : 500;
    res.status(status).json(errorResponse(error.message));
  }
});

export { router as provisioningRouter };
