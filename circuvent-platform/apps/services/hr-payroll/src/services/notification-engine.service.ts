// ──────────────────────────────────────────────────────────────
// HR Payroll — Notification Engine Service
// Push, email, SMS (mock), scheduled notifications, per-module
// contextual notifiers, preference management, cleanup.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  module: string;
  type?: string;
  actionUrl?: string;
}

interface NotificationPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
  quietHoursStart?: string; // "22:00"
  quietHoursEnd?: string;   // "08:00"
  mutedModules: string[];
}

interface ScheduledNotification {
  userId: string;
  title: string;
  message: string;
  module: string;
  sendAt: Date;
  actionUrl?: string;
}

// ══════════════════════════════════════════════════════════════
// In-memory stores
// ══════════════════════════════════════════════════════════════

const preferencesStore = new Map<string, NotificationPreferences>();
const scheduledQueue: ScheduledNotification[] = [];

// Default preferences
const DEFAULT_PREFERENCES: NotificationPreferences = {
  email: true,
  push: true,
  sms: false,
  quietHoursStart: undefined,
  quietHoursEnd: undefined,
  mutedModules: [],
};

// ══════════════════════════════════════════════════════════════
// NotificationEngine
// ══════════════════════════════════════════════════════════════

export class NotificationEngine {

  // ── Core Push ───────────────────────────────────────────

