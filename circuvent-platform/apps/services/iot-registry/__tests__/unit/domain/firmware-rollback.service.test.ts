// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Firmware Rollback Domain Service
// Tests rollback eligibility, fleet rollback planning, auto-rollback logic.
// ══════════════════════════════════════════════════════════════════════════════

import { FirmwareRollbackDomainService } from "../../../src/domain/services/firmware-rollback.service";
import { DeviceEntity } from "../../../src/domain/entities/device.entity";

function createDevice(overrides: Partial<{ id: string; deviceCode: string; firmwareVersion: string; status: string }>): DeviceEntity {
  return new DeviceEntity({
    id: overrides.id || "dev-001",
    name: "Test Device",
    deviceCode: overrides.deviceCode || "DEV-001",
    macAddress: "AA:BB:CC:DD:EE:01",
    firmwareVersion: overrides.firmwareVersion || "2.1.0",
    status: overrides.status || "ONLINE",
  });
}

describe("FirmwareRollbackDomainService", () => {
  let service: FirmwareRollbackDomainService;

  beforeEach(() => {
    service = new FirmwareRollbackDomainService();
  });

  describe("checkRollbackEligibility", () => {
    it("should allow rollback within same major version", () => {
      const device = createDevice({ firmwareVersion: "2.3.0" });
      const result = service.checkRollbackEligibility(device, "2.1.0", ["2.2.0", "2.1.0", "2.0.0"]);
      expect(result.eligible).toBe(true);
      expect(result.risk).toBe("MEDIUM"); // Minor version difference
    });

    it("should reject rollback on decommissioned device", () => {
      const device = createDevice({ firmwareVersion: "2.3.0", status: "DECOMMISSIONED" });
      const result = service.checkRollbackEligibility(device, "2.1.0");
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("decommissioned");
    });

    it("should reject 'rollback' to same version", () => {
      const device = createDevice({ firmwareVersion: "2.1.0" });
      const result = service.checkRollbackEligibility(device, "2.1.0");
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("already on version");
    });

    it("should reject upgrade disguised as rollback", () => {
      const device = createDevice({ firmwareVersion: "2.1.0" });
      const result = service.checkRollbackEligibility(device, "3.0.0");
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("newer");
    });

    it("should reject cross-major rollback", () => {
      const device = createDevice({ firmwareVersion: "3.0.0" });
      const result = service.checkRollbackEligibility(device, "2.9.0");
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("Major version rollback");
    });

    it("should assess LOW risk for patch rollback", () => {
      const device = createDevice({ firmwareVersion: "2.1.3" });
      const result = service.checkRollbackEligibility(device, "2.1.0");
      expect(result.eligible).toBe(true);
      expect(result.risk).toBe("LOW");
    });

    it("should require approval for HIGH risk rollback", () => {
      const device = createDevice({ firmwareVersion: "2.5.0" });
      const result = service.checkRollbackEligibility(device, "2.1.0");
      expect(result.eligible).toBe(true);
      expect(result.risk).toBe("HIGH"); // 4 minor versions back
      expect(result.requiresApproval).toBe(true);
    });
  });

  describe("planFleetRollback", () => {
    it("should create a fleet rollback plan", () => {
      const devices = [
        createDevice({ id: "d1", deviceCode: "DEV-001", firmwareVersion: "2.3.0" }),
        createDevice({ id: "d2", deviceCode: "DEV-002", firmwareVersion: "2.3.0" }),
        createDevice({ id: "d3", deviceCode: "DEV-003", firmwareVersion: "2.3.0" }),
        createDevice({ id: "d4", deviceCode: "DEV-004", firmwareVersion: "2.2.0" }), // Not on problematic version
        createDevice({ id: "d5", deviceCode: "DEV-005", firmwareVersion: "2.3.0", status: "DECOMMISSIONED" }),
      ];

      const plan = service.planFleetRollback(devices, "2.3.0", "2.2.0");

      expect(plan.eligible.length).toBe(3); // d1, d2, d3
      expect(plan.ineligible.length).toBe(1); // d5 decommissioned
      expect(plan.batchSize).toBeGreaterThanOrEqual(1);
      expect(plan.estimatedDurationMinutes).toBeGreaterThan(0);
    });

    it("should calculate 20% batch size", () => {
      const devices = Array.from({ length: 10 }, (_, i) =>
        createDevice({ id: `d${i}`, deviceCode: `DEV-${i}`, firmwareVersion: "2.3.0" })
      );

      const plan = service.planFleetRollback(devices, "2.3.0", "2.2.0");
      expect(plan.batchSize).toBe(2); // 20% of 10

      expect(plan.eligible.length).toBe(10);
    });
  });

  describe("shouldAutoRollback", () => {
    it("should trigger auto-rollback after 3 failures within 30 minutes", () => {
      const result = service.shouldAutoRollback(3, 50, 15);
      expect(result.trigger).toBe(true);
      expect(result.reason).toContain("3 devices failed");
    });

    it("should not trigger for 2 failures", () => {
      const result = service.shouldAutoRollback(2, 50, 15);
      expect(result.trigger).toBe(false);
    });

    it("should trigger on >10% failure rate", () => {
      const result = service.shouldAutoRollback(6, 50, 45); // 12% failure
      expect(result.trigger).toBe(true);
      expect(result.reason).toContain("12.0%");
    });

    it("should not trigger if enough time has passed (>60min)", () => {
      const result = service.shouldAutoRollback(6, 50, 120); // 2 hours later
      expect(result.trigger).toBe(false);
    });

    it("should not trigger on small fleets with <10%", () => {
      const result = service.shouldAutoRollback(1, 20, 15); // 5% failure
      expect(result.trigger).toBe(false);
    });
  });
});
