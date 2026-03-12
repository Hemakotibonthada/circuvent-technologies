// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Health Check Routes
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { PrismaClient } from "@circuvent/database";
import { SERVICE_PORTS } from "@circuvent/shared";

const router = Router();
const prisma = new PrismaClient();

// ── GET /api/health ──
router.get("/", async (_req: Request, res: Response) => {
  const dbStatus = await checkDatabase();

  res.json({
    success: true,
    data: {
      service: "api-gateway",
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus,
      services: {
        projectTracker: `http://localhost:${SERVICE_PORTS.PROJECT_TRACKER}`,
        iotRegistry: `http://localhost:${SERVICE_PORTS.IOT_REGISTRY}`,
        hrPayroll: `http://localhost:${SERVICE_PORTS.HR_PAYROLL}`,
        clientPortal: `http://localhost:${SERVICE_PORTS.CLIENT_PORTAL}`,
        aiOrchestrator: `http://localhost:${SERVICE_PORTS.AI_ORCHESTRATOR}`,
        financialLedger: `http://localhost:${SERVICE_PORTS.FINANCIAL_LEDGER}`,
        atsEngine: `http://localhost:${SERVICE_PORTS.ATS_ENGINE}`,
      },
    },
  });
});

async function checkDatabase(): Promise<string> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "connected";
  } catch {
    return "disconnected";
  }
}

export { router as healthRouter };
