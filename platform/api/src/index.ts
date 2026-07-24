import http from "node:http";
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { config } from "./config";
import { logger } from "./logger";
import { initDb } from "./db";
import { connectMqtt } from "./mqtt";
import { attachWebSocket } from "./ws";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { deviceRouter } from "./routes/devices";

async function main(): Promise<void> {
  await initDb();
  logger.info("Database ready");
  // Connect to the broker in the background — never block HTTP startup on it.
  // mqtt.js auto-reconnects, so the API stays up (and /health works) even if
  // the broker is briefly unavailable.
  connectMqtt().catch((err) => logger.error({ err }, "MQTT initial connect failed (will retry)"));

  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.CORS_ORIGIN === "*" ? true : config.CORS_ORIGIN.split(",") }));
  app.use(express.json({ limit: "256kb" }));
  app.use(pinoHttp({ logger }));

  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use("/devices", deviceRouter);

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  const server = http.createServer(app);
  attachWebSocket(server);

  server.listen(config.PORT, () => logger.info(`Control plane listening on :${config.PORT}`));

  const shutdown = () => {
    logger.info("Shutting down");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "Fatal boot error");
  process.exit(1);
});
