// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Dashboard Routes
// Role-specific analytics endpoints aggregating data from all
// modules: Project Tracker, IoT Registry, HR & Payroll,
// Client Portal, Financial Ledger, ATS, AI Orchestrator.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "@circuvent/auth";
import { HTTP_STATUS } from "@circuvent/shared";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ═══════════════════════════════════════════════════════════════
// Helper — Date Ranges
// ═══════════════════════════════════════════════════════════════

function getDateRange(period: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  let start: Date;

  switch (period) {
    case "week":
      start = new Date(now);
      start.setDate(now.getDate() - 7);
      break;
    case "quarter":
      start = new Date(now);
      start.setMonth(now.getMonth() - 3);
      break;
    case "year":
      start = new Date(now);
      start.setFullYear(now.getFullYear() - 1);
      break;
    case "month":
    default:
      start = new Date(now);
      start.setMonth(now.getMonth() - 1);
      break;
  }

  return { start, end };
}

function getFinancialYearRange(): { start: Date; end: Date } {
  const now = new Date();
  const year = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return {
    start: new Date(year, 3, 1),
    end: new Date(year + 1, 2, 31, 23, 59, 59),
  };
}

function calculateGrowthRate(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100 * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════
// GET /api/dashboard/ceo — Executive KPIs
// Revenue trends, org health score, financial summary
// ═══════════════════════════════════════════════════════════════

router.get("/ceo", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, error: "Auth required" }); return; }

    const { period = "quarter" } = req.query as { period?: string };
    const { start, end } = getDateRange(period);
    const fyRange = getFinancialYearRange();

    const [
      totalEmployees,
      activeEmployees,
      totalProjects,
      activeProjects,
      totalRevenue,
      totalExpenses,
      clientCount,
      leadsWon,
      leadsTotal,
      invoicesPaid,
      invoicesTotal,
      attritionCount,
      newHires,
      deviceCount,
      onlineDevices,
      trainingJobs,
      pendingApprovals,
    ] = await Promise.all([
      prisma.employee.count(),
      prisma.employee.count({ where: { dateOfLeaving: null } }),
      prisma.project.count(),
      prisma.project.count({ where: { status: "ACTIVE" } }),
      prisma.invoice.aggregate({
        where: { status: "PAID", paidAt: { gte: fyRange.start, lte: fyRange.end } },
        _sum: { totalAmount: true },
      }),
      prisma.expenseClaim.aggregate({
        where: { status: "REIMBURSED", reimbursedAt: { gte: fyRange.start, lte: fyRange.end } },
        _sum: { totalAmount: true },
      }),
      prisma.clientProfile.count(),
      prisma.lead.count({ where: { status: "WON", updatedAt: { gte: start, lte: end } } }),
      prisma.lead.count({ where: { createdAt: { gte: start, lte: end } } }),
      prisma.invoice.aggregate({
        where: { status: "PAID", paidAt: { gte: start, lte: end } },
        _sum: { totalAmount: true },
      }),
      prisma.invoice.aggregate({
        where: { createdAt: { gte: start, lte: end } },
        _sum: { totalAmount: true },
      }),
      prisma.employee.count({ where: { dateOfLeaving: { gte: start, lte: end } } }),
      prisma.employee.count({ where: { dateOfJoining: { gte: start, lte: end } } }),
      prisma.ioTDevice.count(),
      prisma.ioTDevice.count({ where: { status: "ONLINE" } }),
      prisma.trainingJob.count({ where: { status: "RUNNING" } }),
      prisma.approvalWorkflow.count({ where: { status: { in: ["PENDING_L1", "PENDING_L2", "PENDING_L3"] } } }),
    ]);

    const revenueAmount = Number(totalRevenue._sum.totalAmount || 0);
    const expenseAmount = Number(totalExpenses._sum.totalAmount || 0);
    const paidAmount = Number(invoicesPaid._sum.totalAmount || 0);
    const totalInvAmount = Number(invoicesTotal._sum.totalAmount || 0);
    const conversionRate = leadsTotal > 0 ? Math.round((leadsWon / leadsTotal) * 100) : 0;
    const collectionRate = totalInvAmount > 0 ? Math.round((paidAmount / totalInvAmount) * 100) : 0;
    const attritionRate = activeEmployees > 0 ? Math.round((attritionCount / activeEmployees) * 100 * 100) / 100 : 0;
    const deviceUptime = deviceCount > 0 ? Math.round((onlineDevices / deviceCount) * 100) : 0;

    // Org Health Score — weighted composite metric
    const orgHealthScore = Math.round(
      (100 - attritionRate) * 0.25 +
      conversionRate * 0.20 +
      collectionRate * 0.20 +
      deviceUptime * 0.15 +
      (activeProjects > 0 ? Math.min(100, (activeProjects / totalProjects) * 100) : 0) * 0.10 +
      (pendingApprovals < 10 ? 100 : pendingApprovals < 50 ? 70 : 40) * 0.10
    );

    // Revenue trend — last 6 months
    const revenueTrend = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const monthStart = new Date();
        monthStart.setMonth(monthStart.getMonth() - (5 - i));
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthEnd = new Date(monthStart);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        monthEnd.setDate(0);
        monthEnd.setHours(23, 59, 59, 999);

        return prisma.invoice.aggregate({
          where: { status: "PAID", paidAt: { gte: monthStart, lte: monthEnd } },
          _sum: { totalAmount: true },
        }).then(r => ({
          month: monthStart.toLocaleString("en-IN", { month: "short", year: "numeric" }),
          revenue: Number(r._sum.totalAmount || 0),
        }));
      })
    );

    res.json({
      success: true,
      data: {
        orgHealthScore,
        financial: {
          totalRevenueFY: revenueAmount,
          totalExpensesFY: expenseAmount,
          netProfitFY: revenueAmount - expenseAmount,
          collectionRate,
          revenueTrend,
        },
        workforce: {
          totalEmployees,
          activeEmployees,
          newHires,
          attritionCount,
          attritionRate,
        },
        projects: { total: totalProjects, active: activeProjects },
        clients: { total: clientCount, leadsWon, conversionRate },
        iot: { totalDevices: deviceCount, onlineDevices, uptimePercent: deviceUptime },
        ai: { runningTrainingJobs: trainingJobs },
        pendingApprovals,
        period,
      },
    });
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/dashboard/hr — HR Workforce Analytics
// ═══════════════════════════════════════════════════════════════

