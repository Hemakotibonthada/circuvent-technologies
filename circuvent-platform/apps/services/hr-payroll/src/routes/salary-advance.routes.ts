// ──────────────────────────────────────────────────────────────
// HR & Payroll — Salary Advance Routes
// Complete CRUD for salary advance requests, approvals,
// auto-deduction from payroll, and dashboard stats.
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
    include: { user: { select: { id: true, firstName: true, lastName: true, role: true, email: true } } },
  });
}

async function getMaxAdvance(employeeId: string): Promise<{ grossSalary: number; netSalary: number; maxAdvance: number; pendingAdvances: number; available: number }> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      salarySlips: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!employee) throw new Error("Employee not found");

  const latestSlip = employee.salarySlips[0];
  const grossSalary = latestSlip ? Number(latestSlip.grossSalary) : Number(employee.baseSalary);
  const netSalary = latestSlip ? Number(latestSlip.netSalary) : grossSalary * 0.75;
  const maxAdvance = Math.round(netSalary * 0.5);

  const pending = await prisma.salaryAdvance.aggregate({
    where: {
      employeeId,
      status: { in: ["PENDING", "APPROVED"] },
    },
    _sum: { amount: true },
  });

  const pendingAdvances = Number(pending._sum.amount || 0);
  const available = Math.max(0, maxAdvance - pendingAdvances);

  return { grossSalary, netSalary, maxAdvance, pendingAdvances, available };
}

function isHROrAdmin(role: string): boolean {
  return ["ADMIN", "SUPER_ADMIN", "HR_MANAGER", "CEO"].includes(role);
}

// ═══════════════════════════════════════════════════════════════
// POST /salary-advances — Request advance
// ═══════════════════════════════════════════════════════════════

