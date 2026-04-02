// ══════════════════════════════════════════════════════════════════════════════
// IoT Registry — Device Entity (Domain Core)
// Pure business logic — ZERO external imports. Only depends on value objects
// and domain events. This is the innermost hexagonal ring.
// ══════════════════════════════════════════════════════════════════════════════

import { MacAddress } from "../value-objects/mac-address.vo";
import { FirmwareVersion } from "../value-objects/firmware-version.vo";
import { DeviceStatus, DeviceStatusTransition } from "../value-objects/device-status.vo";

/**
 * IoT Device aggregate root.
 * Encapsulates all device state and enforces business rules.
 *
 * State Machine:
 * ```
 *  REGISTERED → PROVISIONED → ONLINE ⇄ OFFLINE
 *                     ↓                    ↓
 *               MAINTENANCE         DECOMMISSIONED
 * ```
 *
 * @invariant A device must have a unique MAC address
 * @invariant Firmware version follows semver (MAJOR.MINOR.PATCH)
 * @invariant Decommissioned devices cannot receive commands
 */
export class DeviceEntity {
  /** Unique identifier (CUID) */
  public readonly id: string;
  /** Human-readable device name */
  public name: string;
  /** Auto-generated device code (DEV-001) */
  public readonly deviceCode: string;
  /** Validated MAC address */
  public readonly macAddress: MacAddress;
  /** Current firmware version */
  private _firmwareVersion: FirmwareVersion;
  /** Current lifecycle status */
  private _status: DeviceStatus;
  /** Hardware model identifier */
  public hardwareModel: string | null;
  /** Physical or logical location */
  public location: string | null;
  /** IP address (may change) */
  public ipAddress: string | null;
  /** Linked project (nullable) */
  public projectId: string | null;
  /** Last heartbeat timestamp */
  private _lastHeartbeat: Date | null;
  /** Domain events collected during this aggregate's lifecycle */
  private _domainEvents: DomainEventRecord[] = [];
  /** Device shadow — desired vs reported state */
  private _shadow: DeviceShadow;

