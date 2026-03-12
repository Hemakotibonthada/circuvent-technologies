// ══════════════════════════════════════════════════════════════════════════════
// IoT Registry — Firmware Rollback Domain Service
// Manages automated and manual firmware rollbacks when OTA updates fail.
// Includes compatibility checks, rollback chain validation, and fleet-wide
// rollback orchestration.
// ══════════════════════════════════════════════════════════════════════════════

import { DeviceEntity } from "../entities/device.entity";
import { FirmwareVersion } from "../value-objects/firmware-version.vo";

/**
 * Result of a rollback eligibility check.
 */
export interface RollbackEligibility {
  /** Whether the rollback is allowed */
  eligible: boolean;
  /** Human-readable reason if not eligible */
  reason?: string;
  /** The target version to roll back to */
  targetVersion: string;
  /** Risk assessment */
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  /** Whether admin approval is required */
  requiresApproval: boolean;
}

/**
 * Result of a fleet-wide rollback assessment.
 */
export interface FleetRollbackPlan {
  /** Devices eligible for rollback */
  eligible: Array<{ deviceId: string; deviceCode: string; currentVersion: string }>;
  /** Devices that cannot be rolled back */
  ineligible: Array<{ deviceId: string; reason: string }>;
  /** Recommended batch size for staged rollout */
  batchSize: number;
  /** Estimated total time in minutes */
  estimatedDurationMinutes: number;
  /** Overall risk level */
  overallRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

/**
 * Domain service for firmware rollback operations.
 *
 * Business Rules:
 * 1. Cannot rollback across major versions without explicit force flag
 * 2. Decommissioned devices are excluded
 * 3. Devices in MAINTENANCE mode get priority rollback
 * 4. Fleet rollbacks are staged (max 20% of fleet per batch)
 * 5. Automatic rollback triggers after 3+ devices fail a new firmware version
 *
 * @example
 * ```ts
 * const service = new FirmwareRollbackService();
 *
 * // Check single device
 * const check = service.checkRollbackEligibility(device, "1.2.0", firmwareHistory);
 *
 * // Plan fleet rollback
 * const plan = service.planFleetRollback(devices, "1.2.0", "1.1.5");
 * ```
 */
export class FirmwareRollbackDomainService {

  /**
   * Checks whether a single device can be rolled back to a target version.
   *
   * @param device The device entity
   * @param targetVersion The version to roll back to
   * @param previousVersions Ordered history of firmware versions (newest first)
   * @returns Rollback eligibility assessment
   */
  checkRollbackEligibility(
    device: DeviceEntity,
    targetVersion: string,
    previousVersions: string[] = [],
  ): RollbackEligibility {
    const current = device.firmwareVersion;
    const target = FirmwareVersion.parse(targetVersion);

    // Rule 1: Device must be active
    if (device.status.isTerminal()) {
      return {
        eligible: false,
        reason: "Device is decommissioned",
        targetVersion,
        risk: "LOW",
        requiresApproval: false,
      };
    }

    // Rule 2: Target must differ from current
    if (current.equals(target)) {
      return {
        eligible: false,
        reason: `Device is already on version ${targetVersion}`,
        targetVersion,
        risk: "LOW",
        requiresApproval: false,
      };
    }

    // Rule 3: Target must be older (this IS a rollback)
    if (target.isNewerThan(current)) {
      return {
        eligible: false,
        reason: `Version ${targetVersion} is newer — use firmware update instead`,
        targetVersion,
        risk: "LOW",
        requiresApproval: false,
      };
    }

    // Rule 4: Check safe rollback (same major)
    const safetyCheck = current.canSafelyRollbackTo(target);
    if (!safetyCheck.safe) {
      return {
        eligible: false,
        reason: safetyCheck.reason,
        targetVersion,
        risk: "CRITICAL",
        requiresApproval: true,
      };
    }

    // Rule 5: Prefer versions from the device's own history
    const wasOnThisVersion = previousVersions.includes(targetVersion);

    // Assess risk
    const distance = current.distanceTo(target);
    let risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
    if (distance.major > 0) risk = "CRITICAL";
    else if (distance.minor > 2) risk = "HIGH";
    else if (distance.minor > 0) risk = "MEDIUM";

    return {
      eligible: true,
      targetVersion,
      risk,
      requiresApproval: risk === "HIGH" || risk === "CRITICAL",
      reason: wasOnThisVersion
        ? `Rolling back to previously installed version ${targetVersion}`
        : `Rolling back to version ${targetVersion} (not previously installed on this device)`,
    };
  }

