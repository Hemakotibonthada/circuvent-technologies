// ══════════════════════════════════════════════════════════════════════════════
// IoT Registry — Rollback Firmware Use Case
// Orchestrates firmware rollback for a single device or fleet.
// ══════════════════════════════════════════════════════════════════════════════

import { DeviceRepositoryPort } from "../ports/device.repository.port";
import { FirmwareRollbackDomainService, RollbackEligibility, FleetRollbackPlan } from "../../domain/services/firmware-rollback.service";

export interface RollbackSingleInput {
  deviceId: string;
  targetVersion: string;
  reason: string;
  forceMajorRollback?: boolean;
  performedBy: string;
}

export interface RollbackFleetInput {
  problematicVersion: string;
  rollbackTarget: string;
  reason: string;
  performedBy: string;
}

/**
 * Use Case: Firmware Rollback
 *
 * Handles:
 * - Single device rollback with eligibility checks
 * - Fleet-wide rollback planning with staged execution
 * - Auto-rollback trigger evaluation
 */
export class RollbackFirmwareUseCase {
  private readonly rollbackService: FirmwareRollbackDomainService;

  constructor(private readonly deviceRepo: DeviceRepositoryPort) {
    this.rollbackService = new FirmwareRollbackDomainService();
  }

  /**
   * Checks if a single device is eligible for rollback.
   */
  async checkEligibility(deviceId: string, targetVersion: string): Promise<RollbackEligibility> {
    const device = await this.deviceRepo.findById(deviceId);
    if (!device) {
      return { eligible: false, reason: "Device not found", targetVersion, risk: "LOW", requiresApproval: false };
    }
    return this.rollbackService.checkRollbackEligibility(device, targetVersion);
  }

  /**
   * Executes a firmware rollback on a single device.
   */
  async rollbackSingle(input: RollbackSingleInput): Promise<{
    success: boolean;
    deviceCode: string;
    previousVersion: string;
    newVersion: string;
    message: string;
  }> {
    const device = await this.deviceRepo.findById(input.deviceId);
    if (!device) throw new Error(`Device '${input.deviceId}' not found`);

    const eligibility = this.rollbackService.checkRollbackEligibility(device, input.targetVersion);
    if (!eligibility.eligible && !input.forceMajorRollback) {
      throw new Error(`Rollback not allowed: ${eligibility.reason}`);
    }

    const previousVersion = device.firmwareVersion.toString();

    // Apply rollback through domain entity
    device.rollbackFirmware(input.targetVersion, input.reason);

    // Persist
    await this.deviceRepo.update(device);

    return {
      success: true,
      deviceCode: device.deviceCode,
      previousVersion,
      newVersion: device.firmwareVersion.toString(),
      message: `Rolled back ${device.deviceCode} from ${previousVersion} to ${input.targetVersion}`,
    };
  }

  /**
   * Plans a fleet-wide rollback (does not execute).
   */
  async planFleetRollback(input: RollbackFleetInput): Promise<FleetRollbackPlan> {
    const affectedDevices = await this.deviceRepo.findByFirmwareVersion(input.problematicVersion);
    return this.rollbackService.planFleetRollback(affectedDevices, input.problematicVersion, input.rollbackTarget);
  }

  /**
   * Determines if auto-rollback should trigger.
   */
  shouldAutoRollback(failedCount: number, totalUpdated: number, minutesSinceRollout: number): {
    trigger: boolean;
    reason: string;
  } {
    return this.rollbackService.shouldAutoRollback(failedCount, totalUpdated, minutesSinceRollout);
  }
}
