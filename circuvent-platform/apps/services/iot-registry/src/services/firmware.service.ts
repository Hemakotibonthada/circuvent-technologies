// ──────────────────────────────────────────────────────────────
// IoT Registry — Firmware Management Service
// Manages firmware versioning, OTA update scheduling,
// rollback tracking, and fleet-wide firmware analytics.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

export interface FirmwareUpdateRequest {
  deviceId: string;
  targetVersion: string;
  notes?: string;
  forceUpdate?: boolean;
  rollbackVersion?: string;
  issuedById: string;
}

export interface FirmwareRollout {
  targetVersion: string;
  deviceIds: string[];
  notes?: string;
  issuedById: string;
}

export class FirmwareService {
  /**
   * Initiate firmware update for a single device with validation.
   */
  static async updateSingle(request: FirmwareUpdateRequest): Promise<any> {
    const device = await prisma.ioTDevice.findUnique({ where: { id: request.deviceId } });
    if (!device) throw new Error("Device not found");
    if (device.status === "DECOMMISSIONED") throw new Error("Cannot update decommissioned device");

    // Version comparison
    if (!request.forceUpdate && this.compareVersions(request.targetVersion, device.firmwareVersion) <= 0) {
      throw new Error(
        `Firmware downgrade not allowed. Current: ${device.firmwareVersion}, Target: ${request.targetVersion}. Use forceUpdate=true to override.`
      );
    }

    // Check for pending updates
    const pendingUpdate = await prisma.firmwareUpdate.findFirst({
      where: { deviceId: request.deviceId, status: { in: ["pending", "in_progress"] } },
    });
    if (pendingUpdate) {
      throw new Error(`Device has a pending firmware update (${pendingUpdate.toVersion}). Wait for completion or cancel it.`);
    }

    // Create firmware update record
    const update = await prisma.firmwareUpdate.create({
      data: {
        deviceId: request.deviceId,
        fromVersion: device.firmwareVersion,
        toVersion: request.targetVersion,
        status: "pending",
        notes: request.notes,
      },
    });

    // Send OTA command via device command system
    await prisma.deviceCommand.create({
      data: {
        deviceId: request.deviceId,
        command: "OTA_UPDATE",
        payload: {
          targetVersion: request.targetVersion,
          rollbackVersion: request.rollbackVersion || device.firmwareVersion,
          forceUpdate: request.forceUpdate || false,
        } as any,
        status: "QUEUED",
        issuedById: request.issuedById,
      },
    });

    await createAuditLog({
      userId: request.issuedById,
      action: "FIRMWARE_UPDATE",
      entity: "FirmwareUpdate",
      entityId: update.id,
      newValue: { deviceId: request.deviceId, from: device.firmwareVersion, to: request.targetVersion },
    });

    return update;
  }

  /**
   * Fleet-wide firmware rollout to multiple devices.
   */
  static async rollout(request: FirmwareRollout): Promise<{
    initiated: number;
    skipped: { deviceId: string; reason: string }[];
    errors: { deviceId: string; error: string }[];
  }> {
    const results = { initiated: 0, skipped: [] as any[], errors: [] as any[] };

    for (const deviceId of request.deviceIds) {
      try {
        const device = await prisma.ioTDevice.findUnique({ where: { id: deviceId } });
        if (!device) { results.skipped.push({ deviceId, reason: "Device not found" }); continue; }
        if (device.status === "DECOMMISSIONED") { results.skipped.push({ deviceId, reason: "Decommissioned" }); continue; }
        if (device.firmwareVersion === request.targetVersion) { results.skipped.push({ deviceId, reason: "Already on target version" }); continue; }

        await this.updateSingle({
          deviceId,
          targetVersion: request.targetVersion,
          notes: request.notes || `Fleet rollout to ${request.targetVersion}`,
          issuedById: request.issuedById,
        });
        results.initiated++;
      } catch (error: any) {
        results.errors.push({ deviceId, error: error.message });
      }
    }

    await createAuditLog({
      userId: request.issuedById,
      action: "FIRMWARE_UPDATE",
      entity: "IoTDevice",
      metadata: { action: "FLEET_ROLLOUT", targetVersion: request.targetVersion, initiated: results.initiated, total: request.deviceIds.length },
    });

    return results;
  }