  /**
   * Creates a fleet-wide rollback plan for devices running a problematic version.
   *
   * @param devices All devices in the fleet
   * @param problematicVersion The version causing issues
   * @param rollbackTarget The version to roll back to
   * @returns A staged rollback plan
   */
  planFleetRollback(
    devices: DeviceEntity[],
    problematicVersion: string,
    rollbackTarget: string,
  ): FleetRollbackPlan {
    const problematic = FirmwareVersion.parse(problematicVersion);
    const target = FirmwareVersion.parse(rollbackTarget);

    const eligible: FleetRollbackPlan["eligible"] = [];
    const ineligible: FleetRollbackPlan["ineligible"] = [];

    for (const device of devices) {
      // Only rollback devices currently on the problematic version
      if (!device.firmwareVersion.equals(problematic)) {
        continue; // Not on the problematic version — skip
      }

      if (device.status.isTerminal()) {
        ineligible.push({ deviceId: device.id, reason: "Decommissioned" });
        continue;
      }

      const safetyCheck = device.firmwareVersion.canSafelyRollbackTo(target);
      if (!safetyCheck.safe) {
        ineligible.push({ deviceId: device.id, reason: safetyCheck.reason || "Unsafe rollback" });
        continue;
      }

      eligible.push({
        deviceId: device.id,
        deviceCode: device.deviceCode,
        currentVersion: device.firmwareVersion.toString(),
      });
    }

    // Batch size: max 20% of eligible devices per wave
    const batchSize = Math.max(1, Math.ceil(eligible.length * 0.2));
    const batches = Math.ceil(eligible.length / batchSize);
    // Estimate 5 minutes per batch (with monitoring gap)
    const estimatedDurationMinutes = batches * 5;

    // Overall risk
    let overallRisk: FleetRollbackPlan["overallRisk"] = "LOW";
    if (eligible.length > 50) overallRisk = "HIGH";
    else if (eligible.length > 20) overallRisk = "MEDIUM";
    if (problematic.isBreakingChange(target)) overallRisk = "CRITICAL";

    return {
      eligible,
      ineligible,
      batchSize,
      estimatedDurationMinutes,
      overallRisk,
    };
  }

  /**
   * Determines if an automatic rollback should be triggered.
   *
   * Business Rule: If 3+ devices fail within 30 minutes of a fleet OTA update,
   * trigger an automatic rollback for all remaining devices.
   *
   * @param failedDeviceCount Number of devices that reported failure
   * @param totalUpdatedCount Total devices that received the update
   * @param minutesSinceRollout Minutes since the OTA rollout started
   * @returns Whether automatic rollback should be triggered
   */
  shouldAutoRollback(
    failedDeviceCount: number,
    totalUpdatedCount: number,
    minutesSinceRollout: number,
  ): { trigger: boolean; reason: string } {
    // Absolute threshold: 3+ failures
    if (failedDeviceCount >= 3 && minutesSinceRollout <= 30) {
      return {
        trigger: true,
        reason: `${failedDeviceCount} devices failed within ${minutesSinceRollout} minutes of rollout`,
      };
    }

    // Percentage threshold: >10% failure rate after reasonable time
    if (totalUpdatedCount > 10) {
      const failureRate = failedDeviceCount / totalUpdatedCount;
      if (failureRate > 0.1 && minutesSinceRollout <= 60) {
        return {
          trigger: true,
          reason: `${(failureRate * 100).toFixed(1)}% failure rate across ${totalUpdatedCount} devices`,
        };
      }
    }

    return { trigger: false, reason: "Failure threshold not reached" };
  }
}
