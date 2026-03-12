// ──────────────────────────────────────────────────────────────
// IoT Registry — Firmware Management Routes
// REST endpoints for firmware updates, fleet rollouts,
// version distribution, and OTA management.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { FirmwareService } from "../services/firmware.service";
import { firmwareUpdateSchemaV2 } from "../validators/iot.validators.v2";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

// ── POST /api/firmware/:deviceId — Update single device ──
router.post("/:deviceId", async (req: Request, res: Response) => {
  try {
    const parsed = firmwareUpdateSchemaV2.safeParse(req.body);
    if (!parsed.success) { res.status(400).json(errorResponse(parsed.error.errors[0].message)); return; }

    const userId = (req as any).user?.userId;
    const update = await FirmwareService.updateSingle({
      deviceId: req.params.deviceId,
      targetVersion: parsed.data.toVersion,
      notes: parsed.data.notes,
      forceUpdate: parsed.data.forceUpdate,
      rollbackVersion: parsed.data.rollbackVersion,
      issuedById: userId,
    });
    res.status(201).json(successResponse(update, "Firmware update initiated"));
  } catch (error: any) {
    const status = error.message.includes("not found") ? 404
      : error.message.includes("decommissioned") || error.message.includes("pending") ? 400
      : error.message.includes("downgrade") ? 400 : 500;
    res.status(status).json(errorResponse(error.message));
  }
});

// ── POST /api/firmware/rollout — Fleet-wide rollout ──
router.post("/rollout", async (req: Request, res: Response) => {
  try {
    const { targetVersion, deviceIds, notes } = req.body;
    if (!targetVersion || !deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      res.status(400).json(errorResponse("targetVersion and deviceIds[] required"));
      return;
    }

    const userId = (req as any).user?.userId;
    const result = await FirmwareService.rollout({
      targetVersion, deviceIds, notes, issuedById: userId,
    });
    res.json(successResponse(result,
      `Rollout: ${result.initiated} initiated, ${result.skipped.length} skipped, ${result.errors.length} errors`
    ));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /api/firmware/distribution — Firmware version distribution ──
router.get("/distribution", async (_req: Request, res: Response) => {
  try {
    const dist = await FirmwareService.getFirmwareDistribution();
    res.json(successResponse(dist));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /api/firmware/pending — Pending firmware updates ──
router.get("/pending", async (_req: Request, res: Response) => {
  try {
    const pending = await FirmwareService.getPendingUpdates();
    res.json(successResponse(pending));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /api/firmware/:deviceId/history — Device firmware history ──
router.get("/:deviceId/history", async (req: Request, res: Response) => {
  try {
    const history = await FirmwareService.getDeviceHistory(req.params.deviceId);
    res.json(successResponse(history));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── POST /api/firmware/updates/:updateId/complete — Complete firmware update ──
router.post("/updates/:updateId/complete", async (req: Request, res: Response) => {
  try {
    const { success: isSuccess, errorMessage } = req.body;
    const result = await FirmwareService.completeUpdate(req.params.updateId, isSuccess !== false, errorMessage);
    res.json(successResponse(result, isSuccess !== false ? "Firmware updated successfully" : "Firmware update failed"));
  } catch (error: any) {
    res.status(error.message.includes("not found") ? 404 : 500).json(errorResponse(error.message));
  }
});

// ── DELETE /api/firmware/updates/:updateId — Cancel pending update ──
router.delete("/updates/:updateId", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const result = await FirmwareService.cancelUpdate(req.params.updateId, userId);
    res.json(successResponse(result, "Firmware update cancelled"));
  } catch (error: any) {
    const status = error.message.includes("not found") ? 404 : error.message.includes("Only pending") ? 400 : 500;
    res.status(status).json(errorResponse(error.message));
  }
});

export { router as firmwareRouter };
