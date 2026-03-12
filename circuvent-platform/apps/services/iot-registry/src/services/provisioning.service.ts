// ──────────────────────────────────────────────────────────────
// IoT Registry — Device Provisioning Service
// Handles the full device lifecycle from registration through
// provisioning to deployment. Manages provisioning tokens,
// configuration push, and fleet onboarding.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";
import crypto from "crypto";

const prisma = new PrismaClient();

export interface ProvisioningRequest {
  deviceName: string;
  macAddress: string;
  hardwareModel: string;
  firmwareVersion: string;
  projectId?: string;
  location?: string;
  configTemplate?: string;
  registeredById: string;
}

export interface ProvisioningResult {
  deviceId: string;
  deviceCode: string;
  provisioningToken: string;
  configPayload: Record<string, unknown>;
  status: string;
}

export interface BulkProvisioningRequest {
  devices: Omit<ProvisioningRequest, "registeredById">[];
  projectId?: string;
  registeredById: string;
}

const CONFIG_TEMPLATES: Record<string, Record<string, unknown>> = {
  sensor_hub: {
    heartbeatIntervalMs: 30000,
    telemetryIntervalMs: 60000,
    logLevel: "INFO",
    otaEnabled: true,
    watchdogTimeoutMs: 120000,
    wifiRetryCount: 5,
    deepSleepEnabled: false,
    sensorReadIntervalMs: 5000,
  },
  gateway: {
    heartbeatIntervalMs: 15000,
    telemetryIntervalMs: 30000,
    logLevel: "WARN",
    otaEnabled: true,
    maxConnectedDevices: 50,
    meshNetworkEnabled: true,
    dataAggregationWindowMs: 10000,
    uplinkProtocol: "MQTT",
  },
  actuator: {
    heartbeatIntervalMs: 30000,
    telemetryIntervalMs: 120000,
    logLevel: "INFO",
    otaEnabled: true,
    safeMode: true,
    maxCurrentDraw: 5.0,
    failsafePosition: "OFF",
    commandTimeout: 10000,
  },
  camera: {
    heartbeatIntervalMs: 30000,
    streamResolution: "720p",
    fps: 15,
    motionDetectionEnabled: true,
    storageLocal: true,
    cloudUploadEnabled: false,
    nightVisionEnabled: true,
    recordOnMotion: true,
  },
  default: {
    heartbeatIntervalMs: 30000,
    telemetryIntervalMs: 60000,
    logLevel: "INFO",
    otaEnabled: true,
  },
};

export class DeviceProvisioningService {
  /**
   * Provision a single device — register, configure, and prepare.
   */
  static async provision(request: ProvisioningRequest): Promise<ProvisioningResult> {
    // Generate device code
    const count = await prisma.ioTDevice.count();
    const deviceCode = `DEV-${String(count + 1).padStart(3, "0")}`;

    // Generate provisioning token
    const provisioningToken = crypto.randomBytes(32).toString("hex");

    // Get config template
    const configTemplate = request.configTemplate || "default";
    const configPayload = {
      ...(CONFIG_TEMPLATES[configTemplate] || CONFIG_TEMPLATES.default),
      deviceCode,
      provisioningToken,
      serverUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
      wsUrl: process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3000/ws",
      registeredAt: new Date().toISOString(),
    };

    // Create device
    const device = await prisma.ioTDevice.create({
      data: {
        deviceName: request.deviceName,
        deviceCode,
        macAddress: request.macAddress.toUpperCase().replace(/-/g, ":"),
        hardwareModel: request.hardwareModel,
        firmwareVersion: request.firmwareVersion,
        projectId: request.projectId || null,
        location: request.location || null,
        registeredById: request.registeredById,
        status: "PROVISIONED",
        metadata: {
          provisioningToken: provisioningToken.slice(0, 8) + "...",
          configTemplate,
          provisionedAt: new Date().toISOString(),
        } as any,
      },
    });

    await createAuditLog({
      userId: request.registeredById,
      action: "DEVICE_REGISTER",
      entity: "IoTDevice",
      entityId: device.id,
      newValue: { deviceCode, macAddress: request.macAddress, configTemplate },
    });

    return {
      deviceId: device.id,
      deviceCode,
      provisioningToken,
      configPayload,
      status: "PROVISIONED",
    };
  }

