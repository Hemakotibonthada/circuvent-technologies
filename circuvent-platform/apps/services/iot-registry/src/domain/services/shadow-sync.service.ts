// ══════════════════════════════════════════════════════════════════════════════
// IoT Registry — Shadow Sync Domain Service
// AWS IoT Shadow–inspired desired/reported state synchronization.
// Maintains convergence between cloud-desired state and device-reported state.
// ══════════════════════════════════════════════════════════════════════════════

import { DeviceEntity, DeviceShadow } from "../entities/device.entity";

/**
 * Shadow update command to send to a device.
 */
export interface ShadowCommand {
  deviceId: string;
  deviceCode: string;
  properties: Record<string, unknown>;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  retryCount: number;
  maxRetries: number;
  sentAt: Date;
  timeoutMs: number;
}

/**
 * Shadow convergence assessment.
 */
export interface ConvergenceReport {
  totalDevices: number;
  convergedDevices: number;
  convergenceRate: number;
  /** Devices with delta (desired != reported) */
  divergentDevices: Array<{
    deviceId: string;
    deviceCode: string;
    deltaProperties: string[];
    deltaCount: number;
    lastReportedAt: Date | null;
    retryCount: number;
  }>;
  /** Properties most commonly desynced */
  commonDeltas: Array<{ property: string; deviceCount: number }>;
}

/**
 * Shadow Sync Domain Service.
 *
 * The Shadow pattern allows the cloud to set a "desired" state for a device,
 * and the device reports its "reported" state. When they differ, the delta
 * triggers a command to the device to converge.
 *
 * Business Rules:
 * 1. Desired state can be set at any time, even if device is offline
 * 2. When device comes online, it receives pending desired state
 * 3. After 3 failed convergence attempts, escalate to manual intervention
 * 4. Critical properties (e.g., firmware, sampling_rate) have higher retry priority
 * 5. Shadow updates are idempotent
 *
 * @example
 * ```ts
 * const service = new ShadowSyncService();
 *
 * // Set desired state
 * service.setDesiredState(device, {
 *   samplingRateMs: 1000,
 *   ledEnabled: true,
 *   reportingMode: "CONTINUOUS",
 * });
 *
 * // Check if device has converged
 * const delta = service.getDelta(device);
 * if (delta.length > 0) {
 *   const commands = service.generateCommands([device]);
 *   // Send commands via MQTT
 * }
 * ```
 */
export class ShadowSyncService {

  /** Critical properties that get higher retry priority */
  private static readonly CRITICAL_PROPERTIES = new Set([
    "firmwareVersion", "samplingRateMs", "reportingMode",
    "sleepMode", "encryptionKey", "otaEnabled",
  ]);

  /**
   * Sets the desired state for a device.
   * Merges with existing desired state (doesn't replace).
   */
  setDesiredState(device: DeviceEntity, desired: Record<string, unknown>): {
    applied: boolean;
    deltaCreated: boolean;
    deltaCount: number;
  } {
    if (device.status.isTerminal()) {
      return { applied: false, deltaCreated: false, deltaCount: 0 };
    }

    device.updateShadow({ desired });

    const deltaCount = Object.keys(device.shadow.delta).length;
    return {
      applied: true,
      deltaCreated: deltaCount > 0,
      deltaCount,
    };
  }

  /**
   * Processes a device's reported state update.
   * Typically called when a device sends a state report via MQTT.
   */
  processReportedState(device: DeviceEntity, reported: Record<string, unknown>): {
    fullyConverged: boolean;
    remainingDelta: string[];
    newlyConverged: string[];
  } {
    const previousDelta = { ...device.shadow.delta };
    device.updateShadow({ reported });

    const currentDelta = device.shadow.delta;
    const remainingDelta = Object.keys(currentDelta);

    // Determine which properties just converged
    const newlyConverged = Object.keys(previousDelta).filter(k => !currentDelta[k]);

    return {
      fullyConverged: remainingDelta.length === 0,
      remainingDelta,
      newlyConverged,
    };
  }

  /**
   * Returns the delta (desired - reported) for a device.
   */
  getDelta(device: DeviceEntity): Array<{
    property: string;
    desired: unknown;
    reported: unknown;
    isCritical: boolean;
  }> {
    return Object.entries(device.shadow.delta).map(([prop, values]) => {
      const v = values as { desired: unknown; reported: unknown };
      return {
        property: prop,
        desired: v.desired,
        reported: v.reported,
        isCritical: ShadowSyncService.CRITICAL_PROPERTIES.has(prop),
      };
    });
  }

  /**
   * Generates convergence commands for devices with deltas.
   * Commands are prioritized: critical properties first, then by delta size.
   */
  generateCommands(
    devices: DeviceEntity[],
    maxRetriesPerDevice: number = 3,
  ): ShadowCommand[] {
    const commands: ShadowCommand[] = [];

    for (const device of devices) {
      if (device.status.isTerminal()) continue;
      if (!device.status.canReceiveCommands()) continue;

      const delta = this.getDelta(device);
      if (delta.length === 0) continue;

      const properties: Record<string, unknown> = {};
      let hasCritical = false;

      for (const d of delta) {
        properties[d.property] = d.desired;
        if (d.isCritical) hasCritical = true;
      }

      commands.push({
        deviceId: device.id,
        deviceCode: device.deviceCode,
        properties,
        priority: hasCritical ? "HIGH" : delta.length > 3 ? "NORMAL" : "LOW",
        retryCount: 0,
        maxRetries: maxRetriesPerDevice,
        sentAt: new Date(),
        timeoutMs: hasCritical ? 30000 : 60000,
      });
    }

    // Sort by priority
    const priorityOrder = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    commands.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return commands;
  }

  /**
   * Generates a convergence report for the entire fleet.
   */
  generateConvergenceReport(devices: DeviceEntity[]): ConvergenceReport {
    const activeDevices = devices.filter(d => !d.status.isTerminal());
    const converged = activeDevices.filter(d => Object.keys(d.shadow.delta).length === 0);

    const divergentDevices = activeDevices
      .filter(d => Object.keys(d.shadow.delta).length > 0)
      .map(d => ({
        deviceId: d.id,
        deviceCode: d.deviceCode,
        deltaProperties: Object.keys(d.shadow.delta),
        deltaCount: Object.keys(d.shadow.delta).length,
        lastReportedAt: d.lastHeartbeat,
        retryCount: 0,
      }));

    // Common deltas
    const propertyCounts = new Map<string, number>();
    for (const d of divergentDevices) {
      for (const prop of d.deltaProperties) {
        propertyCounts.set(prop, (propertyCounts.get(prop) || 0) + 1);
      }
    }
    const commonDeltas = Array.from(propertyCounts.entries())
      .map(([property, deviceCount]) => ({ property, deviceCount }))
      .sort((a, b) => b.deviceCount - a.deviceCount);

    return {
      totalDevices: activeDevices.length,
      convergedDevices: converged.length,
      convergenceRate: activeDevices.length > 0
        ? Math.round((converged.length / activeDevices.length) * 100)
        : 100,
      divergentDevices,
      commonDeltas,
    };
  }

  /**
   * Clears all shadow state for a device (factory reset scenario).
   */
  resetShadow(device: DeviceEntity): void {
    device.updateShadow({ desired: {}, reported: {} });
  }
}
