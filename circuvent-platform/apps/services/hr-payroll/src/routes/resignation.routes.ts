// ──────────────────────────────────────────────────────────────
// HR & Payroll — Resignation Routes
// Complete CRUD for resignations: submit, approve, reject,
// withdraw, final settlement, exit completion, analytics, and
// auto-generation of experience/relieving letters.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

async function resolveEmployee(req: Request) {
  const userId = (req as any).user?.userId;
  if (!userId) return null;
  return prisma.employee.findUnique({
    where: { userId },
    include: { user: { select: { id: true, firstName: true, lastName: true, role: true, email: true, department: true } } },
  });
}

function isHROrAdmin(role: string): boolean {
  return ["ADMIN", "SUPER_ADMIN", "HR_MANAGER", "CEO"].includes(role);
}

/** Auto-calculate notice period based on employment type and tenure */
function calculateNoticePeriod(employmentType: string, dateOfJoining: Date): number {
  const tenureMonths = Math.floor((Date.now() - dateOfJoining.getTime()) / (1000 * 60 * 60 * 24 * 30));
  switch (employmentType) {
    case "FULL_TIME":
      return tenureMonths > 12 ? 90 : 30; // 90 days for > 1 year, else 30
    case "PART_TIME":
      return 15;
    case "CONTRACT":
      return 30;
    case "INTERN":
      return 7;
    default:
      return 30;
  }
}

/** Default exit checklist items */
function getExitChecklist() {
  return [
    { id: "ec-1", title: "Return laptop and accessories", category: "IT", isCompleted: false },
    { id: "ec-2", title: "Revoke email and system access", category: "IT", isCompleted: false },
    { id: "ec-3", title: "Return access card / ID badge", category: "ADMIN", isCompleted: false },
    { id: "ec-4", title: "Knowledge transfer documentation", category: "TEAM", isCompleted: false },
    { id: "ec-5", title: "Clear pending expense claims", category: "FINANCE", isCompleted: false },
    { id: "ec-6", title: "Return company assets (monitor, headset, etc.)", category: "IT", isCompleted: false },
    { id: "ec-7", title: "Complete exit interview", category: "HR", isCompleted: false },
    { id: "ec-8", title: "Sign non-disclosure reminder", category: "HR", isCompleted: false },
    { id: "ec-9", title: "Clear PF / gratuity paperwork", category: "FINANCE", isCompleted: false },
    { id: "ec-10", title: "Hand over pending tasks", category: "TEAM", isCompleted: false },
  ];
}

// ═══════════════════════════════════════════════════════════════
// POST /resignations — Submit resignation
// ═══════════════════════════════════════════════════════════════

router.post("/", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }

    const { reason, lastWorkingDate } = req.body;
    if (!reason) { res.status(400).json({ success: false, error: "Reason is required" }); return; }

    // Check for existing active resignation
    const existingResignation = await prisma.resignation.findFirst({
      where: {
        employeeId: actor.id,
        status: { in: ["SUBMITTED", "ACCEPTED"] },
      },
    });
    if (existingResignation) {
      res.status(400).json({ success: false, error: "You already have a pending/accepted resignation" }); return;
    }

    const noticePeriod = calculateNoticePeriod(actor.employmentType, actor.dateOfJoining);
    const calculatedLastDay = lastWorkingDate
      ? new Date(lastWorkingDate)
      : new Date(Date.now() + noticePeriod * 24 * 60 * 60 * 1000);

    const resignation = await prisma.resignation.create({
      data: {
        employeeId: actor.id,
        reason,
        lastWorkingDate: calculatedLastDay,
        noticePeriod,
        status: "SUBMITTED",
      },
    });

    res.status(201).json({
      success: true,
      data: {
        ...resignation,
        noticePeriodDays: noticePeriod,
        employeeName: `${actor.user.firstName} ${actor.user.lastName}`,
        exitChecklist: getExitChecklist(),
      },
      message: "Resignation submitted successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to submit resignation" });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /resignations/my — My resignation
// ═══════════════════════════════════════════════════════════════

router.get("/my", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }

    const resignations = await prisma.resignation.findMany({
      where: { employeeId: actor.id },
      orderBy: { createdAt: "desc" },
    });

    const enriched = resignations.map((r) => ({
      ...r,
      exitChecklist: getExitChecklist(),
    }));

    res.json({ success: true, data: enriched });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch resignation" });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /resignations — List all (admin/HR only)
// ═══════════════════════════════════════════════════════════════