  constructor(params: {
    id: string;
    name: string;
    deviceCode: string;
    macAddress: string;
    firmwareVersion: string;
    status?: string;
    hardwareModel?: string | null;
    location?: string | null;
    ipAddress?: string | null;
    projectId?: string | null;
    lastHeartbeat?: Date | null;
    shadow?: DeviceShadow;
  }) {
    this.id = params.id;
    this.name = params.name;
    this.deviceCode = params.deviceCode;
    this.macAddress = MacAddress.create(params.macAddress);
    this._firmwareVersion = FirmwareVersion.parse(params.firmwareVersion);
    this._status = DeviceStatus.fromString(params.status || "REGISTERED");
    this.hardwareModel = params.hardwareModel ?? null;
    this.location = params.location ?? null;
    this.ipAddress = params.ipAddress ?? null;
    this.projectId = params.projectId ?? null;
    this._lastHeartbeat = params.lastHeartbeat ?? null;
    this._shadow = params.shadow ?? { desired: {}, reported: {}, delta: {} };
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  get firmwareVersion(): FirmwareVersion { return this._firmwareVersion; }
  get status(): DeviceStatus { return this._status; }
  get lastHeartbeat(): Date | null { return this._lastHeartbeat; }
  get shadow(): DeviceShadow { return this._shadow; }
  get domainEvents(): ReadonlyArray<DomainEventRecord> { return this._domainEvents; }

  // ── Commands (State-Changing Operations) ────────────────────────────────────

  /**
   * Provisions the device — transitions from REGISTERED → PROVISIONED.
   * @throws DomainRuleError if device is not in REGISTERED state
   */
  provision(provisionedBy: string): void {
    this.transitionTo(DeviceStatus.PROVISIONED);
    this.addEvent("DeviceProvisioned", { provisionedBy });
  }

  /**
   * Brings the device online after provisioning.
   * @throws DomainRuleError if device is not PROVISIONED or OFFLINE
   */
  bringOnline(ipAddress: string): void {
    this.transitionTo(DeviceStatus.ONLINE);
    this.ipAddress = ipAddress;
    this._lastHeartbeat = new Date();
    this.addEvent("DeviceCameOnline", { ipAddress });
  }

  /**
   * Marks the device as offline (heartbeat timeout).
   * @throws DomainRuleError if device is not ONLINE
   */
  markOffline(reason: string = "Heartbeat timeout"): void {
    this.transitionTo(DeviceStatus.OFFLINE);
    this.addEvent("DeviceWentOffline", { reason });
  }

  /**
   * Puts the device into maintenance mode.
   * Allowed from ONLINE, OFFLINE, or PROVISIONED states.
   */
  enterMaintenance(reason: string, scheduledBy: string): void {
    this.transitionTo(DeviceStatus.MAINTENANCE);
    this.addEvent("DeviceEnteredMaintenance", { reason, scheduledBy });
  }

  /**
   * Decommissions the device permanently.
   * This is a terminal state — no further transitions allowed.
   */
  decommission(reason: string, decommissionedBy: string): void {
    this.transitionTo(DeviceStatus.DECOMMISSIONED);
    this.addEvent("DeviceDecommissioned", { reason, decommissionedBy });
  }

  /**
   * Records a heartbeat from the device.
   * Automatically transitions OFFLINE → ONLINE if needed.
   */
  recordHeartbeat(ipAddress?: string): void {
    if (this._status.equals(DeviceStatus.DECOMMISSIONED)) {
      throw new Error("Cannot record heartbeat for decommissioned device");
    }

    this._lastHeartbeat = new Date();
    if (ipAddress) this.ipAddress = ipAddress;

    // Auto-transition from OFFLINE → ONLINE
    if (this._status.equals(DeviceStatus.OFFLINE)) {
      this._status = DeviceStatus.ONLINE;
      this.addEvent("DeviceAutoRecovered", { ipAddress });
    }
  }

  /**
   * Initiates a firmware update on this device.
   *
   * @param targetVersion The version to update to
   * @param force Whether to allow downgrades
   * @returns { canUpdate: boolean, reason?: string }
   */
  canUpdateFirmware(targetVersion: string, force: boolean = false): { canUpdate: boolean; reason?: string } {
    if (this._status.equals(DeviceStatus.DECOMMISSIONED)) {
      return { canUpdate: false, reason: "Device is decommissioned" };
    }

    const target = FirmwareVersion.parse(targetVersion);

    if (!force && target.isOlderThan(this._firmwareVersion)) {
      return { canUpdate: false, reason: `Downgrade from ${this._firmwareVersion} to ${target} not allowed without force flag` };
    }

    if (target.equals(this._firmwareVersion)) {
      return { canUpdate: false, reason: `Already on version ${target}` };
    }

    return { canUpdate: true };
  }

  /**
   * Applies a firmware update to this device.
   */
  applyFirmwareUpdate(targetVersion: string): void {
    const oldVersion = this._firmwareVersion.toString();
    this._firmwareVersion = FirmwareVersion.parse(targetVersion);
    this.addEvent("FirmwareUpdated", {
      fromVersion: oldVersion,
      toVersion: targetVersion,
    });
  }

  /**
   * Rolls back firmware to a previous version.
   * Used when an OTA update causes device failures.
   */
  rollbackFirmware(previousVersion: string, reason: string): void {
    const currentVersion = this._firmwareVersion.toString();
    this._firmwareVersion = FirmwareVersion.parse(previousVersion);
    this.addEvent("FirmwareRolledBack", {
      fromVersion: currentVersion,
      toVersion: previousVersion,
      reason,
    });
  }

  /**
   * Updates the device shadow (desired/reported state).
   * Detects deltas between desired and reported for convergence.
   */
  updateShadow(update: { desired?: Record<string, unknown>; reported?: Record<string, unknown> }): void {
    if (update.desired) {
      this._shadow.desired = { ...this._shadow.desired, ...update.desired };
    }
    if (update.reported) {
      this._shadow.reported = { ...this._shadow.reported, ...update.reported };
    }

    // Calculate delta (desired keys not matching reported)
    this._shadow.delta = {};
    for (const [key, desiredValue] of Object.entries(this._shadow.desired)) {
      const reportedValue = this._shadow.reported[key];
      if (JSON.stringify(desiredValue) !== JSON.stringify(reportedValue)) {
        this._shadow.delta[key] = { desired: desiredValue, reported: reportedValue };
      }
    }

    if (Object.keys(this._shadow.delta).length > 0) {
      this.addEvent("ShadowDesync", { delta: this._shadow.delta });
    }
  }

  /**
   * Checks if the device is healthy based on business rules.
   */
  isHealthy(): boolean {
    if (!this._status.equals(DeviceStatus.ONLINE)) return false;
    if (!this._lastHeartbeat) return false;
    const minutesSinceHeartbeat = (Date.now() - this._lastHeartbeat.getTime()) / 60000;
    return minutesSinceHeartbeat < 5; // Healthy if heartbeat within 5 minutes
  }

  /**
   * Clears accumulated domain events (call after persistence).
   */
  clearEvents(): void {
    this._domainEvents = [];
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private transitionTo(target: DeviceStatus): void {
    if (!DeviceStatusTransition.isAllowed(this._status, target)) {
      throw new Error(
        `Invalid device state transition: ${this._status} → ${target}. ` +
        `Allowed transitions: ${DeviceStatusTransition.allowedFrom(this._status).join(", ")}`
      );
    }
    this._status = target;
  }

  private addEvent(type: string, payload: Record<string, unknown>): void {
    this._domainEvents.push({
      type,
      aggregateType: "IoTDevice",
      aggregateId: this.id,
      payload,
      timestamp: new Date().toISOString(),
    });
  }
}

// ── Supporting Types ─────────────────────────────────────────────────────────

/** Lightweight domain event record (no external deps) */
export interface DomainEventRecord {
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

/** Device shadow structure (AWS IoT Shadow pattern) */
export interface DeviceShadow {
  /** State the cloud wants the device to be in */
  desired: Record<string, unknown>;
  /** State the device last reported */
  reported: Record<string, unknown>;
  /** Keys where desired ≠ reported */
  delta: Record<string, unknown>;
}
