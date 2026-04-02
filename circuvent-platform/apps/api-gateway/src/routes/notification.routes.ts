// ──────────────────────────────────────────────────────────────
// API Gateway — Notification Routes
// REST endpoints for notification management: list, mark
// read, unread count, and broadcast.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "@circuvent/auth";
import { HTTP_STATUS } from "@circuvent/shared";

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ── GET /api/notifications — Get user notifications ──
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required" }); return; }

    const { page, limit, unreadOnly } = req.query;
    const pageNum = Number(page) || 1;
    const limitNum = Math.min(Number(limit) || 20, 100);

    const where: any = { userId };
    if (unreadOnly === "true") where.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    res.json({
      success: true,
      data: notifications,
      meta: { total, page: pageNum, limit: limitNum, unreadCount },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /api/notifications/unread-count ──
router.get("/unread-count", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required" }); return; }

    const count = await prisma.notification.count({ where: { userId, isRead: false } });
    res.json({ success: true, data: { count } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── PATCH /api/notifications/:id/read — Mark single as read ──
router.patch("/:id/read", async (req: Request, res: Response) => {
  try {
    const notification = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    res.json({ success: true, data: notification });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /api/notifications/mark-all-read — Mark all as read ──
router.post("/mark-all-read", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ success: false, error: "Auth required" }); return; }

    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    res.json({ success: true, data: { markedRead: result.count } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── DELETE /api/notifications/:id — Delete notification ──
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.notification.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Notification deleted" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /api/notifications/cleanup — Delete old notifications ──
router.post("/cleanup", async (req: Request, res: Response) => {
  try {
    const { daysOld } = req.body;
    const cutoff = new Date(Date.now() - (daysOld || 90) * 24 * 60 * 60 * 1000);

    const result = await prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff }, isRead: true },
    });
    res.json({ success: true, data: { deleted: result.count } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export { router as notificationRouter };
