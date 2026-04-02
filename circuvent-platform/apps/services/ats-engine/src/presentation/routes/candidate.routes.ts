// ══════════════════════════════════════════════════════════════════════════════
// ATS Engine — Candidate Routes
// Candidate registration, profile management, resume scoring, search.
// ══════════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";
import { ResumeScorerService } from "../../domain/services/resume-scorer.service";

const router = Router();
const scorer = new ResumeScorerService();

/** GET / — Search/list candidates */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { search, source, skills, minExp, maxExp, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (source) where.source = source;
    if (minExp) where.experienceYears = { ...where.experienceYears, gte: Number(minExp) };
    if (maxExp) where.experienceYears = { ...where.experienceYears, lte: Number(maxExp) };
    if (skills) where.skills = { hasSome: (skills as string).split(",") };
    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: "insensitive" } },
        { lastName: { contains: search as string, mode: "insensitive" } },
        { email: { contains: search as string, mode: "insensitive" } },
        { candidateCode: { contains: search as string, mode: "insensitive" } },
        { currentRole: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        include: { _count: { select: { applications: true, poolMemberships: true } } },
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.candidate.count({ where }),
    ]);
    res.json(successResponse(candidates, undefined, { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) }));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** GET /:id — Candidate profile with application history */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const candidate = await prisma.candidate.findUnique({
      where: { id: req.params.id },
      include: {
        applications: { include: { job: { select: { title: true, jobCode: true, division: true } }, reviews: true }, orderBy: { appliedAt: "desc" } },
        poolMemberships: { include: { pool: { select: { name: true, category: true } } } },
      },
    });
    if (!candidate) { res.status(404).json(errorResponse("Candidate not found")); return; }
    res.json(successResponse(candidate));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** POST / — Register a new candidate */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, phone, linkedinUrl, portfolioUrl, githubUrl,
      currentCompany, currentRole, experienceYears, location, noticePeriod,
      currentCTC, expectedCTC, source, referredBy, skills, education, resumeText } = req.body;
    if (!firstName || !lastName || !email) {
      res.status(400).json(errorResponse("firstName, lastName, email required")); return;
    }

    // Check duplicate
    const existing = await prisma.candidate.findUnique({ where: { email } });
    if (existing) { res.status(409).json(errorResponse(`Candidate with email '${email}' already exists (${existing.candidateCode})`)); return; }

    const count = await prisma.candidate.count();
    const candidateCode = `CAN-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    const candidate = await prisma.candidate.create({
      data: {
        candidateCode, firstName, lastName, email,
        phone: phone || null, linkedinUrl: linkedinUrl || null,
        portfolioUrl: portfolioUrl || null, githubUrl: githubUrl || null,
        currentCompany: currentCompany || null, currentRole: currentRole || null,
        experienceYears: experienceYears || 0, location: location || null,
        noticePeriod: noticePeriod || null, currentCTC: currentCTC || null,
        expectedCTC: expectedCTC || null, source: source || "WEBSITE",
        referredBy: referredBy || null, skills: skills || [],
        education: education || null, resumeText: resumeText || null,
        tags: [],
      },
    });
    res.status(201).json(successResponse(candidate, `Candidate ${candidateCode} registered`));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** POST /:id/score — Score a candidate against a specific job */
router.post("/:id/score", async (req: Request, res: Response) => {
  try {
    const { jobId } = req.body;
    if (!jobId) { res.status(400).json(errorResponse("jobId required")); return; }

    const [candidate, job] = await Promise.all([
      prisma.candidate.findUnique({ where: { id: req.params.id } }),
      prisma.jobPosting.findUnique({ where: { id: jobId } }),
    ]);
    if (!candidate) { res.status(404).json(errorResponse("Candidate not found")); return; }
    if (!job) { res.status(404).json(errorResponse("Job not found")); return; }

    const result = scorer.score(
      {
        title: job.title, requiredSkills: job.skills, niceToHaveSkills: job.niceToHave,
        experienceMin: job.experienceMin, experienceMax: job.experienceMax,
        division: job.division, description: job.description,
      },
      {
        skills: candidate.skills, experienceYears: Number(candidate.experienceYears),
        currentRole: candidate.currentRole, education: candidate.education as any,
        resumeText: candidate.resumeText, portfolioUrl: candidate.portfolioUrl,
        githubUrl: candidate.githubUrl,
      }
    );

    // Update candidate's ATS score and tags
    await prisma.candidate.update({
      where: { id: req.params.id },
      data: {
        resumeScore: result.totalScore,
        tags: { set: [...new Set([...candidate.tags, ...result.suggestedTags])] },
      },
    });

    res.json(successResponse(result, `Scored ${result.totalScore}/100 — ${result.priority} priority`));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** PATCH /:id/tags — Update candidate tags */
router.patch("/:id/tags", async (req: Request, res: Response) => {
  try {
    const { tags } = req.body;
    const candidate = await prisma.candidate.update({
      where: { id: req.params.id },
      data: { tags: { set: tags } },
    });
    res.json(successResponse(candidate, "Tags updated"));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

export { router as candidateRoutes };
