import http from "node:http";
import { createHash } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
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
import { faceRouter } from "./face/routes";
import { homeRouter } from "./home/routes";
import { anprRouter } from "./routes/anpr";
import { droneRouter } from "./routes/drone";
import { v1Router } from "./routes/v1";
import { developerRouter } from "./routes/developer";
import { consoleRouter } from "./routes/console";
import { startAutomationScheduler } from "./automations";
import { startWebhooks } from "./webhooks";
import { startAnpr } from "./anpr";
import { startFaceDoors } from "./face/door";
import { startAttendanceSystem, attendanceRouter } from "./attend";
import { startGuardianSystem, guardianRouter } from "./guardian";
import { startGateSystem, gateAccessRouter } from "./gate";
import { startDrone } from "./drone";
import { startLivenessSweeper } from "./liveness";
import { asActor } from "./home/enforce";

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
      /*
       * Unauthenticated requests fall back to the address, through the
       * library's helper rather than `req.ip` directly.
       *
       * A raw IPv6 address is not an identity. A single client is routinely
       * handed a whole /64, so counting per address let one machine take a
       * fresh 600-per-minute budget for every address it cared to use — an
       * unlimited allowance dressed as a limit. The helper buckets a v6 caller
       * by its subnet, and leaves v4 alone.
       *
       * express-rate-limit says this at startup (ERR_ERL_KEY_GEN_IPV6). It was
       * logged as an error on every boot and read as noise, which is the usual
       * fate of a warning nobody has to act on.
       */
      return "ip:" + ipKeyGenerator(req.ip ?? "unknown");
    },
    message: { error: "Rate limit exceeded — 600 requests per minute per key.", code: "rate_limited" },
  });
  app.use(apiLimiter);

  app.use("/health", healthRouter);
  /*
   * Account-level routers run as the person, never as the home they are
   * currently acting in.
   *
   * `requireAuth` rewrites the uid to the home so device queries scope
   * correctly; on these routers that rewrite would let a household member
   * change the owner's password, read the owner's signed-in devices and their
   * IP addresses, or sign the owner out of everything. `asActor` puts the real
   * identity back before any handler sees it, and `account-scope.test.ts`
   * fails if one of these is ever mounted without it.
   */
  app.use("/auth", authLimiter, asActor, authRouter);
  app.use("/v1", v1Limiter, v1Router);
  app.use("/developer", asActor, developerRouter);
  app.use("/devices", deviceRouter);
  app.use("/account", asActor, accountRouter);
  app.use("/automations", automationRouter);
  app.use("/provisioning", provisioningRouter);
  app.use("/oauth", oauthRouter);
  app.use("/smarthome", smarthomeRouter);
  app.use("/rooms", roomsRouter);
  app.use("/face", faceRouter);
  app.use("/home", homeRouter);
  app.use("/scenes", scenesRouter);
  app.use("/events", eventsRouter);
  app.use("/energy", energyRouter);
  app.use("/admin", asActor, adminRouter);
  app.use("/gate", gateRouter);
  app.use("/attendance", attendanceRouter);
  app.use("/guardian", guardianRouter);
  app.use("/gate", gateAccessRouter);
  app.use("/anpr", anprRouter);
  app.use("/drone", droneRouter);
  // Mounted last so it can never shadow an API path: it only claims "/" and
  // "/index.json", and every route above is matched first.
  app.use("/", consoleRouter);

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  /*
   * The last line of defence for a handler that threw.
   *
   * Express 4 routes a *synchronous* throw here and does nothing with a
   * rejected promise, so this catches the first kind and the process-level
   * handler below catches the second. Both exist because neither is enough
   * alone, and because the failure they prevent is disproportionate: a single
   * bad request that reached an unguarded `pool.query` used to end the process
   * for every tenant on it.
   *
   * The body says nothing about the error. A stack trace or a Postgres message
   * on a 500 tells an attacker the schema; the log has both, keyed by a
   * request id the operator can search for.
   */
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err, method: req.method, path: req.path }, "unhandled route error");
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal error", code: "internal_error" });
  });

  const server = http.createServer(app);
  attachWebSocket(server);

  startAutomationScheduler();
  startWebhooks();
  startAnpr();
  startFaceDoors();
  startAttendanceSystem();
  startGuardianSystem();
  startGateSystem();
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

  /*
   * A rejected promise must not end the fleet.
   *
   * Node exits on an unhandled rejection by default, and Express 4 turns every
   * async route handler that rejects into exactly that: `pool.query` with a
   * malformed id raises, nothing is awaiting the handler, and the control
   * plane — every account, every device, every open WebSocket — goes down
   * because one request had a letter where a number belonged.
   *
   * Logging and continuing is the right trade *here specifically*, and the
   * reasoning matters because the opposite is the usual advice. This process
   * holds no in-memory state that a rejection can corrupt: sessions are JWTs,
   * device state is in Postgres, and the MQTT client reconnects. The request
   * that caused it gets no response and times out, which is a bad minute for
   * one caller. Crashing turns that into an outage for everybody, and on a
   * single-VM deployment (Docs/12-vm-runbook.md) there is no second replica to
   * take over while it restarts.
   *
   * It is logged at error with the reason attached so it cannot pass as
   * healthy: this is a net for bugs nobody found yet, not a way to stop
   * finding them.
   */
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "unhandled promise rejection — request dropped, process kept alive");
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal boot error");
  process.exit(1);
});
