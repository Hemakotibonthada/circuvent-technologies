// ══════════════════════════════════════════════════════════════════════════════
// IoT Registry — Fleet Health Domain Service
// Aggregates health metrics across the entire device fleet, detects
// systemic issues, and generates fleet-wide health reports.
// ══════════════════════════════════════════════════════════════════════════════

import { DeviceEntity } from "../entities/device.entity";

/**
 * Individual device health status.
 */
export interface DeviceHealthStatus {
  deviceId: string;
  deviceCode: string;
  name: string;
  status: string;
  firmwareVersion: string;
  lastHeartbeat: Date | null;
  isHealthy: boolean;
  minutesSinceHeartbeat: number;
  issues: string[];
}

/**
 * Fleet-wide health summary.
 */
export interface FleetHealthReport {
  /** Total devices in fleet */
  totalDevices: number;
  /** Devices by status */
  statusBreakdown: Record<string, number>;
  /** Percentage of healthy devices (online + recent heartbeat) */
  healthPercentage: number;
  /** Devices with issues */
  unhealthyDevices: DeviceHealthStatus[];
  /** Devices with stale heartbeats */
  staleDevices: DeviceHealthStatus[];
  /** Firmware version distribution */
  firmwareDistribution: Array<{ version: string; count: number; percentage: number }>;
  /** Systemic issues detected */
  systemicIssues: Array<{ issue: string; severity: "WARNING" | "CRITICAL"; affectedCount: number; recommendation: string }>;
  /** Fleet uptime percentage */
  uptimePercentage: number;
  /** Generated at */
  generatedAt: Date;
}

/**
 * Health thresholds configuration.
 */
export interface HealthThresholds {
  /** Minutes without heartbeat before "stale" */
  staleHeartbeatMinutes: number;
  /** Percentage of offline devices that triggers systemic alert */
  offlineAlertThreshold: number;
  /** Percentage of devices on old firmware that triggers update alert */
  firmwareUpdateAlertThreshold: number;
  /** Maximum acceptable devices in MAINTENANCE at once */
  maintenanceCapacityLimit: number;
}

const DEFAULT_THRESHOLDS: HealthThresholds = {
  staleHeartbeatMinutes: 5,
  offlineAlertThreshold: 20, // >20% offline = systemic issue
  firmwareUpdateAlertThreshold: 30, // >30% on old firmware = update needed
  maintenanceCapacityLimit: 5,
};

/**
 * Fleet Health Domain Service.
 *
 * Provides enterprise IoT fleet monitoring at scale:
 * - Real-time health assessment for every device
 * - Systemic issue detection (mass offline, firmware fragmentation)
 * - Stale device identification
 * - Firmware distribution analysis
 * - Fleet uptime metrics
 *
 * @example
 * ```ts
 * const service = new FleetHealthService();
 * const report = service.generateReport(devices);
 * if (report.healthPercentage < 80) {
 *   triggerAlert("Fleet health below 80%!", report.systemicIssues);
 * }
 * ```
 */
export class FleetHealthService {

