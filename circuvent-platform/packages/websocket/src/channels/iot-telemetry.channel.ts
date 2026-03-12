// ──────────────────────────────────────────────────────────────
// WebSocket — IoT Telemetry Channel
// Handles real-time telemetry data streaming from devices,
// validates payloads, stores in DB, and broadcasts.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { CircuventWSServer, AuthenticatedSocket } from "../ws.server";

const prisma = new PrismaClient();

const VALID_LOG_LEVELS = ["INFO", "WARN", "ERROR", "CRITICAL"];
const MAX_BATCH_SIZE = 100;

interface TelemetryPayload {
  deviceId: string;
  payload: Record<string, unknown>;
  logLevel?: string;
  timestamp?: string;
}

interface BatchTelemetryPayload {
  entries: TelemetryPayload[];
}

export function registerTelemetryChannel(wsServer: CircuventWSServer): void {
  wsServer.onChannel("iot:telemetry", async (socket: AuthenticatedSocket, data: unknown) => {
    const msg = data as TelemetryPayload | BatchTelemetryPayload;

    try {
      // Handle batch vs single
      if ("entries" in msg && Array.isArray(msg.entries)) {
        await handleBatch(wsServer, msg.entries);
      } else {
        await handleSingle(wsServer, msg as TelemetryPayload);
      }
    } catch (error: any) {
      socket.send(JSON.stringify({
        channel: "iot:telemetry",
        event: "error",
        data: { message: error.message },
        timestamp: new Date().toISOString(),
      }));
    }
  });
}

async function handleSingle(wsServer: CircuventWSServer, payload: TelemetryPayload): Promise<void> {
  if (!payload.deviceId || !payload.payload) return;

  const logLevel = VALID_LOG_LEVELS.includes(payload.logLevel || "") ? payload.logLevel! : "INFO";

  await prisma.telemetryLog.create({
    data: {
      deviceId: payload.deviceId,
      payload: payload.payload as any,
      logLevel,
      timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
    },
  });

  // Update heartbeat
  await prisma.ioTDevice.update({
    where: { id: payload.deviceId },
    data: { lastHeartbeat: new Date(), status: "ONLINE" },
  }).catch(() => {}); // Ignore if device not found

  // Broadcast to subscribers
  wsServer.broadcast("iot:telemetry", "telemetry_received", {
    deviceId: payload.deviceId,
    logLevel,
    payload: payload.payload,
    timestamp: new Date().toISOString(),
  });

  // If error or critical, also broadcast to alerts channel
  if (logLevel === "ERROR" || logLevel === "CRITICAL") {
    wsServer.broadcast("iot:alerts", "telemetry_alert", {
      deviceId: payload.deviceId,
      logLevel,
      message: typeof payload.payload.message === "string" ? payload.payload.message : JSON.stringify(payload.payload),
      timestamp: new Date().toISOString(),
    });
  }
}

async function handleBatch(wsServer: CircuventWSServer, entries: TelemetryPayload[]): Promise<void> {
  if (entries.length === 0) return;
  if (entries.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size ${entries.length} exceeds maximum ${MAX_BATCH_SIZE}`);
  }

  const validEntries = entries.filter((e) => e.deviceId && e.payload);

  await prisma.telemetryLog.createMany({
    data: validEntries.map((e) => ({
      deviceId: e.deviceId,
      payload: e.payload as any,
      logLevel: VALID_LOG_LEVELS.includes(e.logLevel || "") ? e.logLevel! : "INFO",
      timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
    })),
  });

  // Update heartbeats for unique devices
  const uniqueDeviceIds = [...new Set(validEntries.map((e) => e.deviceId))];
  await Promise.all(
    uniqueDeviceIds.map((id) =>
      prisma.ioTDevice.update({
        where: { id },
        data: { lastHeartbeat: new Date(), status: "ONLINE" },
      }).catch(() => {})
    )
  );

  wsServer.broadcast("iot:telemetry", "batch_received", {
    count: validEntries.length,
    devices: uniqueDeviceIds,
    timestamp: new Date().toISOString(),
  });
}
