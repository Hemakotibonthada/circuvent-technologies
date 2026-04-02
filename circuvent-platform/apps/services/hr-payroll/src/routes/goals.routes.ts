// ──────────────────────────────────────────────────────────────
// Employee Portal — Goals & OKRs Routes
// Create, track, update goals and key results
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

// ── GET / — List goals ──
router.get("/", async (req: Request, res: Response) => {
  try {
    const { employeeId, status, quarter, category } = req.query;
    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;
    if (quarter) where.quarter = quarter;
    if (category) where.category = category;

    const goals = await prisma.goal.findMany({
      where,
      include: { employee: { include: { user: { select: { firstName: true, lastName: true } } } } },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
    res.json(successResponse(goals));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── POST / — Create goal ──
router.post("/", async (req: Request, res: Response) => {
  try {
    const { employeeId, title, description, category, priority, targetDate, quarter, keyResults } = req.body;
    if (!employeeId || !title) {
      res.status(400).json(errorResponse("employeeId and title required"));
      return;
    }
    const goal = await prisma.goal.create({
      data: {
        employeeId, title, description, category: category || "PROFESSIONAL",
        priority: priority || "MEDIUM", targetDate: targetDate ? new Date(targetDate) : null,
        quarter, keyResults: keyResults || [],
      },
    });
    res.status(201).json(successResponse(goal, "Goal created"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── PATCH /:id — Update goal ──
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { title, description, status, progress, priority, targetDate, keyResults, managerNotes } = req.body;
    const data: any = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;
    if (progress !== undefined) data.progress = Math.min(100, Math.max(0, progress));
    if (priority !== undefined) data.priority = priority;
    if (targetDate !== undefined) data.targetDate = targetDate ? new Date(targetDate) : null;
    if (keyResults !== undefined) data.keyResults = keyResults;
    if (managerNotes !== undefined) data.managerNotes = managerNotes;
    if (status === "COMPLETED") data.completedAt = new Date();

    const goal = await prisma.goal.update({ where: { id: req.params.id }, data });
    res.json(successResponse(goal, "Goal updated"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── DELETE /:id — Delete goal ──
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.goal.delete({ where: { id: req.params.id } });
    res.json(successResponse(null, "Goal deleted"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /dashboard/stats — Goals dashboard ──
router.get("/dashboard/stats", async (req: Request, res: Response) => {
  try {
    const { employeeId, quarter } = req.query;
    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (quarter) where.quarter = quarter;

    const [total, completed, inProgress, notStarted, avgProgress] = await Promise.all([
      prisma.goal.count({ where }),
      prisma.goal.count({ where: { ...where, status: "COMPLETED" } }),
      prisma.goal.count({ where: { ...where, status: "IN_PROGRESS" } }),
      prisma.goal.count({ where: { ...where, status: "NOT_STARTED" } }),
      prisma.goal.aggregate({ _avg: { progress: true }, where }),
    ]);
    res.json(successResponse({
      total, completed, inProgress, notStarted,
      avgProgress: avgProgress._avg.progress || 0,
      completionRate: total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0,
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

export { router as goalsRouter };
