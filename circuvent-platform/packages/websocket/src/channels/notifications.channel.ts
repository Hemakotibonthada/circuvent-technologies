// ──────────────────────────────────────────────────────────────
// WebSocket — Notifications Channel
// Sends real-time notifications to specific users or roles.
// Supports: alerts, approvals, system messages, activity feeds.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { CircuventWSServer, AuthenticatedSocket } from "../ws.server";

const prisma = new PrismaClient();

interface NotificationPayload {
  userId?: string;
  role?: string;
  title: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
  module: string;
  actionUrl?: string;
}

export function registerNotificationsChannel(wsServer: CircuventWSServer): void {
  wsServer.onChannel("notifications", async (_socket: AuthenticatedSocket, data: unknown) => {
    const notification = data as NotificationPayload;

    if (!notification.title || !notification.message) return;

    // Store notification in database
    if (notification.userId) {
      await prisma.notification.create({
        data: {
          userId: notification.userId,
          title: notification.title,
          message: notification.message,
          type: notification.type || "info",
          module: notification.module || "system",
          actionUrl: notification.actionUrl,
        },
      });

      // Send to specific user
      wsServer.sendToUser(notification.userId, "notifications", "new_notification", {
        title: notification.title,
        message: notification.message,
        type: notification.type,
        module: notification.module,
        actionUrl: notification.actionUrl,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Broadcast to all subscribers
      wsServer.broadcast("notifications", "broadcast_notification", {
        title: notification.title,
        message: notification.message,
        type: notification.type,
        module: notification.module,
        timestamp: new Date().toISOString(),
      });
    }
  });
}

/**
 * Helper to send notification from any service.
 */
export class NotificationService {
  private wsServer: CircuventWSServer | null = null;

  setWSServer(server: CircuventWSServer): void {
    this.wsServer = server;
  }

  async sendToUser(userId: string, notification: Omit<NotificationPayload, "userId">): Promise<void> {
    await prisma.notification.create({
      data: {
        userId,
        title: notification.title,
        message: notification.message,
        type: notification.type || "info",
        module: notification.module || "system",
        actionUrl: notification.actionUrl,
      },
    });

    if (this.wsServer) {
      this.wsServer.sendToUser(userId, "notifications", "new_notification", {
        ...notification,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async getRecent(userId: string, limit = 20): Promise<any[]> {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async markAsRead(notificationId: string): Promise<void> {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return result.count;
  }
}

export const notificationService = new NotificationService();
