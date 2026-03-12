// ══════════════════════════════════════════════════════════════════════════════
// ATS Engine — Interview & Review Routes
// Schedule interviews, submit reviews/scores, reviewer workload tracking.
// ══════════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

/** GET / — List interviews */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { interviewerId, status, applicationId, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (interviewerId) where.interviewerId = interviewerId;
    if (status) where.status = status;
    if (applicationId) where.applicationId = applicationId;

    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
        where,
        include: {
          application: { include: { candidate: { select: { firstName: true, lastName: true, email: true } } } },
          job: { select: { title: true, jobCode: true } },
          review: true,
        },
        orderBy: { scheduledAt: "asc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.interview.count({ where }),
    ]);
    res.json(successResponse(interviews, undefined, { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) }));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** POST / — Schedule an interview */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { applicationId, interviewerId, roundNumber, roundType, scheduledAt, durationMinutes, meetingLink, location } = req.body;
    if (!applicationId || !interviewerId || !roundType || !scheduledAt) {
      res.status(400).json(errorResponse("applicationId, interviewerId, roundType, scheduledAt required")); return;
    }

    const app = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!app) { res.status(404).json(errorResponse("Application not found")); return; }

    const interview = await prisma.interview.create({
      data: {
        applicationId, jobId: app.jobId, interviewerId,
        roundNumber: roundNumber || 1, roundType,
        scheduledAt: new Date(scheduledAt),
        durationMinutes: durationMinutes || 60,
        meetingLink: meetingLink || null,
        location: location || null,
      },
      include: { application: { include: { candidate: { select: { firstName: true, lastName: true } } } } },
    });
    res.status(201).json(successResponse(interview, "Interview scheduled"));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** PATCH /:id/complete — Mark interview as completed */
router.patch("/:id/complete", async (req: Request, res: Response) => {
  try {
    const interview = await prisma.interview.update({
      where: { id: req.params.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    res.json(successResponse(interview, "Interview marked complete"));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** POST /:id/review — Submit interview review (thumbs up/down + scores) */
router.post("/:id/review", async (req: Request, res: Response) => {
  try {
    const { decision, technicalScore, communicationScore, cultureFitScore, problemSolvingScore,
      strengths, weaknesses, notes, recommendation, isConfidential } = req.body;
    if (!decision) { res.status(400).json(errorResponse("decision required (STRONG_YES, YES, MAYBE, NO, STRONG_NO)")); return; }

    const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
    if (!interview) { res.status(404).json(errorResponse("Interview not found")); return; }

    const reviewerId = (req as any).user?.userId || interview.interviewerId;
    const scores = [technicalScore, communicationScore, cultureFitScore, problemSolvingScore].filter(Boolean);
    const overallScore = scores.length > 0 ? Number((scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(2)) : null;

    const review = await prisma.interviewReview.create({
      data: {
        interviewId: req.params.id, applicationId: interview.applicationId,
        reviewerId, decision, technicalScore, communicationScore,
        cultureFitScore, problemSolvingScore, overallScore,
        strengths: strengths || null, weaknesses: weaknesses || null,
        notes: notes || null, recommendation: recommendation || null,
        isConfidential: isConfidential || false,
      },
    });

    // Update interview status
    await prisma.interview.update({ where: { id: req.params.id }, data: { status: "COMPLETED", completedAt: new Date() } });

    res.status(201).json(successResponse(review, `Review submitted: ${decision}`));
  } catch (error: any) {
    if ((error as any).code === "P2002") { res.status(409).json(errorResponse("Review already submitted for this interview")); return; }
    res.status(500).json(errorResponse(error.message));
  }
});

/** GET /reviews/:applicationId — All reviews for an application */
router.get("/reviews/:applicationId", async (req: Request, res: Response) => {
  try {
    const reviews = await prisma.interviewReview.findMany({
      where: { applicationId: req.params.applicationId },
      include: { interview: { select: { roundType: true, roundNumber: true, scheduledAt: true } } },
      orderBy: { submittedAt: "asc" },
    });
    const avgScore = reviews.length > 0
      ? Number((reviews.reduce((s, r) => s + Number(r.overallScore || 0), 0) / reviews.length).toFixed(2))
      : 0;
    const decisions = reviews.map(r => r.decision);
    const recommendation = decisions.filter(d => d === "STRONG_YES" || d === "YES").length > decisions.length / 2 ? "PROCEED" : "HOLD";

    res.json(successResponse({ reviews, avgScore, totalReviews: reviews.length, overallRecommendation: recommendation }));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** PATCH /:id/cancel — Cancel interview */
router.patch("/:id/cancel", async (req: Request, res: Response) => {
  try {
    const interview = await prisma.interview.update({
      where: { id: req.params.id },
      data: { status: "CANCELLED" },
    });
    res.json(successResponse(interview, "Interview cancelled"));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

export { router as interviewRoutes };
