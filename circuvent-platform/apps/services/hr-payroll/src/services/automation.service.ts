// ──────────────────────────────────────────────────────────────
// HR & Payroll — Automation Service
// Handles scheduled tasks: auto-approve leaves, payroll gen,
// shift assignment, asset depreciation, reminders, survey
// closure, grievance escalation, and report generation.
// ──────────────────────────────────────────────────────────────

import { PrismaClient, Prisma } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types & Interfaces
// ══════════════════════════════════════════════════════════════

export interface LeaveAutoApprovalRules {
  maxDays: number;
  allowedTypes: string[];
  requireMinBalance: boolean;
  minBalanceThreshold: number;
  excludeDepartments?: string[];
  autoApproverLabel: string;
}

export interface PayrollGenerationResult {
  processedCount: number;
  skippedCount: number;
  errorCount: number;
  totalGrossPaid: number;
  totalNetPaid: number;
  errors: Array<{ employeeId: string; error: string }>;
}

export interface ShiftAssignmentResult {
  assignedCount: number;
  skippedCount: number;
  assignments: Array<{
    employeeId: string;
    employeeName: string;
    shiftName: string;
    date: string;
  }>;
}

export interface AssetDepreciationResult {
  processedCount: number;
  totalDepreciation: number;
  items: Array<{
    assetCode: string;
    name: string;
    originalValue: number;
    currentValue: number;
    depreciationAmount: number;
  }>;
}

export interface ReminderResult {
  overdueTimesheets: number;
  pendingLeaveApprovals: number;
  pendingExpenseApprovals: number;
  upcomingReviews: number;
  expiringDocuments: number;
  totalNotificationsSent: number;
}

export interface ReportData {
  reportType: string;
  generatedAt: Date;
  period: { start: Date; end: Date };
  data: Record<string, any>;
}

export interface CronScheduleEntry {
  task: string;
  cron: string;
  description: string;
  enabled: boolean;
}

// ══════════════════════════════════════════════════════════════
// Automation Service
// ══════════════════════════════════════════════════════════════

export class AutomationService {
  /**
   * Auto-approve short leaves where the employee meets policy criteria.
   * Typical rule: casual/sick leave <= 1 day, employee has sufficient balance.
   */
  static async autoApproveLeaves(rules: LeaveAutoApprovalRules): Promise<{
    approved: number;
    skipped: number;
    details: Array<{ leaveId: string; employeeCode: string; reason: string }>;
  }> {
    const details: Array<{ leaveId: string; employeeCode: string; reason: string }> = [];
    let approved = 0;
    let skipped = 0;

    try {
      const pendingLeaves = await prisma.leaveRecord.findMany({
        where: {
          status: "PENDING",
          leaveType: { in: rules.allowedTypes },
          totalDays: { lte: rules.maxDays },
          ...(rules.excludeDepartments?.length ? {
            employee: { department: { notIn: rules.excludeDepartments } },
          } : {}),
        },
        include: {
          employee: {
            select: { id: true, employeeCode: true, department: true, userId: true },
          },
        },
      });

      for (const leave of pendingLeaves) {
        try {
          // Check leave balance if required
          if (rules.requireMinBalance) {
            const usedLeaves = await prisma.leaveRecord.aggregate({
              where: {
                employeeId: leave.employeeId,
                leaveType: leave.leaveType,
                status: "APPROVED",
                startDate: { gte: new Date(new Date().getFullYear(), 0, 1) },
              },
              _sum: { totalDays: true },
            });

            const used = Number(usedLeaves._sum.totalDays || 0);
            const standardAllowance = leave.leaveType === "CASUAL" ? 12 : leave.leaveType === "SICK" ? 12 : 15;
            const remaining = standardAllowance - used;

            if (remaining < rules.minBalanceThreshold) {
              details.push({
                leaveId: leave.id,
                employeeCode: leave.employee.employeeCode,
                reason: `Insufficient balance: ${remaining} days remaining`,
              });
              skipped++;
              continue;
            }
          }

          // Auto-approve
          await prisma.leaveRecord.update({
            where: { id: leave.id },
            data: {
              status: "APPROVED",
              approvedBy: rules.autoApproverLabel,
            },
          });

          // Create notification
          await prisma.notification.create({
            data: {
              userId: leave.employee.userId,
              title: "Leave Auto-Approved",
              message: `Your ${leave.leaveType} leave for ${leave.totalDays} day(s) has been automatically approved.`,
              type: "success",
              module: "hr",
              actionUrl: `/hr/leaves/${leave.id}`,
            },
          });

          await createAuditLog({
            userId: "SYSTEM",
            action: "APPROVE",
            entity: "LeaveRecord",
            entityId: leave.id,
            newValue: { status: "APPROVED", approvedBy: rules.autoApproverLabel },
          });

          details.push({
            leaveId: leave.id,
            employeeCode: leave.employee.employeeCode,
            reason: "Auto-approved per policy",
          });
          approved++;
        } catch (err: any) {
          details.push({
            leaveId: leave.id,
            employeeCode: leave.employee.employeeCode,
            reason: `Error: ${err.message}`,
          });
          skipped++;
        }
      }
    } catch (error: any) {
      throw new Error(`Auto-approve leaves failed: ${error.message}`);
    }

    return { approved, skipped, details };
  }

