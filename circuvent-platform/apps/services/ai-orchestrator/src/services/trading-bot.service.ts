// ──────────────────────────────────────────────────────────────
// AI Orchestrator — Trading Bot Service
// Manages automated trading bot lifecycle, deployment logs,
// performance tracking, and risk limit enforcement.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

export class TradingBotService {
  static async list(params: { status?: string; page: number; limit: number }) {
    const where: any = {};
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      prisma.tradingBot.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: { _count: { select: { logs: true } } },
      }),
      prisma.tradingBot.count({ where }),
    ]);
    return { data, total };
  }

  static async getById(id: string) {
    return prisma.tradingBot.findUnique({
      where: { id },
      include: {
        logs: { orderBy: { timestamp: "desc" }, take: 100 },
      },
    });
  }

  static async create(data: any, userId: string) {
    const count = await prisma.tradingBot.count();
    const strategyPrefix = data.strategy.slice(0, 4).toUpperCase();
    const botCode = `TB-${strategyPrefix}-${String(count + 1).padStart(2, "0")}`;

    const bot = await prisma.tradingBot.create({
      data: {
        botCode,
        name: data.name,
        description: data.description,
        strategy: data.strategy,
        modelId: data.modelId,
        configJson: data.configJson || {},
        createdById: userId,
      },
    });

    await createAuditLog({ userId, action: "CREATE", entity: "TradingBot", entityId: bot.id, newValue: { botCode, strategy: data.strategy } });
    return bot;
  }

  static async updateStatus(id: string, status: string, userId: string) {
    const bot = await prisma.tradingBot.findUnique({ where: { id } });
    if (!bot) throw new Error("Trading bot not found");

    // Validate state transitions
    const validTransitions: Record<string, string[]> = {
      INACTIVE: ["BACKTESTING", "PAPER_TRADING", "DECOMMISSIONED"],
      BACKTESTING: ["INACTIVE", "PAPER_TRADING", "PAUSED", "ERROR"],
      PAPER_TRADING: ["INACTIVE", "LIVE", "PAUSED", "ERROR"],
      LIVE: ["PAUSED", "ERROR", "INACTIVE"],
      PAUSED: ["LIVE", "PAPER_TRADING", "BACKTESTING", "INACTIVE"],
      ERROR: ["INACTIVE", "PAUSED"],
      DECOMMISSIONED: [],
    };

    if (!validTransitions[bot.status]?.includes(status)) {
      throw new Error(`Invalid transition: ${bot.status} -> ${status}`);
    }

    const updateData: any = { status: status as any };
    if (status === "LIVE" || status === "PAPER_TRADING" || status === "BACKTESTING") {
      updateData.deployedAt = new Date();
    }

    const updated = await prisma.tradingBot.update({ where: { id }, data: updateData });

    // Log the status change
    await prisma.tradingBotLog.create({
      data: {
        botId: id,
        logLevel: status === "ERROR" ? "ERROR" : "INFO",
        message: `Bot status changed: ${bot.status} -> ${status}`,
      },
    });

    const actionMap: Record<string, string> = {
      LIVE: "BOT_DEPLOY",
      INACTIVE: "BOT_STOP",
      DECOMMISSIONED: "BOT_STOP",
    };

    await createAuditLog({
      userId,
      action: (actionMap[status] || "UPDATE") as any,
      entity: "TradingBot",
      entityId: id,
      newValue: { status, previousStatus: bot.status },
    });

    return updated;
  }

  static async addLog(botId: string, data: { logLevel: string; message: string; tradeData?: any }) {
    const log = await prisma.tradingBotLog.create({
      data: {
        botId,
        logLevel: data.logLevel,
        message: data.message,
        tradeData: data.tradeData || undefined,
      },
    });

    // If it's a trade, update lastTradeAt
    if (data.logLevel === "TRADE") {
      await prisma.tradingBot.update({
        where: { id: botId },
        data: { lastTradeAt: new Date() },
      });
    }

    return log;
  }

  static async updatePerformance(botId: string, performanceJson: Record<string, unknown>) {
    return prisma.tradingBot.update({
      where: { id: botId },
      data: { performanceJson: performanceJson as any },
    });
  }

  static async getLogs(botId: string, params: { logLevel?: string; limit?: number }) {
    const where: any = { botId };
    if (params.logLevel) where.logLevel = params.logLevel;

    return prisma.tradingBotLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: Math.min(params.limit || 100, 1000),
    });
  }

  static async getDashboard() {
    const [total, byStatus, activeBots, recentTrades] = await Promise.all([
      prisma.tradingBot.count(),
      prisma.tradingBot.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.tradingBot.findMany({
        where: { status: { in: ["LIVE", "PAPER_TRADING", "BACKTESTING"] } },
        select: { id: true, botCode: true, name: true, strategy: true, status: true, performanceJson: true, lastTradeAt: true },
      }),
      prisma.tradingBotLog.findMany({
        where: { logLevel: "TRADE" },
        orderBy: { timestamp: "desc" },
        take: 20,
        include: { bot: { select: { botCode: true, name: true } } },
      }),
    ]);

    return {
      total,
      byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count.id])),
      activeBots,
      recentTrades,
    };
  }
}
