// ══════════════════════════════════════════════════════════════════════════════
// HR Payroll — Admin & Analytics Routes
// HR admin dashboard, workforce analytics, attrition tracking,
// compensation benchmarking, and compliance reporting.
// ══════════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

/** GET /workforce — Workforce analytics dashboard */
router.get("/workforce", async (_req: Request, res: Response) => {
  try {
    const [total, byDept, byType, byDesignation, recentJoiners, recentLeavers, genderDist] = await Promise.all([
      prisma.employee.count({ where: { dateOfLeaving: null } }),
      prisma.employee.groupBy({ by: ["department"], _count: true, where: { dateOfLeaving: null }, orderBy: { department: "asc" } }),
      prisma.employee.groupBy({ by: ["employmentType"], _count: true, where: { dateOfLeaving: null } }),
      prisma.employee.groupBy({ by: ["designation"], _count: true, where: { dateOfLeaving: null }, orderBy: { _count: { id: "desc" } }, take: 10 }),
      prisma.employee.findMany({ where: { dateOfLeaving: null }, orderBy: { dateOfJoining: "desc" }, take: 5, include: { user: { select: { firstName: true, lastName: true } } } }),
      prisma.employee.findMany({ where: { dateOfLeaving: { not: null } }, orderBy: { dateOfLeaving: "desc" }, take: 5, include: { user: { select: { firstName: true, lastName: true } } } }),
      prisma.user.groupBy({ by: ["role"], _count: true, where: { status: "ACTIVE" } }),
    ]);

    // Average tenure
    const employees = await prisma.employee.findMany({ where: { dateOfLeaving: null }, select: { dateOfJoining: true } });
    const totalTenureMonths = employees.reduce((s, e) => s + Math.floor((Date.now() - new Date(e.dateOfJoining).getTime()) / (30 * 24 * 60 * 60 * 1000)), 0);
    const avgTenureMonths = employees.length > 0 ? Math.round(totalTenureMonths / employees.length) : 0;

    // Attrition rate (last 12 months)
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const leftInYear = await prisma.employee.count({ where: { dateOfLeaving: { gte: yearAgo } } });
    const attritionRate = total > 0 ? Number(((leftInYear / total) * 100).toFixed(1)) : 0;

    // Headcount trend (last 6 months)
    const headcountTrend = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const count = await prisma.employee.count({
        where: {
          dateOfJoining: { lte: monthEnd },
          OR: [{ dateOfLeaving: null }, { dateOfLeaving: { gt: monthEnd } }],
        },
      });
      headcountTrend.push({
        month: `${date.toLocaleString("default", { month: "short" })} ${date.getFullYear()}`,
        count,
      });
    }

    res.json(successResponse({
      totalHeadcount: total,
      attritionRate,
      avgTenureMonths,
      byDepartment: byDept.map(d => ({ department: d.department, count: d._count })),
      byEmploymentType: byType.map(t => ({ type: t.employmentType, count: t._count })),
      topDesignations: byDesignation.map(d => ({ designation: d.designation, count: d._count })),
      roleDistribution: genderDist.map(g => ({ role: g.role, count: g._count })),
      recentJoiners: recentJoiners.map(e => ({ name: `${e.user.firstName} ${e.user.lastName}`, department: e.department, designation: e.designation, joined: e.dateOfJoining })),
      recentLeavers: recentLeavers.map(e => ({ name: `${e.user.firstName} ${e.user.lastName}`, department: e.department, left: e.dateOfLeaving })),
      headcountTrend,
      leftThisYear: leftInYear,
    }));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** GET /compensation — Compensation analytics */
router.get("/compensation", async (_req: Request, res: Response) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { dateOfLeaving: null },
      select: { id: true, department: true, designation: true, baseSalary: true, employmentType: true, dateOfJoining: true },
    });

    const salaries = employees.map(e => Number(e.baseSalary));
    const avgSalary = salaries.length > 0 ? Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length) : 0;
    const medianSalary = salaries.length > 0 ? salaries.sort((a, b) => a - b)[Math.floor(salaries.length / 2)] : 0;
    const maxSalary = Math.max(...salaries, 0);
    const minSalary = Math.min(...salaries, 0);
    const totalPayroll = salaries.reduce((a, b) => a + b, 0);

    // By department
    const deptSalaries: Record<string, { count: number; total: number; avg: number; min: number; max: number }> = {};
    for (const e of employees) {
      if (!deptSalaries[e.department]) deptSalaries[e.department] = { count: 0, total: 0, avg: 0, min: Infinity, max: 0 };
      const s = Number(e.baseSalary);
      deptSalaries[e.department].count++;
      deptSalaries[e.department].total += s;
      deptSalaries[e.department].min = Math.min(deptSalaries[e.department].min, s);
      deptSalaries[e.department].max = Math.max(deptSalaries[e.department].max, s);
    }
    for (const dept of Object.keys(deptSalaries)) {
      deptSalaries[dept].avg = Math.round(deptSalaries[dept].total / deptSalaries[dept].count);
    }

    // Salary bands
    const bands = [
      { label: "< ₹3L", min: 0, max: 25000, count: 0 },
      { label: "₹3L-6L", min: 25001, max: 50000, count: 0 },
      { label: "₹6L-10L", min: 50001, max: 83333, count: 0 },
      { label: "₹10L-15L", min: 83334, max: 125000, count: 0 },
      { label: "₹15L-25L", min: 125001, max: 208333, count: 0 },
      { label: "> ₹25L", min: 208334, max: Infinity, count: 0 },
    ];
    for (const s of salaries) {
      const band = bands.find(b => s >= b.min && s <= b.max);
      if (band) band.count++;
    }

    res.json(successResponse({
      overview: {
        totalEmployees: employees.length,
        totalMonthlyPayroll: totalPayroll,
        totalAnnualPayroll: totalPayroll * 12,
        avgMonthlySalary: avgSalary,
        medianMonthlySalary: medianSalary,
        minSalary, maxSalary,
        payrollToRevenueRatio: 0, // Would need revenue data
      },
      byDepartment: Object.entries(deptSalaries).map(([dept, data]) => ({ department: dept, ...data })),
      salaryBands: bands.filter(b => b.count > 0).map(b => ({ band: b.label, count: b.count, percentage: Math.round((b.count / employees.length) * 100) })),
    }));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** GET /attendance-report — Monthly attendance summary */
