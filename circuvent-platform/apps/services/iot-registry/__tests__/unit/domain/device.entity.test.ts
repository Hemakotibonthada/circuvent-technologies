// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — IoT Device Entity (Domain Core)
// Tests state machine transitions, firmware operations, shadow sync.
// ══════════════════════════════════════════════════════════════════════════════

import { DeviceEntity } from "../../../src/domain/entities/device.entity";

function createDevice(overrides?: Record<string, any>) {
  return new DeviceEntity({
    id: "dev-001",
    name: "Temperature Sensor Alpha",
    deviceCode: "DEV-001",
    macAddress: "AA:BB:CC:DD:EE:FF",
    firmwareVersion: "2.1.0",
    status: "REGISTERED",
    hardwareModel: "ESP32-WROOM",
    ...overrides,
  } as any);
}

describe("DeviceEntity", () => {
  describe("Creation", () => {
    it("should create a device with valid properties", () => {
      const device = createDevice();
      expect(device.id).toBe("dev-001");
      expect(device.name).toBe("Temperature Sensor Alpha");
      expect(device.macAddress.toString()).toBe("AA:BB:CC:DD:EE:FF");
      expect(device.firmwareVersion.toString()).toBe("2.1.0");
      expect(device.status.toString()).toBe("REGISTERED");
    });

    it("should reject invalid MAC address", () => {
      expect(() => createDevice({ macAddress: "invalid" } as any)).toThrow("Invalid MAC address");
    });

    it("should reject invalid firmware version", () => {
      expect(() => createDevice({ firmwareVersion: "bad" } as any)).toThrow("Invalid firmware version");
    });
  });

  describe("State Machine", () => {
    it("should allow REGISTERED → PROVISIONED", () => {
      const device = createDevice();
      device.provision("admin-001");
      expect(device.status.toString()).toBe("PROVISIONED");
    });

    it("should allow PROVISIONED → ONLINE", () => {
      const device = createDevice({ status: "PROVISIONED" } as any);
      device.bringOnline("192.168.1.100");
      expect(device.status.toString()).toBe("ONLINE");
      expect(device.ipAddress).toBe("192.168.1.100");
    });

    it("should allow ONLINE → OFFLINE", () => {
      const device = createDevice({ status: "ONLINE" } as any);
      device.markOffline("Heartbeat timeout");
      expect(device.status.toString()).toBe("OFFLINE");
    });

    it("should NOT allow REGISTERED → ONLINE (must provision first)", () => {
      const device = createDevice();
      expect(() => device.bringOnline("192.168.1.1")).toThrow("Invalid device state transition");
    });

    it("should NOT allow commands on DECOMMISSIONED device", () => {
      const device = createDevice({ status: "DECOMMISSIONED" } as any);
      expect(() => device.recordHeartbeat()).toThrow("Cannot record heartbeat");
    });

    it("should produce domain events on state changes", () => {
      const device = createDevice();
      device.provision("admin-001");
      expect(device.domainEvents.length).toBe(1);
      expect(device.domainEvents[0].type).toBe("DeviceProvisioned");
    });
  });

  describe("Firmware Operations", () => {
    it("should allow firmware update to newer version", () => {
      const device = createDevice({ status: "ONLINE" } as any);
      const check = device.canUpdateFirmware("3.0.0");
      expect(check.canUpdate).toBe(true);
    });

    it("should prevent downgrade without force flag", () => {
      const device = createDevice({ firmwareVersion: "2.1.0", status: "ONLINE" } as any);
      const check = device.canUpdateFirmware("1.0.0");
      expect(check.canUpdate).toBe(false);
      expect(check.reason).toContain("Downgrade");
    });

    it("should allow forced downgrade", () => {
      const device = createDevice({ firmwareVersion: "2.1.0", status: "ONLINE" } as any);
      const check = device.canUpdateFirmware("1.0.0", true);
      expect(check.canUpdate).toBe(true);
    });

    it("should prevent update to same version", () => {
      const device = createDevice({ firmwareVersion: "2.1.0" } as any);
      const check = device.canUpdateFirmware("2.1.0");
      expect(check.canUpdate).toBe(false);
    });

    it("should apply firmware update", () => {
      const device = createDevice({ firmwareVersion: "2.1.0" } as any);
      device.applyFirmwareUpdate("2.2.0");
      expect(device.firmwareVersion.toString()).toBe("2.2.0");
    });

    it("should rollback firmware with event", () => {
      const device = createDevice({ firmwareVersion: "2.2.0" } as any);
      device.rollbackFirmware("2.1.0", "CRC failure");
      expect(device.firmwareVersion.toString()).toBe("2.1.0");
      expect(device.domainEvents.some((e: any) => e.type === "FirmwareRolledBack")).toBe(true);
    });
  });

  describe("Heartbeat & Health", () => {
    it("should record heartbeat", () => {
      const device = createDevice({ status: "ONLINE" } as any);
      device.recordHeartbeat("192.168.1.50");
      expect(device.lastHeartbeat).not.toBeNull();
      expect(device.ipAddress).toBe("192.168.1.50");
    });

    it("should auto-recover OFFLINE device on heartbeat", () => {
      const device = createDevice({ status: "OFFLINE" } as any);
      device.recordHeartbeat();
      expect(device.status.toString()).toBe("ONLINE");
      expect(device.domainEvents.some((e: any) => e.type === "DeviceAutoRecovered")).toBe(true);
    });

    it("should report unhealthy if no heartbeat", () => {
      const device = createDevice({ status: "ONLINE" } as any);
      expect(device.isHealthy()).toBe(false); // No heartbeat recorded yet
    });

    it("should report healthy after fresh heartbeat", () => {
      const device = createDevice({ status: "ONLINE" } as any);
      device.recordHeartbeat();
      expect(device.isHealthy()).toBe(true);
    });
  });

  describe("Device Shadow", () => {
    it("should update desired state", () => {
      const device = createDevice();
      device.updateShadow({ desired: { ledEnabled: true, samplingRate: 1000 } });
      expect(device.shadow.desired).toEqual({ ledEnabled: true, samplingRate: 1000 });
    });

    it("should detect delta between desired and reported", () => {
      const device = createDevice();
      device.updateShadow({ desired: { ledEnabled: true }, reported: { ledEnabled: false } });
      expect(Object.keys(device.shadow.delta).length).toBe(1);
      expect(device.domainEvents.some((e: any) => e.type === "ShadowDesync")).toBe(true);
    });

    it("should have empty delta when desired matches reported", () => {
      const device = createDevice();
      device.updateShadow({ desired: { mode: "auto" }, reported: { mode: "auto" } });
      expect(Object.keys(device.shadow.delta).length).toBe(0);
    });
  });

  describe("Event Management", () => {
    it("should accumulate events and allow clearing", () => {
      const device = createDevice();
      device.provision("admin");
      expect(device.domainEvents.length).toBe(1);
      device.clearEvents();
      expect(device.domainEvents.length).toBe(0);
    });
  });
});
