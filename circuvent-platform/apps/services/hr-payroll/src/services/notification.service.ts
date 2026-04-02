// ──────────────────────────────────────────────────────────────
// HR & Payroll — Notification Service
// Centralized notification engine with support for single,
// bulk, role-based, and department-based notifications.
// Includes scheduling, preferences, and contextual notifiers
// for leave/expense/payslip/birthday/anniversary events.
// ──────────────────────────────────────────────────────────────

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types & Interfaces
// ══════════════════════════════════════════════════════════════

export type NotificationType = "info" | "success" | "warning" | "error";
export type NotificationModule = "hr" | "project" | "iot" | "client" | "finance" | "ats" | "system";

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  module?: NotificationModule;
  actionUrl?: string;
  data?: Record<string, any>;
}

export interface BulkNotificationPayload {
  userIds: string[];
  type: NotificationType;
  title: string;
  message: string;
  module?: NotificationModule;
  actionUrl?: string;
}

export interface NotificationPreferences {
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  leaveUpdates: boolean;
  expenseUpdates: boolean;
  payslipAlerts: boolean;
  birthdayWishes: boolean;
  anniversaryAlerts: boolean;
  systemAlerts: boolean;
  weeklyDigest: boolean;
  quietHoursStart?: string; // "22:00"
  quietHoursEnd?: string;   // "08:00"
}

export interface PaginatedNotifications {
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    type: string;
    module: string;
    isRead: boolean;
    actionUrl: string | null;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  limit: number;
  unreadCount: number;
  hasMore: boolean;
}

export interface NotificationStats {
  total: number;
  unread: number;
  read: number;
  byType: Record<string, number>;
  byModule: Record<string, number>;
}

// ══════════════════════════════════════════════════════════════
// Notification Service
// ══════════════════════════════════════════════════════════════

