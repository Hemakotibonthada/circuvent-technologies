// ──────────────────────────────────────────────────────────────
// IoT Registry — Device Command Service
// Sends commands to devices, tracks status (QUEUED → SENT →
// ACKNOWLEDGED → COMPLETED/FAILED), and logs results.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

const VALID_COMMANDS = ["RESTART", "OTA_UPDATE", "CONFIG_PUSH", "DIAGNOSTIC", "FACTORY_RESET", "LOG_DUMP"] as const;
type CommandType = typeof VALID_COMMANDS[number];

export interface CommandInput {
  deviceId: string;
  command: CommandType;
  payload?: Record<string, unknown>;
  issuedById: string;
}

export interface CommandAck {
  commandId: string;
  status: "ACKNOWLEDGED" | "COMPLETED" | "FAILED";
  response?: Record<string, unknown>;
}

export class DeviceCommandService {
  /**
   * Queue a command for a device.
   */
  static async sendCommand(input: CommandInput): Promise<any> {
    // Validate device
    const device = await prisma.ioTDevice.findUnique({ where: { id: input.deviceId } });
    if (!device) throw new Error("Device not found");
    if (device.status === "DECOMMISSIONED") throw new Error("Cannot send commands to decommissioned device");

    // Validate command type
    if (!VALID_COMMANDS.includes(input.command)) {
      throw new Error(`Invalid command. Valid: ${VALID_COMMANDS.join(", ")}`);
    }

    // Check for pending duplicate commands
    const pendingCommand = await prisma.deviceCommand.findFirst({
      where: {
        deviceId: input.deviceId,
        command: input.command,
        status: { in: ["QUEUED", "SENT"] },
      },
    });

    if (pendingCommand) {
      throw new Error(`Duplicate: A ${input.command} command is already pending for this device`);
    }

    // Validate FACTORY_RESET requires admin
    if (input.command === "FACTORY_RESET") {
      // This would be enforced at route level via RBAC
    }

    // OTA_UPDATE payload validation
    if (input.command === "OTA_UPDATE") {
      if (!input.payload?.targetVersion) {
        throw new Error("OTA_UPDATE requires targetVersion in payload");
      }
      // Prevent firmware downgrade
      const targetVersion = String(input.payload.targetVersion);
      if (this.compareVersions(targetVersion, device.firmwareVersion) <= 0) {
        throw new Error(`Firmware downgrade not allowed. Current: ${device.firmwareVersion}, Target: ${targetVersion}`);
      }
    }

    const cmd = await prisma.deviceCommand.create({
      data: {
        deviceId: input.deviceId,
        command: input.command,
        payload: input.payload as any,
        status: "QUEUED",
        issuedById: input.issuedById,
      },
      include: {
        device: { select: { deviceCode: true, deviceName: true } },
      },
    });

    await createAuditLog({
      userId: input.issuedById,
      action: "DEVICE_COMMAND",
      entity: "DeviceCommand",
      entityId: cmd.id,
      newValue: { deviceId: input.deviceId, command: input.command },
    });

    return cmd;
  }

  /**
   * Acknowledge or complete a command (called by device or IoT gateway).
   */
  static async acknowledge(ack: CommandAck): Promise<any> {
    const cmd = await prisma.deviceCommand.findUnique({ where: { id: ack.commandId } });
    if (!cmd) throw new Error("Command not found");

    const validTransitions: Record<string, string[]> = {
      QUEUED: ["SENT", "ACKNOWLEDGED", "FAILED"],
      SENT: ["ACKNOWLEDGED", "COMPLETED", "FAILED"],
      ACKNOWLEDGED: ["COMPLETED", "FAILED"],
    };

    if (!validTransitions[cmd.status]?.includes(ack.status)) {
      throw new Error(`Invalid status transition: ${cmd.status} → ${ack.status}`);
    }

    const updateData: any = {
      status: ack.status,
      response: ack.response as any,
    };

    if (ack.status === "ACKNOWLEDGED") updateData.ackedAt = new Date();
    if (ack.status === "COMPLETED" || ack.status === "FAILED") updateData.completedAt = new Date();

    const updated = await prisma.deviceCommand.update({
      where: { id: ack.commandId },
      data: updateData,
    });

    // If OTA_UPDATE completed, update device firmware version
    if (ack.status === "COMPLETED" && cmd.command === "OTA_UPDATE") {
      const payload = cmd.payload as any;
      if (payload?.targetVersion) {
        await prisma.ioTDevice.update({
          where: { id: cmd.deviceId },
          data: { firmwareVersion: payload.targetVersion },
        });

        await prisma.firmwareUpdate.create({
          data: {
            deviceId: cmd.deviceId,
            fromVersion: (ack.response as any)?.previousVersion || "unknown",
            toVersion: payload.targetVersion,
            status: "completed",
            completedAt: new Date(),
            notes: `OTA via command ${cmd.id}`,
          },
        });
      }
    }

    return updated;
  }

  /**
   * Get command history for a device.
   */
  static async getDeviceCommands(deviceId: string, params: {
    status?: string;
    limit?: number;
  }): Promise<any[]> {
    const where: any = { deviceId };
    if (params.status) where.status = params.status;

    return prisma.deviceCommand.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params.limit || 50,
    });
  }

  /**
   * Check for timed-out commands (QUEUED/SENT for too long).
   */
  static async detectTimedOutCommands(timeoutMinutes = 30): Promise<number> {
    const threshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const result = await prisma.deviceCommand.updateMany({
      where: {
        status: { in: ["QUEUED", "SENT"] },
        createdAt: { lt: threshold },
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        response: { error: "Command timed out" } as any,
      },
    });

    return result.count;
  }

  /**
   * Simple semver comparison. Returns >0 if a > b, 0 if equal, <0 if a < b.
   */
  private static compareVersions(a: string, b: string): number {
    const partsA = a.split(".").map(Number);
    const partsB = b.split(".").map(Number);
    const len = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < len; i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;
      if (numA !== numB) return numA - numB;
    }
    return 0;
  }
}
