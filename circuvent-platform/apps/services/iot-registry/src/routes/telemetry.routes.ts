// ──────────────────────────────────────────────────────────────
// Enhanced Telemetry Routes — ingest + batch + query
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { HTTP_STATUS, successResponse, errorResponse } from "@circuvent/shared";
import { TelemetryService } from "../services";
import { telemetrySchema, batchTelemetrySchema } from "../validators";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = telemetrySchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const log = await TelemetryService.ingest(parsed.data.deviceId, parsed.data.payload, parsed.data.logLevel);
    res.status(HTTP_STATUS.CREATED).json(successResponse(log));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to ingest telemetry"));
  }
});

router.post("/batch", async (req: Request, res: Response) => {
  try {
    const parsed = batchTelemetrySchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const result = await TelemetryService.batchIngest(parsed.data.entries);
    res.status(HTTP_STATUS.CREATED).json(successResponse(result, `${result.inserted} entries ingested`));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Batch ingest failed"));
  }
});

router.get("/:deviceId", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, logLevel, limit } = req.query;
    const logs = await TelemetryService.query(req.params.deviceId, {
      startDate: startDate as string,
      endDate: endDate as string,
      logLevel: logLevel as string,
      limit: limit ? Number(limit) : undefined,
    });
    res.json(successResponse(logs));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to query telemetry"));
  }
});

export { router as telemetryRouter };
