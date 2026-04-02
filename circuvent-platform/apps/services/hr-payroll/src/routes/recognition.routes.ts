// ══════════════════════════════════════════════════════════════
// Recognition & Awards Routes
// ══════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ── Recognition Wall ─────────────────────────────────────
router.get("/wall", async (req: Request, res: Response) => {
  try {
    const { page = "1", limit = "20" } = req.query;
    const [recognitions, total] = await Promise.all([
      prisma.recognition.findMany({
        where: { isPublic: true },
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.recognition.count({ where: { isPublic: true } }),
    ]);

    // Enrich with user names
    const userIds = new Set<string>();
    recognitions.forEach(r => { userIds.add(r.giverId); userIds.add(r.receiverId); });
    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    const enriched = recognitions.map(r => ({
      ...r,
      giver: userMap.get(r.giverId) || { firstName: "Unknown", lastName: "" },
      receiver: userMap.get(r.receiverId) || { firstName: "Unknown", lastName: "" },
    }));

    res.json({ success: true, data: enriched, meta: { total } });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch recognition wall" });
  }
});

// ── Give Recognition ─────────────────────────────────────
router.post("/give", async (req: Request, res: Response) => {
  try {
    const giverId = (req as any).user?.userId;
    const { receiverId, type, category, message, points, isPublic } = req.body;

    if (!receiverId || !message) {
      res.status(400).json({ success: false, error: "receiverId and message required" });
      return;
    }

    if (giverId === receiverId) {
      res.status(400).json({ success: false, error: "Cannot recognize yourself" });
      return;
    }

    const recognition = await prisma.recognition.create({
      data: {
        giverId,
        receiverId,
        type: type || "KUDOS",
        category: category || "TEAMWORK",
        message,
        points: Number(points) || 10,
        isPublic: isPublic !== false,
      },
    });

    // Auto-create notification
    await prisma.notification.create({
      data: {
        userId: receiverId,
        type: "RECOGNITION",
        module: "RECOGNITION",
        title: "You received a recognition! \uD83C\uDF89",
        message: `You were recognized for ${category || "TEAMWORK"}: "${message}"`,
      },
    });

    res.status(201).json({ success: true, data: recognition, message: "Recognition sent!" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to give recognition" });
  }
});

// ── React to Recognition ──────────────────────────────────
router.post("/:id/react", async (req: Request, res: Response) => {
  try {
    const { emoji } = req.body; // 👏, 🎉, ❤️, 🔥, 💯
    const recognition = await prisma.recognition.findUnique({ where: { id: req.params.id } });
    if (!recognition) { res.status(404).json({ success: false, error: "Not found" }); return; }

    const reactions = (recognition.reactions as Record<string, number>) || {};
    reactions[emoji] = (reactions[emoji] || 0) + 1;

    const updated = await prisma.recognition.update({
      where: { id: req.params.id },
      data: { reactions },
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to react" });
  }
});

// ── My Recognitions (received & given) ────────────────────
router.get("/my", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const [received, given, totalPoints] = await Promise.all([
      prisma.recognition.findMany({
        where: { receiverId: userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.recognition.findMany({
        where: { giverId: userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.recognition.aggregate({
        where: { receiverId: userId },
        _sum: { points: true },
      }),
    ]);

    res.json({
      success: true,
      data: { received, given, totalPoints: totalPoints._sum.points || 0 },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch recognitions" });
  }
});

// ── Leaderboard ───────────────────────────────────────────
router.get("/leaderboard", async (req: Request, res: Response) => {
  try {
    const { period = "month" } = req.query;
    let startDate: Date;
    const now = new Date();
    if (period === "week") {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === "quarter") {
      startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const topReceivers = await prisma.recognition.groupBy({
      by: ["receiverId"],
      where: { createdAt: { gte: startDate } },
      _sum: { points: true },
      _count: true,
      orderBy: { _sum: { points: "desc" } },
      take: 20,
    });

    // Enrich with user names
    const userIds = topReceivers.map(r => r.receiverId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, department: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    const leaderboard = topReceivers.map((r, idx) => ({
      rank: idx + 1,
      user: userMap.get(r.receiverId) || { firstName: "Unknown", lastName: "" },
      totalPoints: r._sum.points || 0,
      recognitionCount: r._count,
    }));

    res.json({ success: true, data: leaderboard, meta: { period, startDate } });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch leaderboard" });
  }
});

// ── Award Programs ────────────────────────────────────────
router.get("/awards", async (_req: Request, res: Response) => {
  try {
    const programs = await prisma.awardProgram.findMany({
      where: { isActive: true },
      include: { nominations: { where: { status: "WINNER" }, take: 5 } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: programs });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch awards" });
  }
});

router.post("/awards", async (req: Request, res: Response) => {
  try {
    const { name, description, frequency, pointValue } = req.body;
    const program = await prisma.awardProgram.create({
      data: { name, description, frequency: frequency || "MONTHLY", pointValue: Number(pointValue) || 100 },
    });
    res.status(201).json({ success: true, data: program });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to create award" });
  }
});

// ── Nominations ───────────────────────────────────────────
router.post("/awards/:id/nominate", async (req: Request, res: Response) => {
  try {
    const nominatorId = (req as any).user?.userId;
    const { nomineeId, reason, period } = req.body;

    const nomination = await prisma.awardNomination.create({
      data: {
        programId: req.params.id,
        nomineeId,
        nominatorId,
        reason,
        period: period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
      },
    });
    res.status(201).json({ success: true, data: nomination, message: "Nomination submitted" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to nominate" });
  }
});

router.get("/awards/:id/nominations", async (req: Request, res: Response) => {
  try {
    const nominations = await prisma.awardNomination.findMany({
      where: { programId: req.params.id },
      orderBy: { votesCount: "desc" },
    });

    const userIds = nominations.map(n => n.nomineeId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    const enriched = nominations.map(n => ({
      ...n,
      nominee: userMap.get(n.nomineeId) || { firstName: "Unknown", lastName: "" },
    }));

    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch nominations" });
  }
});

router.post("/nominations/:id/vote", async (req: Request, res: Response) => {
  try {
    const nomination = await prisma.awardNomination.update({
      where: { id: req.params.id },
      data: { votesCount: { increment: 1 } },
    });
    res.json({ success: true, data: nomination });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to vote" });
  }
});

router.post("/nominations/:id/select-winner", async (req: Request, res: Response) => {
  try {
    const nomination = await prisma.awardNomination.update({
      where: { id: req.params.id },
      data: { status: "WINNER" },
    });

    // Auto-give recognition points to winner
    const program = await prisma.awardProgram.findUnique({ where: { id: nomination.programId } });
    if (program) {
      await prisma.recognition.create({
        data: {
          giverId: (req as any).user?.userId,
          receiverId: nomination.nomineeId,
          type: "AWARD",
          category: "EXCELLENCE",
          message: `Won the ${program.name} award! 🏆`,
          points: program.pointValue,
          isPublic: true,
        },
      });
    }

    res.json({ success: true, data: nomination, message: "Winner selected and awarded!" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to select winner" });
  }
});

// ── Dashboard ─────────────────────────────────────────────
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [total, thisMonthCount, topCategories, totalPoints, activePrograms] = await Promise.all([
      prisma.recognition.count(),
      prisma.recognition.count({ where: { createdAt: { gte: thisMonth } } }),
      prisma.recognition.groupBy({ by: ["category"], _count: true, orderBy: { _count: { category: "desc" } }, take: 5 }),
      prisma.recognition.aggregate({ _sum: { points: true } }),
      prisma.awardProgram.count({ where: { isActive: true } }),
    ]);

    res.json({
      success: true,
      data: {
        totalRecognitions: total,
        thisMonthRecognitions: thisMonthCount,
        totalPointsDistributed: totalPoints._sum.points || 0,
        activePrograms,
        topCategories: topCategories.map(c => ({ category: c.category, count: c._count })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch dashboard" });
  }
});

export { router as recognitionRouter };
