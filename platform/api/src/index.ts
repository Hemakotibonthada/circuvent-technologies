import http from "node:http";
import { createHash } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { config } from "./config";
import { logger } from "./logger";
import { initDb } from "./db";
import { connectMqtt } from "./mqtt";
import { attachWebSocket } from "./ws";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { deviceRouter } from "./routes/devices";
import { accountRouter } from "./routes/account";
import { automationRouter } from "./routes/automations";
import { provisioningRouter } from "./routes/provisioning";
import { oauthRouter } from "./routes/oauth";
import { smarthomeRouter } from "./routes/smarthome";
import { roomsRouter } from "./routes/rooms";
import { scenesRouter } from "./routes/scenes";
import { eventsRouter } from "./routes/events";
import { energyRouter } from "./routes/energy";
import { adminRouter } from "./routes/admin";
import { gateRouter } from "./routes/gate";
import { anprRouter } from "./routes/anpr";
import { droneRouter } from "./routes/drone";
import { v1Router } from "./routes/v1";
import { developerRouter } from "./routes/developer";
import { consoleRouter } from "./routes/console";
import { startAutomationScheduler } from "./automations";
import { startWebhooks } from "./webhooks";
import { startAnpr } from "./anpr";
import { startDrone } from "./drone";
import { startLivenessSweeper } from "./liveness";

async function main(): Promise<void> {
  await initDb();
  logger.info("Database ready");
  // Connect to the broker in the background — never block HTTP startup on it.
  // mqtt.js auto-reconnects, so the API stays up (and /health works) even if
  // the broker is briefly unavailable.
  connectMqtt().catch((err) => logger.error({ err }, "MQTT initial connect failed (will retry)"));

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // behind Caddy — needed for correct client IPs (rate limiting)
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
  app.use(cors({ origin: config.CORS_ORIGIN === "*" ? true : config.CORS_ORIGIN.split(",") }));
  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp({ logger }));

  // Abuse protection. Auth/OTP endpoints are the sensitive ones (brute-force,
  // OTP-email flooding), so they get a tighter bucket than the general API.
  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
    // /v1 has its own per-key bucket below. Leaving the IP limiter in front of
    // it would mean two developers behind one NAT — or one developer's whole
    // server — sharing a budget with every browser on that address.
    skip: (req) => req.path.startsWith("/v1"),
  });
  const authLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts — please wait a minute." } });

  /**
   * Developer API budget, counted per key rather than per IP.
   *
   * An integration runs from one server, so every call it makes shares a
   * source address; per-IP counting would make one busy customer throttle
   * themselves while telling us nothing about who was actually spending the
   * budget. Requests with no key fall back to the IP so an unauthenticated
   * flood is still bounded.
   */
  const v1Limiter = rateLimit({
    windowMs: 60_000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const h = req.headers.authorization;
      const raw = h?.startsWith("Bearer ") ? h.slice(7).trim() : (req.headers["x-api-key"] as string | undefined);
      // Bucket by a hash of the key, never the key itself — rate-limiter state
      // is held in memory and shows up in dumps and metrics.
      if (raw) return "k:" + createHash("sha256").update(raw).digest("hex").slice(0, 32);
      return "ip:" + (req.ip ?? "unknown");
    },
    message: { error: "Rate limit exceeded — 600 requests per minute per key.", code: "rate_limited" },
  });
  app.use(apiLimiter);

  app.use("/health", healthRouter);
  app.use("/auth", authLimiter, authRouter);
  app.use("/v1", v1Limiter, v1Router);
  app.use("/developer", developerRouter);
  app.use("/devices", deviceRouter);
  app.use("/account", accountRouter);
  app.use("/automations", automationRouter);
  app.use("/provisioning", provisioningRouter);
  app.use("/oauth", oauthRouter);
  app.use("/smarthome", smarthomeRouter);
  app.use("/rooms", roomsRouter);
  app.use("/scenes", scenesRouter);
  app.use("/events", eventsRouter);
  app.use("/energy", energyRouter);
  app.use("/admin", adminRouter);
  app.use("/gate", gateRouter);
  app.use("/anpr", anprRouter);
  app.use("/drone", droneRouter);
  // Mounted last so it can never shadow an API path: it only claims "/" and
  // "/index.json", and every route above is matched first.
  app.use("/", consoleRouter);

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  const server = http.createServer(app);
  attachWebSocket(server);

  startAutomationScheduler();
  startWebhooks();
  startAnpr();
  startDrone();
  startLivenessSweeper();

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
