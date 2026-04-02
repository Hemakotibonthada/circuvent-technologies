// ══════════════════════════════════════════════════════════════════════════════
// ATS Engine — Application Routes
// Apply to jobs, stage transitions, scoring, timeline tracking.
// ══════════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";
import { HiringStageVO } from "../../domain/value-objects/hiring-stage.vo";
import { ResumeScorerService } from "../../domain/services/resume-scorer.service";

const router = Router();
const scorer = new ResumeScorerService();

/** GET / — List applications (filterable by status, job, candidate) */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { status, jobId, candidateId, assignedTo, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (jobId) where.jobId = jobId;
    if (candidateId) where.candidateId = candidateId;
    if (assignedTo) where.assignedReviewerId = assignedTo;

    const [apps, total] = await Promise.all([
      prisma.application.findMany({
        where,
        include: {
          candidate: { select: { firstName: true, lastName: true, email: true, candidateCode: true, resumeScore: true, tags: true } },
          job: { select: { title: true, jobCode: true, division: true } },
          _count: { select: { reviews: true, interviews: true } },
        },
        orderBy: { appliedAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.application.count({ where }),
    ]);
    res.json(successResponse(apps, undefined, { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) }));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** POST / — Apply to a job */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { jobId, candidateId, coverLetter } = req.body;
    if (!jobId || !candidateId) { res.status(400).json(errorResponse("jobId and candidateId required")); return; }

    // Check job is open
    const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
    if (!job) { res.status(404).json(errorResponse("Job not found")); return; }
    if (job.status !== "OPEN") { res.status(400).json(errorResponse("Job is not open for applications")); return; }

    // Check duplicate application
    const existing = await prisma.application.findUnique({ where: { jobId_candidateId: { jobId, candidateId } } });
    if (existing) { res.status(409).json(errorResponse("Already applied to this job")); return; }

    // Get candidate for scoring
    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) { res.status(404).json(errorResponse("Candidate not found")); return; }

    // Auto-score
    const scoreResult = scorer.score(
      { title: job.title, requiredSkills: job.skills, niceToHaveSkills: job.niceToHave, experienceMin: job.experienceMin, experienceMax: job.experienceMax, division: job.division, description: job.description },
      { skills: candidate.skills, experienceYears: Number(candidate.experienceYears), currentRole: candidate.currentRole, education: candidate.education as any, resumeText: candidate.resumeText, portfolioUrl: candidate.portfolioUrl, githubUrl: candidate.githubUrl }
    );

    const count = await prisma.application.count();
    const applicationCode = `APP-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    const application = await prisma.application.create({
      data: {
        applicationCode, jobId, candidateId,
        coverLetter: coverLetter || null,
        matchScore: scoreResult.totalScore,
        skillMatchPct: scoreResult.skillMatchScore,
        experienceMatch: scoreResult.experienceScore,
        status: "APPLIED",
        timeline: { create: { fromStatus: "NEW", toStatus: "APPLIED", changedBy: candidateId, notes: `Auto-scored: ${scoreResult.totalScore}/100` } },
      },
      include: { candidate: { select: { firstName: true, lastName: true } }, job: { select: { title: true, jobCode: true } } },
    });

    // Update candidate ATS score
    await prisma.candidate.update({ where: { id: candidateId }, data: { resumeScore: scoreResult.totalScore, tags: { set: [...new Set([...candidate.tags, ...scoreResult.suggestedTags])] } } });

    res.status(201).json(successResponse({ application, score: scoreResult }, `Application ${applicationCode} submitted (Score: ${scoreResult.totalScore}/100)`));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** PATCH /:id/stage — Transition application to a new hiring stage */
router.patch("/:id/stage", async (req: Request, res: Response) => {
  try {
    const { newStatus, notes, rejectionReason } = req.body;
    if (!newStatus) { res.status(400).json(errorResponse("newStatus required")); return; }

    const app = await prisma.application.findUnique({ where: { id: req.params.id } });
    if (!app) { res.status(404).json(errorResponse("Application not found")); return; }

    // Validate transition using domain state machine
    const currentStage = HiringStageVO.of(app.status);
    try {
      currentStage.transitionTo(newStatus);
    } catch (err: any) {
      res.status(422).json(errorResponse(err.message)); return;
    }

    const changedBy = (req as any).user?.userId || "system";
    const data: any = { status: newStatus };
    if (newStatus === "SCREENING") data.screenedAt = new Date();
    if (newStatus === "SHORTLISTED") data.shortlistedAt = new Date();
    if (newStatus === "OFFER_EXTENDED") data.offeredAt = new Date();
    if (newStatus === "HIRED") data.hiredAt = new Date();
    if (newStatus === "REJECTED") { data.rejectedAt = new Date(); data.rejectionReason = rejectionReason || null; }

    const updated = await prisma.application.update({
      where: { id: req.params.id },
      data,
    });

    // Record timeline
    await prisma.applicationTimeline.create({
      data: { applicationId: req.params.id, fromStatus: app.status, toStatus: newStatus, changedBy, notes: notes || null },
    });

    // If HIRED, increment job.filled count
    if (newStatus === "HIRED") {
      await prisma.jobPosting.update({ where: { id: app.jobId }, data: { filled: { increment: 1 } } });
    }

    res.json(successResponse(updated, `Application moved to ${newStatus}`));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** GET /:id/timeline — Application timeline */
router.get("/:id/timeline", async (req: Request, res: Response) => {
  try {
    const timeline = await prisma.applicationTimeline.findMany({
      where: { applicationId: req.params.id },
      orderBy: { createdAt: "asc" },
    });
    res.json(successResponse(timeline));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** GET /pipeline — Pipeline view (count by stage) */
router.get("/pipeline/summary", async (req: Request, res: Response) => {
  try {
    const { jobId } = req.query;
    const where: any = {};
    if (jobId) where.jobId = jobId;

    const pipeline = await prisma.application.groupBy({
      by: ["status"],
      _count: true,
      where,
    });
    const result = pipeline.map(p => ({ stage: p.status, count: p._count }));
    res.json(successResponse(result));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

export { router as applicationRoutes };
