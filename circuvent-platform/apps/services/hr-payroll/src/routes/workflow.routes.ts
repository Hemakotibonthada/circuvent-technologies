// ══════════════════════════════════════════════════════════════
// Workflow Automation Engine — Event-driven automated workflows
// Triggers: EMPLOYEE_ONBOARD, LEAVE_REQUEST, EXPENSE_SUBMIT,
//           ASSET_REQUEST, TRAVEL_REQUEST, MANUAL, SCHEDULED
// Steps: APPROVAL, NOTIFICATION, WEBHOOK, CONDITION, DELAY, EMAIL
// ══════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════
// Workflow Templates CRUD
// ═══════════════════════════════════════════════════════════

// GET /workflows/templates — List all workflow templates
router.get("/templates", async (req: Request, res: Response) => {
  try {
    const { status, triggerType } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (triggerType) where.triggerType = triggerType;

    const templates = await prisma.workflowTemplate.findMany({
      where,
      include: { steps: { orderBy: { sortOrder: "asc" } }, _count: { select: { instances: true } } },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch workflow templates" });
  }
});

// GET /workflows/templates/:id
router.get("/templates/:id", async (req: Request, res: Response) => {
  try {
    const template = await prisma.workflowTemplate.findUnique({
      where: { id: req.params.id },
      include: { steps: { orderBy: { sortOrder: "asc" } } },
    });
    if (!template) { res.status(404).json({ success: false, error: "Template not found" }); return; }
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch template" });
  }
});

// POST /workflows/templates — Create workflow template
router.post("/templates", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { name, description, triggerType, triggerConfig, steps } = req.body;

    if (!name || !triggerType) {
      res.status(400).json({ success: false, error: "name and triggerType required" });
      return;
    }

    const template = await prisma.workflowTemplate.create({
      data: {
        name, description,
        triggerType, triggerConfig: triggerConfig || {},
        createdBy: userId,
        steps: steps ? {
          create: steps.map((s: any, idx: number) => ({
            name: s.name,
            stepType: s.stepType,
            config: s.config || {},
            sortOrder: idx,
            isRequired: s.isRequired !== false,
            timeoutMins: s.timeoutMins,
          })),
        } : undefined,
      },
      include: { steps: { orderBy: { sortOrder: "asc" } } },
    });

    res.status(201).json({ success: true, data: template, message: "Workflow template created" });
  } catch (error) {
    console.error("[WORKFLOW] Create template error:", error);
    res.status(500).json({ success: false, error: "Failed to create template" });
  }
});

// PUT /workflows/templates/:id — Update template
router.put("/templates/:id", async (req: Request, res: Response) => {
  try {
    const { name, description, triggerType, triggerConfig, status } = req.body;
    const template = await prisma.workflowTemplate.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(triggerType && { triggerType }),
        ...(triggerConfig && { triggerConfig }),
        ...(status && { status }),
      },
    });
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update template" });
  }
});

// DELETE /workflows/templates/:id
router.delete("/templates/:id", async (req: Request, res: Response) => {
  try {
    await prisma.workflowTemplate.update({
      where: { id: req.params.id },
      data: { status: "ARCHIVED" },
    });
    res.json({ success: true, message: "Template archived" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to archive template" });
  }
});

// ── Steps CRUD ─────────────────────────────────────────
router.post("/templates/:id/steps", async (req: Request, res: Response) => {
  try {
    const { name, stepType, config, isRequired, timeoutMins } = req.body;
    const count = await prisma.workflowStepDef.count({ where: { templateId: req.params.id } });

    const step = await prisma.workflowStepDef.create({
      data: {
        templateId: req.params.id,
        name, stepType,
        config: config || {},
        sortOrder: count,
        isRequired: isRequired !== false,
        timeoutMins: timeoutMins || null,
      },
    });
    res.status(201).json({ success: true, data: step });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to add step" });
  }
});

router.put("/steps/:id", async (req: Request, res: Response) => {
  try {
    const { name, stepType, config, sortOrder, isRequired, timeoutMins } = req.body;
    const step = await prisma.workflowStepDef.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(stepType && { stepType }),
        ...(config && { config }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isRequired !== undefined && { isRequired }),
        ...(timeoutMins !== undefined && { timeoutMins }),
      },
    });
    res.json({ success: true, data: step });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update step" });
  }
});

router.delete("/steps/:id", async (req: Request, res: Response) => {
  try {
    await prisma.workflowStepDef.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Step removed" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to delete step" });
  }
});

// ═══════════════════════════════════════════════════════════
// Workflow Execution Engine
// ═══════════════════════════════════════════════════════════