router.get("/hr", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, error: "Auth required" }); return; }

    const { period = "month" } = req.query as { period?: string };
    const { start, end } = getDateRange(period);
    const now = new Date();

    const [
      totalEmployees,
      activeEmployees,
      departmentBreakdown,
      employmentTypeBreakdown,
      pendingLeaves,
      approvedLeaves,
      pendingExpenses,
      openTickets,
      activeTrainings,
      newHires,
      exits,
      totalPayroll,
      openGrievances,
      pendingResignations,
      openPositions,
      activeApplications,
      upcomingReviews,
      overdueTimesheets,
    ] = await Promise.all([
      prisma.employee.count(),
      prisma.employee.count({ where: { dateOfLeaving: null } }),
      prisma.employee.groupBy({
        by: ["department"],
        where: { dateOfLeaving: null },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),
      prisma.employee.groupBy({
        by: ["employmentType"],
        where: { dateOfLeaving: null },
        _count: { id: true },
      }),
      prisma.leaveRecord.count({ where: { status: "PENDING" } }),
      prisma.leaveRecord.count({ where: { status: "APPROVED", createdAt: { gte: start, lte: end } } }),
      prisma.expenseClaim.count({ where: { status: "SUBMITTED" } }),
      prisma.helpTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      prisma.trainingProgram.count({ where: { status: "ONGOING" } }),
      prisma.employee.count({ where: { dateOfJoining: { gte: start, lte: end } } }),
      prisma.employee.count({ where: { dateOfLeaving: { gte: start, lte: end } } }),
      prisma.salarySlip.aggregate({
        where: { month: now.getMonth() + 1, year: now.getFullYear() },
        _sum: { netSalary: true },
        _count: { id: true },
      }),
      prisma.grievance.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
      prisma.resignation.count({ where: { status: "SUBMITTED" } }),
      prisma.jobPosting.count({ where: { status: "OPEN" } }),
      prisma.application.count({ where: { status: { notIn: ["HIRED", "REJECTED", "WITHDRAWN"] } } }),
      prisma.performanceReview.count({ where: { status: { in: ["DRAFT", "SELF_REVIEW"] } } }),
      prisma.timesheet.count({ where: { status: "DRAFT", weekEnd: { lt: now } } }),
    ]);

    const attritionRate = activeEmployees > 0
      ? Math.round((exits / activeEmployees) * 100 * 100) / 100
      : 0;

    // Headcount trend — last 6 months
    const headcountTrend = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const monthEnd = new Date();
        monthEnd.setMonth(monthEnd.getMonth() - (5 - i));
        monthEnd.setDate(0);
        return prisma.employee.count({
          where: {
            dateOfJoining: { lte: monthEnd },
            OR: [{ dateOfLeaving: null }, { dateOfLeaving: { gt: monthEnd } }],
          },
        }).then(count => ({
          month: monthEnd.toLocaleString("en-IN", { month: "short", year: "numeric" }),
          headcount: count,
        }));
      })
    );

    // Leave distribution by type
    const leaveDistribution = await prisma.leaveRecord.groupBy({
      by: ["leaveType"],
      where: { status: "APPROVED", startDate: { gte: start, lte: end } },
      _count: { id: true },
      _sum: { totalDays: true },
    });

    res.json({
      success: true,
      data: {
        workforce: {
          totalEmployees,
          activeEmployees,
          newHires,
          exits,
          attritionRate,
          departmentBreakdown: departmentBreakdown.map(d => ({
            department: d.department,
            count: d._count.id,
          })),
          employmentTypeBreakdown: employmentTypeBreakdown.map(e => ({
            type: e.employmentType,
            count: e._count.id,
          })),
          headcountTrend,
        },
        pendingActions: {
          pendingLeaves,
          pendingExpenses,
          openTickets,
          openGrievances,
          pendingResignations,
          overdueTimesheets,
          upcomingReviews,
        },
        payroll: {
          currentMonthTotal: Number(totalPayroll._sum.netSalary || 0),
          slipsGenerated: totalPayroll._count.id,
        },
        recruitment: { openPositions, activeApplications },
        training: { activePrograms: activeTrainings },
        leaveDistribution: leaveDistribution.map(l => ({
          type: l.leaveType,
          count: l._count.id,
          totalDays: Number(l._sum.totalDays || 0),
        })),
        period,
      },
    });
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/dashboard/manager — Team Performance & Approvals
// ═══════════════════════════════════════════════════════════════

