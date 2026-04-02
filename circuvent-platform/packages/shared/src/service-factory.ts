// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Base Express Service Factory
// Shared bootstrap for all microservices.
// ──────────────────────────────────────────────────────────────

import express, { Express, Router } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";

export interface ServiceConfig {
  name: string;
  port: number;
}

/**
 * Creates a pre-configured Express app for a microservice.
 * Each service receives user info via headers from the API Gateway.
 */
export function createService(config: ServiceConfig): Express {
  const app = express();

  // ── Middleware ──
  app.use(helmet({
    contentSecurityPolicy: false,   // relaxed for dev — Chrome DevTools needs connect-src
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());
  app.use(cors());
  app.use(morgan("short"));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // ── Extract user from gateway-forwarded headers ──
  app.use((req, _res, next) => {
    const userId = req.headers["x-user-id"] as string;
    const userEmail = req.headers["x-user-email"] as string;
    const userRole = req.headers["x-user-role"] as string;

    if (userId) {
      (req as any).user = {
        userId,
        email: userEmail,
        role: userRole,
      };
    }
    next();
  });

  // ── Root welcome ──
  app.get("/", (_req, res) => {
    res.json({
      success: true,
      service: config.name,
      version: "1.0.0",
      status: "running",
      docs: {
        health: "/health",
        api: "/api",
      },
      timestamp: new Date().toISOString(),
    });
  });

  // ── Health check ──
  app.get("/health", (_req, res) => {
    res.json({
      success: true,
      data: {
        service: config.name,
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
    });
  });

  return app;
}

/**
 * Starts the microservice and logs the startup banner.
 */
export function startService(app: Express, config: ServiceConfig): void {
  app.listen(config.port, () => {
    console.log(`  [${config.name}] Running on http://localhost:${config.port}`);
  });
}

/**
 * Creates a typed router for a service module.
 */
export function createRouter(): Router {
  return Router();
}
