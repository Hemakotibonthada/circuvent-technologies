// Firmware & Changelog Hub — a static, versioned reference of the latest
// known firmware per device type (mirrors firmware/<device>/*.ino version
// history) so users can see at a glance whether their device is behind, and
// what changed. Purely informational + a live comparison against each
// device's own `fw_version` field (already returned by control-plane.ts).

export interface FirmwareInfo {
  deviceType: string;
  latestVersion: string;
  changelog: { version: string; notes: string[] }[];
}

export const FIRMWARE_CATALOG: FirmwareInfo[] = [
  { deviceType: "smart-plug", latestVersion: "2.1.0", changelog: [{ version: "2.1.0", notes: ["Improved energy accuracy", "Faster reconnect after Wi-Fi drop"] }, { version: "2.0.0", notes: ["Captive portal provisioning"] }] },
  { deviceType: "smart-switch", latestVersion: "2.0.2", changelog: [{ version: "2.0.2", notes: ["Fixed boot-state restore edge case"] }] },
  { deviceType: "smart-light", latestVersion: "1.8.0", changelog: [{ version: "1.8.0", notes: ["Smoother PWM dimming curve"] }] },
  { deviceType: "smart-fan", latestVersion: "1.4.0", changelog: [{ version: "1.4.0", notes: ["Added preset speed profiles"] }] },
  { deviceType: "curtain", latestVersion: "1.3.1", changelog: [{ version: "1.3.1", notes: ["Improved stop-position accuracy"] }] },
  { deviceType: "smart-lock", latestVersion: "1.6.0", changelog: [{ version: "1.6.0", notes: ["Auto-lock timer configurable from app"] }] },
  { deviceType: "motion-sensor", latestVersion: "1.5.0", changelog: [{ version: "1.5.0", notes: ["Reduced false triggers in low light"] }] },
  { deviceType: "camera", latestVersion: "1.0.0", changelog: [{ version: "1.0.0", notes: ["Live JPEG streaming over MQTT", "On-board motion detection without extra hardware", "Dimmable illuminator and 180° rotation"] }] },
  { deviceType: "energy-monitor", latestVersion: "1.7.0", changelog: [{ version: "1.7.0", notes: ["Higher sample rate for spikes"] }] },
  { deviceType: "aquaguard", latestVersion: "2.2.0", changelog: [{ version: "2.2.0", notes: ["Improved dry-run detection", "Dual-tank coordination fixes"] }] },
  { deviceType: "home-hub", latestVersion: "2.4.0", changelog: [{ version: "2.4.0", notes: ["Scene scheduling reliability improvements"] }] },
  { deviceType: "guardian", latestVersion: "1.9.0", changelog: [{ version: "1.9.0", notes: ["Faster GPS fix on cold start"] }] },
  { deviceType: "agri-starter", latestVersion: "1.2.0", changelog: [{ version: "1.2.0", notes: ["SMS command retry logic"] }] },
];

export function getFirmwareInfo(deviceType: string): FirmwareInfo | undefined {
  return FIRMWARE_CATALOG.find((f) => f.deviceType === deviceType);
}

/** True when a device's reported fw_version is older than the catalog's latest (string compare on dotted versions). */
export function isBehind(current: string | undefined, latest: string): boolean {
  if (!current) return true;
  const a = current.split(".").map(Number);
  const b = latest.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