  /**
   * Generates a comprehensive fleet health report.
   */
  generateReport(
    devices: DeviceEntity[],
    thresholds?: Partial<HealthThresholds>,
  ): FleetHealthReport {
    const cfg = { ...DEFAULT_THRESHOLDS, ...thresholds };
    const now = new Date();

    // Assess each device's health
    const statuses = devices.map(d => this.assessDevice(d, cfg.staleHeartbeatMinutes, now));

    // Status breakdown
    const statusBreakdown: Record<string, number> = {};
    for (const s of statuses) {
      statusBreakdown[s.status] = (statusBreakdown[s.status] || 0) + 1;
    }

    // Health percentage (healthy = online + recent heartbeat)
    const healthyCount = statuses.filter(s => s.isHealthy).length;
    const healthPercentage = devices.length > 0 ? Math.round((healthyCount / devices.length) * 100) : 100;

    // Unhealthy devices
    const unhealthyDevices = statuses.filter(s => !s.isHealthy && s.issues.length > 0);
    const staleDevices = statuses.filter(s => s.minutesSinceHeartbeat > cfg.staleHeartbeatMinutes && s.status !== "DECOMMISSIONED");

    // Firmware distribution
    const fwCounts = new Map<string, number>();
    const activeDevices = devices.filter(d => !d.status.isTerminal());
    for (const d of activeDevices) {
      const v = d.firmwareVersion.toString();
      fwCounts.set(v, (fwCounts.get(v) || 0) + 1);
    }
    const firmwareDistribution = Array.from(fwCounts.entries())
      .map(([version, count]) => ({
        version,
        count,
        percentage: Math.round((count / Math.max(activeDevices.length, 1)) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    // Detect systemic issues
    const systemicIssues = this.detectSystemicIssues(statuses, statusBreakdown, firmwareDistribution, devices.length, cfg);

    // Uptime
    const onlineCount = statusBreakdown["ONLINE"] || 0;
    const totalActive = devices.length - (statusBreakdown["DECOMMISSIONED"] || 0);
    const uptimePercentage = totalActive > 0 ? Math.round((onlineCount / totalActive) * 100) : 100;

    return {
      totalDevices: devices.length,
      statusBreakdown,
      healthPercentage,
      unhealthyDevices: unhealthyDevices.slice(0, 20),
      staleDevices: staleDevices.slice(0, 20),
      firmwareDistribution,
      systemicIssues,
      uptimePercentage,
      generatedAt: now,
    };
  }

  /**
   * Quick health check — returns true if fleet is above threshold.
   */
  isFleetHealthy(devices: DeviceEntity[], minHealthPercentage: number = 80): boolean {
    const report = this.generateReport(devices);
    return report.healthPercentage >= minHealthPercentage;
  }

  /**
   * Returns devices that need immediate attention (circuit breaker pattern).
   * These are devices that can be isolated to prevent cascade failures.
   */
  getDevicesRequiringIsolation(devices: DeviceEntity[]): Array<{
    device: DeviceEntity;
    reason: string;
    action: "RESTART" | "ISOLATE" | "DECOMMISSION";
  }> {
    const results: Array<{ device: DeviceEntity; reason: string; action: "RESTART" | "ISOLATE" | "DECOMMISSION" }> = [];

    for (const device of devices) {
      const issues: string[] = [];

      if (device.status.toString() === "OFFLINE" && device.lastHeartbeat) {
        const minsSince = (Date.now() - device.lastHeartbeat.getTime()) / 60000;
        if (minsSince > 60) {
          issues.push(`Offline for ${Math.round(minsSince)} minutes`);
          results.push({ device, reason: issues.join("; "), action: minsSince > 1440 ? "DECOMMISSION" : "RESTART" });
        }
      }

      // Shadow desync
      if (Object.keys(device.shadow.delta).length > 5) {
        results.push({ device, reason: `${Object.keys(device.shadow.delta).length} shadow properties desynced`, action: "ISOLATE" });
      }
    }

    return results;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private assessDevice(device: DeviceEntity, staleMinutes: number, now: Date): DeviceHealthStatus {
    const issues: string[] = [];
    const minutesSince = device.lastHeartbeat
      ? Math.round((now.getTime() - device.lastHeartbeat.getTime()) / 60000)
      : Infinity;

    const isHealthy = device.isHealthy();

    if (!isHealthy && device.status.toString() !== "DECOMMISSIONED" && device.status.toString() !== "REGISTERED") {
      if (device.status.toString() === "OFFLINE") issues.push("Device is OFFLINE");
      if (minutesSince > staleMinutes) issues.push(`No heartbeat for ${minutesSince} minutes`);
      if (device.status.toString() === "MAINTENANCE") issues.push("In maintenance mode");
      if (Object.keys(device.shadow.delta).length > 0) issues.push("Shadow state desynced");
    }

    return {
      deviceId: device.id,
      deviceCode: device.deviceCode,
      name: device.name,
      status: device.status.toString(),
      firmwareVersion: device.firmwareVersion.toString(),
      lastHeartbeat: device.lastHeartbeat,
      isHealthy,
      minutesSinceHeartbeat: minutesSince,
      issues,
    };
  }

  private detectSystemicIssues(
    statuses: DeviceHealthStatus[],
    breakdown: Record<string, number>,
    fwDist: Array<{ version: string; count: number; percentage: number }>,
    totalDevices: number,
    cfg: HealthThresholds,
  ): FleetHealthReport["systemicIssues"] {
    const issues: FleetHealthReport["systemicIssues"] = [];
    const total = Math.max(totalDevices, 1);

    // Mass offline detection
    const offlineCount = breakdown["OFFLINE"] || 0;
    const offlinePct = (offlineCount / total) * 100;
    if (offlinePct > cfg.offlineAlertThreshold) {
      issues.push({
        issue: `${offlinePct.toFixed(0)}% of fleet is OFFLINE (${offlineCount} devices)`,
        severity: offlinePct > 50 ? "CRITICAL" : "WARNING",
        affectedCount: offlineCount,
        recommendation: "Investigate network connectivity or power supply issues. Check if a firmware update caused mass failures.",
      });
    }

    // Firmware fragmentation
    if (fwDist.length > 3) {
      const oldestVersions = fwDist.slice(1); // Everything except the latest
      const oldCount = oldestVersions.reduce((s, v) => s + v.count, 0);
      const oldPct = (oldCount / total) * 100;
      if (oldPct > cfg.firmwareUpdateAlertThreshold) {
        issues.push({
          issue: `Firmware fragmentation: ${fwDist.length} versions in use, ${oldPct.toFixed(0)}% on older versions`,
          severity: "WARNING",
          affectedCount: oldCount,
          recommendation: `Plan fleet-wide OTA update to latest version (${fwDist[0]?.version}).`,
        });
      }
    }

    // Maintenance overload
    const maintenanceCount = breakdown["MAINTENANCE"] || 0;
    if (maintenanceCount > cfg.maintenanceCapacityLimit) {
      issues.push({
        issue: `${maintenanceCount} devices in MAINTENANCE mode (limit: ${cfg.maintenanceCapacityLimit})`,
        severity: "WARNING",
        affectedCount: maintenanceCount,
        recommendation: "Review maintenance queue — complete or return devices to service.",
      });
    }

    // Heartbeat anomaly (many stale at once)
    const staleCount = statuses.filter(s => s.minutesSinceHeartbeat > 15).length;
    if (staleCount > total * 0.15) {
      issues.push({
        issue: `${staleCount} devices have stale heartbeats (>15 min)`,
        severity: staleCount > total * 0.3 ? "CRITICAL" : "WARNING",
        affectedCount: staleCount,
        recommendation: "Check MQTT broker health and network connectivity.",
      });
    }

    return issues;
  }
}
