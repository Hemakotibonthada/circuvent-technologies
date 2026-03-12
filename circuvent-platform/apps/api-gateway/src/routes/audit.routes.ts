// ──────────────────────────────────────────────────────────────
// Audit Routes (served from gateway)
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { queryAuditLogs } from "@circuvent/audit";
import { authenticate, authorize } from "@circuvent/auth";
import { HTTP_STATUS, Role } from "@circuvent/shared";

const router = Router();

router.use(authenticate);

router.get("/", authorize(Role.ADMIN), async (req: Request, res: Response) => {
  try {
    const { userId, entity, action, startDate, endDate, page, limit } = req.query;
    const result = await queryAuditLogs({
      userId: userId as string,
      entity: entity as string,
      action: action as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("[AUDIT] Query error:", error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: "Failed to query audit logs" });
  }
});

export { router as auditRouter };
