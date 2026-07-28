// Device Diagnostics — pure scoring helpers + configurable thresholds for a
// fleet-wide health view (distinct from the existing single-device detail
// page at /smarthome/device/[id]). No device data is stored here; it always
// operates on live data from control-plane.ts.

const KEY = "cv-console-diagnostics-thresholds";

export interface DiagnosticsThresholds {
  weakSignalDbm: number; // rssi at or below this is considered weak
  staleMinutes: number; // last_seen older than this (while marked online) is considered stale
}

function defaults(): DiagnosticsThresholds {
  return { weakSignalDbm: -75, staleMinutes: 15 };
}

export function getThresholds(): DiagnosticsThresholds {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...defaults(), ...(JSON.parse(raw) as Partial<DiagnosticsThresholds>) } : defaults();
  } catch {
    return defaults();
  }
}

export function saveThresholds(thresholds: DiagnosticsThresholds): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(thresholds));
  } catch {
    /* ignore */
  }
}

export interface DiagnosableDevice {
  online: boolean;
  last_seen?: string | null;
  state: Record<string, unknown>;
}

export type HealthLevel = "good" | "warning" | "critical";

export interface HealthResult {
  level: HealthLevel;
  score: number; // 0-100
  reasons: string[];
}

/** Scores a device's health from its online flag, RSSI and last-seen recency. */
export function healthScore(device: DiagnosableDevice, thresholds: DiagnosticsThresholds): HealthResult {
  const reasons: string[] = [];
  let score = 100;

  if (!device.online) {
    reasons.push("Offline");
    score -= 60;
  }

  const rssi = Number(device.state?.rssi);
  if (!Number.isNaN(rssi) && rssi !== 0 && rssi <= thresholds.weakSignalDbm) {
    reasons.push(`Weak signal (${rssi} dBm)`);
    score -= 20;
  }

  if (device.online && device.last_seen) {
    const minutesAgo = (Date.now() - new Date(device.last_seen).getTime()) / 60_000;
    if (minutesAgo > thresholds.staleMinutes) {
      reasons.push(`No update in ${Math.round(minutesAgo)} min`);
      score -= 20;
    }
  }

  score = Math.max(0, Math.min(100, score));
  const level: HealthLevel = score >= 80 ? "good" : score >= 50 ? "warning" : "critical";
  return { level, score, reasons };
}
