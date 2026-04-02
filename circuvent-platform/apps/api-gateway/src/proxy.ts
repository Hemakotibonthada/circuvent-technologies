// ──────────────────────────────────────────────────────────────
// Circuvent Platform — API Gateway Proxy Configuration
// Routes traffic to downstream microservices.
// ──────────────────────────────────────────────────────────────

import { Express } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { SERVICE_PORTS, SERVICE_ROUTES } from "@circuvent/shared";
import { authenticate } from "@circuvent/auth";

const BASE_URL = process.env.SERVICE_HOST || "http://localhost";

interface ServiceConfig {
  path: string;
  target: string;
  requiresAuth: boolean;
}

const services: ServiceConfig[] = [
  {
    path: SERVICE_ROUTES.PROJECT_TRACKER,
    target: `${BASE_URL}:${SERVICE_PORTS.PROJECT_TRACKER}`,
    requiresAuth: true,
  },
  {
    path: SERVICE_ROUTES.IOT_REGISTRY,
    target: `${BASE_URL}:${SERVICE_PORTS.IOT_REGISTRY}`,
    requiresAuth: true,
  },
  {
    path: SERVICE_ROUTES.HR_PAYROLL,
    target: `${BASE_URL}:${SERVICE_PORTS.HR_PAYROLL}`,
    requiresAuth: true,
  },
  {
    path: SERVICE_ROUTES.CLIENT_PORTAL,
    target: `${BASE_URL}:${SERVICE_PORTS.CLIENT_PORTAL}`,
    requiresAuth: true,
  },
  {
    path: SERVICE_ROUTES.AI_ORCHESTRATOR,
    target: `${BASE_URL}:${SERVICE_PORTS.AI_ORCHESTRATOR}`,
    requiresAuth: true,
  },
  {
    path: SERVICE_ROUTES.FINANCIAL_LEDGER,
    target: `${BASE_URL}:${SERVICE_PORTS.FINANCIAL_LEDGER}`,
    requiresAuth: true,
  },
  {
    path: SERVICE_ROUTES.ATS_ENGINE,
    target: `${BASE_URL}:${SERVICE_PORTS.ATS_ENGINE}`,
    requiresAuth: true,
  },
];

export function setupProxyRoutes(app: Express): void {
  for (const service of services) {
    // Create a proxy that handles auth + forwarding
    // Use app.all to match all methods, and manually filter the path
    const pathPattern = `${service.path}*`;

    if (service.requiresAuth) {
      app.use(pathPattern, authenticate);
    }

    app.use(pathPattern, createProxyMiddleware({
      target: service.target,
      changeOrigin: true,
      // http-proxy-middleware v3: when mounted on a path, Express strips the base.
      // We need to prepend it back so the downstream service receives the full path.
      pathRewrite: (_path, req) => {
        // req.originalUrl has the FULL path from the client
        return req.originalUrl;
      },
      on: {
        proxyReq: (proxyReq, req: any) => {
          // Forward user context from auth middleware
          if (req.user) {
            proxyReq.setHeader("x-user-id", req.user.userId);
            proxyReq.setHeader("x-user-email", req.user.email);
            proxyReq.setHeader("x-user-role", req.user.role);
          }
          // Fix: re-serialize body for POST/PUT/PATCH — express.json() consumed the stream
          if (req.body && Object.keys(req.body).length > 0) {
            const bodyData = JSON.stringify(req.body);
            proxyReq.setHeader("Content-Type", "application/json");
            proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        },
        error: (err, _req, res: any) => {
          console.error(`[PROXY ERROR] ${service.path}:`, err.message);
          if (!res.headersSent) {
            res.status(503).json({ success: false, error: `Service unavailable: ${service.path}` });
          }
        },
      },
    }));

    console.log(`  → Proxy: ${service.path} → ${service.target}`);
  }
}
