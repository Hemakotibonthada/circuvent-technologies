// ──────────────────────────────────────────────────────────────
// WebSocket — Device Command Handler
// Processes command dispatch/acknowledgment through WS.
// Allows devices to receive commands in real-time instead
// of polling the REST API.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { CircuventWSServer, AuthenticatedSocket } from "../ws.server";

const prisma = new PrismaClient();

interface CommandDispatch {
  commandId: string;
  deviceId: string;
  command: string;
  payload?: Record<string, unknown>;
}

interface CommandResponse {
  commandId: string;
  status: "ACKNOWLEDGED" | "COMPLETED" | "FAILED";
  response?: Record<string, unknown>;
}

export function registerDeviceCommandHandler(wsServer: CircuventWSServer): void {
  wsServer.onChannel("iot:commands", async (socket: AuthenticatedSocket, data: unknown) => {
    const msg = data as CommandDispatch | CommandResponse;

    if ("command" in msg) {
      // Dispatch command to device
      await dispatchCommand(wsServer, msg as CommandDispatch);
    } else if ("commandId" in msg && "status" in msg) {
      // Device acknowledging/completing a command
      await handleCommandResponse(wsServer, msg as CommandResponse);
    }
  });
}

async function dispatchCommand(wsServer: CircuventWSServer, dispatch: CommandDispatch): Promise<void> {
  // Mark command as SENT
  await prisma.deviceCommand.update({
    where: { id: dispatch.commandId },
    data: { status: "SENT", sentAt: new Date() },
  });

  // Send to all WebSocket connections subscribed to this device's commands
  wsServer.broadcast("iot:commands", "command_dispatch", {
    commandId: dispatch.commandId,
    deviceId: dispatch.deviceId,
    command: dispatch.command,
    payload: dispatch.payload,
    timestamp: new Date().toISOString(),
  });
}

async function handleCommandResponse(wsServer: CircuventWSServer, response: CommandResponse): Promise<void> {
  const updateData: any = {
    status: response.status,
    response: response.response as any,
  };

  if (response.status === "ACKNOWLEDGED") updateData.ackedAt = new Date();
  if (response.status === "COMPLETED" || response.status === "FAILED") {
    updateData.completedAt = new Date();
  }

  const cmd = await prisma.deviceCommand.update({
    where: { id: response.commandId },
    data: updateData,
    include: { device: { select: { deviceCode: true, deviceName: true } } },
  });

  // Handle OTA completion
  if (response.status === "COMPLETED" && cmd.command === "OTA_UPDATE") {
    const payload = cmd.payload as any;
    if (payload?.targetVersion) {
      await prisma.ioTDevice.update({
        where: { id: cmd.deviceId },
        data: { firmwareVersion: payload.targetVersion },
      });
    }
  }

  // Broadcast command result
  wsServer.broadcast("iot:commands", "command_result", {
    commandId: response.commandId,
    deviceId: cmd.deviceId,
    deviceCode: cmd.device.deviceCode,
    command: cmd.command,
    status: response.status,
    response: response.response,
    timestamp: new Date().toISOString(),
  });
}
