// ══════════════════════════════════════════════════════════════
// Benefits Administration Routes
// ══════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// GET /benefits/plans — List benefit plans
router.get("/plans", async (_req: Request, res: Response) => {
  try {
    const plans = await prisma.benefitPlan.findMany({
      where: { isActive: true },
      include: { _count: { select: { enrollments: true } } },
      orderBy: { type: "asc" },
    });
    res.json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch plans" });
  }
});

// POST /benefits/plans — Create plan
router.post("/plans", async (req: Request, res: Response) => {
  try {
    const { name, type, provider, description, premium, employerContribution, coverageDetails } = req.body;
    const plan = await prisma.benefitPlan.create({
      data: {
        name, type, provider, description,
        premium: Number(premium) || 0,
        employerContribution: Number(employerContribution) || 0,
        coverageDetails: coverageDetails || {},
      },
    });
    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to create plan" });
  }
});

// PUT /benefits/plans/:id — Update plan
router.put("/plans/:id", async (req: Request, res: Response) => {
  try {
    const { name, provider, description, premium, employerContribution, coverageDetails, isActive } = req.body;
    const plan = await prisma.benefitPlan.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(provider !== undefined && { provider }),
        ...(description !== undefined && { description }),
        ...(premium !== undefined && { premium: Number(premium) }),
        ...(employerContribution !== undefined && { employerContribution: Number(employerContribution) }),
        ...(coverageDetails && { coverageDetails }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update plan" });
  }
});

// GET /benefits/enrollments/my — My enrollments
router.get("/enrollments/my", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    const enrollments = await prisma.benefitEnrollment.findMany({
      where: { employeeId: employee.id },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: enrollments });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch enrollments" });
  }
});

// POST /benefits/enroll — Enroll in plan
router.post("/enroll", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const employee = await prisma.employee.findUnique({ where: { userId } });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    const { planId, dependents } = req.body;

    // Check if already enrolled
    const existing = await prisma.benefitEnrollment.findFirst({
      where: { planId, employeeId: employee.id, status: "ACTIVE" },
    });
    if (existing) {
      res.status(409).json({ success: false, error: "Already enrolled in this plan" });
      return;
    }

    const enrollment = await prisma.benefitEnrollment.create({
      data: {
        planId,
        employeeId: employee.id,
        startDate: new Date(),
        dependents: dependents || [],
      },
      include: { plan: true },
    });
    res.status(201).json({ success: true, data: enrollment, message: "Enrolled successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to enroll" });
  }
});

// POST /benefits/enrollments/:id/cancel — Cancel enrollment
router.post("/enrollments/:id/cancel", async (req: Request, res: Response) => {
  try {
    const enrollment = await prisma.benefitEnrollment.update({
      where: { id: req.params.id },
      data: { status: "CANCELLED", endDate: new Date() },
    });
    res.json({ success: true, data: enrollment, message: "Enrollment cancelled" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to cancel" });
  }
});

// Dashboard
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const [totalPlans, activePlans, totalEnrollments, byType, totalPremium] = await Promise.all([
      prisma.benefitPlan.count(),
      prisma.benefitPlan.count({ where: { isActive: true } }),
      prisma.benefitEnrollment.count({ where: { status: "ACTIVE" } }),
      prisma.benefitPlan.groupBy({
        by: ["type"],
        _count: true,
      }),
      prisma.benefitEnrollment.findMany({
        where: { status: "ACTIVE" },
        include: { plan: { select: { premium: true, employerContribution: true } } },
      }),
    ]);

    const totalEmployerCost = totalPremium.reduce((sum, e) => sum + e.plan.employerContribution, 0);

    res.json({
      success: true,
      data: {
        totalPlans, activePlans, totalEnrollments,
        totalEmployerCost,
        byType: byType.map(t => ({ type: t.type, count: t._count })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch dashboard" });
  }
});

// ── Seed default plans ──
router.post("/seed-plans", async (_req: Request, res: Response) => {
  try {
    const defaults = [
      { name: "Group Health Insurance", type: "HEALTH", provider: "Star Health", premium: 1500, employerContribution: 1200, description: "Comprehensive health coverage for employee and family" },
      { name: "Dental Coverage", type: "DENTAL", provider: "Aditya Birla", premium: 500, employerContribution: 400, description: "Annual dental check-ups and treatments" },
      { name: "Term Life Insurance", type: "LIFE", provider: "HDFC Life", premium: 800, employerContribution: 800, description: "Life insurance coverage up to 50 lakhs" },
      { name: "NPS - Retirement", type: "RETIREMENT", provider: "NPS Trust", premium: 2000, employerContribution: 2000, description: "National Pension System contribution" },
      { name: "Vision Care", type: "VISION", provider: "Care Health", premium: 300, employerContribution: 200, description: "Annual eye check-ups and spectacle allowance" },
    ];

    let created = 0;
    for (const plan of defaults) {
      const existing = await prisma.benefitPlan.findFirst({ where: { name: plan.name } });
      if (existing) continue;
      await prisma.benefitPlan.create({ data: plan });
      created++;
    }

    res.json({ success: true, message: `Created ${created} benefit plans` });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to seed plans" });
  }
});

export { router as benefitsRouter };
