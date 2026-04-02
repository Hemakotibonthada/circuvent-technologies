// ──────────────────────────────────────────────────────────────
// AI Orchestrator — Trading Bot Controller
// Handles bot CRUD, status transitions with domain entity
// validation, trade logging, and performance tracking.
// ──────────────────────────────────────────────────────────────

import { Request, Response } from "express";
import { TradingBotService } from "../services/trading-bot.service";
import { TradingBotEntity } from "../domain/ai.entities";
import { createTradingBotSchema, updateBotStatusSchema, logBotTradeSchema } from "../validators/ai.validators";

function jsonOk(res: Response, data: unknown, message?: string, status = 200) {
  res.status(status).json({ success: true, data, message });
}
function jsonErr(res: Response, error: string, status = 500) {
  res.status(status).json({ success: false, error });
}

export class TradingController {
  static async getDashboard(_req: Request, res: Response): Promise<void> {
    try {
      const dashboard = await TradingBotService.getDashboard();
      jsonOk(res, dashboard);
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { status, page, limit } = req.query;
      const result = await TradingBotService.list({
        status: status as string,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
      });
      jsonOk(res, result.data);
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const bot = await TradingBotService.getById(req.params.id);
      if (!bot) { jsonErr(res, "Trading bot not found", 404); return; }

      const config = bot.configJson as any;
      const entity = new TradingBotEntity(
        bot.id, bot.botCode, bot.status, bot.strategy,
        config?.riskLimits || {
          maxPositionSize: 0, maxDailyLoss: 0, maxDrawdownPercent: 0,
          stopLossPercent: 0, takeProfitPercent: 0, maxOpenPositions: 0,
        },
      );

      jsonOk(res, {
        ...bot,
        _analysis: {
          isActive: entity.isActive(),
          isLive: entity.isLive(),
          canGoLive: entity.canGoLive(),
        },
      });
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createTradingBotSchema.safeParse(req.body);
      if (!parsed.success) { jsonErr(res, parsed.error.errors[0].message, 400); return; }
      const userId = (req as any).user?.userId;
      const bot = await TradingBotService.create(parsed.data, userId);
      jsonOk(res, bot, "Trading bot created", 201);
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateBotStatusSchema.safeParse(req.body);
      if (!parsed.success) { jsonErr(res, parsed.error.errors[0].message, 400); return; }

      // Validate with domain entity
      const existing = await TradingBotService.getById(req.params.id);
      if (!existing) { jsonErr(res, "Bot not found", 404); return; }

      const config = existing.configJson as any;
      const entity = new TradingBotEntity(
        existing.id, existing.botCode, existing.status, existing.strategy,
        config?.riskLimits || {
          maxPositionSize: 0, maxDailyLoss: 0, maxDrawdownPercent: 0,
          stopLossPercent: 0, takeProfitPercent: 0, maxOpenPositions: 0,
        },
      );

      if (!entity.canTransitionTo(parsed.data.status as any)) {
        jsonErr(res, `Invalid bot transition: ${existing.status} → ${parsed.data.status}`, 400);
        return;
      }

      const userId = (req as any).user?.userId;
      const bot = await TradingBotService.updateStatus(req.params.id, parsed.data.status, userId);
      jsonOk(res, bot, "Bot status updated");
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async addLog(req: Request, res: Response): Promise<void> {
    try {
      const parsed = logBotTradeSchema.safeParse(req.body);
      if (!parsed.success) { jsonErr(res, parsed.error.errors[0].message, 400); return; }

      // If it's a TRADE log, validate risk limits
      if (parsed.data.logLevel === "TRADE" && parsed.data.tradeData) {
        const bot = await TradingBotService.getById(req.params.id);
        if (bot) {
          const config = bot.configJson as any;
          const entity = new TradingBotEntity(
            bot.id, bot.botCode, bot.status, bot.strategy,
            config?.riskLimits || {
              maxPositionSize: Infinity, maxDailyLoss: Infinity, maxDrawdownPercent: 100,
              stopLossPercent: 100, takeProfitPercent: 100, maxOpenPositions: 999,
            },
          );

          const riskCheck = entity.validateTradeRisk({
            size: parsed.data.tradeData.quantity * parsed.data.tradeData.price,
            currentDailyLoss: 0,
            openPositions: 0,
          });

          if (!riskCheck.allowed) {
            jsonErr(res, `Risk limit violated: ${riskCheck.violations.join("; ")}`, 400);
            return;
          }
        }
      }

      const log = await TradingBotService.addLog(req.params.id, parsed.data);
      jsonOk(res, log, undefined, 201);
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async getLogs(req: Request, res: Response): Promise<void> {
    try {
      const { logLevel, limit } = req.query;
      const logs = await TradingBotService.getLogs(req.params.id, {
        logLevel: logLevel as string, limit: limit ? Number(limit) : 100,
      });
      jsonOk(res, logs);
    } catch (error: any) { jsonErr(res, error.message); }
  }

  static async updatePerformance(req: Request, res: Response): Promise<void> {
    try {
      const bot = await TradingBotService.updatePerformance(req.params.id, req.body);
      jsonOk(res, bot, "Performance updated");
    } catch (error: any) { jsonErr(res, error.message); }
  }
}
