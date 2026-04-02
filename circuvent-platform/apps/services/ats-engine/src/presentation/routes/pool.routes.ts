// ══════════════════════════════════════════════════════════════════════════════
// ATS Engine — Talent Pool Routes
// Manage pools, auto-assign candidates, pool health metrics.
// ══════════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

/** GET / — List all talent pools */
router.get("/", async (req: Request, res: Response) => {
  try {
    const pools = await prisma.talentPool.findMany({
      include: { _count: { select: { members: true } } },
      orderBy: { name: "asc" },
    });
    res.json(successResponse(pools));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** POST / — Create a talent pool */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, category, description, division, autoAssignRules } = req.body;
    if (!name || !category) { res.status(400).json(errorResponse("name and category required")); return; }
    const managerId = (req as any).user?.userId || "system";
    const pool = await prisma.talentPool.create({
      data: { name, category, description: description || null, division: division || null, managerId, autoAssignRules: autoAssignRules || null },
    });
    res.status(201).json(successResponse(pool, `Pool '${name}' created`));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** GET /:id — Pool details with members */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const pool = await prisma.talentPool.findUnique({
      where: { id: req.params.id },
      include: {
        members: { include: { candidate: { select: { firstName: true, lastName: true, email: true, skills: true, experienceYears: true, resumeScore: true, tags: true } } }, orderBy: { addedAt: "desc" } },
      },
    });
    if (!pool) { res.status(404).json(errorResponse("Pool not found")); return; }
    res.json(successResponse(pool));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** POST /:id/members — Add candidate to pool */
router.post("/:id/members", async (req: Request, res: Response) => {
  try {
    const { candidateId, reason, priority } = req.body;
    if (!candidateId) { res.status(400).json(errorResponse("candidateId required")); return; }
    const addedBy = (req as any).user?.userId || "system";
    const member = await prisma.talentPoolMember.create({
      data: { poolId: req.params.id, candidateId, addedBy, reason: reason || null, priority: priority || "NORMAL" },
    });
    res.status(201).json(successResponse(member, "Candidate added to pool"));
  } catch (error: any) {
    if ((error as any).code === "P2002") { res.status(409).json(errorResponse("Candidate already in pool")); return; }
    res.status(500).json(errorResponse(error.message));
  }
});

/** DELETE /:id/members/:candidateId — Remove from pool */
router.delete("/:id/members/:candidateId", async (req: Request, res: Response) => {
  try {
    await prisma.talentPoolMember.deleteMany({ where: { poolId: req.params.id, candidateId: req.params.candidateId } });
    res.json(successResponse(null, "Removed from pool"));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** GET /health/summary — Pool health dashboard */
router.get("/health/summary", async (req: Request, res: Response) => {
  try {
    const pools = await prisma.talentPool.findMany({
      include: { _count: { select: { members: true } } },
    });
    const summary = pools.map(p => ({
      name: p.name,
      category: p.category,
      memberCount: p._count.members,
      isActive: p.isActive,
      health: p._count.members >= 10 ? "HEALTHY" : p._count.members >= 3 ? "GROWING" : "NEEDS_ATTENTION",
    }));
    res.json(successResponse({
      totalPools: pools.length,
      activePools: pools.filter(p => p.isActive).length,
      totalMembers: summary.reduce((s, p) => s + p.memberCount, 0),
      pools: summary,
    }));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

export { router as poolRoutes };
