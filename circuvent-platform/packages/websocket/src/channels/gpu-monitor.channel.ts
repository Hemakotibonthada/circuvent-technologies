// ──────────────────────────────────────────────────────────────
// WebSocket — GPU Monitor Channel
// Real-time GPU/CPU resource utilization monitoring for
// the AI Orchestrator dashboard.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { CircuventWSServer, AuthenticatedSocket } from "../ws.server";

const prisma = new PrismaClient();

interface GPUMetricsPayload {
  resourceId: string;
  gpuUtilization: number;    // 0-100%
  gpuMemoryUsed: number;     // GB
  gpuMemoryTotal: number;    // GB
  gpuTemperature: number;    // °C
  powerDraw: number;         // Watts
  fanSpeed: number;          // %
  processCount: number;
  timestamp?: string;
}

export function registerGPUMonitorChannel(wsServer: CircuventWSServer): void {
  wsServer.onChannel("gpu:monitor", async (_socket: AuthenticatedSocket, data: unknown) => {
    const metrics = data as GPUMetricsPayload;

    if (!metrics.resourceId) return;

    // Validate resource exists
    const resource = await prisma.computeResource.findUnique({
      where: { id: metrics.resourceId },
      select: { id: true, resourceCode: true, name: true, vramGb: true },
    });

    if (!resource) return;

    // Broadcast to all GPU monitor subscribers
    wsServer.broadcast("gpu:monitor", "gpu_metrics", {
      resourceId: metrics.resourceId,
      resourceCode: resource.resourceCode,
      resourceName: resource.name,
      utilization: metrics.gpuUtilization,
      memoryUsed: metrics.gpuMemoryUsed,
      memoryTotal: metrics.gpuMemoryTotal,
      memoryPercent: metrics.gpuMemoryTotal > 0
        ? Math.round((metrics.gpuMemoryUsed / metrics.gpuMemoryTotal) * 100)
        : 0,
      temperature: metrics.gpuTemperature,
      powerDraw: metrics.powerDraw,
      fanSpeed: metrics.fanSpeed,
      processCount: metrics.processCount,
      timestamp: metrics.timestamp || new Date().toISOString(),
    });

    // Alert on high temperature
    if (metrics.gpuTemperature > 85) {
      wsServer.broadcast("gpu:monitor", "gpu_alert", {
        resourceId: metrics.resourceId,
        alertType: "HIGH_TEMPERATURE",
        severity: metrics.gpuTemperature > 95 ? "CRITICAL" : "WARNING",
        message: `GPU ${resource.resourceCode} temperature: ${metrics.gpuTemperature}°C`,
        timestamp: new Date().toISOString(),
      });
    }

    // Alert on memory exhaustion
    if (metrics.gpuMemoryTotal > 0 && (metrics.gpuMemoryUsed / metrics.gpuMemoryTotal) > 0.95) {
      wsServer.broadcast("gpu:monitor", "gpu_alert", {
        resourceId: metrics.resourceId,
        alertType: "MEMORY_EXHAUSTION",
        severity: "CRITICAL",
        message: `GPU ${resource.resourceCode} memory: ${metrics.gpuMemoryUsed}/${metrics.gpuMemoryTotal} GB`,
        timestamp: new Date().toISOString(),
      });
    }
  });
}
