// ──────────────────────────────────────────────────────────────
// Circuvent Platform — API Gateway Entry Point
// Routes requests to microservice endpoints.
// ──────────────────────────────────────────────────────────────

import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { SERVICE_PORTS } from "@circuvent/shared";
import { setupProxyRoutes } from "./proxy";
import { authRouter } from "./routes/auth.routes";
import { healthRouter } from "./routes/health.routes";
import { auditRouter } from "./routes/audit.routes";
import { notificationRouter } from "./routes/notification.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { integrationRouter } from "./routes/integration.routes";
import { requestIdMiddleware } from "./middleware/request-id.middleware";
import { correlationMiddleware } from "./middleware/correlation.middleware";
import { responseTimeMiddleware } from "./middleware/response-time.middleware";

const app = express();
const PORT = process.env.GATEWAY_PORT || SERVICE_PORTS.GATEWAY;

// ── Global Middleware ──
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3005",
  credentials: true,
}));
app.use(morgan("combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Rate Limiting ──
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please try again later." },
});
app.use(limiter);

// ── Tracing Middleware ──
app.use(requestIdMiddleware);
app.use(correlationMiddleware);
app.use(responseTimeMiddleware);

// ── Root welcome ──
app.get("/", (_req, res) => {
  res.json({
    success: true,
    service: "circuvent-api-gateway",
    version: "1.0.0",
    platform: "Circuvent Technologies",
    status: "running",
    endpoints: {
      health: "/api/health",
      auth: "/api/auth",
      projects: "/api/projects",
      iot: "/api/iot",
      hr: "/api/hr",
      clients: "/api/clients",
      ai: "/api/ai",
      audit: "/api/audit",
    },
    frontend: "http://localhost:3005",
    timestamp: new Date().toISOString(),
  });
});

// ── Direct Routes (Auth handled at gateway level) ──
app.use("/api/auth", authRouter);
app.use("/api/health", healthRouter);
app.use("/api/audit", auditRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/integrations", integrationRouter);

// ── Proxy Routes to Microservices ──
setupProxyRoutes(app);

// ── 404 Handler ──
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

// ── Global Error Handler ──
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[GATEWAY ERROR]", err.message);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message,
  });
});

// ── Start Server ──
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   Circuvent Platform — API Gateway           ║
  ║   Running on http://localhost:${PORT}            ║
  ║   Environment: ${process.env.NODE_ENV || "development"}               ║
  ╚══════════════════════════════════════════════╝
  `);
});

export default app;
