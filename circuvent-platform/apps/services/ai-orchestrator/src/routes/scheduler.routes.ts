// ──────────────────────────────────────────────────────────────
// AI Orchestrator — Scheduler Routes
// REST endpoints for resource scheduling, queue management,
// force allocation, and queue processing.
// ──────────────────────────────────────────────────────────────

import { Router } from "express";
import { ResourceController } from "../controllers/resource.controller";

const router = Router();

// ── POST /api/scheduler/schedule — Request resource allocation ──
router.post("/schedule", ResourceController.schedule);

// ── POST /api/scheduler/force — Force-allocate with preemption ──
router.post("/force", ResourceController.forceAllocate);

// ── POST /api/scheduler/process-queue — Process job queue ──
router.post("/process-queue", ResourceController.processQueue);

// ── GET /api/scheduler/queue — Queue status ──
router.get("/queue", ResourceController.getQueueStatus);

export { router as schedulerRouter };
