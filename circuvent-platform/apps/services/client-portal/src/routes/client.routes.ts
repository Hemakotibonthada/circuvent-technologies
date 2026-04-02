// ──────────────────────────────────────────────────────────────
// Enhanced Client Routes
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { HTTP_STATUS, successResponse, errorResponse } from "@circuvent/shared";
import { ClientService } from "../services";
import { createClientSchema } from "../validators";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const clients = await ClientService.list();
    res.json(successResponse(clients));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch clients"));
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const client = await ClientService.getById(req.params.id);
    if (!client) { res.status(HTTP_STATUS.NOT_FOUND).json(errorResponse("Client not found")); return; }
    res.json(successResponse(client));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch client"));
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = createClientSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const actorId = (req as any).user?.userId;
    const client = await ClientService.create(parsed.data, actorId);
    res.status(HTTP_STATUS.CREATED).json(successResponse(client, "Client created"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse(error.message || "Failed to create client"));
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).user?.userId;
    const client = await ClientService.update(req.params.id, req.body, actorId);
    res.json(successResponse(client, "Client updated"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to update client"));
  }
});

export { router as clientRouter };