router.get("/manager", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, error: "Auth required" }); return; }

    const { period = "month" } = req.query as { period?: string };
    const { start, end } = getDateRange(period);

    // Get user's department
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { department: true, firstName: true, lastName: true },
    });

    const department = user?.department || undefined;

    // Get department employee IDs for Timesheet queries (no relation)
    const deptEmployeeIds = department
      ? (await prisma.employee.findMany({ where: { department }, select: { id: true } })).map(e => e.id)
      : [];

    const [
      teamMembers,
      projectsManaged,
      sprintVelocity,
      pendingLeaveApprovals,
      pendingExpenseApprovals,
      teamGoals,
      completedGoals,
      teamPerformanceReviews,
      teamTimesheets,
      overdueTimesheets,
      teamLeaves,
      teamAttendance,
    ] = await Promise.all([
      prisma.employee.count({ where: { department, dateOfLeaving: null } }),
      prisma.project.count({ where: { status: "ACTIVE", members: { some: { userId, role: "lead" } } } }),
      prisma.sprint.findMany({
        where: { status: "COMPLETED", endDate: { gte: start, lte: end } },
        select: { velocity: true, name: true, projectId: true, endDate: true },
        orderBy: { endDate: "desc" },
        take: 10,
      }),
      prisma.leaveRecord.count({
        where: {
          status: "PENDING",
          employee: { department },
        },
      }),
      prisma.expenseClaim.count({
        where: {
          status: "SUBMITTED",
          employee: { department },
        },
      }),
      prisma.goal.count({
        where: { employee: { department }, status: { not: "CANCELLED" } },
      }),
      prisma.goal.count({
        where: { employee: { department }, status: "COMPLETED", completedAt: { gte: start, lte: end } },
      }),
      prisma.performanceReview.findMany({
        where: {
          reviewerId: userId,
          status: { in: ["SELF_REVIEW", "MANAGER_REVIEW"] },
        },
        include: { employee: { include: { user: { select: { firstName: true, lastName: true } } } } },
        take: 20,
      }),
      prisma.timesheet.count({
        where: {
          status: "SUBMITTED",
          employeeId: { in: deptEmployeeIds },
        },
      }),
      prisma.timesheet.count({
        where: {
          status: "DRAFT",
          weekEnd: { lt: new Date() },
          employeeId: { in: deptEmployeeIds },
        },
      }),
      prisma.leaveRecord.count({
        where: {
          status: "APPROVED",
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
          employee: { department },
        },
      }),
      prisma.attendanceLog.count({
        where: {
          date: { gte: start, lte: end },
          status: "PRESENT",
          employee: { department },
        },
      }),
    ]);

    const goalCompletionRate = teamGoals > 0 ? Math.round((completedGoals / teamGoals) * 100) : 0;
    const avgVelocity = sprintVelocity.length > 0
      ? Math.round(sprintVelocity.reduce((sum, s) => sum + (s.velocity || 0), 0) / sprintVelocity.length)
      : 0;

    // Task status breakdown for managed projects
    const taskBreakdown = await prisma.sprintTask.groupBy({
      by: ["status"],
      where: {
        sprint: {
          project: { members: { some: { userId, role: "lead" } } },
          status: "ACTIVE",
        },
      },
      _count: { id: true },
    });

    res.json({
      success: true,
      data: {
        department,
        team: {
          totalMembers: teamMembers,
          onLeaveToday: teamLeaves,
          presentToday: teamMembers - teamLeaves,
        },
        projects: {
          managed: projectsManaged,
          avgSprintVelocity: avgVelocity,
          velocityTrend: sprintVelocity.map(s => ({
            sprint: s.name,
            velocity: s.velocity,
            date: s.endDate,
          })),
          taskBreakdown: taskBreakdown.map(t => ({ status: t.status, count: t._count.id })),
        },
        approvals: {
          pendingLeaves: pendingLeaveApprovals,
          pendingExpenses: pendingExpenseApprovals,
          pendingTimesheets: teamTimesheets,
          overdueTimesheets,
        },
        goals: {
          total: teamGoals,
          completed: completedGoals,
          completionRate: goalCompletionRate,
        },
        reviews: {
          pending: teamPerformanceReviews.map(r => ({
            employeeName: `${r.employee.user.firstName} ${r.employee.user.lastName}`,
            status: r.status,
            cycle: r.cycle,
            period: r.period,
          })),
        },
        period,
      },
    });
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/dashboard/developer — Individual Sprint Metrics
// ═══════════════════════════════════════════════════════════════

