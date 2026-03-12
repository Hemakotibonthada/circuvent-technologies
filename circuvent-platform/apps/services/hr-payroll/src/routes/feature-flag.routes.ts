// ══════════════════════════════════════════════════════════════
// Feature Flags Routes — Gradual rollout, A/B testing
// ══════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// GET /feature-flags — List all flags
router.get("/", async (_req: Request, res: Response) => {
  try {
    const flags = await prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
    res.json({ success: true, data: flags });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch flags" });
  }
});

// GET /feature-flags/evaluate — Evaluate all flags for current user
router.get("/evaluate", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const userRole = (req as any).user?.role;
    const flags = await prisma.featureFlag.findMany();

    const evaluated: Record<string, boolean> = {};
    for (const flag of flags) {
      if (!flag.enabled) { evaluated[flag.key] = false; continue; }
      if (flag.targetRoles.length > 0 && !flag.targetRoles.includes(userRole)) {
        evaluated[flag.key] = false; continue;
      }
      if (flag.percentage < 100) {
        const hash = simpleHash(userId + flag.key) % 100;
        evaluated[flag.key] = hash < flag.percentage;
      } else {
        evaluated[flag.key] = true;
      }
    }

    res.json({ success: true, data: evaluated });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to evaluate flags" });
  }
});

// POST /feature-flags — Create flag
router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { key, name, description, enabled, targetRoles, percentage, metadata } = req.body;
    if (!key || !name) { res.status(400).json({ success: false, error: "key and name required" }); return; }

    const flag = await prisma.featureFlag.create({
      data: {
        key, name, description, enabled: enabled || false,
        targetRoles: targetRoles || [], percentage: percentage || 100,
        metadata: metadata || {}, createdBy: userId,
      },
    });

    await prisma.auditLog.create({
      data: { userId, action: "CREATE", entity: "FeatureFlag", entityId: flag.id, newValue: { key, enabled } },
    });

    res.status(201).json({ success: true, data: flag });
  } catch (error: any) {
    if (error.code === "P2002") { res.status(409).json({ success: false, error: "Flag key already exists" }); return; }
    res.status(500).json({ success: false, error: "Failed to create flag" });
  }
});

// PUT /feature-flags/:id — Update flag
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { name, description, enabled, targetRoles, percentage, metadata } = req.body;
    const flag = await prisma.featureFlag.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(enabled !== undefined && { enabled }),
        ...(targetRoles && { targetRoles }),
        ...(percentage !== undefined && { percentage }),
        ...(metadata && { metadata }),
      },
    });

    await prisma.auditLog.create({
      data: { userId, action: "UPDATE", entity: "FeatureFlag", entityId: flag.id, newValue: { enabled: flag.enabled, percentage: flag.percentage } },
    });

    res.json({ success: true, data: flag });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update flag" });
  }
});

// POST /feature-flags/:id/toggle — Quick toggle
router.post("/:id/toggle", async (req: Request, res: Response) => {
  try {
    const flag = await prisma.featureFlag.findUnique({ where: { id: req.params.id } });
    if (!flag) { res.status(404).json({ success: false, error: "Flag not found" }); return; }

    const updated = await prisma.featureFlag.update({
      where: { id: req.params.id },
      data: { enabled: !flag.enabled },
    });

    res.json({ success: true, data: updated, message: `Flag ${updated.key} is now ${updated.enabled ? "ON" : "OFF"}` });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to toggle" });
  }
});

// DELETE /feature-flags/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.featureFlag.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Flag deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to delete flag" });
  }
});

// ── Seed default flags ──
router.post("/seed-defaults", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const defaults = [
      { key: "employee_self_service", name: "Employee Self-Service Portal", description: "Allow employees to edit their own profiles", enabled: true },
      { key: "ai_resume_scoring", name: "AI Resume Scoring", description: "Use ML model for automatic resume evaluation", enabled: true, percentage: 50 },
      { key: "auto_payroll", name: "Automated Payroll Processing", description: "Auto-generate payslips monthly", enabled: false },
      { key: "visitor_management", name: "Visitor Management Module", description: "Pre-registration and badge system", enabled: true },
      { key: "dark_mode", name: "Dark Mode", description: "Enable dark theme support", enabled: true },
      { key: "workflow_automation", name: "Workflow Automation Engine", description: "Event-driven workflow execution", enabled: true },
      { key: "calendar_integration", name: "Calendar + Meeting Rooms", description: "Full calendar system with room booking", enabled: true },
      { key: "recognition_system", name: "Recognition & Awards", description: "Peer-to-peer recognition", enabled: true },
      { key: "survey_module", name: "Employee Surveys", description: "Engagement and pulse surveys", enabled: true },
      { key: "benefits_admin", name: "Benefits Administration", description: "Health, dental, retirement plans", enabled: false },
    ];

    let created = 0;
    for (const flag of defaults) {
      const existing = await prisma.featureFlag.findFirst({ where: { key: flag.key } });
      if (existing) continue;
      await prisma.featureFlag.create({ data: { ...flag, createdBy: userId } });
      created++;
    }

    res.json({ success: true, message: `Created ${created} feature flags` });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to seed flags" });
  }
});

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export { router as featureFlagRouter };