router.get("/attendance-report", async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year) || new Date().getFullYear();
    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0, 23, 59, 59);

    const employees = await prisma.employee.findMany({
      where: { dateOfLeaving: null },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    const report = [];
    for (const emp of employees) {
      const logs = await prisma.attendanceLog.findMany({
        where: { employeeId: emp.id, date: { gte: startDate, lte: endDate } },
      });

      report.push({
        employeeId: emp.id,
        name: `${emp.user.firstName} ${emp.user.lastName}`,
        department: emp.department,
        present: logs.filter(l => l.status === "PRESENT").length,
        halfDay: logs.filter(l => l.status === "HALF_DAY").length,
        wfh: logs.filter(l => l.status === "WORK_FROM_HOME").length,
        absent: logs.filter(l => l.status === "ABSENT").length,
        onLeave: logs.filter(l => l.status === "ON_LEAVE").length,
        totalHours: Number(logs.reduce((s, l) => s + Number(l.totalHours || 0), 0).toFixed(1)),
        overtime: Number(logs.reduce((s, l) => s + Number(l.overtimeHours || 0), 0).toFixed(1)),
        avgHours: logs.length > 0 ? Number((logs.reduce((s, l) => s + Number(l.totalHours || 0), 0) / logs.filter(l => l.totalHours).length).toFixed(1)) : 0,
      });
    }

    const summary = {
      month: m, year: y,
      totalEmployees: employees.length,
      avgPresent: report.length > 0 ? Math.round(report.reduce((s, r) => s + r.present, 0) / report.length) : 0,
      avgAbsent: report.length > 0 ? Number((report.reduce((s, r) => s + r.absent, 0) / report.length).toFixed(1)) : 0,
      totalOvertime: report.reduce((s, r) => s + r.overtime, 0),
    };

    res.json(successResponse({ summary, employees: report }));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** GET /leave-report — Leave analytics */
router.get("/leave-report", async (req: Request, res: Response) => {
  try {
    const [totalLeaves, byType, byStatus, byDept] = await Promise.all([
      prisma.leaveRecord.count(),
      prisma.leaveRecord.groupBy({ by: ["leaveType"], _count: true }),
      prisma.leaveRecord.groupBy({ by: ["status"], _count: true }),
      prisma.leaveRecord.findMany({
        include: { employee: { select: { department: true } } },
      }),
    ]);

    // Department-wise leave
    const deptLeaves: Record<string, number> = {};
    for (const l of byDept) {
      const dept = l.employee.department;
      deptLeaves[dept] = (deptLeaves[dept] || 0) + 1;
    }

    res.json(successResponse({
      totalLeaves,
      byType: byType.map(t => ({ type: t.leaveType, count: t._count })),
      byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
      byDepartment: Object.entries(deptLeaves).map(([dept, count]) => ({ department: dept, count })),
      pendingApprovals: byStatus.find(s => s.status === "PENDING")?._count || 0,
    }));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** GET /expense-report — Expense analytics */
router.get("/expense-report", async (_req: Request, res: Response) => {
  try {
    const [total, byStatus, totalAmount, rndTotal] = await Promise.all([
      prisma.expenseClaim.count(),
      prisma.expenseClaim.groupBy({ by: ["status"], _count: true }),
      prisma.expenseClaim.aggregate({ _sum: { totalAmount: true } }),
      prisma.expenseClaim.aggregate({ _sum: { totalAmount: true }, where: { isRnDExpense: true } }),
    ]);

    res.json(successResponse({
      totalClaims: total,
      totalAmount: Number(totalAmount._sum.totalAmount || 0),
      rndTotalAmount: Number(rndTotal._sum.totalAmount || 0),
      byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
      pendingApprovals: byStatus.find(s => s.status === "SUBMITTED")?._count || 0,
    }));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** GET /payroll-report — Payroll analytics */
router.get("/payroll-report", async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year) || new Date().getFullYear();

    const slips = await prisma.salarySlip.findMany({
      where: { month: m, year: y },
      include: { employee: { select: { department: true, designation: true }, include: { user: { select: { firstName: true, lastName: true } } } } },
    });

    const summary = {
      month: m, year: y,
      totalSlips: slips.length,
      paidSlips: slips.filter(s => s.isPaid).length,
      unpaidSlips: slips.filter(s => !s.isPaid).length,
      totalGross: slips.reduce((s, sl) => s + Number(sl.grossSalary), 0),
      totalDeductions: slips.reduce((s, sl) => s + Number(sl.totalDeductions), 0),
      totalNet: slips.reduce((s, sl) => s + Number(sl.netSalary), 0),
      totalPF: slips.reduce((s, sl) => s + Number(sl.pfDeduction), 0),
      totalESI: slips.reduce((s, sl) => s + Number(sl.esiDeduction), 0),
      totalTDS: slips.reduce((s, sl) => s + Number(sl.tds), 0),
      totalPT: slips.reduce((s, sl) => s + Number(sl.professionalTax), 0),
    };

    // By department
    const byDept: Record<string, { count: number; totalNet: number }> = {};
    for (const slip of slips) {
      const dept = slip.employee.department;
      if (!byDept[dept]) byDept[dept] = { count: 0, totalNet: 0 };
      byDept[dept].count++;
      byDept[dept].totalNet += Number(slip.netSalary);
    }

    res.json(successResponse({
      summary,
      byDepartment: Object.entries(byDept).map(([dept, data]) => ({ department: dept, ...data })),
      slips: slips.map(s => ({
        employeeName: `${s.employee.user.firstName} ${s.employee.user.lastName}`,
        department: s.employee.department,
        gross: Number(s.grossSalary),
        deductions: Number(s.totalDeductions),
        net: Number(s.netSalary),
        isPaid: s.isPaid,
      })),
    }));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

/** GET /compliance-overview — Compliance status for all regulatory requirements */
router.get("/compliance-overview", async (_req: Request, res: Response) => {
  try {
    const [employeeCount, missingPAN, missingAadhaar, missingUAN, missingBank] = await Promise.all([
      prisma.employee.count({ where: { dateOfLeaving: null } }),
      prisma.employee.count({ where: { dateOfLeaving: null, panNumber: null } }),
      prisma.employee.count({ where: { dateOfLeaving: null, aadhaarNumber: null } }),
      prisma.employee.count({ where: { dateOfLeaving: null, uanNumber: null } }),
      prisma.employee.count({ where: { dateOfLeaving: null, bankAccountNo: null } }),
    ]);

    const complianceItems = [
      { item: "PAN Card", compliant: employeeCount - missingPAN, nonCompliant: missingPAN, percentage: employeeCount > 0 ? Math.round(((employeeCount - missingPAN) / employeeCount) * 100) : 0 },
      { item: "Aadhaar", compliant: employeeCount - missingAadhaar, nonCompliant: missingAadhaar, percentage: employeeCount > 0 ? Math.round(((employeeCount - missingAadhaar) / employeeCount) * 100) : 0 },
      { item: "UAN (PF)", compliant: employeeCount - missingUAN, nonCompliant: missingUAN, percentage: employeeCount > 0 ? Math.round(((employeeCount - missingUAN) / employeeCount) * 100) : 0 },
      { item: "Bank Details", compliant: employeeCount - missingBank, nonCompliant: missingBank, percentage: employeeCount > 0 ? Math.round(((employeeCount - missingBank) / employeeCount) * 100) : 0 },
    ];

    const overallCompliance = complianceItems.length > 0
      ? Math.round(complianceItems.reduce((s, c) => s + c.percentage, 0) / complianceItems.length)
      : 100;

    res.json(successResponse({
      totalEmployees: employeeCount,
      overallCompliancePercent: overallCompliance,
      items: complianceItems,
      isFullyCompliant: overallCompliance === 100,
    }));
  } catch (error: any) { res.status(500).json(errorResponse(error.message)); }
});

export { router as adminAnalyticsRouter };