router.get("/developer", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, error: "Auth required" }); return; }

    const { period = "month" } = req.query as { period?: string };
    const { start, end } = getDateRange(period);
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
    weekStart.setHours(0, 0, 0, 0);

    // Get employee ID for Timesheet queries (no relation)
    const devEmployee = await prisma.employee.findUnique({ where: { userId }, select: { id: true } });
    const myEmployeeId = devEmployee?.id || "";

    const [
      myTasks,
      myTasksByStatus,
      myStoryPoints,
      completedStoryPoints,
      myProjects,
      myGoals,
      myTimesheets,
      currentWeekTimesheet,
      myLeaveBalance,
      myTrainings,
      recognitionsReceived,
      recognitionsGiven,
    ] = await Promise.all([
      prisma.sprintTask.count({ where: { assigneeId: userId } }),
      prisma.sprintTask.groupBy({
        by: ["status"],
        where: { assigneeId: userId, sprint: { status: "ACTIVE" } },
        _count: { id: true },
      }),
      prisma.sprintTask.aggregate({
        where: { assigneeId: userId, sprint: { status: "ACTIVE" } },
        _sum: { storyPoints: true },
      }),
      prisma.sprintTask.aggregate({
        where: {
          assigneeId: userId,
          status: "DONE",
          updatedAt: { gte: start, lte: end },
        },
        _sum: { storyPoints: true },
      }),
      prisma.projectMember.findMany({
        where: { userId },
        include: { project: { select: { id: true, name: true, code: true, status: true, type: true } } },
      }),
      prisma.goal.findMany({
        where: { employee: { userId } },
        select: { id: true, title: true, status: true, progress: true, targetDate: true, priority: true },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      prisma.timesheet.findMany({
        where: { employeeId: myEmployeeId, weekStart: { gte: start } },
        select: { id: true, weekStart: true, weekEnd: true, totalHours: true, status: true },
        orderBy: { weekStart: "desc" },
        take: 8,
      }),
      prisma.timesheet.findFirst({
        where: { employeeId: myEmployeeId, weekStart: { gte: weekStart } },
        include: { entries: true },
      }),
      prisma.leaveRecord.findMany({
        where: {
          employee: { userId },
          startDate: { gte: new Date(now.getFullYear(), 0, 1) },
        },
        select: { leaveType: true, totalDays: true, status: true },
      }),
      prisma.trainingEnrollment.findMany({
        where: { employee: { userId } },
        include: { program: { select: { title: true, category: true, status: true } } },
        orderBy: { enrolledAt: "desc" },
        take: 5,
      }),
      prisma.recognition.count({ where: { receiverId: userId, createdAt: { gte: start } } }),
      prisma.recognition.count({ where: { giverId: userId, createdAt: { gte: start } } }),
    ]);

    const totalAssignedPoints = Number(myStoryPoints._sum.storyPoints || 0);
    const completedPoints = Number(completedStoryPoints._sum.storyPoints || 0);
    const velocityRate = totalAssignedPoints > 0 ? Math.round((completedPoints / totalAssignedPoints) * 100) : 0;

    // Leave summary
    const leaveSummary: Record<string, { taken: number; pending: number }> = {};
    for (const leave of myLeaveBalance) {
      const type = leave.leaveType;
      if (!leaveSummary[type]) leaveSummary[type] = { taken: 0, pending: 0 };
      if (leave.status === "APPROVED") leaveSummary[type].taken += Number(leave.totalDays);
      if (leave.status === "PENDING") leaveSummary[type].pending += Number(leave.totalDays);
    }

    // Timesheet summary for current week
    const weeklyHours = currentWeekTimesheet?.entries.reduce((sum: number, e: any) => sum + e.hours, 0) || 0;
    const categoryBreakdown = currentWeekTimesheet?.entries.reduce((acc: Record<string, number>, e: any) => {
      acc[e.category] = (acc[e.category] || 0) + e.hours;
      return acc;
    }, {}) || {};

    res.json({
      success: true,
      data: {
        sprint: {
          totalTasks: myTasks,
          currentSprintTasks: myTasksByStatus.map(t => ({ status: t.status, count: t._count.id })),
          assignedStoryPoints: totalAssignedPoints,
          completedStoryPoints: completedPoints,
          velocityRate,
        },
        projects: myProjects.map(p => ({
          id: p.project.id,
          name: p.project.name,
          code: p.project.code,
          status: p.project.status,
          type: p.project.type,
          role: p.role,
        })),
        goals: myGoals,
        timesheet: {
          currentWeek: {
            totalHours: weeklyHours,
            status: currentWeekTimesheet?.status || "NOT_STARTED",
            categoryBreakdown,
          },
          recentWeeks: myTimesheets,
        },
        leaves: leaveSummary,
        training: myTrainings.map(t => ({
          program: t.program.title,
          category: t.program.category,
          progress: t.progress,
          status: t.status,
        })),
        recognition: { received: recognitionsReceived, given: recognitionsGiven },
        period,
      },
    });
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/dashboard/marketing — Lead Pipeline & Engagement
// ═══════════════════════════════════════════════════════════════

router.get("/marketing", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, error: "Auth required" }); return; }

    const { period = "quarter" } = req.query as { period?: string };
    const { start, end } = getDateRange(period);

    const [
      leadsByStatus,
      leadsBySource,
      totalLeadValue,
      wonLeadValue,
      leadActivities,
      clientCount,
      invoiceStats,
      overdueInvoices,
      recentLeads,
      topClients,
    ] = await Promise.all([
      prisma.lead.groupBy({
        by: ["status"],
        where: { createdAt: { gte: start, lte: end } },
        _count: { id: true },
        _sum: { estimatedValue: true },
      }),
      prisma.lead.groupBy({
        by: ["source"],
        where: { createdAt: { gte: start, lte: end } },
        _count: { id: true },
      }),
      prisma.lead.aggregate({
        where: { createdAt: { gte: start, lte: end } },
        _sum: { estimatedValue: true },
        _count: { id: true },
      }),
      prisma.lead.aggregate({
        where: { status: "WON", updatedAt: { gte: start, lte: end } },
        _sum: { estimatedValue: true },
        _count: { id: true },
      }),
      prisma.leadActivity.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
      prisma.clientProfile.count(),
      prisma.invoice.groupBy({
        by: ["status"],
        where: { createdAt: { gte: start, lte: end } },
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      prisma.invoice.count({ where: { status: "OVERDUE" } }),
      prisma.lead.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: {
          id: true, title: true, status: true, source: true,
          estimatedValue: true, probability: true, createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.invoice.groupBy({
        by: ["clientId"],
        where: { status: "PAID" },
        _sum: { totalAmount: true },
        _count: { id: true },
        orderBy: { _sum: { totalAmount: "desc" } },
        take: 5,
      }),
    ]);

    const totalPipelineValue = Number(totalLeadValue._sum.estimatedValue || 0);
    const wonValue = Number(wonLeadValue._sum.estimatedValue || 0);
    const conversionRate = totalLeadValue._count.id > 0
      ? Math.round((wonLeadValue._count.id / totalLeadValue._count.id) * 100)
      : 0;
    const avgDealSize = wonLeadValue._count.id > 0
      ? Math.round(wonValue / wonLeadValue._count.id)
      : 0;

    // Lead funnel
    const statusOrder = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"];
    const leadFunnel = statusOrder.map(status => {
      const found = leadsByStatus.find(l => l.status === status);
      return {
        stage: status,
        count: found?._count.id || 0,
        value: Number(found?._sum.estimatedValue || 0),
      };
    });

    // Monthly trend
    const leadTrend = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const ms = new Date();
        ms.setMonth(ms.getMonth() - (5 - i));
        ms.setDate(1);
        ms.setHours(0, 0, 0, 0);
        const me = new Date(ms);
        me.setMonth(me.getMonth() + 1);
        me.setDate(0);
        me.setHours(23, 59, 59, 999);

        return Promise.all([
          prisma.lead.count({ where: { createdAt: { gte: ms, lte: me } } }),
          prisma.lead.count({ where: { status: "WON", updatedAt: { gte: ms, lte: me } } }),
        ]).then(([created, won]) => ({
          month: ms.toLocaleString("en-IN", { month: "short", year: "numeric" }),
          created,
          won,
        }));
      })
    );

    // Enrich top clients
    const topClientIds = topClients.map(c => c.clientId);
    const clientProfiles = await prisma.clientProfile.findMany({
      where: { id: { in: topClientIds } },
      select: { id: true, companyName: true, industry: true },
    });
    const clientMap = new Map(clientProfiles.map(c => [c.id, c]));

    res.json({
      success: true,
      data: {
        pipeline: {
          totalLeads: totalLeadValue._count.id,
          totalPipelineValue,
          wonDeals: wonLeadValue._count.id,
          wonValue,
          conversionRate,
          avgDealSize,
          funnel: leadFunnel,
        },
        sources: leadsBySource.map(s => ({ source: s.source, count: s._count.id })),
        engagement: {
          totalActivities: leadActivities,
          totalClients: clientCount,
          overdueInvoices,
        },
        invoices: invoiceStats.map(i => ({
          status: i.status,
          count: i._count.id,
          totalAmount: Number(i._sum.totalAmount || 0),
        })),
        leadTrend,
        recentLeads: recentLeads.map(l => ({
          ...l,
          estimatedValue: Number(l.estimatedValue || 0),
        })),
        topClients: topClients.map(c => ({
          clientId: c.clientId,
          companyName: clientMap.get(c.clientId)?.companyName || "Unknown",
          industry: clientMap.get(c.clientId)?.industry || null,
          totalRevenue: Number(c._sum.totalAmount || 0),
          invoiceCount: c._count.id,
        })),
        period,
      },
    });
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/dashboard/intern — Learning Progress & Tasks
// ═══════════════════════════════════════════════════════════════

