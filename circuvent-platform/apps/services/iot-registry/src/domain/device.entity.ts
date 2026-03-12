// ──────────────────────────────────────────────────────────────
// IoT Registry — Device Domain Entity
// Encapsulates device lifecycle, health evaluation, firmware
// version management, and decommission rules.
// ──────────────────────────────────────────────────────────────

export type DeviceStatus = "REGISTERED" | "PROVISIONED" | "ONLINE" | "OFFLINE" | "MAINTENANCE" | "DECOMMISSIONED";

const DEVICE_STATUS_TRANSITIONS: Record<DeviceStatus, DeviceStatus[]> = {
  REGISTERED: ["PROVISIONED", "DECOMMISSIONED"],
  PROVISIONED: ["ONLINE", "MAINTENANCE", "DECOMMISSIONED"],
  ONLINE: ["OFFLINE", "MAINTENANCE", "DECOMMISSIONED"],
  OFFLINE: ["ONLINE", "MAINTENANCE", "DECOMMISSIONED"],
  MAINTENANCE: ["ONLINE", "OFFLINE", "DECOMMISSIONED"],
  DECOMMISSIONED: [],
};

export interface DeviceProps {
  id: string;
  deviceCode: string;
  deviceName: string;
  macAddress: string;
  firmwareVersion: string;
  status: DeviceStatus;
  lastHeartbeat: Date | null;
  location: string | null;
  projectId: string | null;
}

export class DeviceEntity {
  constructor(private props: DeviceProps) {}

  get id() { return this.props.id; }
  get deviceCode() { return this.props.deviceCode; }
  get status() { return this.props.status; }
  get firmwareVersion() { return this.props.firmwareVersion; }

  canTransitionTo(newStatus: DeviceStatus): boolean {
    return DEVICE_STATUS_TRANSITIONS[this.props.status].includes(newStatus);
  }

  isOnline(): boolean {
    return this.props.status === "ONLINE";
  }

  isDecommissioned(): boolean {
    return this.props.status === "DECOMMISSIONED";
  }

  getSecondsSinceLastHeartbeat(): number | null {
    if (!this.props.lastHeartbeat) return null;
    return Math.floor((Date.now() - this.props.lastHeartbeat.getTime()) / 1000);
  }

  isHeartbeatStale(thresholdSeconds = 120): boolean {
    const seconds = this.getSecondsSinceLastHeartbeat();
    if (seconds === null) return true;
    return seconds > thresholdSeconds;
  }

  canReceiveCommand(): boolean {
    return !this.isDecommissioned() && (this.props.status === "ONLINE" || this.props.status === "OFFLINE");
  }

  canUpdateFirmware(targetVersion: string): { allowed: boolean; reason?: string } {
    if (this.isDecommissioned()) {
      return { allowed: false, reason: "Device is decommissioned" };
    }
    if (this.props.status === "MAINTENANCE") {
      return { allowed: false, reason: "Device is under maintenance" };
    }
    if (this.compareVersions(targetVersion, this.props.firmwareVersion) <= 0) {
      return { allowed: false, reason: `Firmware downgrade not allowed. Current: ${this.props.firmwareVersion}, Target: ${targetVersion}` };
    }
    return { allowed: true };
  }

  getHealthStatus(): { status: "healthy" | "warning" | "critical" | "unknown"; reason: string } {
    if (this.isDecommissioned()) return { status: "unknown", reason: "Decommissioned" };
    if (!this.props.lastHeartbeat) return { status: "unknown", reason: "No heartbeat received" };

    const staleSec = this.getSecondsSinceLastHeartbeat()!;
    if (staleSec > 300) return { status: "critical", reason: `No heartbeat for ${Math.floor(staleSec / 60)} minutes` };
    if (staleSec > 120) return { status: "warning", reason: `Heartbeat delayed: ${staleSec}s ago` };
    return { status: "healthy", reason: "Normal operation" };
  }

  private compareVersions(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
  }
}

// ── Telemetry Value Object ──

export interface TelemetryReading {
  deviceId: string;
  timestamp: Date;
  payload: Record<string, unknown>;
  logLevel: "INFO" | "WARN" | "ERROR" | "CRITICAL";
}

export class TelemetryBatch {
  constructor(private readings: TelemetryReading[]) {}

  get size() { return this.readings.length; }

  getByLevel(level: string): TelemetryReading[] {
    return this.readings.filter((r) => r.logLevel === level);
  }

  getCriticalCount(): number {
    return this.readings.filter((r) => r.logLevel === "CRITICAL" || r.logLevel === "ERROR").length;
  }

  getUniqueDevices(): string[] {
    return [...new Set(this.readings.map((r) => r.deviceId))];
  }

  validate(): { valid: TelemetryReading[]; invalid: { reading: TelemetryReading; reason: string }[] } {
    const valid: TelemetryReading[] = [];
    const invalid: { reading: TelemetryReading; reason: string }[] = [];

    for (const r of this.readings) {
      if (!r.deviceId) { invalid.push({ reading: r, reason: "Missing deviceId" }); continue; }
      if (!r.payload || typeof r.payload !== "object") { invalid.push({ reading: r, reason: "Invalid payload" }); continue; }
      if (r.timestamp && new Date(r.timestamp).getTime() > Date.now() + 60000) {
        invalid.push({ reading: r, reason: "Timestamp in the future" }); continue;
      }
      valid.push(r);
    }

    return { valid, invalid };
  }
}