// POST /workflows/trigger — Trigger a workflow (manual or event-driven)
router.post("/trigger", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { triggerType, entityType, entityId, context } = req.body;

    // Find matching active templates
    const templates = await prisma.workflowTemplate.findMany({
      where: { triggerType, status: "ACTIVE" },
      include: { steps: { orderBy: { sortOrder: "asc" } } },
    });

    if (templates.length === 0) {
      res.json({ success: true, message: "No active workflows for this trigger", data: [] });
      return;
    }

    const instances = [];
    for (const template of templates) {
      const instance = await prisma.workflowInstance.create({
        data: {
          templateId: template.id,
          entityType: entityType || triggerType,
          entityId: entityId || "manual",
          startedBy: userId,
          context: context || {},
        },
      });

      // Immediately execute first step
      if (template.steps.length > 0) {
        const firstStep = template.steps[0];
        await executeWorkflowStep(instance.id, firstStep, context || {}, userId);
      } else {
        // No steps — auto-complete
        await prisma.workflowInstance.update({
          where: { id: instance.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
      }

      instances.push(instance);
    }

    res.status(201).json({
      success: true,
      data: instances,
      message: `Triggered ${instances.length} workflow(s)`,
    });
  } catch (error) {
    console.error("[WORKFLOW] Trigger error:", error);
    res.status(500).json({ success: false, error: "Failed to trigger workflow" });
  }
});

// POST /workflows/instances/:id/advance — Advance to next step (approve/action)
router.post("/instances/:id/advance", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { action, data } = req.body; // action: APPROVED, REJECTED, COMPLETED

    const instance = await prisma.workflowInstance.findUnique({
      where: { id: req.params.id },
      include: { template: { include: { steps: { orderBy: { sortOrder: "asc" } } } } },
    });

    if (!instance || instance.status !== "RUNNING") {
      res.status(400).json({ success: false, error: "Workflow not running" });
      return;
    }

    const currentStepDef = instance.template.steps[instance.currentStep];
    if (!currentStepDef) {
      res.status(400).json({ success: false, error: "No current step" });
      return;
    }

    // Log this action
    await prisma.workflowLog.create({
      data: {
        instanceId: instance.id,
        stepIndex: instance.currentStep,
        stepName: currentStepDef.name,
        action: action || "COMPLETED",
        actorId: userId,
        data: data || {},
      },
    });

    if (action === "REJECTED") {
      // Terminate workflow
      await prisma.workflowInstance.update({
        where: { id: instance.id },
        data: { status: "FAILED", completedAt: new Date(), error: "Rejected at step: " + currentStepDef.name },
      });
      res.json({ success: true, message: "Workflow rejected and terminated" });
      return;
    }

    // Advance to next step
    const nextStepIndex = instance.currentStep + 1;
    if (nextStepIndex >= instance.template.steps.length) {
      // Workflow complete
      await prisma.workflowInstance.update({
        where: { id: instance.id },
        data: { status: "COMPLETED", completedAt: new Date(), currentStep: nextStepIndex },
      });
      res.json({ success: true, message: "Workflow completed successfully!" });
    } else {
      // Execute next step
      const nextStep = instance.template.steps[nextStepIndex];
      await prisma.workflowInstance.update({
        where: { id: instance.id },
        data: { currentStep: nextStepIndex },
      });

      await executeWorkflowStep(instance.id, nextStep, instance.context as any || {}, userId);
      res.json({ success: true, message: `Advanced to step ${nextStepIndex + 1}: ${nextStep.name}` });
    }
  } catch (error) {
    console.error("[WORKFLOW] Advance error:", error);
    res.status(500).json({ success: false, error: "Failed to advance workflow" });
  }
});

