// ──────────────────────────────────────────────────────────────
// Enhanced Device Routes — full CRUD with validation + dashboard
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { HTTP_STATUS, successResponse, errorResponse, normalizePagination, buildPaginationMeta } from "@circuvent/shared";
import { DeviceService } from "../services";
import { registerDeviceSchema, updateDeviceSchema, firmwareUpdateSchema } from "../validators";

const router = Router();

router.get("/dashboard/summary", async (_req: Request, res: Response) => {
  try {
    const dashboard = await DeviceService.getDashboard();
    res.json(successResponse(dashboard));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch dashboard"));
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const pagination = normalizePagination(req.query);
    const { status, projectId } = req.query;
    const { data, total } = await DeviceService.list({ ...pagination, status: status as string, projectId: projectId as string });
    res.json(successResponse(data, undefined, buildPaginationMeta(total, pagination.page, pagination.limit)));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch devices"));
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const device = await DeviceService.getById(req.params.id);
    if (!device) { res.status(HTTP_STATUS.NOT_FOUND).json(errorResponse("Device not found")); return; }
    res.json(successResponse(device));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch device"));
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = registerDeviceSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const userId = (req as any).user?.userId;
    const device = await DeviceService.register(parsed.data, userId);
    res.status(HTTP_STATUS.CREATED).json(successResponse(device, "Device registered"));
  } catch (error: any) {
    if (error?.code === "P2002") { res.status(HTTP_STATUS.CONFLICT).json(errorResponse("MAC address already registered")); return; }
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse(error.message || "Failed to register device"));
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const parsed = updateDeviceSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const userId = (req as any).user?.userId;
    const device = await DeviceService.update(req.params.id, parsed.data, userId);
    res.json(successResponse(device, "Device updated"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to update device"));
  }
});

router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const userId = (req as any).user?.userId;
    const device = await DeviceService.update(req.params.id, { status }, userId);
    res.json(successResponse(device, "Status updated"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to update status"));
  }
});

router.post("/:id/firmware", async (req: Request, res: Response) => {
  try {
    const parsed = firmwareUpdateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const userId = (req as any).user?.userId;
    const update = await DeviceService.updateFirmware(req.params.id, parsed.data.toVersion, parsed.data.notes, userId);
    res.status(HTTP_STATUS.CREATED).json(successResponse(update, "Firmware updated"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse(error.message || "Failed to update firmware"));
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    await DeviceService.delete(req.params.id, userId);
    res.json(successResponse(null, "Device deleted"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to delete device"));
  }
});

export { router as deviceRouter };