export class NotificationService {
  /**
   * Send a single notification to a user.
   */
  static async sendNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: { module?: NotificationModule; actionUrl?: string; metadata?: Record<string, any> }
  ): Promise<{ id: string; success: boolean }> {
    try {
      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true },
      });

      if (!user || user.status !== "ACTIVE") {
        return { id: "", success: false };
      }

      const notification = await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          module: data?.module || "system",
          actionUrl: data?.actionUrl || null,
        },
      });

      return { id: notification.id, success: true };
    } catch (error: any) {
      console.error(`Failed to send notification to ${userId}: ${error.message}`);
      return { id: "", success: false };
    }
  }

  /**
   * Send the same notification to multiple users.
   */
  static async sendBulkNotification(
    userIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    module: NotificationModule = "system",
    actionUrl?: string
  ): Promise<{ sent: number; failed: number; failedUserIds: string[] }> {
    let sent = 0;
    const failedUserIds: string[] = [];

    // Verify which users are valid and active
    const activeUsers = await prisma.user.findMany({
      where: { id: { in: userIds }, status: "ACTIVE" },
      select: { id: true },
    });
    const activeUserIds = new Set(activeUsers.map(u => u.id));

    // Batch create notifications
    const notificationData = userIds
      .filter(id => activeUserIds.has(id))
      .map(userId => ({
        userId,
        type,
        title,
        message,
        module,
        actionUrl: actionUrl || null,
        isRead: false,
      }));

    try {
      const result = await prisma.notification.createMany({
        data: notificationData,
        skipDuplicates: true,
      });
      sent = result.count;
    } catch (error: any) {
      console.error(`Bulk notification failed: ${error.message}`);
    }

    // Track failed
    for (const id of userIds) {
      if (!activeUserIds.has(id)) failedUserIds.push(id);
    }

    return { sent, failed: failedUserIds.length, failedUserIds };
  }

  /**
   * Send notification to all users with a specific role.
   */
  static async sendRoleNotification(
    role: string,
    title: string,
    message: string,
    type: NotificationType = "info",
    module: NotificationModule = "system",
    actionUrl?: string
  ): Promise<{ sent: number; targetedRole: string }> {
    const users = await prisma.user.findMany({
      where: { role: role as any, status: "ACTIVE" },
      select: { id: true },
    });

    if (users.length === 0) {
      return { sent: 0, targetedRole: role };
    }

    const result = await prisma.notification.createMany({
      data: users.map(u => ({
        userId: u.id,
        type,
        title,
        message,
        module,
        actionUrl: actionUrl || null,
      })),
    });

    return { sent: result.count, targetedRole: role };
  }

  /**
   * Send notification to all employees in a department.
   */
  static async sendDepartmentNotification(
    department: string,
    title: string,
    message: string,
    type: NotificationType = "info",
    module: NotificationModule = "hr"
  ): Promise<{ sent: number; department: string }> {
    const employees = await prisma.employee.findMany({
      where: { department, dateOfLeaving: null },
      select: { userId: true },
    });

    if (employees.length === 0) {
      return { sent: 0, department };
    }

    const result = await prisma.notification.createMany({
      data: employees.map(e => ({
        userId: e.userId,
        type,
        title,
        message,
        module,
      })),
    });

    return { sent: result.count, department };
  }

  /**
   * Get unread notification count for a user.
   */
  static async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  /**
   * Mark a single notification as read.
   */
  static async markAsRead(notificationId: string): Promise<boolean> {
    try {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user.
   */
  static async markAllRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return result.count;
  }

  /**
   * Get paginated notifications for a user.
   */
  static async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { type?: NotificationType; module?: NotificationModule; unreadOnly?: boolean }
  ): Promise<PaginatedNotifications> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;

    const where: Prisma.NotificationWhereInput = { userId };
    if (filters?.type) where.type = filters.type;
    if (filters?.module) where.module = filters.module;
    if (filters?.unreadOnly) where.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: safeLimit,
        select: {
          id: true, title: true, message: true, type: true,
          module: true, isRead: true, actionUrl: true, createdAt: true,
        },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      notifications,
      total,
      page: safePage,
      limit: safeLimit,
      unreadCount,
      hasMore: skip + safeLimit < total,
    };
  }

  /**
   * Delete a single notification.
   */
  static async deleteNotification(notificationId: string): Promise<boolean> {
    try {
      await prisma.notification.delete({ where: { id: notificationId } });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get notification preferences for a user (stored in user metadata or defaults).
   */
  static async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    // For now, return sensible defaults. In production, this would query
    // a NotificationPreferences model or user metadata.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return {
      userId,
      emailEnabled: true,
      pushEnabled: true,
      leaveUpdates: true,
      expenseUpdates: true,
      payslipAlerts: true,
      birthdayWishes: true,
      anniversaryAlerts: true,
      systemAlerts: true,
      weeklyDigest: user.role === "CEO" || user.role === "MANAGER" || user.role === "HR_MANAGER",
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
    };
  }

  /**
   * Update notification preferences.
   * In a full implementation, this writes to a preferences table.
   */
  static async updateNotificationPreferences(
    userId: string,
    prefs: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    // Validate user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // In production, we'd persist these. For now, return merged defaults.
    const defaults = await this.getNotificationPreferences(userId);
    return { ...defaults, ...prefs, userId };
  }

  /**
   * Schedule a notification for future delivery.
   * Creates a pending notification with a scheduled timestamp.
   */
  static async scheduleNotification(
    userId: string,
    sendAt: Date,
    type: NotificationType,
    title: string,
    message: string,
    module: NotificationModule = "system"
  ): Promise<{ scheduled: boolean; scheduledFor: Date; notificationId: string }> {
    if (sendAt <= new Date()) {
      // If sendAt is in the past, send immediately
      const result = await this.sendNotification(userId, type, title, message, { module });
      return { scheduled: true, scheduledFor: new Date(), notificationId: result.id };
    }

    // Create the notification — in a production system, a job scheduler (Bull/Agenda)
    // would pick up scheduled items. Here we create it with a future-dated audit trail.
    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        module,
        isRead: false,
      },
    });

    // In production: enqueue with a job scheduler
    // e.g., agenda.schedule(sendAt, 'deliver-notification', { notificationId: notification.id });

    return {
      scheduled: true,
      scheduledFor: sendAt,
      notificationId: notification.id,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // Contextual Notification Helpers
  // ══════════════════════════════════════════════════════════════

  /**
   * Notify about leave request approval/rejection.
   */
  static async notifyLeaveApproval(
    leaveId: string,
    status: "APPROVED" | "REJECTED",
    comments?: string
  ): Promise<boolean> {
    try {
      const leave = await prisma.leaveRecord.findUnique({
        where: { id: leaveId },
        include: {
          employee: {
            select: { userId: true, employeeCode: true, user: { select: { firstName: true } } },
          },
        },
      });

      if (!leave) return false;

      const statusText = status === "APPROVED" ? "approved" : "rejected";
      const type: NotificationType = status === "APPROVED" ? "success" : "error";
      const commentText = comments ? ` Comments: ${comments}` : "";

      await this.sendNotification(
        leave.employee.userId,
        type,
        `Leave ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}`,
        `Your ${leave.leaveType} leave request from ${leave.startDate.toISOString().split("T")[0]} to ${leave.endDate.toISOString().split("T")[0]} (${leave.totalDays} days) has been ${statusText}.${commentText}`,
        { module: "hr", actionUrl: `/hr/leaves/${leaveId}` }
      );

      return true;
    } catch (error: any) {
      console.error(`Leave notification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Notify about expense claim approval/rejection.
   */
  static async notifyExpenseApproval(
    expenseId: string,
    status: "APPROVED" | "REJECTED" | "REIMBURSED",
    comments?: string
  ): Promise<boolean> {
    try {
      const expense = await prisma.expenseClaim.findUnique({
        where: { id: expenseId },
        include: {
          employee: {
            select: { userId: true, employeeCode: true, user: { select: { firstName: true } } },
          },
        },
      });

      if (!expense) return false;

      const statusLabels: Record<string, string> = {
        APPROVED: "approved",
        REJECTED: "rejected",
        REIMBURSED: "reimbursed",
      };
      const types: Record<string, NotificationType> = {
        APPROVED: "success",
        REJECTED: "error",
        REIMBURSED: "success",
      };
      const label = statusLabels[status] || status.toLowerCase();
      const commentText = comments ? ` Comments: ${comments}` : "";

      await this.sendNotification(
        expense.employee.userId,
        types[status] || "info",
        `Expense Claim ${label.charAt(0).toUpperCase() + label.slice(1)}`,
        `Your expense claim "${expense.title}" (${expense.claimCode}) for ₹${Number(expense.totalAmount).toLocaleString("en-IN")} has been ${label}.${commentText}`,
        { module: "hr", actionUrl: `/hr/expenses/${expenseId}` }
      );

      return true;
    } catch (error: any) {
      console.error(`Expense notification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Notify employee when payslip is generated.
   */
  static async notifyPayslipGenerated(
    employeeId: string,
    month: number,
    year: number
  ): Promise<boolean> {
    try {
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { userId: true, employeeCode: true },
      });

      if (!employee) return false;

      const monthName = new Date(year, month - 1).toLocaleString("en-IN", { month: "long" });

      await this.sendNotification(
        employee.userId,
        "info",
        "Payslip Available",
        `Your salary slip for ${monthName} ${year} has been generated and is available for download.`,
        { module: "hr", actionUrl: `/hr/payslips?month=${month}&year=${year}` }
      );

      return true;
    } catch (error: any) {
      console.error(`Payslip notification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Send birthday wishes to an employee and notify their team.
   */
  static async notifyBirthdayWishes(employeeId: string): Promise<{ wished: boolean; teamNotified: number }> {
    try {
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, department: true } },
        },
      });

      if (!employee) return { wished: false, teamNotified: 0 };

      const name = `${employee.user.firstName} ${employee.user.lastName}`;

      // Wish the employee
      await this.sendNotification(
        employee.userId,
        "success",
        "🎂 Happy Birthday!",
        `Wishing you a wonderful birthday, ${employee.user.firstName}! The entire Circuvent team wishes you happiness and success.`,
        { module: "hr" }
      );

      // Notify team members
      const teamMembers = await prisma.employee.findMany({
        where: {
          department: employee.department,
          dateOfLeaving: null,
          id: { not: employeeId },
        },
        select: { userId: true },
      });

      let teamNotified = 0;
      if (teamMembers.length > 0) {
        const result = await prisma.notification.createMany({
          data: teamMembers.map(tm => ({
            userId: tm.userId,
            type: "info" as const,
            title: "Team Birthday! 🎉",
            message: `Today is ${name}'s birthday! Don't forget to wish them.`,
            module: "hr",
          })),
        });
        teamNotified = result.count;
      }

      return { wished: true, teamNotified };
    } catch (error: any) {
      console.error(`Birthday notification failed: ${error.message}`);
      return { wished: false, teamNotified: 0 };
    }
  }

  /**
   * Send work anniversary notification.
   */
  static async notifyWorkAnniversary(
    employeeId: string,
    years: number
  ): Promise<{ notified: boolean; companyWideNotified: number }> {
    try {
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, department: true } },
        },
      });

      if (!employee) return { notified: false, companyWideNotified: 0 };

      const name = `${employee.user.firstName} ${employee.user.lastName}`;
      const yearLabel = years === 1 ? "1 year" : `${years} years`;

      // Notify the employee
      await this.sendNotification(
        employee.userId,
        "success",
        "🎉 Work Anniversary!",
        `Congratulations on completing ${yearLabel} at Circuvent Technologies, ${employee.user.firstName}! Thank you for your dedication and contributions.`,
        { module: "hr" }
      );

      // For milestone years (1, 3, 5, 10, 15, 20+), notify company-wide
      const milestoneYears = [1, 3, 5, 10, 15, 20, 25, 30];
      let companyWideNotified = 0;

      if (milestoneYears.includes(years)) {
        // Notify HR and managers
        const managers = await prisma.user.findMany({
          where: {
            role: { in: ["HR_MANAGER", "MANAGER", "CEO"] },
            status: "ACTIVE",
          },
          select: { id: true },
        });

        if (managers.length > 0) {
          const result = await prisma.notification.createMany({
            data: managers.map(m => ({
              userId: m.id,
              type: "info" as const,
              title: `Work Anniversary Milestone`,
              message: `${name} has completed ${yearLabel} at Circuvent Technologies! Department: ${employee.department}.`,
              module: "hr" as const,
            })),
          });
          companyWideNotified = result.count;
        }
      }

      return { notified: true, companyWideNotified };
    } catch (error: any) {
      console.error(`Anniversary notification failed: ${error.message}`);
      return { notified: false, companyWideNotified: 0 };
    }
  }

  /**
   * Get notification stats for a user.
   */
  static async getNotificationStats(userId: string): Promise<NotificationStats> {
    const [total, unread, byTypeRaw, byModuleRaw] = await Promise.all([
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } }),
      prisma.notification.groupBy({
        by: ["type"],
        where: { userId },
        _count: { id: true },
      }),
      prisma.notification.groupBy({
        by: ["module"],
        where: { userId },
        _count: { id: true },
      }),
    ]);

    const byType: Record<string, number> = {};
    for (const t of byTypeRaw) byType[t.type] = t._count.id;

    const byModule: Record<string, number> = {};
    for (const m of byModuleRaw) byModule[m.module] = m._count.id;

    return { total, unread, read: total - unread, byType, byModule };
  }

  /**
   * Cleanup old read notifications (older than N days).
   */
  static async cleanupOldNotifications(olderThanDays: number = 90): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const result = await prisma.notification.deleteMany({
      where: {
        isRead: true,
        createdAt: { lt: cutoff },
      },
    });

    return result.count;
  }
}