router.get("/", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor || !isHROrAdmin(actor.user.role)) {
      res.status(403).json({ success: false, error: "Access denied" }); return;
    }

    const { status, department, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (status) where.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [resignations, total] = await Promise.all([
      prisma.resignation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
      }),
      prisma.resignation.count({ where }),
    ]);

    // Enrich with employee info
    const enriched = await Promise.all(
      resignations.map(async (r) => {
        const emp = await prisma.employee.findUnique({
          where: { id: r.employeeId },
          include: { user: { select: { firstName: true, lastName: true, department: true } } },
        });
        return {
          ...r,
          employeeName: emp ? `${emp.user.firstName} ${emp.user.lastName}` : "Unknown",
          department: emp?.department || "N/A",
          designation: emp?.designation || "N/A",
        };
      })
    );

    res.json({ success: true, data: enriched, meta: { total, page: Number(page), limit: Number(limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch resignations" });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /resignations/pending — Pending approvals
// ═══════════════════════════════════════════════════════════════

router.get("/pending", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor || !isHROrAdmin(actor.user.role)) {
      res.status(403).json({ success: false, error: "Access denied" }); return;
    }

    const pending = await prisma.resignation.findMany({
      where: { status: "SUBMITTED" },
      orderBy: { createdAt: "asc" },
    });

    const enriched = await Promise.all(
      pending.map(async (r) => {
        const emp = await prisma.employee.findUnique({
          where: { id: r.employeeId },
          include: { user: { select: { firstName: true, lastName: true, department: true } } },
        });
        return {
          ...r,
          employeeName: emp ? `${emp.user.firstName} ${emp.user.lastName}` : "Unknown",
          department: emp?.department || "N/A",
        };
      })
    );

    res.json({ success: true, data: enriched });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch pending resignations" });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /resignations/:id/approve
// ═══════════════════════════════════════════════════════════════

router.post("/:id/approve", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor || !isHROrAdmin(actor.user.role)) {
      res.status(403).json({ success: false, error: "Only HR/Admin can approve" }); return;
    }

    const resignation = await prisma.resignation.findUnique({ where: { id: req.params.id } });
    if (!resignation) { res.status(404).json({ success: false, error: "Resignation not found" }); return; }
    if (resignation.status !== "SUBMITTED") {
      res.status(400).json({ success: false, error: `Cannot approve — status is ${resignation.status}` }); return;
    }

    const { lastWorkingDate } = req.body;
    const updated = await prisma.resignation.update({
      where: { id: req.params.id },
      data: {
        status: "ACCEPTED",
        processedBy: actor.userId,
        processedAt: new Date(),
        lastWorkingDate: lastWorkingDate ? new Date(lastWorkingDate) : resignation.lastWorkingDate,
      },
    });

    res.json({ success: true, data: updated, message: "Resignation approved" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to approve" });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /resignations/:id/reject
// ═══════════════════════════════════════════════════════════════

router.post("/:id/reject", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor || !isHROrAdmin(actor.user.role)) {
      res.status(403).json({ success: false, error: "Only HR/Admin can reject" }); return;
    }

    const { reason } = req.body;
    const resignation = await prisma.resignation.findUnique({ where: { id: req.params.id } });
    if (!resignation) { res.status(404).json({ success: false, error: "Resignation not found" }); return; }
    if (resignation.status !== "SUBMITTED") {
      res.status(400).json({ success: false, error: `Cannot reject — status is ${resignation.status}` }); return;
    }

    const updated = await prisma.resignation.update({
      where: { id: req.params.id },
      data: {
        status: "REJECTED",
        processedBy: actor.userId,
        processedAt: new Date(),
        exitInterviewNotes: reason || "Resignation rejected by management",
      },
    });

    res.json({ success: true, data: updated, message: "Resignation rejected" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to reject" });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /resignations/:id/withdraw
// ═══════════════════════════════════════════════════════════════

router.post("/:id/withdraw", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }

    const resignation = await prisma.resignation.findUnique({ where: { id: req.params.id } });
    if (!resignation) { res.status(404).json({ success: false, error: "Resignation not found" }); return; }
    if (resignation.employeeId !== actor.id) {
      res.status(403).json({ success: false, error: "Can only withdraw your own resignation" }); return;
    }
    if (!["SUBMITTED", "ACCEPTED"].includes(resignation.status)) {
      res.status(400).json({ success: false, error: `Cannot withdraw — status is ${resignation.status}` }); return;
    }

    const updated = await prisma.resignation.update({
      where: { id: req.params.id },
      data: { status: "WITHDRAWN" },
    });

    res.json({ success: true, data: updated, message: "Resignation withdrawn" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to withdraw" });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /resignations/:id/settlement — Calculate final settlement
// ═══════════════════════════════════════════════════════════════

router.get("/:id/settlement", async (req: Request, res: Response) => {
  try {
    const resignation = await prisma.resignation.findUnique({ where: { id: req.params.id } });
    if (!resignation) { res.status(404).json({ success: false, error: "Resignation not found" }); return; }

    const employee = await prisma.employee.findUnique({
      where: { id: resignation.employeeId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        salarySlips: { orderBy: { createdAt: "desc" }, take: 1 },
        leaveRecords: { where: { status: "APPROVED" } },
      },
    });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    const lastSlip = employee.salarySlips[0];
    const monthlySalary = lastSlip ? Number(lastSlip.netSalary) : Number(employee.baseSalary) * 0.75;
    const dailySalary = monthlySalary / 30;

    // Calculate pending salary (days worked in last month)
    const now = new Date();
    const lastWorkingDay = resignation.lastWorkingDate || now;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = Math.min(lastWorkingDay.getDate(), daysInMonth);
    const pendingSalary = Math.round(dailySalary * dayOfMonth);

    // Leave encashment (unused earned leaves × daily salary)
    const totalLeaveTaken = employee.leaveRecords
      .filter((l) => l.leaveType === "EARNED")
      .reduce((sum, l) => sum + Number(l.totalDays), 0);
    const maxEarnedLeaves = 30;
    const unusedLeaves = Math.max(0, maxEarnedLeaves - totalLeaveTaken);
    const leaveEncashment = Math.round(unusedLeaves * dailySalary);

    // Gratuity (if tenure > 5 years)
    const tenureYears = (Date.now() - employee.dateOfJoining.getTime()) / (1000 * 60 * 60 * 24 * 365);
    const gratuity = tenureYears >= 5 ? Math.round((Number(employee.baseSalary) * 15 * Math.floor(tenureYears)) / 26) : 0;

    // Pending reimbursements
    const pendingExpenses = await prisma.expenseClaim.aggregate({
      where: { employeeId: employee.id, status: "APPROVED" },
      _sum: { totalAmount: true },
    });
    const pendingReimbursements = Number(pendingExpenses._sum.totalAmount || 0);

    // Advance recovery
    const pendingAdvances = await prisma.salaryAdvance.aggregate({
      where: { employeeId: employee.id, status: { in: ["APPROVED", "DISBURSED"] } },
      _sum: { amount: true },
    });
    const advanceRecovery = Number(pendingAdvances._sum.amount || 0);

    // Notice period recovery (if short notice)
    const actualNoticeDays = Math.max(0, Math.floor((lastWorkingDay.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const noticePeriodRecovery = actualNoticeDays < resignation.noticePeriod
      ? Math.round((resignation.noticePeriod - actualNoticeDays) * dailySalary)
      : 0;

    const totalPayable = pendingSalary + leaveEncashment + gratuity + pendingReimbursements;
    const totalDeductions = advanceRecovery + noticePeriodRecovery;
    const netSettlement = totalPayable - totalDeductions;

    res.json({
      success: true,
      data: {
        employeeId: employee.id,
        employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
        lastWorkingDay: lastWorkingDay.toISOString(),
        tenureYears: Number(tenureYears.toFixed(1)),
        components: {
          pendingSalary,
          leaveEncashment,
          gratuity,
          bonus: 0,
          pendingReimbursements,
          deductions: totalDeductions,
          advanceRecovery,
          noticePeriodRecovery,
        },
        totalPayable,
        totalDeductions,
        netSettlement,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to calculate settlement" });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /resignations/:id/complete-exit — Mark exit complete
// ═══════════════════════════════════════════════════════════════

router.post("/:id/complete-exit", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor || !isHROrAdmin(actor.user.role)) {
      res.status(403).json({ success: false, error: "Only HR/Admin can complete exit" }); return;
    }

    const resignation = await prisma.resignation.findUnique({ where: { id: req.params.id } });
    if (!resignation) { res.status(404).json({ success: false, error: "Resignation not found" }); return; }
    if (resignation.status !== "ACCEPTED") {
      res.status(400).json({ success: false, error: `Cannot complete exit — status is ${resignation.status}` }); return;
    }

    // Update resignation status
    await prisma.resignation.update({
      where: { id: req.params.id },
      data: {
        status: "COMPLETED",
        exitInterviewDone: true,
      },
    });

    // Update employee dateOfLeaving
    const employee = await prisma.employee.findUnique({
      where: { id: resignation.employeeId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    if (employee) {
      await prisma.employee.update({
        where: { id: employee.id },
        data: { dateOfLeaving: resignation.lastWorkingDate || new Date() },
      });

      // Auto-generate experience letter
      const experienceTemplate = await prisma.letterTemplate.findFirst({
        where: { letterType: "EXPERIENCE_LETTER", isActive: true },
      });

      if (experienceTemplate) {
        await prisma.letter.create({
          data: {
            templateId: experienceTemplate.id,
            letterType: "EXPERIENCE_LETTER",
            recipientId: employee.user.id,
            recipientName: `${employee.user.firstName} ${employee.user.lastName}`,
            recipientEmail: employee.user.email,
            subject: "Experience Certificate — Circuvent Technologies",
            htmlContent: experienceTemplate.htmlContent
              .replace(/\{\{employeeName\}\}/g, `${employee.user.firstName} ${employee.user.lastName}`)
              .replace(/\{\{employeeCode\}\}/g, employee.employeeCode)
              .replace(/\{\{designation\}\}/g, employee.designation)
              .replace(/\{\{department\}\}/g, employee.department)
              .replace(/\{\{date\}\}/g, new Date().toLocaleDateString("en-IN")),
            status: "DRAFT",
            createdBy: actor.userId,
          },
        });
      }

      // Auto-generate relieving letter
      const relievingTemplate = await prisma.letterTemplate.findFirst({
        where: { letterType: "RELIEVING_LETTER", isActive: true },
      });

      if (relievingTemplate) {
        await prisma.letter.create({
          data: {
            templateId: relievingTemplate.id,
            letterType: "RELIEVING_LETTER",
            recipientId: employee.user.id,
            recipientName: `${employee.user.firstName} ${employee.user.lastName}`,
            recipientEmail: employee.user.email,
            subject: "Relieving Letter — Circuvent Technologies",
            htmlContent: relievingTemplate.htmlContent
              .replace(/\{\{employeeName\}\}/g, `${employee.user.firstName} ${employee.user.lastName}`)
              .replace(/\{\{employeeCode\}\}/g, employee.employeeCode)
              .replace(/\{\{designation\}\}/g, employee.designation)
              .replace(/\{\{department\}\}/g, employee.department)
              .replace(/\{\{date\}\}/g, new Date().toLocaleDateString("en-IN")),
            status: "DRAFT",
            createdBy: actor.userId,
          },
        });
      }
    }

    res.json({
      success: true,
      message: "Exit completed. Experience and relieving letters have been auto-generated.",
      data: { lettersGenerated: ["EXPERIENCE_LETTER", "RELIEVING_LETTER"] },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to complete exit" });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /resignations/analytics — Resignation trends
// ═══════════════════════════════════════════════════════════════

router.get("/analytics", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor || !isHROrAdmin(actor.user.role)) {
      res.status(403).json({ success: false, error: "Access denied" }); return;
    }

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisQuarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

    const [totalResignations, thisMonth, thisQuarter, allResignations] = await Promise.all([
      prisma.resignation.count(),
      prisma.resignation.count({ where: { createdAt: { gte: thisMonthStart } } }),
      prisma.resignation.count({ where: { createdAt: { gte: thisQuarterStart } } }),
      prisma.resignation.findMany({
        select: { reason: true, employeeId: true, noticePeriod: true, createdAt: true },
      }),
    ]);

    // Average notice period
    const avgNoticePeriod = allResignations.length > 0
      ? Math.round(allResignations.reduce((sum, r) => sum + r.noticePeriod, 0) / allResignations.length)
      : 30;

    // By reason
    const reasonMap = new Map<string, number>();
    for (const r of allResignations) {
      const shortReason = r.reason.length > 50 ? r.reason.substring(0, 50) + "..." : r.reason;
      reasonMap.set(shortReason, (reasonMap.get(shortReason) || 0) + 1);
    }
    const byReason = Array.from(reasonMap.entries())
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: totalResignations > 0 ? Number(((count / totalResignations) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // By department
    const deptMap = new Map<string, number>();
    for (const r of allResignations) {
      const emp = await prisma.employee.findUnique({
        where: { id: r.employeeId },
        select: { department: true },
      });
      const dept = emp?.department || "Unknown";
      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    }
    const byDepartment = Array.from(deptMap.entries())
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count);

    // Attrition rate
    const totalEmployees = await prisma.employee.count({ where: { dateOfLeaving: null } });
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearResignations = await prisma.resignation.count({
      where: { createdAt: { gte: yearStart }, status: { in: ["ACCEPTED", "COMPLETED"] } },
    });
    const attritionRate = totalEmployees > 0
      ? Number(((yearResignations / totalEmployees) * 100).toFixed(1))
      : 0;

    res.json({
      success: true,
      data: {
        totalResignations,
        thisMonth,
        thisQuarter,
        avgNoticePeriod,
        byReason,
        byDepartment,
        byTenure: [], // Simplified
        attritionRate,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch analytics" });
  }
});

export default router;
export { router as resignationRouter };
