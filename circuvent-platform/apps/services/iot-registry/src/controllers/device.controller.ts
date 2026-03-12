// ──────────────────────────────────────────────────────────────
// IoT Device Controller — handles device CRUD with domain
// entity validation, firmware version checks, and fleet ops.
// ──────────────────────────────────────────────────────────────

import { Request, Response } from "express";
import { DeviceService, TelemetryService } from "../services";
import { DeviceEntity } from "../domain/device.entity";
import { registerDeviceSchema, updateDeviceSchema, firmwareUpdateSchema } from "../validators";
import { successResponse, errorResponse, normalizePagination, buildPaginationMeta } from "@circuvent/shared";

export class DeviceController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const pagination = normalizePagination(req.query);
      const { status, projectId } = req.query;
      const { data, total } = await DeviceService.list({
        ...pagination, status: status as string, projectId: projectId as string,
      });
      res.json(successResponse(data, undefined, buildPaginationMeta(total, pagination.page, pagination.limit)));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const device = await DeviceService.getById(req.params.id);
      if (!device) { res.status(404).json(errorResponse("Device not found")); return; }

      // Enrich with domain entity analysis
      const entity = new DeviceEntity({
        id: device.id, deviceCode: device.deviceCode, deviceName: device.deviceName,
        macAddress: device.macAddress, firmwareVersion: device.firmwareVersion,
        status: device.status, lastHeartbeat: device.lastHeartbeat,
        location: device.location, projectId: device.projectId,
      });

      res.json(successResponse({
        ...device,
        _analysis: {
          healthStatus: entity.getHealthStatus(),
          isHeartbeatStale: entity.isHeartbeatStale(),
          secondsSinceHeartbeat: entity.getSecondsSinceLastHeartbeat(),
          canReceiveCommand: entity.canReceiveCommand(),
        },
      }));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async register(req: Request, res: Response): Promise<void> {
    try {
      const parsed = registerDeviceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(errorResponse(parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ")));
        return;
      }
      const userId = (req as any).user?.userId;
      const device = await DeviceService.register(parsed.data, userId);
      res.status(201).json(successResponse(device, "Device registered"));
    } catch (error: any) {
      if (error?.code === "P2002") { res.status(409).json(errorResponse("MAC address already registered")); return; }
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateDeviceSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json(errorResponse(parsed.error.errors[0].message)); return; }

      // Validate status transition with domain entity
      if (parsed.data.status) {
        const existing = await DeviceService.getById(req.params.id);
        if (!existing) { res.status(404).json(errorResponse("Device not found")); return; }

        const entity = new DeviceEntity({
          id: existing.id, deviceCode: existing.deviceCode, deviceName: existing.deviceName,
          macAddress: existing.macAddress, firmwareVersion: existing.firmwareVersion,
          status: existing.status, lastHeartbeat: existing.lastHeartbeat,
          location: existing.location, projectId: existing.projectId,
        });

        if (!entity.canTransitionTo(parsed.data.status as any)) {
          res.status(400).json(errorResponse(
            `Invalid device status transition: ${existing.status} → ${parsed.data.status}`
          ));
          return;
        }
      }

      const userId = (req as any).user?.userId;
      const device = await DeviceService.update(req.params.id, parsed.data, userId);
      res.json(successResponse(device, "Device updated"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async updateFirmware(req: Request, res: Response): Promise<void> {
    try {
      const parsed = firmwareUpdateSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json(errorResponse(parsed.error.errors[0].message)); return; }

      // Validate firmware update with domain entity
      const existing = await DeviceService.getById(req.params.id);
      if (!existing) { res.status(404).json(errorResponse("Device not found")); return; }

      const entity = new DeviceEntity({
        id: existing.id, deviceCode: existing.deviceCode, deviceName: existing.deviceName,
        macAddress: existing.macAddress, firmwareVersion: existing.firmwareVersion,
        status: existing.status, lastHeartbeat: existing.lastHeartbeat,
        location: existing.location, projectId: existing.projectId,
      });

      const fwCheck = entity.canUpdateFirmware(parsed.data.toVersion);
      if (!fwCheck.allowed) {
        res.status(400).json(errorResponse(fwCheck.reason!));
        return;
      }

      const userId = (req as any).user?.userId;
      const update = await DeviceService.updateFirmware(req.params.id, parsed.data.toVersion, parsed.data.notes, userId);
      res.status(201).json(successResponse(update, "Firmware updated"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const dashboard = await DeviceService.getDashboard();
      res.json(successResponse(dashboard));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.userId;
      await DeviceService.delete(req.params.id, userId);
      res.json(successResponse(null, "Device deleted"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }
}

// ── Telemetry Controller ──

export class TelemetryController {
  static async ingest(req: Request, res: Response): Promise<void> {
    try {
      const { deviceId, payload, logLevel } = req.body;
      if (!deviceId || !payload) { res.status(400).json(errorResponse("deviceId and payload required")); return; }
      const log = await TelemetryService.ingest(deviceId, payload, logLevel || "INFO");
      res.status(201).json(successResponse(log));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async batchIngest(req: Request, res: Response): Promise<void> {
    try {
      const { entries } = req.body;
      if (!entries || !Array.isArray(entries) || entries.length === 0) {
        res.status(400).json(errorResponse("entries array required")); return;
      }
      if (entries.length > 100) { res.status(400).json(errorResponse("Max 100 entries per batch")); return; }
      const result = await TelemetryService.batchIngest(entries);
      res.status(201).json(successResponse(result, `${result.inserted} entries ingested`));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async query(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, logLevel, limit } = req.query;
      const logs = await TelemetryService.query(req.params.deviceId, {
        startDate: startDate as string, endDate: endDate as string,
        logLevel: logLevel as string, limit: limit ? Number(limit) : undefined,
      });
      res.json(successResponse(logs));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }
}
