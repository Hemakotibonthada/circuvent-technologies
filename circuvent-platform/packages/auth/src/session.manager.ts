// ──────────────────────────────────────────────────────────────
// Session Manager
// Manages user sessions server-side for multi-device tracking,
// forced logout, and security audit.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class SessionManager {
  static async createSession(params: {
    userId: string;
    ipAddress?: string;
    userAgent?: string;
    deviceInfo?: string;
  }): Promise<string> {
    const session = await prisma.userSession.create({
      data: {
        userId: params.userId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        deviceInfo: params.deviceInfo,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return session.id;
  }

  static async validateSession(sessionId: string): Promise<boolean> {
    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || !session.isActive || session.expiresAt < new Date()) {
      return false;
    }

    // Update lastActiveAt
    await prisma.userSession.update({
      where: { id: sessionId },
      data: { lastActiveAt: new Date() },
    });

    return true;
  }

  static async invalidateSession(sessionId: string): Promise<void> {
    await prisma.userSession.update({
      where: { id: sessionId },
      data: { isActive: false },
    });
  }

  static async invalidateAllUserSessions(userId: string): Promise<number> {
    const result = await prisma.userSession.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    return result.count;
  }

  static async getActiveSessions(userId: string): Promise<any[]> {
    return prisma.userSession.findMany({
      where: { userId, isActive: true, expiresAt: { gt: new Date() } },
      orderBy: { lastActiveAt: "desc" },
    });
  }

  static async cleanupExpiredSessions(): Promise<number> {
    const result = await prisma.userSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { isActive: false, lastActiveAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        ],
      },
    });
    return result.count;
  }
}