  /**
   * Bulk provision multiple devices.
   */
  static async bulkProvision(request: BulkProvisioningRequest): Promise<{
    provisioned: ProvisioningResult[];
    errors: { deviceName: string; error: string }[];
  }> {
    const results: ProvisioningResult[] = [];
    const errors: { deviceName: string; error: string }[] = [];

    for (const device of request.devices) {
      try {
        const result = await this.provision({
          ...device,
          projectId: device.projectId || request.projectId,
          registeredById: request.registeredById,
        });
        results.push(result);
      } catch (error: any) {
        errors.push({ deviceName: device.deviceName, error: error.message });
      }
    }

    return { provisioned: results, errors };
  }

  /**
   * Activate a provisioned device (device calls this after first boot).
   */
  static async activate(deviceId: string, provisioningData: {
    firmwareVersion: string;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
  }): Promise<any> {
    const device = await prisma.ioTDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error("Device not found");
    if (device.status !== "PROVISIONED" && device.status !== "REGISTERED") {
      throw new Error(`Device cannot be activated from ${device.status} state`);
    }

    const updated = await prisma.ioTDevice.update({
      where: { id: deviceId },
      data: {
        status: "ONLINE",
        firmwareVersion: provisioningData.firmwareVersion,
        ipAddress: provisioningData.ipAddress,
        lastHeartbeat: new Date(),
        metadata: {
          ...(device.metadata as any || {}),
          activatedAt: new Date().toISOString(),
          ...(provisioningData.metadata || {}),
        } as any,
      },
    });

    return updated;
  }

  /**
   * Get available config templates.
   */
  static getConfigTemplates(): { name: string; description: string; config: Record<string, unknown> }[] {
    return [
      { name: "sensor_hub", description: "IoT sensor hub with frequent readings", config: CONFIG_TEMPLATES.sensor_hub },
      { name: "gateway", description: "Edge gateway with mesh networking", config: CONFIG_TEMPLATES.gateway },
      { name: "actuator", description: "Control actuator with safety features", config: CONFIG_TEMPLATES.actuator },
      { name: "camera", description: "Smart camera with motion detection", config: CONFIG_TEMPLATES.camera },
      { name: "default", description: "Default minimal configuration", config: CONFIG_TEMPLATES.default },
    ];
  }

  /**
   * Get provisioning status for a batch.
   */
  static async getProvisioningStatus(deviceIds: string[]): Promise<{
    total: number;
    provisioned: number;
    activated: number;
    pending: number;
    devices: { id: string; code: string; name: string; status: string }[];
  }> {
    const devices = await prisma.ioTDevice.findMany({
      where: { id: { in: deviceIds } },
      select: { id: true, deviceCode: true, deviceName: true, status: true },
    });

    return {
      total: devices.length,
      provisioned: devices.filter((d) => d.status === "PROVISIONED").length,
      activated: devices.filter((d) => d.status === "ONLINE").length,
      pending: devices.filter((d) => d.status === "REGISTERED").length,
      devices: devices.map((d) => ({ id: d.id, code: d.deviceCode, name: d.deviceName, status: d.status })),
    };
  }

  /**
   * Decommission a device permanently.
   */
  static async decommission(deviceId: string, reason: string, userId: string): Promise<any> {
    const device = await prisma.ioTDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new Error("Device not found");
    if (device.status === "DECOMMISSIONED") throw new Error("Already decommissioned");

    const updated = await prisma.ioTDevice.update({
      where: { id: deviceId },
      data: {
        status: "DECOMMISSIONED",
        metadata: {
          ...(device.metadata as any || {}),
          decommissionedAt: new Date().toISOString(),
          decommissionedBy: userId,
          decommissionReason: reason,
        } as any,
      },
    });

    // Resolve all active alerts
    await prisma.deviceAlert.updateMany({
      where: { deviceId, isResolved: false },
      data: { isResolved: true, resolvedAt: new Date(), resolvedBy: "SYSTEM_DECOMMISSION" },
    });

    await createAuditLog({
      userId,
      action: "DELETE",
      entity: "IoTDevice",
      entityId: deviceId,
      newValue: { status: "DECOMMISSIONED", reason },
    });

    return updated;
  }
}
