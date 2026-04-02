// ══════════════════════════════════════════════════════════════════════════════
// ATS Engine — Job Posting Routes
// CRUD for job postings with division-based filtering and status management.
// ══════════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

/** GET / — List job postings */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { status, division, department, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (division) where.division = division;
    if (department) where.department = { contains: department as string, mode: "insensitive" };

    const [jobs, total] = await Promise.all([
      prisma.jobPosting.findMany({
        where,
        include: { _count: { select: { applications: true, interviews: true } } },
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.jobPosting.count({ where }),
    ]);
    res.json(successResponse(jobs, undefined, { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) }));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** GET /:id — Get job details */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const job = await prisma.jobPosting.findUnique({
      where: { id: req.params.id },
      include: {
        applications: { include: { candidate: { select: { firstName: true, lastName: true, email: true } } }, orderBy: { appliedAt: "desc" }, take: 20 },
        _count: { select: { applications: true } },
      },
    });
    if (!job) { res.status(404).json(errorResponse("Job not found")); return; }
    res.json(successResponse(job));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** POST / — Create a job posting */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { title, description, requirements, division, department, location, workMode,
      employmentType, experienceMin, experienceMax, salaryMin, salaryMax, skills, niceToHave, openings } = req.body;
    if (!title || !description || !requirements || !division || !department) {
      res.status(400).json(errorResponse("title, description, requirements, division, department required")); return;
    }
    const count = await prisma.jobPosting.count();
    const jobCode = `JOB-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;
    const hiringManagerId = (req as any).user?.userId || "system";

    const job = await prisma.jobPosting.create({
      data: {
        jobCode, title, description, requirements, division, department,
        location: location || "Bangalore, India", workMode: workMode || "HYBRID",
        employmentType: employmentType || "FULL_TIME",
        experienceMin: experienceMin || 0, experienceMax: experienceMax || null,
        salaryMin: salaryMin || null, salaryMax: salaryMax || null,
        skills: skills || [], niceToHave: niceToHave || [],
        openings: openings || 1, hiringManagerId,
      },
    });
    res.status(201).json(successResponse(job, `Job ${jobCode} created`));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** PATCH /:id/publish — Publish a job */
router.patch("/:id/publish", async (req: Request, res: Response) => {
  try {
    const job = await prisma.jobPosting.update({
      where: { id: req.params.id },
      data: { status: "OPEN", publishedAt: new Date() },
    });
    res.json(successResponse(job, `Job ${job.jobCode} published`));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** PATCH /:id/close — Close a job posting */
router.patch("/:id/close", async (req: Request, res: Response) => {
  try {
    const job = await prisma.jobPosting.update({
      where: { id: req.params.id },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    res.json(successResponse(job, `Job ${job.jobCode} closed`));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** PUT /:id — Update job */
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { title, description, requirements, skills, niceToHave, salaryMin, salaryMax, openings } = req.body;
    const job = await prisma.jobPosting.update({
      where: { id: req.params.id },
      data: { title, description, requirements, skills, niceToHave, salaryMin, salaryMax, openings },
    });
    res.json(successResponse(job, "Job updated"));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

export { router as jobRoutes };
