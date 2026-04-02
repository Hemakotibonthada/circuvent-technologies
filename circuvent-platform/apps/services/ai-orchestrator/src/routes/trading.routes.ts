// ──────────────────────────────────────────────────────────────
// AI Orchestrator — Trading Bot Routes
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { TradingBotService } from "../services/trading-bot.service";
import { createTradingBotSchema, updateBotStatusSchema, logBotTradeSchema } from "../validators/ai.validators";

const router = Router();

router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const dashboard = await TradingBotService.getDashboard();
    res.json({ success: true, data: dashboard });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const { status, page, limit } = req.query;
    const result = await TradingBotService.list({
      status: status as string, page: Number(page) || 1, limit: Number(limit) || 20,
    });
    res.json({ success: true, data: result.data, meta: { total: result.total } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const bot = await TradingBotService.getById(req.params.id);
    if (!bot) { res.status(404).json({ success: false, error: "Bot not found" }); return; }
    res.json({ success: true, data: bot });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = createTradingBotSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
    const userId = (req as any).user?.userId;
    const bot = await TradingBotService.create(parsed.data, userId);
    res.status(201).json({ success: true, data: bot, message: "Trading bot created" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const parsed = updateBotStatusSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
    const userId = (req as any).user?.userId;
    const bot = await TradingBotService.updateStatus(req.params.id, parsed.data.status, userId);
    res.json({ success: true, data: bot, message: "Bot status updated" });
  } catch (error: any) {
    const status = error.message.includes("Invalid transition") ? 400 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

router.post("/:id/logs", async (req: Request, res: Response) => {
  try {
    const parsed = logBotTradeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
    const log = await TradingBotService.addLog(req.params.id, parsed.data);
    res.status(201).json({ success: true, data: log });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/:id/logs", async (req: Request, res: Response) => {
  try {
    const { logLevel, limit } = req.query;
    const logs = await TradingBotService.getLogs(req.params.id, {
      logLevel: logLevel as string, limit: Number(limit) || 100,
    });
    res.json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put("/:id/performance", async (req: Request, res: Response) => {
  try {
    const bot = await TradingBotService.updatePerformance(req.params.id, req.body);
    res.json({ success: true, data: bot, message: "Performance updated" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export { router as tradingRouter };