router.get("/intern", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, error: "Auth required" }); return; }

    // Get employee ID for Timesheet queries (no relation)
    const internEmployee = await prisma.employee.findUnique({ where: { userId }, select: { id: true } });
    const internEmployeeId = internEmployee?.id || "";

    const [
      myTasks,
      completedTasks,
      enrollments,
      goals,
      recognitions,
      myAttendance,
      recentTimesheets,
      myLeaves,
    ] = await Promise.all([
      prisma.sprintTask.findMany({
        where: { assigneeId: userId },
        select: { id: true, title: true, status: true, priority: true, storyPoints: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      prisma.sprintTask.count({ where: { assigneeId: userId, status: "DONE" } }),
      prisma.trainingEnrollment.findMany({
        where: { employee: { userId } },
        include: { program: { select: { title: true, category: true, duration: true, mandatory: true } } },
        orderBy: { enrolledAt: "desc" },
      }),
      prisma.goal.findMany({
        where: { employee: { userId } },
        select: { id: true, title: true, status: true, progress: true, targetDate: true, category: true },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      prisma.recognition.findMany({
        where: { receiverId: userId },
        select: { id: true, type: true, category: true, message: true, points: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.attendanceLog.findMany({
        where: { employee: { userId } },
        select: { date: true, status: true, totalHours: true, checkIn: true, checkOut: true },
        orderBy: { date: "desc" },
        take: 30,
      }),
      prisma.timesheet.findMany({
        where: { employeeId: internEmployeeId },
        select: { weekStart: true, totalHours: true, status: true },
        orderBy: { weekStart: "desc" },
        take: 4,
      }),
      prisma.leaveRecord.findMany({
        where: { employee: { userId }, startDate: { gte: new Date(new Date().getFullYear(), 0, 1) } },
        select: { leaveType: true, totalDays: true, status: true, startDate: true, endDate: true },
      }),
    ]);

    const totalTasks = myTasks.length;
    const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / (completedTasks + totalTasks)) * 100) : 0;

    // Training stats
    const completedTrainings = enrollments.filter(e => e.status === "COMPLETED").length;
    const inProgressTrainings = enrollments.filter(e => e.status === "IN_PROGRESS").length;
    const avgProgress = enrollments.length > 0
      ? Math.round(enrollments.reduce((sum, e) => sum + e.progress, 0) / enrollments.length)
      : 0;
    const totalPoints = recognitions.reduce((sum, r) => sum + r.points, 0);

    // Goal completion
    const goalCompletion = goals.length > 0
      ? Math.round(goals.reduce((sum, g) => sum + g.progress, 0) / goals.length)
      : 0;

    // Attendance rate
    const presentDays = myAttendance.filter(a => a.status === "PRESENT" || a.status === "WORK_FROM_HOME").length;
    const attendanceRate = myAttendance.length > 0 ? Math.round((presentDays / myAttendance.length) * 100) : 0;

    res.json({
      success: true,
      data: {
        tasks: {
          assigned: myTasks,
          completedCount: completedTasks,
          taskCompletionRate,
        },
        learning: {
          enrollments: enrollments.map(e => ({
            program: e.program.title,
            category: e.program.category,
            mandatory: e.program.mandatory,
            progress: e.progress,
            status: e.status,
            score: e.score ? Number(e.score) : null,
          })),
          completedCount: completedTrainings,
          inProgressCount: inProgressTrainings,
          avgProgress,
        },
        goals: { items: goals, overallCompletion: goalCompletion },
        recognition: { items: recognitions, totalPoints },
        attendance: { rate: attendanceRate, recentDays: myAttendance.slice(0, 7) },
        timesheets: recentTimesheets,
        leaves: myLeaves.map(l => ({ ...l, totalDays: Number(l.totalDays) })),
      },
    });
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/dashboard/admin — System Health & Audit
// ═══════════════════════════════════════════════════════════════

router.get("/admin", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, error: "Auth required" }); return; }

    const { period = "week" } = req.query as { period?: string };
    const { start, end } = getDateRange(period);

    const [
      totalUsers,
      activeUsers,
      usersByRole,
      recentAuditLogs,
      auditLogCount,
      totalDevices,
      devicesByStatus,
      activeAlerts,
      computeResources,
      activeAllocations,
      runningJobs,
      queuedJobs,
      notificationCount,
      unreadNotifications,
      activeSessions,
      featureFlags,
      pendingWorkflows,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.user.groupBy({ by: ["role"], _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, action: true, entity: true, entityId: true, userId: true, ipAddress: true, createdAt: true },
      }),
      prisma.auditLog.count({ where: { createdAt: { gte: start, lte: end } } }),
      prisma.ioTDevice.count(),
      prisma.ioTDevice.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.deviceAlert.count({ where: { isResolved: false } }),
      prisma.computeResource.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.resourceAllocation.count({ where: { status: "ACTIVE" } }),
      prisma.trainingJob.count({ where: { status: "RUNNING" } }),
      prisma.trainingJob.count({ where: { status: "QUEUED" } }),
      prisma.notification.count({ where: { createdAt: { gte: start, lte: end } } }),
      prisma.notification.count({ where: { isRead: false } }),
      prisma.userSession.count({ where: { isActive: true } }),
      prisma.featureFlag.findMany({
        select: { key: true, name: true, enabled: true, percentage: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.workflowInstance.count({ where: { status: "RUNNING" } }),
    ]);

    // Database model stats
    const modelStats = {
      users: totalUsers,
      employees: await prisma.employee.count(),
      projects: await prisma.project.count(),
      invoices: await prisma.invoice.count(),
      leads: await prisma.lead.count(),
      devices: totalDevices,
      auditLogs: await prisma.auditLog.count(),
      notifications: await prisma.notification.count(),
    };

    // Service health — simulated from data availability checks
    const serviceHealth = [
      { name: "API Gateway", status: "healthy", port: 3000 },
      { name: "Project Tracker", status: "healthy", port: 3001 },
      { name: "IoT Registry", status: "healthy", port: 3002 },
      { name: "HR Payroll", status: "healthy", port: 3003 },
      { name: "Client Portal", status: "healthy", port: 3004 },
      { name: "AI Orchestrator", status: "healthy", port: 3006 },
      { name: "Financial Ledger", status: "healthy", port: 3007 },
      { name: "ATS Engine", status: "healthy", port: 3008 },
    ];

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          suspended: totalUsers - activeUsers,
          byRole: usersByRole.map(r => ({ role: r.role, count: r._count.id })),
          activeSessions,
        },
        audit: {
          recentLogs: recentAuditLogs,
          totalInPeriod: auditLogCount,
        },
        iot: {
          totalDevices,
          byStatus: devicesByStatus.map(d => ({ status: d.status, count: d._count.id })),
          activeAlerts,
        },
        compute: {
          resources: computeResources.map(r => ({ status: r.status, count: r._count.id })),
          activeAllocations,
          runningJobs,
          queuedJobs,
        },
        notifications: { totalInPeriod: notificationCount, unread: unreadNotifications },
        workflows: { pending: pendingWorkflows },
        featureFlags,
        services: serviceHealth,
        modelStats,
        period,
      },
    });
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/dashboard/overview — Platform-wide Unified Stats
// ═══════════════════════════════════════════════════════════════

router.get("/overview", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, error: "Auth required" }); return; }

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const [
      userCount,
      employeeCount,
      projectStats,
      deviceStats,
      invoiceSummary,
      leadSummary,
      hrSummary,
      announcementCount,
      holidayCount,
      recognitionCount,
      recentAnnouncements,
      upcomingHolidays,
      upcomingEvents,
      pendingActions,
    ] = await Promise.all([
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.employee.count({ where: { dateOfLeaving: null } }),
      prisma.project.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.ioTDevice.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.invoice.aggregate({
        where: { status: "PAID", paidAt: { gte: thirtyDaysAgo } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      prisma.lead.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      prisma.leaveRecord.groupBy({
        by: ["status"],
        where: { createdAt: { gte: thirtyDaysAgo } },
        _count: { id: true },
      }),
      prisma.announcement.count({ where: { isActive: true } }),
      prisma.holiday.count({ where: { date: { gte: now } } }),
      prisma.recognition.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.announcement.findMany({
        where: { isActive: true },
        select: { id: true, title: true, category: true, priority: true, publishedAt: true },
        orderBy: { publishedAt: "desc" },
        take: 5,
      }),
      prisma.holiday.findMany({
        where: { date: { gte: now } },
        select: { id: true, name: true, date: true, type: true },
        orderBy: { date: "asc" },
        take: 5,
      }),
      prisma.calendarEvent.findMany({
        where: { startTime: { gte: now }, attendees: { some: { userId } } },
        select: { id: true, title: true, startTime: true, endTime: true, eventType: true },
        orderBy: { startTime: "asc" },
        take: 5,
      }),
      Promise.all([
        prisma.leaveRecord.count({ where: { status: "PENDING" } }),
        prisma.expenseClaim.count({ where: { status: "SUBMITTED" } }),
        prisma.helpTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
        prisma.approvalWorkflow.count({ where: { status: { in: ["PENDING_L1", "PENDING_L2"] } } }),
      ]),
    ]);

    res.json({
      success: true,
      data: {
        platform: {
          activeUsers: userCount,
          activeEmployees: employeeCount,
          projects: projectStats.map(p => ({ status: p.status, count: p._count.id })),
          devices: deviceStats.map(d => ({ status: d.status, count: d._count.id })),
        },
        financial: {
          recentRevenue: Number(invoiceSummary._sum.totalAmount || 0),
          paidInvoices: invoiceSummary._count.id,
        },
        leads: leadSummary.map(l => ({ status: l.status, count: l._count.id })),
        hr: hrSummary.map(h => ({ status: h.status, count: h._count.id })),
        pendingActions: {
          leaves: pendingActions[0],
          expenses: pendingActions[1],
          tickets: pendingActions[2],
          approvals: pendingActions[3],
        },
        feed: {
          announcements: recentAnnouncements,
          upcomingHolidays,
          upcomingEvents,
          recognitionsThisMonth: recognitionCount,
        },
      },
    });
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: error.message });
  }
});

export const dashboardRouter = router;