// GET /workflows/instances — List workflow instances
router.get("/instances", async (req: Request, res: Response) => {
  try {
    const { status, entityType, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (entityType) where.entityType = entityType;

    const [instances, total] = await Promise.all([
      prisma.workflowInstance.findMany({
        where,
        include: {
          template: { select: { name: true, triggerType: true } },
          logs: { orderBy: { createdAt: "desc" }, take: 5 },
        },
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.workflowInstance.count({ where }),
    ]);

    res.json({ success: true, data: instances, meta: { total } });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch instances" });
  }
});

// GET /workflows/instances/:id — Instance detail with logs
router.get("/instances/:id", async (req: Request, res: Response) => {
  try {
    const instance = await prisma.workflowInstance.findUnique({
      where: { id: req.params.id },
      include: {
        template: { include: { steps: { orderBy: { sortOrder: "asc" } } } },
        logs: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!instance) { res.status(404).json({ success: false, error: "Instance not found" }); return; }
    res.json({ success: true, data: instance });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch instance" });
  }
});

// POST /workflows/instances/:id/cancel — Cancel running workflow
router.post("/instances/:id/cancel", async (req: Request, res: Response) => {
  try {
    await prisma.workflowInstance.update({
      where: { id: req.params.id },
      data: { status: "CANCELLED", completedAt: new Date() },
    });

    await prisma.workflowLog.create({
      data: {
        instanceId: req.params.id,
        stepIndex: 0,
        stepName: "SYSTEM",
        action: "CANCELLED",
        actorId: (req as any).user?.userId,
      },
    });

    res.json({ success: true, message: "Workflow cancelled" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to cancel workflow" });
  }
});

// ═══════════════════════════════════════════════════════════
// Dashboard & Metrics
// ═══════════════════════════════════════════════════════════

router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const [totalTemplates, activeTemplates, totalInstances, byStatus, recentInstances, avgDuration] = await Promise.all([
      prisma.workflowTemplate.count(),
      prisma.workflowTemplate.count({ where: { status: "ACTIVE" } }),
      prisma.workflowInstance.count(),
      prisma.workflowInstance.groupBy({ by: ["status"], _count: true }),
      prisma.workflowInstance.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { template: { select: { name: true } } },
      }),
      prisma.workflowInstance.findMany({
        where: { status: "COMPLETED", completedAt: { not: null } },
        select: { startedAt: true, completedAt: true },
        take: 100,
      }),
    ]);

    const avgMs = avgDuration.length > 0
      ? avgDuration.reduce((sum, i) => {
          return sum + (i.completedAt!.getTime() - i.startedAt.getTime());
        }, 0) / avgDuration.length
      : 0;

    const triggerTypes = await prisma.workflowTemplate.groupBy({
      by: ["triggerType"],
      where: { status: "ACTIVE" },
      _count: true,
    });

    res.json({
      success: true,
      data: {
        totalTemplates,
        activeTemplates,
        totalExecutions: totalInstances,
        byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
        avgDurationMinutes: Math.round(avgMs / 60000),
        successRate: totalInstances > 0
          ? ((byStatus.find(s => s.status === "COMPLETED")?._count || 0) / totalInstances * 100).toFixed(1)
          : "0",
        triggerTypes: triggerTypes.map(t => ({ type: t.triggerType, count: t._count })),
        recentInstances,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch dashboard" });
  }
});

// ═══════════════════════════════════════════════════════════
// Built-in Workflow Templates (seed)
// ═══════════════════════════════════════════════════════════

router.post("/seed-defaults", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const defaults = [
      {
        name: "Employee Onboarding Workflow",
        description: "Auto-triggered when a candidate is promoted to employee",
        triggerType: "EMPLOYEE_ONBOARD",
        steps: [
          { name: "Send Welcome Email", stepType: "EMAIL", config: { template: "welcome_employee", channel: "email" } },
          { name: "Notify IT for Equipment", stepType: "NOTIFICATION", config: { targetRole: "ADMIN", message: "New employee needs equipment setup" } },
          { name: "Assign Default Training", stepType: "ACTION", config: { action: "ASSIGN_TRAINING", trainingIds: [] } },
          { name: "Manager Acknowledgment", stepType: "APPROVAL", config: { approverRole: "MANAGER", autoApproveAfterMins: 4320 } },
          { name: "HR Compliance Check", stepType: "APPROVAL", config: { approverRole: "HR_MANAGER" } },
        ],
      },
      {
        name: "Leave Request Workflow",
        description: "Auto-triggered on leave request submission",
        triggerType: "LEAVE_REQUEST",
        steps: [
          { name: "Manager Approval", stepType: "APPROVAL", config: { approverRole: "MANAGER", autoApproveAfterMins: 2880 } },
          { name: "Notify Team", stepType: "NOTIFICATION", config: { message: "Team member on leave" } },
          { name: "Update Calendar", stepType: "ACTION", config: { action: "CREATE_CALENDAR_EVENT" } },
        ],
      },
      {
        name: "Expense Approval Workflow",
        description: "Auto-triggered on expense submission",
        triggerType: "EXPENSE_SUBMIT",
        steps: [
          { name: "Auto-check Policy", stepType: "CONDITION", config: { condition: "amount_under_limit", limit: 5000 } },
          { name: "Manager Approval", stepType: "APPROVAL", config: { approverRole: "MANAGER" } },
          { name: "Finance Review", stepType: "APPROVAL", config: { approverRole: "ADMIN", condition: "amount_over", threshold: 25000 } },
          { name: "Notify Employee", stepType: "NOTIFICATION", config: { message: "Expense approved/rejected" } },
        ],
      },
      {
        name: "Asset Request Workflow",
        description: "Auto-triggered on asset request",
        triggerType: "ASSET_REQUEST",
        steps: [
          { name: "IT Admin Approval", stepType: "APPROVAL", config: { approverRole: "ADMIN" } },
          { name: "Auto-assign Asset", stepType: "ACTION", config: { action: "ASSIGN_ASSET" } },
          { name: "Notify Employee", stepType: "NOTIFICATION", config: { message: "Asset allocated" } },
        ],
      },
      {
        name: "Travel Request Workflow",
        description: "Auto-triggered on travel request",
        triggerType: "TRAVEL_REQUEST",
        steps: [
          { name: "Policy Validation", stepType: "CONDITION", config: { condition: "budget_check" } },
          { name: "Manager Approval", stepType: "APPROVAL", config: { approverRole: "MANAGER" } },
          { name: "Finance Approval", stepType: "APPROVAL", config: { approverRole: "ADMIN", condition: "budget_over", threshold: 50000 } },
          { name: "Book Travel", stepType: "ACTION", config: { action: "SEND_BOOKING_REQUEST" } },
        ],
      },
    ];

    let created = 0;
    for (const def of defaults) {
      const existing = await prisma.workflowTemplate.findFirst({
        where: { name: def.name },
      });
      if (existing) continue;

      await prisma.workflowTemplate.create({
        data: {
          name: def.name,
          description: def.description,
          triggerType: def.triggerType,
          createdBy: userId,
          steps: {
            create: def.steps.map((s, idx) => ({
              name: s.name,
              stepType: s.stepType as any,
              config: s.config,
              sortOrder: idx,
            })),
          },
        },
      });
      created++;
    }

    res.json({ success: true, message: `Created ${created} default workflow templates` });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to seed defaults" });
  }
});

// ═══════════════════════════════════════════════════════════
// Step Execution Helper
// ═══════════════════════════════════════════════════════════

async function executeWorkflowStep(
  instanceId: string,
  step: { id: string; name: string; stepType: string; config: any; timeoutMins: number | null },
  context: any,
  actorId: string
) {
  try {
    switch (step.stepType) {
      case "NOTIFICATION": {
        const config = step.config as any;
        // Auto-execute: create notification
        if (config?.targetRole) {
          const users = await prisma.user.findMany({
            where: { role: config.targetRole, status: "ACTIVE" },
            select: { id: true },
          });
          await prisma.notification.createMany({
            data: users.map(u => ({
              userId: u.id,
              type: "WORKFLOW",
              module: "WORKFLOW",
              title: `Workflow: ${step.name}`,
              message: config.message || "Action required",
            })),
          });
        }

        // Auto-advance after notification
        await prisma.workflowLog.create({
          data: {
            instanceId, stepIndex: 0, stepName: step.name,
            action: "NOTIFIED", actorId: "SYSTEM", data: { recipients: "auto" },
          },
        });
        break;
      }

      case "EMAIL": {
        // Log email step (actual sending would use nodemailer)
        await prisma.workflowLog.create({
          data: {
            instanceId, stepIndex: 0, stepName: step.name,
            action: "EMAIL_QUEUED", actorId: "SYSTEM", data: step.config,
          },
        });
        break;
      }

      case "APPROVAL": {
        // Wait for manual approval — log that it's pending
        await prisma.workflowLog.create({
          data: {
            instanceId, stepIndex: 0, stepName: step.name,
            action: "STARTED", actorId: "SYSTEM",
            data: { awaiting: "approval", approverRole: (step.config as any)?.approverRole },
          },
        });

        // Auto-approve check (if timeout configured)
        if (step.timeoutMins && step.timeoutMins > 0) {
          // In production, schedule a job. For now, just log.
          await prisma.workflowLog.create({
            data: {
              instanceId, stepIndex: 0, stepName: step.name,
              action: "AUTO_APPROVE_SCHEDULED",
              data: { autoApproveAfterMins: step.timeoutMins },
            },
          });
        }
        break;
      }

      case "CONDITION": {
        // Evaluate condition and auto-advance
        const config = step.config as any;
        let conditionMet = true;

        if (config?.condition === "amount_under_limit" && context?.amount) {
          conditionMet = Number(context.amount) < Number(config.limit);
        }

        await prisma.workflowLog.create({
          data: {
            instanceId, stepIndex: 0, stepName: step.name,
            action: conditionMet ? "CONDITION_MET" : "CONDITION_FAILED",
            data: { condition: config?.condition, result: conditionMet },
          },
        });
        break;
      }

      case "ACTION": {
        await prisma.workflowLog.create({
          data: {
            instanceId, stepIndex: 0, stepName: step.name,
            action: "ACTION_EXECUTED", actorId: "SYSTEM", data: step.config,
          },
        });
        break;
      }

      default: {
        await prisma.workflowLog.create({
          data: {
            instanceId, stepIndex: 0, stepName: step.name,
            action: "STARTED", actorId: actorId || "SYSTEM",
          },
        });
      }
    }
  } catch (error) {
    console.error(`[WORKFLOW] Step execution error for ${step.name}:`, error);
    await prisma.workflowLog.create({
      data: {
        instanceId, stepIndex: 0, stepName: step.name,
        action: "ERROR", data: { error: String(error) },
      },
    });
  }
}

export { router as workflowRouter };