router.post("/", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }

    const { amount, reason, repaymentMonths } = req.body;
    if (!amount || amount <= 0) { res.status(400).json({ success: false, error: "Valid amount required" }); return; }
    if (!reason) { res.status(400).json({ success: false, error: "Reason required" }); return; }

    // Check max advance limit
    const limits = await getMaxAdvance(actor.id);
    if (amount > limits.available) {
      res.status(400).json({
        success: false,
        error: `Amount exceeds maximum. Available: ₹${limits.available.toLocaleString("en-IN")}, Max: ₹${limits.maxAdvance.toLocaleString("en-IN")}, Pending: ₹${limits.pendingAdvances.toLocaleString("en-IN")}`,
      });
      return;
    }

    const advance = await prisma.salaryAdvance.create({
      data: {
        employeeId: actor.id,
        amount,
        reason,
        repaymentMonths: repaymentMonths || 3,
        status: "PENDING",
      },
    });

    res.status(201).json({ success: true, data: advance, message: "Salary advance requested" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to request advance" });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /salary-advances/my — My advances
// ═══════════════════════════════════════════════════════════════

router.get("/my", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }

    const advances = await prisma.salaryAdvance.findMany({
      where: { employeeId: actor.id },
      orderBy: { createdAt: "desc" },
    });

    const limits = await getMaxAdvance(actor.id);

    res.json({ success: true, data: { advances, limits } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch advances" });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /salary-advances — List all (admin/HR only)
// ═══════════════════════════════════════════════════════════════

router.get("/", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor || !isHROrAdmin(actor.user.role)) {
      res.status(403).json({ success: false, error: "Access denied" }); return;
    }

    const { status, employeeId, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;

    const skip = (Number(page) - 1) * Number(limit);
    const [advances, total] = await Promise.all([
      prisma.salaryAdvance.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
      }),
      prisma.salaryAdvance.count({ where }),
    ]);

    res.json({ success: true, data: advances, meta: { total, page: Number(page), limit: Number(limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch advances" });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /salary-advances/pending — Pending approvals
// ═══════════════════════════════════════════════════════════════

router.get("/pending", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor || !isHROrAdmin(actor.user.role)) {
      res.status(403).json({ success: false, error: "Access denied" }); return;
    }

    const pending = await prisma.salaryAdvance.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });

    // Enrich with employee details
    const enriched = await Promise.all(
      pending.map(async (adv) => {
        const emp = await prisma.employee.findUnique({
          where: { id: adv.employeeId },
          include: { user: { select: { firstName: true, lastName: true, department: true } } },
        });
        return {
          ...adv,
          employeeName: emp ? `${emp.user.firstName} ${emp.user.lastName}` : "Unknown",
          department: emp?.department || "N/A",
        };
      })
    );

    res.json({ success: true, data: enriched });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch pending" });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /salary-advances/:id/approve
// ═══════════════════════════════════════════════════════════════

router.post("/:id/approve", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor || !isHROrAdmin(actor.user.role)) {
      res.status(403).json({ success: false, error: "Only HR/Admin can approve" }); return;
    }

    const advance = await prisma.salaryAdvance.findUnique({ where: { id: req.params.id } });
    if (!advance) { res.status(404).json({ success: false, error: "Advance not found" }); return; }
    if (advance.status !== "PENDING") {
      res.status(400).json({ success: false, error: `Cannot approve — status is ${advance.status}` }); return;
    }

    const updated = await prisma.salaryAdvance.update({
      where: { id: req.params.id },
      data: {
        status: "APPROVED",
        approvedBy: actor.userId,
        approvedAt: new Date(),
      },
    });

    res.json({ success: true, data: updated, message: "Salary advance approved" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to approve" });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /salary-advances/:id/reject
// ═══════════════════════════════════════════════════════════════

router.post("/:id/reject", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor || !isHROrAdmin(actor.user.role)) {
      res.status(403).json({ success: false, error: "Only HR/Admin can reject" }); return;
    }

    const { reason } = req.body;
    const advance = await prisma.salaryAdvance.findUnique({ where: { id: req.params.id } });
    if (!advance) { res.status(404).json({ success: false, error: "Advance not found" }); return; }
    if (advance.status !== "PENDING") {
      res.status(400).json({ success: false, error: `Cannot reject — status is ${advance.status}` }); return;
    }

    const updated = await prisma.salaryAdvance.update({
      where: { id: req.params.id },
      data: {
        status: "REJECTED",
        rejectionReason: reason || "Request denied",
        approvedBy: actor.userId,
        approvedAt: new Date(),
      },
    });

    res.json({ success: true, data: updated, message: "Salary advance rejected" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to reject" });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /salary-advances/:id/cancel
// ═══════════════════════════════════════════════════════════════

router.post("/:id/cancel", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }

    const advance = await prisma.salaryAdvance.findUnique({ where: { id: req.params.id } });
    if (!advance) { res.status(404).json({ success: false, error: "Advance not found" }); return; }
    if (advance.employeeId !== actor.id) {
      res.status(403).json({ success: false, error: "Can only cancel your own advance" }); return;
    }
    if (advance.status !== "PENDING") {
      res.status(400).json({ success: false, error: `Cannot cancel — status is ${advance.status}` }); return;
    }

    const updated = await prisma.salaryAdvance.update({
      where: { id: req.params.id },
      data: { status: "REJECTED", rejectionReason: "Cancelled by employee" },
    });

    res.json({ success: true, data: updated, message: "Salary advance cancelled" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to cancel" });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /salary-advances/dashboard — Stats
// ═══════════════════════════════════════════════════════════════

router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor || !isHROrAdmin(actor.user.role)) {
      res.status(403).json({ success: false, error: "Access denied" }); return;
    }

    const [totalCount, pendingCount, approvedCount, rejectedCount, disbursedCount] = await Promise.all([
      prisma.salaryAdvance.count(),
      prisma.salaryAdvance.count({ where: { status: "PENDING" } }),
      prisma.salaryAdvance.count({ where: { status: "APPROVED" } }),
      prisma.salaryAdvance.count({ where: { status: "REJECTED" } }),
      prisma.salaryAdvance.count({ where: { status: "DISBURSED" } }),
    ]);

    const totalAmountResult = await prisma.salaryAdvance.aggregate({
      where: { status: { in: ["APPROVED", "DISBURSED"] } },
      _sum: { amount: true },
    });

    const pendingAmountResult = await prisma.salaryAdvance.aggregate({
      where: { status: "PENDING" },
      _sum: { amount: true },
    });

    // Monthly trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const recentAdvances = await prisma.salaryAdvance.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true, amount: true, status: true },
    });

    const monthlyTrend = new Map<string, { count: number; amount: number }>();
    for (const adv of recentAdvances) {
      const key = `${adv.createdAt.getFullYear()}-${String(adv.createdAt.getMonth() + 1).padStart(2, "0")}`;
      const entry = monthlyTrend.get(key) || { count: 0, amount: 0 };
      entry.count++;
      entry.amount += Number(adv.amount);
      monthlyTrend.set(key, entry);
    }

    res.json({
      success: true,
      data: {
        totalCount,
        pendingCount,
        approvedCount,
        rejectedCount,
        disbursedCount,
        totalDisbursed: Number(totalAmountResult._sum.amount || 0),
        pendingAmount: Number(pendingAmountResult._sum.amount || 0),
        monthlyTrend: Array.from(monthlyTrend.entries())
          .map(([month, data]) => ({ month, ...data }))
          .sort((a, b) => a.month.localeCompare(b.month)),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch dashboard" });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /salary-advances/auto-deduct — Auto-deduct from payroll
// ═══════════════════════════════════════════════════════════════

router.post("/auto-deduct", async (req: Request, res: Response) => {
  try {
    const actor = await resolveEmployee(req);
    if (!actor || !isHROrAdmin(actor.user.role)) {
      res.status(403).json({ success: false, error: "Only HR/Admin can trigger auto-deduction" }); return;
    }

    const { month, year } = req.body;
    const targetMonth = month || new Date().getMonth() + 1;
    const targetYear = year || new Date().getFullYear();

    // Find all approved advances that haven't been disbursed
    const approvedAdvances = await prisma.salaryAdvance.findMany({
      where: { status: { in: ["APPROVED", "DISBURSED"] } },
    });

    let deductedCount = 0;
    let totalDeducted = 0;
    const results: Array<{ employeeId: string; amount: number; status: string }> = [];

    for (const advance of approvedAdvances) {
      const repaymentMonths = advance.repaymentMonths || 3;
      const monthlyDeduction = Math.round(Number(advance.amount) / repaymentMonths);

      if (monthlyDeduction <= 0) continue;

      // Check if salary slip exists for this month
      const existingSlip = await prisma.salarySlip.findUnique({
        where: {
          employeeId_month_year: {
            employeeId: advance.employeeId,
            month: targetMonth,
            year: targetYear,
          },
        },
      });

      if (existingSlip && !existingSlip.isPaid) {
        // Update the salary slip with the deduction
        const currentOtherDeductions = Number(existingSlip.otherDeductions);
        const newOtherDeductions = currentOtherDeductions + monthlyDeduction;
        const newTotalDeductions = Number(existingSlip.totalDeductions) + monthlyDeduction;
        const newNetSalary = Number(existingSlip.netSalary) - monthlyDeduction;

        await prisma.salarySlip.update({
          where: { id: existingSlip.id },
          data: {
            otherDeductions: newOtherDeductions,
            totalDeductions: newTotalDeductions,
            netSalary: Math.max(0, newNetSalary),
          },
        });

        deductedCount++;
        totalDeducted += monthlyDeduction;
        results.push({ employeeId: advance.employeeId, amount: monthlyDeduction, status: "DEDUCTED" });
      } else {
        results.push({ employeeId: advance.employeeId, amount: monthlyDeduction, status: "SKIPPED" });
      }
    }

    res.json({
      success: true,
      data: {
        month: targetMonth,
        year: targetYear,
        processedCount: approvedAdvances.length,
        deductedCount,
        totalDeducted,
        results,
      },
      message: `Auto-deduction processed: ${deductedCount} deductions totaling ₹${totalDeducted.toLocaleString("en-IN")}`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to process auto-deduction" });
  }
});

export default router;
export { router as salaryAdvanceRouter };
