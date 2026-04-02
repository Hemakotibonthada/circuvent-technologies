// ──────────────────────────────────────────────────────────────
// Employee Portal — Performance Review Routes
// Self-assessments, manager reviews, ratings, history
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

// ── GET / — List reviews (filter by employeeId, status, cycle) ──
router.get("/", async (req: Request, res: Response) => {
  try {
    const { employeeId, status, cycle, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;
    if (cycle) where.cycle = cycle;

    const [reviews, total] = await Promise.all([
      prisma.performanceReview.findMany({
        where,
        include: { employee: { include: { user: { select: { firstName: true, lastName: true, department: true } } } } },
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.performanceReview.count({ where }),
    ]);
    res.json(successResponse(reviews, undefined, { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── POST / — Create a new review ──
router.post("/", async (req: Request, res: Response) => {
  try {
    const { employeeId, reviewerId, cycle, period } = req.body;
    if (!employeeId || !reviewerId || !cycle || !period) {
      res.status(400).json(errorResponse("employeeId, reviewerId, cycle, and period required"));
      return;
    }
    const review = await prisma.performanceReview.create({
      data: { employeeId, reviewerId, cycle, period, status: "DRAFT" },
    });
    res.status(201).json(successResponse(review, "Performance review created"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /:id — Get review details ──
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const review = await prisma.performanceReview.findUnique({
      where: { id: req.params.id },
      include: { employee: { include: { user: { select: { firstName: true, lastName: true, email: true, department: true } } } } },
    });
    if (!review) { res.status(404).json(errorResponse("Review not found")); return; }
    res.json(successResponse(review));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── PATCH /:id/self-review — Submit self-assessment ──
router.patch("/:id/self-review", async (req: Request, res: Response) => {
  try {
    const { selfAssessment, technicalRating, communicationRating, leadershipRating, initiativeRating } = req.body;
    const review = await prisma.performanceReview.update({
      where: { id: req.params.id },
      data: {
        selfAssessment, technicalRating, communicationRating, leadershipRating, initiativeRating,
        status: "SELF_REVIEW",
      },
    });
    res.json(successResponse(review, "Self-assessment submitted"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── PATCH /:id/manager-review — Manager review ──
router.patch("/:id/manager-review", async (req: Request, res: Response) => {
  try {
    const { managerComments, strengths, areasOfImprovement, technicalRating, communicationRating,
      leadershipRating, initiativeRating, promotionRecommended, salaryHikePercent } = req.body;

    const ratings = [technicalRating, communicationRating, leadershipRating, initiativeRating].filter(Boolean);
    const overallRating = ratings.length > 0 ? Number((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length).toFixed(2)) : null;

    const review = await prisma.performanceReview.update({
      where: { id: req.params.id },
      data: {
        managerComments, strengths, areasOfImprovement,
        technicalRating, communicationRating, leadershipRating, initiativeRating,
        overallRating, promotionRecommended, salaryHikePercent,
        status: "MANAGER_REVIEW",
      },
    });
    res.json(successResponse(review, "Manager review submitted"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── PATCH /:id/complete — Complete review ──
router.patch("/:id/complete", async (req: Request, res: Response) => {
  try {
    const { hrComments } = req.body;
    const review = await prisma.performanceReview.update({
      where: { id: req.params.id },
      data: { hrComments, status: "COMPLETED", completedAt: new Date() },
    });
    res.json(successResponse(review, "Review completed"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── PATCH /:id/acknowledge — Employee acknowledges ──
router.patch("/:id/acknowledge", async (req: Request, res: Response) => {
  try {
    const review = await prisma.performanceReview.update({
      where: { id: req.params.id },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() },
    });
    res.json(successResponse(review, "Review acknowledged"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /dashboard/stats — Performance dashboard ──
router.get("/dashboard/stats", async (_req: Request, res: Response) => {
  try {
    const [total, completed, pending, avgRating] = await Promise.all([
      prisma.performanceReview.count(),
      prisma.performanceReview.count({ where: { status: { in: ["COMPLETED", "ACKNOWLEDGED"] } } }),
      prisma.performanceReview.count({ where: { status: { in: ["DRAFT", "SELF_REVIEW", "MANAGER_REVIEW"] } } }),
      prisma.performanceReview.aggregate({ _avg: { overallRating: true }, where: { status: "COMPLETED" } }),
    ]);
    res.json(successResponse({ total, completed, pending, avgRating: avgRating._avg.overallRating || 0 }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

export { router as performanceRouter };