  /**
   * Complete a firmware update (called when device reports success).
   */
  static async completeUpdate(updateId: string, success: boolean, errorMessage?: string): Promise<any> {
    const update = await prisma.firmwareUpdate.findUnique({ where: { id: updateId } });
    if (!update) throw new Error("Firmware update not found");

    const updated = await prisma.firmwareUpdate.update({
      where: { id: updateId },
      data: {
        status: success ? "completed" : "failed",
        completedAt: new Date(),
        notes: errorMessage ? `${update.notes || ""}\nError: ${errorMessage}`.trim() : update.notes,
      },
    });

    // Update device firmware version on success
    if (success) {
      await prisma.ioTDevice.update({
        where: { id: update.deviceId },
        data: { firmwareVersion: update.toVersion },
      });
    }

    return updated;
  }

  /**
   * Get firmware distribution across the fleet.
   */
  static async getFirmwareDistribution(): Promise<{
    versions: { version: string; count: number; percentage: number }[];
    totalDevices: number;
    latestVersion: string;
    devicesOnLatest: number;
    devicesNeedingUpdate: number;
  }> {
    const distribution = await prisma.ioTDevice.groupBy({
      by: ["firmwareVersion"],
      where: { status: { not: "DECOMMISSIONED" } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    const totalDevices = distribution.reduce((sum, d) => sum + d._count.id, 0);

    const versions = distribution.map((d) => ({
      version: d.firmwareVersion,
      count: d._count.id,
      percentage: totalDevices > 0 ? Math.round((d._count.id / totalDevices) * 100) : 0,
    }));

    // Find latest version
    const sortedVersions = versions.map((v) => v.version).sort((a, b) => this.compareVersions(b, a));
    const latestVersion = sortedVersions[0] || "0.0.0";
    const devicesOnLatest = versions.find((v) => v.version === latestVersion)?.count || 0;

    return {
      versions,
      totalDevices,
      latestVersion,
      devicesOnLatest,
      devicesNeedingUpdate: totalDevices - devicesOnLatest,
    };
  }

  /**
   * Get firmware update history for a device.
   */
  static async getDeviceHistory(deviceId: string): Promise<any[]> {
    return prisma.firmwareUpdate.findMany({
      where: { deviceId },
      orderBy: { initiatedAt: "desc" },
      take: 50,
    });
  }

  /**
   * Get pending firmware updates across the fleet.
   */
  static async getPendingUpdates(): Promise<any[]> {
    return prisma.firmwareUpdate.findMany({
      where: { status: { in: ["pending", "in_progress"] } },
      include: { device: { select: { deviceCode: true, deviceName: true, status: true } } },
      orderBy: { initiatedAt: "asc" },
    });
  }

  /**
   * Cancel a pending firmware update.
   */
  static async cancelUpdate(updateId: string, userId: string): Promise<any> {
    const update = await prisma.firmwareUpdate.findUnique({ where: { id: updateId } });
    if (!update) throw new Error("Firmware update not found");
    if (update.status !== "pending") throw new Error("Only pending updates can be cancelled");

    const cancelled = await prisma.firmwareUpdate.update({
      where: { id: updateId },
      data: { status: "failed", completedAt: new Date(), notes: `${update.notes || ""}\nCancelled by user`.trim() },
    });

    // Cancel associated device command
    await prisma.deviceCommand.updateMany({
      where: { deviceId: update.deviceId, command: "OTA_UPDATE", status: "QUEUED" },
      data: { status: "FAILED", completedAt: new Date(), response: { cancelled: true } as any },
    });

    await createAuditLog({ userId, action: "UPDATE", entity: "FirmwareUpdate", entityId: updateId, newValue: { status: "cancelled" } });
    return cancelled;
  }

  private static compareVersions(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
  }
}
