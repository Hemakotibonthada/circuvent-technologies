// ══════════════════════════════════════════════════════════════════════════════
// IoT Registry — Device Status Value Object
// Lifecycle states + allowed state transitions (state machine).
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Device lifecycle status enumeration with state machine transitions.
 *
 * ```
 *  REGISTERED → PROVISIONED → ONLINE ⇄ OFFLINE
 *       ↓            ↓          ↓         ↓
 *       └─── MAINTENANCE ←──────┘         │
 *                ↓                        │
 *            (back to ONLINE)             │
 *                                         ↓
 *                              DECOMMISSIONED (terminal)
 * ```
 */
export class DeviceStatus {
  private constructor(private readonly value: string) {}

  static readonly REGISTERED = new DeviceStatus("REGISTERED");
  static readonly PROVISIONED = new DeviceStatus("PROVISIONED");
  static readonly ONLINE = new DeviceStatus("ONLINE");
  static readonly OFFLINE = new DeviceStatus("OFFLINE");
  static readonly MAINTENANCE = new DeviceStatus("MAINTENANCE");
  static readonly DECOMMISSIONED = new DeviceStatus("DECOMMISSIONED");

  /** All valid statuses */
  static readonly ALL = [
    DeviceStatus.REGISTERED,
    DeviceStatus.PROVISIONED,
    DeviceStatus.ONLINE,
    DeviceStatus.OFFLINE,
    DeviceStatus.MAINTENANCE,
    DeviceStatus.DECOMMISSIONED,
  ];

  static fromString(value: string): DeviceStatus {
    const found = DeviceStatus.ALL.find(s => s.value === value);
    if (!found) throw new Error(`Invalid device status: '${value}'`);
    return found;
  }

  /** Whether the device can receive commands in this state */
  canReceiveCommands(): boolean {
    return this.equals(DeviceStatus.ONLINE) || this.equals(DeviceStatus.MAINTENANCE);
  }

  /** Whether the device is in a terminal (non-recoverable) state */
  isTerminal(): boolean {
    return this.equals(DeviceStatus.DECOMMISSIONED);
  }

  /** Whether the device is considered "active" (not decommissioned) */
  isActive(): boolean {
    return !this.isTerminal();
  }

  equals(other: DeviceStatus): boolean {
    return this.value === other.value;
  }

  toString(): string { return this.value; }
  toJSON(): string { return this.value; }
}

/**
 * State transition rules for the Device lifecycle.
 * Defines which transitions are allowed.
 */
export class DeviceStatusTransition {
  /** Adjacency map: from → [allowed targets] */
  private static readonly TRANSITIONS = new Map<string, string[]>([
    ["REGISTERED", ["PROVISIONED", "DECOMMISSIONED"]],
    ["PROVISIONED", ["ONLINE", "MAINTENANCE", "DECOMMISSIONED"]],
    ["ONLINE", ["OFFLINE", "MAINTENANCE", "DECOMMISSIONED"]],
    ["OFFLINE", ["ONLINE", "MAINTENANCE", "DECOMMISSIONED"]],
    ["MAINTENANCE", ["ONLINE", "OFFLINE", "DECOMMISSIONED"]],
    ["DECOMMISSIONED", []], // Terminal — no exits
  ]);

  /** Checks if a transition from `from` to `to` is allowed. */
  static isAllowed(from: DeviceStatus, to: DeviceStatus): boolean {
    const allowed = this.TRANSITIONS.get(from.toString()) || [];
    return allowed.includes(to.toString());
  }

  /** Returns allowed target states from the given state. */
  static allowedFrom(from: DeviceStatus): string[] {
    return this.TRANSITIONS.get(from.toString()) || [];
  }
}