  /**
   * Auto-process payroll for all active employees for a specific month/year.
   * Generates salary slips using the standard salary structure.
   */
  static async autoProcessPayroll(month: number, year: number): Promise<PayrollGenerationResult> {
    const result: PayrollGenerationResult = {
      processedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      totalGrossPaid: 0,
      totalNetPaid: 0,
      errors: [],
    };

    try {
      const employees = await prisma.employee.findMany({
        where: { dateOfLeaving: null },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      for (const employee of employees) {
        try {
          // Check if slip already exists
          const existingSlip = await prisma.salarySlip.findUnique({
            where: {
              employeeId_month_year: { employeeId: employee.id, month, year },
            },
          });

          if (existingSlip) {
            result.skippedCount++;
            continue;
          }

          const annualCTC = Number(employee.baseSalary);
          const monthlyCTC = annualCTC / 12;

          // Standard salary structure
          const basePay = Math.round(monthlyCTC * 0.50);
          const hra = Math.round(monthlyCTC * 0.20);
          const da = Math.round(monthlyCTC * 0.10);
          const specialAllowance = Math.round(monthlyCTC * 0.20);
          const grossSalary = basePay + hra + da + specialAllowance;

          // PF: 12% of base pay capped at ₹15,000
          const pfWage = Math.min(basePay, 15000);
          const pfDeduction = Math.round(pfWage * 0.12);

          // ESI: 0.75% if gross <= ₹21,000
          const esiDeduction = grossSalary <= 21000 ? Math.round(grossSalary * 0.0075) : 0;

          // Professional Tax
          const professionalTax = grossSalary > 15000 ? 200 : grossSalary > 10000 ? 150 : 0;

          // TDS estimate
          const tds = AutomationService.estimateMonthlyTDS(annualCTC);

          const totalDeductions = pfDeduction + esiDeduction + professionalTax + tds;
          const netSalary = grossSalary - totalDeductions;

          await prisma.salarySlip.create({
            data: {
              employeeId: employee.id,
              month,
              year,
              basePay,
              hra,
              da,
              specialAllowance,
              bonus: 0,
              grossSalary,
              pfDeduction,
              esiDeduction,
              professionalTax,
              tds,
              otherDeductions: 0,
              totalDeductions,
              netSalary,
              currency: employee.currency,
            },
          });

          result.processedCount++;
          result.totalGrossPaid += grossSalary;
          result.totalNetPaid += netSalary;

          // Notify employee
          await prisma.notification.create({
            data: {
              userId: employee.user.id,
              title: "Payslip Generated",
              message: `Your salary slip for ${AutomationService.getMonthName(month)} ${year} is ready.`,
              type: "info",
              module: "hr",
              actionUrl: `/hr/payslips?month=${month}&year=${year}`,
            },
          });
        } catch (err: any) {
          result.errorCount++;
          result.errors.push({ employeeId: employee.id, error: err.message });
        }
      }

      await createAuditLog({
        userId: "SYSTEM",
        action: "CREATE",
        entity: "SalarySlip",
        entityId: `${month}-${year}`,
        newValue: {
          month, year,
          processed: result.processedCount,
          skipped: result.skippedCount,
          errors: result.errorCount,
        },
      });
    } catch (error: any) {
      throw new Error(`Auto payroll processing failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Round-robin shift assignment for a department starting from a given week.
   */
  static async autoAssignShifts(department: string, weekStart: Date): Promise<ShiftAssignmentResult> {
    const result: ShiftAssignmentResult = {
      assignedCount: 0,
      skippedCount: 0,
      assignments: [],
    };

    try {
      // Get active shifts
      const shifts = await prisma.shiftDefinition.findMany({
        where: { isActive: true },
        orderBy: { startTime: "asc" },
      });

      if (shifts.length === 0) {
        throw new Error("No active shift definitions found");
      }

      // Get employees in the department
      const employees = await prisma.employee.findMany({
        where: { department, dateOfLeaving: null },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { employeeCode: "asc" },
      });

      if (employees.length === 0) {
        throw new Error(`No active employees found in department: ${department}`);
      }

      const weekDates: Date[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + d);
        weekDates.push(date);
      }

      let shiftIndex = 0;

      for (const employee of employees) {
        for (const date of weekDates) {
          const dayOfWeek = date.getDay();
          // Skip weekends (Sunday = 0, Saturday = 6)
          if (dayOfWeek === 0 || dayOfWeek === 6) continue;

          try {
            // Check if a shift is already assigned for this date
            const existing = await prisma.shiftSchedule.findUnique({
              where: {
                employeeId_date: { employeeId: employee.id, date },
              },
            });

            if (existing) {
              result.skippedCount++;
              continue;
            }

            // Check if employee is on leave
            const onLeave = await prisma.leaveRecord.findFirst({
              where: {
                employeeId: employee.id,
                status: "APPROVED",
                startDate: { lte: date },
                endDate: { gte: date },
              },
            });

            if (onLeave) {
              result.skippedCount++;
              continue;
            }

            const shift = shifts[shiftIndex % shifts.length];

            await prisma.shiftSchedule.create({
              data: {
                employeeId: employee.id,
                shiftId: shift.id,
                date,
                status: "SCHEDULED",
              },
            });

            result.assignedCount++;
            result.assignments.push({
              employeeId: employee.id,
              employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
              shiftName: shift.name,
              date: date.toISOString().split("T")[0],
            });
          } catch (err) {
            result.skippedCount++;
          }
        }
        shiftIndex++; // Rotate shift for next employee
      }

      await createAuditLog({
        userId: "SYSTEM",
        action: "CREATE",
        entity: "ShiftSchedule",
        entityId: `${department}-${weekStart.toISOString().split("T")[0]}`,
        newValue: { department, weekStart, assigned: result.assignedCount },
      });
    } catch (error: any) {
      throw new Error(`Auto shift assignment failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Straight-line depreciation for all allocated assets.
   * Assumes a default useful life of 3 years for IT equipment, 5 for furniture.
   */
  static async autoDepreciateAssets(): Promise<AssetDepreciationResult> {
    const result: AssetDepreciationResult = {
      processedCount: 0,
      totalDepreciation: 0,
      items: [],
    };

    const usefulLifeMap: Record<string, number> = {
      LAPTOP: 3,
      MONITOR: 4,
      KEYBOARD: 2,
      MOUSE: 2,
      HEADSET: 2,
      PHONE: 3,
      FURNITURE: 5,
      OTHER: 3,
    };

    try {
      const assets = await prisma.asset.findMany({
        where: {
          status: { in: ["AVAILABLE", "ALLOCATED"] },
          purchaseDate: { not: null },
          purchasePrice: { not: null },
        },
      });

      for (const asset of assets) {
        if (!asset.purchaseDate || !asset.purchasePrice) continue;

        const usefulLife = usefulLifeMap[asset.category.toUpperCase()] || 3;
        const purchasePrice = Number(asset.purchasePrice);
        const salvageValue = purchasePrice * 0.05; // 5% salvage value
        const annualDepreciation = (purchasePrice - salvageValue) / usefulLife;
        const monthlyDepreciation = Math.round((annualDepreciation / 12) * 100) / 100;

        const monthsSincePurchase = Math.floor(
          (Date.now() - asset.purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
        );

        const totalDepreciated = Math.min(
          monthlyDepreciation * monthsSincePurchase,
          purchasePrice - salvageValue
        );
        const currentValue = Math.max(purchasePrice - totalDepreciated, salvageValue);

        result.processedCount++;
        result.totalDepreciation += monthlyDepreciation;
        result.items.push({
          assetCode: asset.assetCode,
          name: asset.name,
          originalValue: purchasePrice,
          currentValue: Math.round(currentValue * 100) / 100,
          depreciationAmount: monthlyDepreciation,
        });
      }

      await createAuditLog({
        userId: "SYSTEM",
        action: "UPDATE",
        entity: "Asset",
        entityId: `batch-${new Date().toISOString().split("T")[0]}`,
        newValue: {
          processedCount: result.processedCount,
          totalMonthlyDepreciation: result.totalDepreciation,
        },
      });
    } catch (error: any) {
      throw new Error(`Asset depreciation failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Send reminder notifications for overdue/pending items.
   */
  static async autoSendReminders(): Promise<ReminderResult> {
    const result: ReminderResult = {
      overdueTimesheets: 0,
      pendingLeaveApprovals: 0,
      pendingExpenseApprovals: 0,
      upcomingReviews: 0,
      expiringDocuments: 0,
      totalNotificationsSent: 0,
    };

    const now = new Date();
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(now.getDate() + 7);

    try {
      // 1. Overdue timesheets
      const overdueTimesheets = await prisma.timesheet.findMany({
        where: { status: "DRAFT", weekEnd: { lt: now } },
      });

      // Look up employees for timesheet notifications
      const tsEmpIds = [...new Set(overdueTimesheets.map(ts => ts.employeeId))];
      const tsEmployees = await prisma.employee.findMany({
        where: { id: { in: tsEmpIds } },
        select: { id: true, userId: true },
      });
      const tsEmpMap = new Map(tsEmployees.map(e => [e.id, e]));

      for (const ts of overdueTimesheets) {
        const tsEmp = tsEmpMap.get(ts.employeeId);
        if (!tsEmp) continue;
        await prisma.notification.create({
          data: {
            userId: tsEmp.userId,
            title: "Timesheet Overdue",
            message: `Your timesheet for week ${ts.weekStart.toISOString().split("T")[0]} is overdue. Please submit it.`,
            type: "warning",
            module: "hr",
            actionUrl: `/hr/timesheets/${ts.id}`,
          },
        });
        result.overdueTimesheets++;
        result.totalNotificationsSent++;
      }

      // 2. Pending leave approvals (remind managers)
      const pendingLeaves = await prisma.leaveRecord.findMany({
        where: {
          status: "PENDING",
          createdAt: { lt: new Date(now.getTime() - 48 * 60 * 60 * 1000) }, // pending > 48hrs
        },
        include: {
          employee: { select: { department: true, userId: true, user: { select: { firstName: true, lastName: true } } } },
        },
      });

      const managersByDept = new Map<string, string[]>();
      for (const leave of pendingLeaves) {
        const dept = leave.employee.department;
        if (!managersByDept.has(dept)) {
          const managers = await prisma.user.findMany({
            where: { department: dept, role: { in: ["MANAGER", "HR_MANAGER"] }, status: "ACTIVE" },
            select: { id: true },
          });
          managersByDept.set(dept, managers.map(m => m.id));
        }

        const managerIds = managersByDept.get(dept) || [];
        for (const managerId of managerIds) {
          await prisma.notification.create({
            data: {
              userId: managerId,
              title: "Pending Leave Approval",
              message: `Leave request from ${leave.employee.user.firstName} ${leave.employee.user.lastName} is pending for over 48 hours.`,
              type: "warning",
              module: "hr",
              actionUrl: `/hr/leaves/${leave.id}`,
            },
          });
          result.totalNotificationsSent++;
        }
        result.pendingLeaveApprovals++;
      }

      // 3. Pending expense approvals (> 72 hours)
      const pendingExpenses = await prisma.expenseClaim.findMany({
        where: {
          status: "SUBMITTED",
          submittedAt: { lt: new Date(now.getTime() - 72 * 60 * 60 * 1000) },
        },
        include: { employee: { select: { department: true } } },
      });
      result.pendingExpenseApprovals = pendingExpenses.length;

      // 4. Upcoming performance reviews
      const upcomingReviews = await prisma.performanceReview.findMany({
        where: { status: { in: ["DRAFT", "SELF_REVIEW"] } },
        include: { employee: { include: { user: { select: { id: true, firstName: true } } } } },
      });

      for (const review of upcomingReviews) {
        await prisma.notification.create({
          data: {
            userId: review.employee.userId,
            title: "Performance Review Pending",
            message: `Your ${review.cycle} performance review for ${review.period} is pending completion.`,
            type: "info",
            module: "hr",
            actionUrl: `/hr/reviews/${review.id}`,
          },
        });
        result.upcomingReviews++;
        result.totalNotificationsSent++;
      }

      // 5. Expiring documents (within 7 days)
      const expiringDocs = await prisma.employeeDocument.findMany({
        where: {
          expiresAt: { gte: now, lte: sevenDaysFromNow },
        },
        include: { employee: { include: { user: { select: { id: true, firstName: true } } } } },
      });

      for (const doc of expiringDocs) {
        await prisma.notification.create({
          data: {
            userId: doc.employee.userId,
            title: "Document Expiring Soon",
            message: `Your document "${doc.title}" is expiring on ${doc.expiresAt!.toISOString().split("T")[0]}.`,
            type: "warning",
            module: "hr",
            actionUrl: `/hr/documents/${doc.id}`,
          },
        });
        result.expiringDocuments++;
        result.totalNotificationsSent++;
      }

      await createAuditLog({
        userId: "SYSTEM",
        action: "CREATE",
        entity: "Notification",
        entityId: `reminders-${now.toISOString().split("T")[0]}`,
        newValue: result as unknown as Record<string, unknown>,
      });
    } catch (error: any) {
      throw new Error(`Auto reminders failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Close surveys that have passed their end date.
   */
  static async autoCloseSurveys(): Promise<{ closed: number; details: string[] }> {
    const details: string[] = [];
    let closed = 0;

    try {
      const expiredSurveys = await prisma.survey.findMany({
        where: {
          status: "ACTIVE",
          endDate: { lt: new Date() },
        },
        include: {
          _count: { select: { responses: true, questions: true } },
        },
      });

      for (const survey of expiredSurveys) {
        await prisma.survey.update({
          where: { id: survey.id },
          data: { status: "CLOSED" },
        });

        details.push(
          `Survey "${survey.title}" closed — ${survey._count.responses} responses, ${survey._count.questions} questions`
        );
        closed++;

        await createAuditLog({
          userId: "SYSTEM",
          action: "UPDATE",
          entity: "Survey",
          entityId: survey.id,
          newValue: { status: "CLOSED", responses: survey._count.responses },
        });
      }
    } catch (error: any) {
      throw new Error(`Auto close surveys failed: ${error.message}`);
    }

    return { closed, details };
  }

  /**
   * Escalate grievances that have been open beyond the SLA threshold.
   */
  static async autoEscalateGrievances(slaDays: number = 7): Promise<{
    escalated: number;
    details: Array<{ grievanceCode: string; daysPending: number }>;
  }> {
    const details: Array<{ grievanceCode: string; daysPending: number }> = [];
    let escalated = 0;

    try {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - slaDays);

      const overdueGrievances = await prisma.grievance.findMany({
        where: {
          status: { in: ["OPEN", "INVESTIGATING"] },
          createdAt: { lt: threshold },
        },
      });

      for (const grievance of overdueGrievances) {
        const daysPending = Math.floor(
          (Date.now() - grievance.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        await prisma.grievance.update({
          where: { id: grievance.id },
          data: {
            status: "ESCALATED",
            priority: grievance.priority === "LOW" ? "MEDIUM"
              : grievance.priority === "MEDIUM" ? "HIGH"
              : "CRITICAL",
          },
        });

        // Notify HR admins about escalation
        const hrAdmins = await prisma.user.findMany({
          where: { role: { in: ["HR_MANAGER", "ADMIN"] }, status: "ACTIVE" },
          select: { id: true },
        });

        for (const admin of hrAdmins) {
          await prisma.notification.create({
            data: {
              userId: admin.id,
              title: "Grievance Escalated",
              message: `Grievance ${grievance.grievanceCode} has been auto-escalated after ${daysPending} days without resolution.`,
              type: "error",
              module: "hr",
              actionUrl: `/hr/grievances/${grievance.id}`,
            },
          });
        }

        details.push({ grievanceCode: grievance.grievanceCode, daysPending });
        escalated++;

        await createAuditLog({
          userId: "SYSTEM",
          action: "UPDATE",
          entity: "Grievance",
          entityId: grievance.id,
          oldValue: { status: grievance.status, priority: grievance.priority },
          newValue: { status: "ESCALATED" },
        });
      }
    } catch (error: any) {
      throw new Error(`Grievance escalation failed: ${error.message}`);
    }

    return { escalated, details };
  }

  /**
   * Generate weekly/monthly aggregate reports.
   */
  static async autoGenerateReports(
    reportType: "weekly" | "monthly" | "payroll" | "attendance" | "leave"
  ): Promise<ReportData> {
    const now = new Date();
    let start: Date;
    let end: Date = new Date(now);

    if (reportType === "weekly") {
      start = new Date(now);
      start.setDate(now.getDate() - 7);
    } else {
      start = new Date(now);
      start.setMonth(now.getMonth() - 1);
    }

    const reportData: Record<string, any> = {};

    try {
      switch (reportType) {
        case "weekly": {
          const [newLeaves, newExpenses, resolvedTickets, newHires, exits] = await Promise.all([
            prisma.leaveRecord.count({ where: { createdAt: { gte: start, lte: end } } }),
            prisma.expenseClaim.count({ where: { createdAt: { gte: start, lte: end } } }),
            prisma.helpTicket.count({ where: { resolvedAt: { gte: start, lte: end } } }),
            prisma.employee.count({ where: { dateOfJoining: { gte: start, lte: end } } }),
            prisma.employee.count({ where: { dateOfLeaving: { gte: start, lte: end } } }),
          ]);
          reportData.weeklyHighlights = { newLeaves, newExpenses, resolvedTickets, newHires, exits };
          break;
        }

        case "monthly": {
          const [
            headcount, newHires, exits, leaveStats, expenseStats,
            trainingsCompleted, recognitionsGiven,
          ] = await Promise.all([
            prisma.employee.count({ where: { dateOfLeaving: null } }),
            prisma.employee.count({ where: { dateOfJoining: { gte: start, lte: end } } }),
            prisma.employee.count({ where: { dateOfLeaving: { gte: start, lte: end } } }),
            prisma.leaveRecord.groupBy({
              by: ["leaveType"],
              where: { createdAt: { gte: start, lte: end } },
              _count: { id: true },
              _sum: { totalDays: true },
            }),
            prisma.expenseClaim.aggregate({
              where: { createdAt: { gte: start, lte: end } },
              _sum: { totalAmount: true },
              _count: { id: true },
            }),
            prisma.trainingEnrollment.count({
              where: { status: "COMPLETED", completedAt: { gte: start, lte: end } },
            }),
            prisma.recognition.count({ where: { createdAt: { gte: start, lte: end } } }),
          ]);
          reportData.monthlySummary = {
            headcount, newHires, exits,
            attritionRate: headcount > 0 ? ((exits / headcount) * 100).toFixed(2) : "0",
            leaveStats, expenseStats, trainingsCompleted, recognitionsGiven,
          };
          break;
        }

        case "payroll": {
          const month = now.getMonth() + 1;
          const year = now.getFullYear();
          const payrollStats = await prisma.salarySlip.aggregate({
            where: { month, year },
            _sum: { grossSalary: true, netSalary: true, totalDeductions: true, pfDeduction: true, tds: true },
            _count: { id: true },
            _avg: { netSalary: true },
          });
          reportData.payrollSummary = {
            month, year,
            slipsGenerated: payrollStats._count.id,
            totalGross: Number(payrollStats._sum.grossSalary || 0),
            totalNet: Number(payrollStats._sum.netSalary || 0),
            totalDeductions: Number(payrollStats._sum.totalDeductions || 0),
            totalPF: Number(payrollStats._sum.pfDeduction || 0),
            totalTDS: Number(payrollStats._sum.tds || 0),
            avgNetSalary: Number(payrollStats._avg.netSalary || 0),
          };
          break;
        }

        case "attendance": {
          const attendanceStats = await prisma.attendanceLog.groupBy({
            by: ["status"],
            where: { date: { gte: start, lte: end } },
            _count: { id: true },
          });
          const avgHours = await prisma.attendanceLog.aggregate({
            where: { date: { gte: start, lte: end }, status: "PRESENT" },
            _avg: { totalHours: true },
          });
          reportData.attendanceSummary = {
            statusBreakdown: attendanceStats.map(a => ({ status: a.status, count: a._count.id })),
            avgWorkingHours: Number(avgHours._avg.totalHours || 0),
          };
          break;
        }

        case "leave": {
          const leaveStats = await prisma.leaveRecord.groupBy({
            by: ["leaveType", "status"],
            where: { createdAt: { gte: start, lte: end } },
            _count: { id: true },
            _sum: { totalDays: true },
          });
          reportData.leaveSummary = leaveStats.map(l => ({
            type: l.leaveType,
            status: l.status,
            count: l._count.id,
            totalDays: Number(l._sum.totalDays || 0),
          }));
          break;
        }
      }

      await createAuditLog({
        userId: "SYSTEM",
        action: "EXPORT",
        entity: "Report",
        entityId: `${reportType}-${now.toISOString().split("T")[0]}`,
        newValue: { reportType, period: { start, end } },
      });
    } catch (error: any) {
      throw new Error(`Report generation failed: ${error.message}`);
    }

    return {
      reportType,
      generatedAt: now,
      period: { start, end },
      data: reportData,
    };
  }

  /**
   * Cron schedule descriptions for all automation tasks.
   */
  static get cronSchedule(): CronScheduleEntry[] {
    return [
      {
        task: "autoApproveLeaves",
        cron: "0 9 * * 1-5",
        description: "Auto-approve eligible short leaves every weekday at 9:00 AM IST",
        enabled: true,
      },
      {
        task: "autoProcessPayroll",
        cron: "0 2 25 * *",
        description: "Generate payroll on the 25th of every month at 2:00 AM IST",
        enabled: true,
      },
      {
        task: "autoAssignShifts",
        cron: "0 18 * * 5",
        description: "Assign next week shifts every Friday at 6:00 PM IST",
        enabled: true,
      },
      {
        task: "autoDepreciateAssets",
        cron: "0 3 1 * *",
        description: "Calculate asset depreciation on the 1st of every month at 3:00 AM IST",
        enabled: true,
      },
      {
        task: "autoSendReminders",
        cron: "0 10 * * 1-5",
        description: "Send reminder notifications every weekday at 10:00 AM IST",
        enabled: true,
      },
      {
        task: "autoCloseSurveys",
        cron: "0 0 * * *",
        description: "Close expired surveys every day at midnight IST",
        enabled: true,
      },
      {
        task: "autoEscalateGrievances",
        cron: "0 11 * * 1-5",
        description: "Escalate overdue grievances every weekday at 11:00 AM IST",
        enabled: true,
      },
      {
        task: "autoGenerateReports_weekly",
        cron: "0 6 * * 1",
        description: "Generate weekly report every Monday at 6:00 AM IST",
        enabled: true,
      },
      {
        task: "autoGenerateReports_monthly",
        cron: "0 6 1 * *",
        description: "Generate monthly report on the 1st of every month at 6:00 AM IST",
        enabled: true,
      },
    ];
  }

  // ── Private Helpers ──

  private static estimateMonthlyTDS(annualIncome: number): number {
    const standardDeduction = 75000;
    const taxableIncome = Math.max(0, annualIncome - standardDeduction);
    let tax = 0;

    const slabs = [
      { min: 0, max: 300000, rate: 0 },
      { min: 300000, max: 700000, rate: 0.05 },
      { min: 700000, max: 1000000, rate: 0.10 },
      { min: 1000000, max: 1200000, rate: 0.15 },
      { min: 1200000, max: 1500000, rate: 0.20 },
      { min: 1500000, max: Infinity, rate: 0.30 },
    ];

    for (const slab of slabs) {
      if (taxableIncome <= slab.min) break;
      const taxable = Math.min(taxableIncome, slab.max) - slab.min;
      if (taxable > 0) tax += taxable * slab.rate;
    }

    tax = Math.round(tax * 1.04); // 4% cess
    if (annualIncome <= 700000) tax = 0; // Section 87A rebate

    return Math.round(tax / 12);
  }

  private static getMonthName(month: number): string {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    return months[month - 1] || "Unknown";
  }
}
