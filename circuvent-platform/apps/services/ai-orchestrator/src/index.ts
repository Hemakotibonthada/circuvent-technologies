// ──────────────────────────────────────────────────────────────
// Circuvent Platform — AI Resource Orchestrator Service
// Module 5: GPU/CPU management, training jobs, trading bots
// Port 3005 (behind gateway)
// ──────────────────────────────────────────────────────────────

import dotenv from "dotenv";
dotenv.config({ path: "../../../.env" });

import { createService, startService, SERVICE_PORTS } from "@circuvent/shared";
import { resourceRouter } from "./routes/resource.routes";
import { trainingRouter } from "./routes/training.routes";
import { tradingRouter } from "./routes/trading.routes";
import { schedulerRouter } from "./routes/scheduler.routes";
import { modelRouter } from "./routes/model.routes";

const config = {
  name: "ai-orchestrator",
  port: Number(process.env.AI_ORCHESTRATOR_PORT) || SERVICE_PORTS.AI_ORCHESTRATOR,
};

const app = createService(config);

app.use("/api/resources", resourceRouter);
app.use("/api/training", trainingRouter);
app.use("/api/trading", tradingRouter);
app.use("/api/scheduler", schedulerRouter);
app.use("/api/models", modelRouter);
// Gateway-proxied paths
app.use("/api/ai/resources", resourceRouter);
app.use("/api/ai/training", trainingRouter);
app.use("/api/ai/trading", tradingRouter);
app.use("/api/ai/scheduler", schedulerRouter);
app.use("/api/ai/models", modelRouter);

app.use((err: Error, _req: any, res: any, _next: any) => {
  console.error(`[${config.name}] Error:`, err.message);
  res.status(500).json({ success: false, error: err.message });
});

startService(app, config);

export default app;
