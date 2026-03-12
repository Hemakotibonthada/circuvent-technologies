// ──────────────────────────────────────────────────────────────
// IoT Registry — Heartbeat Routes
// REST endpoints for heartbeat ingestion, offline detection,
// alert management, and health dashboard.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { HeartbeatService } from "../services/heartbeat.service";
import { DeviceCommandService } from "../services/device-command.service";

const router = Router();

// ── POST /api/heartbeat — Ingest device heartbeat ──
router.post("/", async (req: Request, res: Response) => {
  try {
    const result = await HeartbeatService.processHeartbeat(req.body);
    res.status(201).json({
      success: true,
      data: result,
      message: result.alerts.length > 0
        ? `Heartbeat stored. ${result.alerts.length} alert(s) triggered.`
        : "Heartbeat stored. Device healthy.",
    });
  } catch (error: any) {
    const status = error.message.includes("not found") ? 404 : error.message.includes("decommissioned") ? 400 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// ── GET /api/heartbeat/health — Health dashboard ──
router.get("/health", async (_req: Request, res: Response) => {
  try {
    const dashboard = await HeartbeatService.getHealthDashboard();
    res.json({ success: true, data: dashboard });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /api/heartbeat/detect-offline — Run offline detection scan ──
router.post("/detect-offline", async (_req: Request, res: Response) => {
  try {
    const result = await HeartbeatService.detectOfflineDevices();
    res.json({
      success: true,
      data: result,
      message: result.newlyOffline.length > 0
        ? `${result.newlyOffline.length} device(s) marked offline.`
        : "All monitored devices are online.",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /api/heartbeat/:deviceId/history — Heartbeat history ──
router.get("/:deviceId/history", async (req: Request, res: Response) => {
  try {
    const { hours, limit } = req.query;
    const history = await HeartbeatService.getHistory(req.params.deviceId, {
      hours: hours ? Number(hours) : 24,
      limit: limit ? Number(limit) : 200,
    });
    res.json({ success: true, data: history });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /api/heartbeat/:deviceId/alerts — Device alerts ──
router.get("/:deviceId/alerts", async (req: Request, res: Response) => {
  try {
    const { resolved, severity, limit } = req.query;
    const alerts = await HeartbeatService.getAlerts(req.params.deviceId, {
      resolved: resolved !== undefined ? resolved === "true" : undefined,
      severity: severity as string,
      limit: limit ? Number(limit) : 50,
    });
    res.json({ success: true, data: alerts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── PATCH /api/heartbeat/alerts/:alertId/resolve — Resolve alert ──
router.patch("/alerts/:alertId/resolve", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const alert = await HeartbeatService.resolveAlert(req.params.alertId, userId);
    res.json({ success: true, data: alert, message: "Alert resolved" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /api/heartbeat/commands — Send command to device ──
router.post("/commands", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const cmd = await DeviceCommandService.sendCommand({
      ...req.body,
      issuedById: userId,
    });
    res.status(201).json({ success: true, data: cmd, message: "Command queued" });
  } catch (error: any) {
    const status = error.message.includes("not found") ? 404
      : error.message.includes("Duplicate") ? 409
      : error.message.includes("not allowed") ? 400
      : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// ── PATCH /api/heartbeat/commands/:id/ack — Acknowledge/complete command ──
router.patch("/commands/:id/ack", async (req: Request, res: Response) => {
  try {
    const cmd = await DeviceCommandService.acknowledge({
      commandId: req.params.id,
      status: req.body.status,
      response: req.body.response,
    });
    res.json({ success: true, data: cmd, message: "Command acknowledged" });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── GET /api/heartbeat/commands/:deviceId — Device command history ──
router.get("/commands/:deviceId", async (req: Request, res: Response) => {
  try {
    const { status, limit } = req.query;
    const cmds = await DeviceCommandService.getDeviceCommands(req.params.deviceId, {
      status: status as string,
      limit: limit ? Number(limit) : 50,
    });
    res.json({ success: true, data: cmds });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export { router as heartbeatRouter };
