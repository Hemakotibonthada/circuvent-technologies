// ══════════════════════════════════════════════════════════════════════════════
// ATS Engine — Recruitment Dashboard Routes
// Analytics: Time-to-Hire, Source Efficacy, Pipeline Health, Hiring Funnel.
// ══════════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

/** GET / — Full recruitment dashboard */
router.get("/", async (req: Request, res: Response) => {
  try {
    const [jobStats, candidateStats, applicationStats, pipelineData, sourceBreakdown,
      divisionBreakdown, recentApplications, upcomingInterviews, poolHealth] = await Promise.all([
      // Job stats
      prisma.jobPosting.groupBy({ by: ["status"], _count: true }),
      // Candidate stats
      Promise.all([
        prisma.candidate.count(),
        prisma.candidate.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
      ]),
      // Application stats
      Promise.all([
        prisma.application.count(),
        prisma.application.count({ where: { status: { in: ["APPLIED", "SCREENING", "SHORTLISTED", "TECHNICAL_ROUND", "HR_ROUND", "FINAL_ROUND"] } } }),
        prisma.application.count({ where: { status: "HIRED" } }),
        prisma.application.count({ where: { status: "REJECTED" } }),
      ]),
      // Pipeline by status
      prisma.application.groupBy({ by: ["status"], _count: true }),
      // Source efficacy
      prisma.candidate.groupBy({ by: ["source"], _count: true }),
      // Division breakdown
      prisma.jobPosting.groupBy({ by: ["division"], _count: true, where: { status: "OPEN" } }),
      // Recent applications
      prisma.application.findMany({
        include: {
          candidate: { select: { firstName: true, lastName: true, candidateCode: true } },
          job: { select: { title: true, jobCode: true } },
        },
        orderBy: { appliedAt: "desc" },
        take: 10,
      }),
      // Upcoming interviews
      prisma.interview.findMany({
        where: { scheduledAt: { gte: new Date() }, status: "SCHEDULED" },
        include: {
          application: { include: { candidate: { select: { firstName: true, lastName: true } } } },
          job: { select: { title: true } },
        },
        orderBy: { scheduledAt: "asc" },
        take: 10,
      }),
      // Pool health
      prisma.talentPool.findMany({ include: { _count: { select: { members: true } } } }),
    ]);

    // Calculate time-to-hire (average days from APPLIED to HIRED)
    const hiredApps = await prisma.application.findMany({
      where: { status: "HIRED", hiredAt: { not: null } },
      select: { appliedAt: true, hiredAt: true },
    });
    const avgTimeToHire = hiredApps.length > 0
      ? Number((hiredApps.reduce((s, a) => s + ((a.hiredAt!.getTime() - a.appliedAt.getTime()) / (24 * 60 * 60 * 1000)), 0) / hiredApps.length).toFixed(1))
      : 0;

    // Offer acceptance rate
    const offers = await prisma.application.count({ where: { status: { in: ["OFFER_EXTENDED", "OFFER_ACCEPTED", "OFFER_DECLINED", "HIRED"] } } });
    const accepted = await prisma.application.count({ where: { status: { in: ["OFFER_ACCEPTED", "HIRED"] } } });
    const offerAcceptanceRate = offers > 0 ? Number(((accepted / offers) * 100).toFixed(1)) : 0;

    res.json(successResponse({
      overview: {
        totalJobs: jobStats.reduce((s, j) => s + j._count, 0),
        openJobs: jobStats.find(j => j.status === "OPEN")?._count || 0,
        totalCandidates: candidateStats[0],
        newCandidates30d: candidateStats[1],
        totalApplications: applicationStats[0],
        activeApplications: applicationStats[1],
        totalHired: applicationStats[2],
        totalRejected: applicationStats[3],
        avgTimeToHireDays: avgTimeToHire,
        offerAcceptanceRate,
      },
      pipeline: pipelineData.map(p => ({ stage: p.status, count: p._count })),
      sourceEfficacy: sourceBreakdown.map(s => ({ source: s.source, count: s._count })),
      divisionBreakdown: divisionBreakdown.map(d => ({ division: d.division, count: d._count })),
      poolHealth: poolHealth.map(p => ({ name: p.name, category: p.category, members: p._count.members })),
      recentApplications,
      upcomingInterviews,
    }));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** GET /time-to-hire — Detailed time-to-hire analytics */
router.get("/time-to-hire", async (req: Request, res: Response) => {
  try {
    const { division, months = "6" } = req.query;
    const since = new Date(Date.now() - Number(months) * 30 * 24 * 60 * 60 * 1000);

    const where: any = { status: "HIRED", hiredAt: { not: null }, appliedAt: { gte: since } };
    if (division) where.job = { division: division };

    const hiredApps = await prisma.application.findMany({
      where,
      select: { appliedAt: true, hiredAt: true, screenedAt: true, shortlistedAt: true, offeredAt: true },
    });

    const stages: Record<string, number[]> = { screening: [], shortlist: [], offer: [], total: [] };
    for (const a of hiredApps) {
      if (a.screenedAt) stages.screening.push((a.screenedAt.getTime() - a.appliedAt.getTime()) / 86400000);
      if (a.shortlistedAt && a.screenedAt) stages.shortlist.push((a.shortlistedAt.getTime() - a.screenedAt.getTime()) / 86400000);
      if (a.offeredAt && a.shortlistedAt) stages.offer.push((a.offeredAt.getTime() - a.shortlistedAt.getTime()) / 86400000);
      if (a.hiredAt) stages.total.push((a.hiredAt.getTime() - a.appliedAt.getTime()) / 86400000);
    }

    const avg = (arr: number[]) => arr.length > 0 ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : 0;

    res.json(successResponse({
      sampleSize: hiredApps.length,
      avgDays: {
        toScreening: avg(stages.screening),
        toShortlist: avg(stages.shortlist),
        toOffer: avg(stages.offer),
        total: avg(stages.total),
      },
    }));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** GET /source-efficacy — Which sources produce the best hires */
router.get("/source-efficacy", async (req: Request, res: Response) => {
  try {
    const sources = await prisma.candidate.groupBy({ by: ["source"], _count: true });
    const sourceData: Array<{ source: string; totalCandidates: number; applications: number; hired: number; conversionRate: number; avgATSScore: number }> = [];

    for (const s of sources) {
      const [applied, hired, avgScore] = await Promise.all([
        prisma.application.count({ where: { candidate: { source: s.source } } }),
        prisma.application.count({ where: { candidate: { source: s.source }, status: "HIRED" } }),
        prisma.candidate.aggregate({ where: { source: s.source, resumeScore: { not: null } }, _avg: { resumeScore: true } }),
      ]);
      sourceData.push({
        source: s.source,
        totalCandidates: s._count,
        applications: applied,
        hired,
        conversionRate: applied > 0 ? Number(((hired / applied) * 100).toFixed(1)) : 0,
        avgATSScore: Number(avgScore._avg.resumeScore || 0),
      });
    }

    res.json(successResponse(sourceData.sort((a, b) => b.conversionRate - a.conversionRate)));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

export { router as dashboardRoutes };
