// ──────────────────────────────────────────────────────────────
// IoT Registry — Service Layer (business logic)
// ──────────────────────────────────────────────────────────────

import { PrismaClient, Prisma } from "@circuvent/database";
import { generateCode, DEVICE_CODE_PREFIX } from "@circuvent/shared";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

export class DeviceService {
  static async list(params: {
    page: number; limit: number; sortBy: string; sortOrder: "asc" | "desc";
    search?: string; status?: string; projectId?: string;
  }) {
    const where: Prisma.IoTDeviceWhereInput = {};
    if (params.search) {
      where.OR = [
        { deviceName: { contains: params.search, mode: "insensitive" } },
        { deviceCode: { contains: params.search, mode: "insensitive" } },
        { macAddress: { contains: params.search, mode: "insensitive" } },
        { location: { contains: params.search, mode: "insensitive" } },
      ];
    }
    if (params.status) where.status = params.status as any;
    if (params.projectId) where.projectId = params.projectId;

    const [data, total] = await Promise.all([
      prisma.ioTDevice.findMany({
        where,
        orderBy: { [params.sortBy]: params.sortOrder },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: {
          project: { select: { id: true, name: true, code: true } },
          registeredBy: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { firmwareHistory: true, telemetryLogs: true } },
        },
      }),
      prisma.ioTDevice.count({ where }),
    ]);
    return { data, total };
  }

  static async getById(id: string) {
    return prisma.ioTDevice.findUnique({
      where: { id },
      include: {
        project: true,
        registeredBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        firmwareHistory: { orderBy: { initiatedAt: "desc" }, take: 20 },
        telemetryLogs: { orderBy: { timestamp: "desc" }, take: 50 },
      },
    });
  }

  static async register(data: any, userId: string) {
    const count = await prisma.ioTDevice.count();
    const deviceCode = generateCode(DEVICE_CODE_PREFIX, count + 1);

    const device = await prisma.ioTDevice.create({
      data: { ...data, deviceCode, registeredById: userId },
      include: {
        project: { select: { id: true, name: true } },
        registeredBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await createAuditLog({ userId, action: "CREATE", entity: "IoTDevice", entityId: device.id, newValue: { deviceName: data.deviceName, macAddress: data.macAddress, deviceCode } });
    return device;
  }

  static async update(id: string, data: any, userId: string) {
    const device = await prisma.ioTDevice.update({
      where: { id },
      data: { ...data, lastHeartbeat: data.status === "ONLINE" ? new Date() : undefined },
    });
    await createAuditLog({ userId, action: "UPDATE", entity: "IoTDevice", entityId: id, newValue: data });
    return device;
  }

  static async updateFirmware(deviceId: string, toVersion: string, notes: string | undefined, userId: string) {
    const device = await prisma.ioTDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error("Device not found");

    const update = await prisma.firmwareUpdate.create({
      data: { deviceId, fromVersion: device.firmwareVersion, toVersion, notes, status: "completed", completedAt: new Date() },
    });

    await prisma.ioTDevice.update({ where: { id: deviceId }, data: { firmwareVersion: toVersion } });
    await createAuditLog({ userId, action: "UPDATE", entity: "FirmwareUpdate", entityId: update.id, newValue: { from: device.firmwareVersion, to: toVersion } });
    return update;
  }

  static async getDashboard() {
    const [total, online, offline, maintenance, registered, decommissioned, recentDevices, recentAlerts] = await Promise.all([
      prisma.ioTDevice.count(),
      prisma.ioTDevice.count({ where: { status: "ONLINE" } }),
      prisma.ioTDevice.count({ where: { status: "OFFLINE" } }),
      prisma.ioTDevice.count({ where: { status: "MAINTENANCE" } }),
      prisma.ioTDevice.count({ where: { status: "REGISTERED" } }),
      prisma.ioTDevice.count({ where: { status: "DECOMMISSIONED" } }),
      prisma.ioTDevice.findMany({
        orderBy: { createdAt: "desc" }, take: 5,
        include: { project: { select: { name: true } } },
      }),
      prisma.telemetryLog.findMany({
        where: { logLevel: { in: ["ERROR", "CRITICAL"] } },
        orderBy: { timestamp: "desc" }, take: 10,
        include: { device: { select: { deviceName: true, deviceCode: true } } },
      }),
    ]);

    return {
      total, online, offline, maintenance, registered, decommissioned,
      onlinePercentage: total > 0 ? Math.round((online / total) * 100) : 0,
      recentDevices, recentAlerts,
    };
  }

  static async delete(id: string, userId: string) {
    await prisma.ioTDevice.delete({ where: { id } });
    await createAuditLog({ userId, action: "DELETE", entity: "IoTDevice", entityId: id });
  }
}

export class TelemetryService {
  static async ingest(deviceId: string, payload: any, logLevel: string) {
    const log = await prisma.telemetryLog.create({
      data: { deviceId, payload, logLevel },
    });
    await prisma.ioTDevice.update({
      where: { id: deviceId },
      data: { lastHeartbeat: new Date(), status: "ONLINE" },
    });
    return log;
  }

  static async batchIngest(entries: { deviceId: string; payload: any; logLevel: string }[]) {
    const results = await prisma.telemetryLog.createMany({ data: entries });
    // Update heartbeats for unique devices
    const uniqueDeviceIds = [...new Set(entries.map((e) => e.deviceId))];
    await Promise.all(
      uniqueDeviceIds.map((id) =>
        prisma.ioTDevice.update({ where: { id }, data: { lastHeartbeat: new Date(), status: "ONLINE" } })
      )
    );
    return { inserted: results.count };
  }

  static async query(deviceId: string, params: {
    startDate?: string; endDate?: string; logLevel?: string; limit?: number;
  }) {
    const where: Prisma.TelemetryLogWhereInput = { deviceId };
    if (params.logLevel) where.logLevel = params.logLevel;
    if (params.startDate || params.endDate) {
      where.timestamp = {};
      if (params.startDate) (where.timestamp as any).gte = new Date(params.startDate);
      if (params.endDate) (where.timestamp as any).lte = new Date(params.endDate);
    }

    return prisma.telemetryLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: Math.min(params.limit || 100, 1000),
    });
  }
}
