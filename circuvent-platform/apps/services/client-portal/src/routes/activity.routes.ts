// ──────────────────────────────────────────────────────────────
// Client Portal — CRM Activity Routes
// REST endpoints for lead activities, follow-ups,
// conversions, and activity analytics.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { CRMActivityService } from "../services/crm-activity.service";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

// ── POST /api/activities/:leadId — Add activity to lead ──
router.post("/:leadId", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const activity = await CRMActivityService.addActivity({
      ...req.body,
      leadId: req.params.leadId,
      createdById: userId,
    });
    res.status(201).json(successResponse(activity, "Activity added"));
  } catch (error: any) {
    res.status(error.message.includes("not found") ? 404 : 500).json(errorResponse(error.message));
  }
});

// ── GET /api/activities/:leadId/timeline — Lead activity timeline ──
router.get("/:leadId/timeline", async (req: Request, res: Response) => {
  try {
    const timeline = await CRMActivityService.getTimeline(req.params.leadId);
    res.json(successResponse(timeline));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /api/activities/upcoming — Upcoming activities ──
router.get("/upcoming", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const activities = await CRMActivityService.getUpcomingActivities(userId);
    res.json(successResponse(activities));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /api/activities/overdue — Overdue activities ──
router.get("/overdue", async (req: Request, res: Response) => {
  try {
    const overdue = await CRMActivityService.getOverdueActivities();
    res.json(successResponse(overdue));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── PATCH /api/activities/:activityId/complete — Complete activity ──
router.patch("/:activityId/complete", async (req: Request, res: Response) => {
  try {
    const activity = await CRMActivityService.completeActivity(req.params.activityId, req.body.outcome);
    res.json(successResponse(activity, "Activity completed"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── POST /api/activities/:leadId/follow-up — Schedule follow-up ──
router.post("/:leadId/follow-up", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { daysFromNow, title } = req.body;
    const activity = await CRMActivityService.scheduleFollowUp(
      req.params.leadId,
      daysFromNow || 7,
      title || "Follow-up",
      userId,
    );
    res.status(201).json(successResponse(activity, "Follow-up scheduled"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── POST /api/activities/:leadId/convert — Convert lead to won ──
router.post("/:leadId/convert", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const result = await CRMActivityService.convertLead(req.params.leadId, {
      ...req.body,
      actorId: userId,
    });
    res.json(successResponse(result, "Lead converted to WON"));
  } catch (error: any) {
    const status = error.message.includes("not found") ? 404 : error.message.includes("already") ? 400 : 500;
    res.status(status).json(errorResponse(error.message));
  }
});

// ── GET /api/activities/analytics — Activity analytics ──
router.get("/analytics", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();
    const analytics = await CRMActivityService.getActivityAnalytics(start, end);
    res.json(successResponse(analytics));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

export { router as activityRouter };