  /**
   * Send a push notification to a single user.
   * Stores in the Notification model and respects user preferences.
   */
  async sendPushNotification(
    userId: string,
    title: string,
    message: string,
    module: string,
    link?: string,
  ): Promise<any> {
    const prefs = this.getNotificationPreferences(userId);

    // Respect muted modules
    if (prefs.mutedModules.includes(module)) {
      return { sent: false, reason: "Module muted by user" };
    }

    // Respect quiet hours
    if (this.isQuietHours(prefs)) {
      // Schedule for after quiet hours end
      const sendAt = this.nextQuietHoursEnd(prefs);
      if (sendAt) {
        this.scheduleNotification(userId, sendAt, title, message, module, link);
        return { sent: false, reason: "Quiet hours — scheduled for later", scheduledAt: sendAt };
      }
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type: "info",
        module,
        isRead: false,
        actionUrl: link || null,
      },
    });

    return { sent: true, id: notification.id };
  }

  /**
   * Send a push notification to multiple users.
   */
  async sendBulkPush(
    userIds: string[],
    title: string,
    message: string,
    module: string,
    link?: string,
  ): Promise<{ total: number; sent: number; skipped: number }> {
    let sent = 0;
    let skipped = 0;

    for (const userId of userIds) {
      const result = await this.sendPushNotification(userId, title, message, module, link);
      if (result.sent) {
        sent++;
      } else {
        skipped++;
      }
    }

    return { total: userIds.length, sent, skipped };
  }

  // ── Email ──────────────────────────────────────────────

  /**
   * Send an email notification.
   * In production, integrate with SMTP or an email service (SendGrid, SES, etc.).
   */
  async sendEmailNotification(
    to: string,
    subject: string,
    htmlBody: string,
  ): Promise<{ sent: boolean; messageId: string }> {
    // Mock implementation — log and return success
    const messageId = `email_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    console.log(`[NotificationEngine] Email to: ${to}, subject: ${subject}, messageId: ${messageId}`);

    // In production, you would:
    // const transporter = nodemailer.createTransport({...});
    // await transporter.sendMail({ to, subject, html: htmlBody });

    return { sent: true, messageId };
  }

  // ── SMS ────────────────────────────────────────────────

  /**
   * Send an SMS notification (mock).
   * In production, integrate with Twilio, AWS SNS, etc.
   */
  async sendSMSNotification(
    phone: string,
    message: string,
  ): Promise<{ sent: boolean; sid: string }> {
    const sid = `sms_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    console.log(`[NotificationEngine] SMS to: ${phone}, message: ${message.substring(0, 50)}...`);

    // Mock: In production, use Twilio:
    // const client = twilio(accountSid, authToken);
    // await client.messages.create({ body: message, to: phone, from: TWILIO_NUMBER });

    return { sent: true, sid };
  }

  // ── Scheduling ─────────────────────────────────────────

  /**
   * Schedule a notification for future delivery.
   */
  scheduleNotification(
    userId: string,
    sendAt: Date,
    title: string,
    message: string,
    module: string = "system",
    actionUrl?: string,
  ): void {
    scheduledQueue.push({
      userId,
      title,
      message,
      module,
      sendAt,
      actionUrl,
    });

    // Sort by sendAt
    scheduledQueue.sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime());
  }

  /**
   * Process all due scheduled notifications.
   * Call periodically (e.g., every minute via setInterval or cron).
   */
  async processScheduledNotifications(): Promise<{ processed: number }> {
    const now = new Date();
    let processed = 0;

    while (scheduledQueue.length > 0 && scheduledQueue[0].sendAt <= now) {
      const scheduled = scheduledQueue.shift()!;
      await this.sendPushNotification(
        scheduled.userId,
        scheduled.title,
        scheduled.message,
        scheduled.module,
        scheduled.actionUrl,
      );
      processed++;
    }

    return { processed };
  }

  // ── Preferences ────────────────────────────────────────

  /**
   * Get notification preferences for a user.
   */
  getNotificationPreferences(userId: string): NotificationPreferences {
    return preferencesStore.get(userId) || { ...DEFAULT_PREFERENCES };
  }

  /**
   * Update notification preferences for a user.
   */
  updateNotificationPreferences(
    userId: string,
    prefs: Partial<NotificationPreferences>,
  ): NotificationPreferences {
    const current = this.getNotificationPreferences(userId);
    const updated = { ...current, ...prefs };
    preferencesStore.set(userId, updated);
    return updated;
  }

  // ── Contextual Notifiers ───────────────────────────────

  /**
   * Notify on ticket creation (ICM).
   */
  async notifyOnTicketCreated(ticket: {
    id: string;
    ticketCode: string;
    subject: string;
    assignedTo?: string | null;
    employeeId: string;
  }): Promise<void> {
    // Notify the assignee if set
    if (ticket.assignedTo) {
      await this.sendPushNotification(
        ticket.assignedTo,
        "New Ticket Assigned",
        `Ticket ${ticket.ticketCode}: ${ticket.subject}`,
        "icm",
        `/icm?ticket=${ticket.id}`,
      );
    }
  }

  /**
   * Notify on ticket assignment.
   */
  async notifyOnTicketAssigned(ticket: {
    id: string;
    ticketCode: string;
    subject: string;
  }, assigneeId: string): Promise<void> {
    await this.sendPushNotification(
      assigneeId,
      "Ticket Assigned to You",
      `${ticket.ticketCode}: ${ticket.subject}`,
      "icm",
      `/icm?ticket=${ticket.id}`,
    );
  }

  /**
   * Notify on ticket resolution.
   */
  async notifyOnTicketResolved(ticket: {
    id: string;
    ticketCode: string;
    subject: string;
    employeeId: string;
  }): Promise<void> {
    // Fetch the employee's user ID
    const employee = await prisma.employee.findUnique({
      where: { id: ticket.employeeId },
      select: { userId: true },
    });

    if (employee) {
      await this.sendPushNotification(
        employee.userId,
        "Ticket Resolved",
        `Your ticket ${ticket.ticketCode} has been resolved: ${ticket.subject}`,
        "icm",
        `/icm?ticket=${ticket.id}`,
      );
    }
  }

  /**
   * Notify on new message received.
   */
  async notifyOnMessageReceived(
    conversationId: string,
    senderId: string,
    preview: string,
  ): Promise<void> {
    // Fetch conversation members (from GeneratedDocument)
    const conv = await prisma.generatedDocument.findUnique({
      where: { id: conversationId },
    });

    if (!conv) return;

    const data = typeof conv.data === "object" ? conv.data as any : {};
    const members: string[] = data?.members || [];

    const recipients = members.filter((m) => m !== senderId);
    for (const recipientId of recipients) {
      await this.sendPushNotification(
        recipientId,
        "New Message",
        preview.length > 80 ? preview.substring(0, 80) + "…" : preview,
        "messaging",
        `/messages?conversation=${conversationId}`,
      );
    }
  }

  /**
   * Notify on leave approved.
   */
  async notifyOnLeaveApproved(leaveId: string): Promise<void> {
    const leave = await prisma.leaveRecord.findUnique({
      where: { id: leaveId },
      include: { employee: { select: { userId: true } } },
    });

    if (!leave) return;

    await this.sendPushNotification(
      leave.employee.userId,
      "Leave Approved",
      `Your ${leave.leaveType} leave from ${leave.startDate.toLocaleDateString()} to ${leave.endDate.toLocaleDateString()} has been approved.`,
      "hr",
      "/hr?tab=leave",
    );
  }

  /**
   * Notify on payslip generated.
   */
  async notifyOnPayslipGenerated(employeeId: string): Promise<void> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { userId: true, employeeCode: true },
    });

    if (!employee) return;

    const now = new Date();
    const month = now.toLocaleString("default", { month: "long" });
    const year = now.getFullYear();

    await this.sendPushNotification(
      employee.userId,
      "Payslip Generated",
      `Your ${month} ${year} payslip is now available for download.`,
      "hr",
      "/hr?tab=payroll",
    );
  }

  /**
   * Notify on birthday (for manager/HR to send wishes).
   */
  async notifyOnBirthdayToday(employeeId: string): Promise<void> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!employee) return;

    // Notify HR managers
    const hrManagers = await prisma.user.findMany({
      where: { role: "HR_MANAGER", status: "ACTIVE" },
      select: { id: true },
    });

    const name = `${employee.user.firstName} ${employee.user.lastName}`;
    for (const mgr of hrManagers) {
      await this.sendPushNotification(
        mgr.id,
        "🎂 Birthday Today",
        `${name} (${employee.employeeCode}) has a birthday today!`,
        "hr",
        `/hr/${employeeId}`,
      );
    }
  }

  /**
   * Notify on work anniversary.
   */
  async notifyOnWorkAnniversary(employeeId: string, years: number): Promise<void> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!employee) return;

    const name = `${employee.user.firstName} ${employee.user.lastName}`;

    // Notify the employee
    await this.sendPushNotification(
      employee.userId,
      "🎉 Work Anniversary!",
      `Happy ${years}-year work anniversary, ${employee.user.firstName}! Thank you for your dedication.`,
      "hr",
    );

    // Notify HR
    const hrManagers = await prisma.user.findMany({
      where: { role: "HR_MANAGER", status: "ACTIVE" },
      select: { id: true },
    });

    for (const mgr of hrManagers) {
      await this.sendPushNotification(
        mgr.id,
        "🎉 Work Anniversary",
        `${name} completes ${years} year${years > 1 ? "s" : ""} at Circuvent today!`,
        "hr",
        `/hr/${employeeId}`,
      );
    }
  }

  // ── Read/Unread Management ─────────────────────────────

  /**
   * Get unread notification count for a user.
   */
  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return result.count;
  }

  // ── Cleanup ────────────────────────────────────────────

  /**
   * Delete notifications older than the specified number of days.
   */
  async deleteOldNotifications(daysOld: number): Promise<number> {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const result = await prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff }, isRead: true },
    });
    return result.count;
  }

  // ── Private Helpers ────────────────────────────────────

  /**
   * Check if current time falls within user's quiet hours.
   */
  private isQuietHours(prefs: NotificationPreferences): boolean {
    if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = prefs.quietHoursStart.split(":").map(Number);
    const [endH, endM] = prefs.quietHoursEnd.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // Same day: e.g., 22:00 - 23:00 (unlikely but valid)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
    // Spans midnight: e.g., 22:00 - 08:00
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  /**
   * Get the next quiet hours end time.
   */
  private nextQuietHoursEnd(prefs: NotificationPreferences): Date | null {
    if (!prefs.quietHoursEnd) return null;

    const [endH, endM] = prefs.quietHoursEnd.split(":").map(Number);
    const now = new Date();
    const next = new Date(now);
    next.setHours(endH, endM, 0, 0);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }
}

export default new NotificationEngine();
