import type { Device, AppEvent, Automation, Scene } from "../../../api";
import { createStore, severityOf, type Severity } from "../../../enterprise";
import type { IconName } from "../../../icons";

export type ArmMode = "disarmed" | "home" | "away" | "night";
export type IncidentStatus = "open" | "acknowledged" | "resolved";

export interface ArmIntent {
  mode: ArmMode;
  reason: string;
  changedAt: string;
  acknowledgedBy: string[];
  failedBy: { id: string; name: string; error: string }[];
}

export interface SecurityConfig {
  arm: ArmIntent;
  bypassedZones: Record<string, boolean>;
  exitDelaySec: number;
  entryDelaySec: number;
}

export interface IncidentNote {
  id: string;
  at: string;
  text: string;
}

export interface IncidentTransition {
  at: string;
  from: IncidentStatus | "created";
  to: IncidentStatus;
  note?: string;
}

export interface Incident {
  id: string;
  title: string;
  severity: Exclude<Severity, "success">;
  status: IncidentStatus;
  notes: IncidentNote[];
  linkedEventIds: number[];
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  transitions: IncidentTransition[];
  sceneRuns: { sceneId: number; sceneName: string; at: string; success: boolean; sent?: number; error?: string }[];
}

export interface IncidentStoreShape {
  incidents: Incident[];
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  arm: { mode: "disarmed", reason: "Initial local configuration", changedAt: new Date(0).toISOString(), acknowledgedBy: [], failedBy: [] },
  bypassedZones: {},
  exitDelaySec: 30,
  entryDelaySec: 15,
};

export const securityConfigStore = createStore<SecurityConfig>("security-config-v1", DEFAULT_SECURITY_CONFIG);
export const incidentStore = createStore<IncidentStoreShape>("security-incidents-v1", { incidents: [] });

export type ZoneKind = "motion" | "contact" | "lock" | "tamper" | "siren" | "raw";
export type ZoneStatus = "active" | "clear" | "locked" | "unlocked" | "tampered" | "unknown";

export interface SecurityZone {
  id: string;
  deviceId: string;
  deviceName: string;
  room?: string;
  kind: ZoneKind;
  label: string;
  field: string;
  value: unknown;
  status: ZoneStatus;
  online: boolean;
  lastChanged?: string | null;
  icon: IconName;
}

const FIELD_MAP: Record<string, Partial<Record<ZoneKind, string[]>>> = {
  guardian: {
    motion: ["motion", "pir", "motionDetected", "occupancy"],
    contact: ["door", "doorOpen", "contact", "window", "windowOpen"],
    tamper: ["tamper", "tampered", "coverOpen"],
    siren: ["siren", "alarm", "alarmActive"],
  },
  facedoor: {
    contact: ["door", "doorOpen", "contact"],
    lock: ["lock", "locked", "lockState", "unlocked"],
    tamper: ["tamper", "tampered"],
  },
  camera: {
    motion: ["motion", "motionDetected", "personDetected"],
    tamper: ["tamper", "tampered"],
  },
  touchboard: { contact: ["door", "doorOpen"], tamper: ["tamper"] },
};

const GENERIC_FIELDS: Partial<Record<ZoneKind, string[]>> = {
  motion: ["motion", "pir", "motionDetected", "occupancy"],
  contact: ["contact", "door", "doorOpen", "window", "windowOpen"],
  lock: ["lock", "locked", "lockState", "unlocked"],
  tamper: ["tamper", "tampered", "coverOpen"],
  siren: ["siren", "alarm", "alarmActive"],
};

function hasOwn(state: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(state, key);
}

function boolish(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === "string") {
    const s = v.toLowerCase();
    if (["true", "active", "open", "unlocked", "motion", "detected", "on", "alarm", "tampered", "yes", "1"].includes(s)) return true;
    if (["false", "clear", "closed", "locked", "idle", "off", "ok", "no", "0"].includes(s)) return false;
  }
  return null;
}

function statusFor(kind: ZoneKind, value: unknown): ZoneStatus {
  const b = boolish(value);
  if (kind === "lock") {
    if (typeof value === "string") {
      const s = value.toLowerCase();
      if (s.includes("unlock")) return "unlocked";
      if (s.includes("lock")) return "locked";
    }
    return b === true ? "locked" : b === false ? "unlocked" : "unknown";
  }
  if (kind === "tamper") return b === true ? "tampered" : b === false ? "clear" : "unknown";
  if (kind === "motion" || kind === "contact" || kind === "siren") return b === true ? "active" : b === false ? "clear" : "unknown";
  return "unknown";
}

export function zoneIcon(kind: ZoneKind, status?: ZoneStatus): IconName {
  if (kind === "motion") return "motion";
  if (kind === "contact") return status === "active" ? "doorOpen" : "windowClosed";
  if (kind === "lock") return status === "unlocked" ? "unlock" : "lock";
  if (kind === "tamper") return "warning";
  if (kind === "siren") return "siren";
  return "sensors";
}

export function zoneSeverity(zone: SecurityZone, bypassed?: boolean): Severity {
  if (bypassed) return "info";
  if (!zone.online) return "warning";
  if (zone.status === "tampered" || (zone.kind === "siren" && zone.status === "active")) return "critical";
  if (zone.status === "active" || zone.status === "unlocked") return "warning";
  if (zone.status === "unknown") return "info";
  return "success";
}

export function zoneStatusLabel(zone: SecurityZone): string {
  if (!zone.online) return "Offline";
  if (zone.status === "active") return zone.kind === "contact" ? "Open" : "Active";
  if (zone.status === "clear") return "Clear";
  if (zone.status === "locked") return "Locked";
  if (zone.status === "unlocked") return "Unlocked";
  if (zone.status === "tampered") return "Tampered";
  return "Unknown";
}

export function securityFieldKeys(device: Device): string[] {
  const state = (device.state ?? {}) as Record<string, unknown>;
  const configured = FIELD_MAP[String(device.type || "").toLowerCase()] ?? {};
  const keys = new Set<string>();
  for (const list of Object.values(configured)) for (const k of list ?? []) if (hasOwn(state, k)) keys.add(k);
  for (const list of Object.values(GENERIC_FIELDS)) for (const k of list ?? []) if (hasOwn(state, k)) keys.add(k);
  return [...keys];
}

export function isSecurityCapable(device: Device): boolean {
  const type = String(device.type || "").toLowerCase();
  return type === "guardian" || type === "facedoor" || securityFieldKeys(device).length > 0 || hasOwn(device.state ?? {}, "armed") || hasOwn(device.state ?? {}, "alarmMode");
}

export function isAlarmCapable(device: Device): boolean {
  const type = String(device.type || "").toLowerCase();
  const s = device.state ?? {};
  return type === "guardian" || hasOwn(s, "siren") || hasOwn(s, "alarm") || hasOwn(s, "alarmActive");
}

export function deriveZones(devices: Device[]): SecurityZone[] {
  const zones: SecurityZone[] = [];
  for (const device of devices) {
    const state = (device.state ?? {}) as Record<string, unknown>;
    const typed = FIELD_MAP[String(device.type || "").toLowerCase()] ?? {};
    const seen = new Set<string>();
    const add = (kind: ZoneKind, field: string) => {
      if (!hasOwn(state, field) || seen.has(field)) return;
      seen.add(field);
      const status = statusFor(kind, state[field]);
      zones.push({
        id: `${device.id}:${field}`,
        deviceId: device.id,
        deviceName: device.name,
        room: device.room,
        kind,
        label: labelFor(device, field, kind),
        field,
        value: state[field],
        status,
        online: device.online,
        lastChanged: device.last_seen,
        icon: zoneIcon(kind, status),
      });
    };
    for (const kind of ["motion", "contact", "lock", "tamper", "siren"] as ZoneKind[]) {
      for (const field of typed[kind] ?? []) add(kind, field);
      for (const field of GENERIC_FIELDS[kind] ?? []) add(kind, field);
    }
    if (!seen.size && isSecurityCapable(device)) {
      for (const [field, value] of Object.entries(state).slice(0, 8)) {
        zones.push({ id: `${device.id}:${field}`, deviceId: device.id, deviceName: device.name, room: device.room, kind: "raw", label: labelFor(device, field, "raw"), field, value, status: "unknown", online: device.online, lastChanged: device.last_seen, icon: "sensors" });
      }
    }
  }
  return zones.sort((a, b) => `${a.room ?? ""}${a.deviceName}${a.field}`.localeCompare(`${b.room ?? ""}${b.deviceName}${b.field}`));
}

function labelFor(device: Device, field: string, kind: ZoneKind): string {
  const nice = field.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (m) => m.toUpperCase());
  const prefix = device.room ? `${device.room} · ${device.name}` : device.name;
  return kind === "raw" ? `${prefix} · ${nice}` : `${prefix} · ${nice}`;
}

export function streamUrl(device: Device): string | null {
  const s = device.state ?? {};
  for (const key of ["stream", "rtsp", "url", "streamUrl", "hls", "webrtc"]) {
    const v = s[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function isCameraLike(device: Device): boolean {
  const type = String(device.type || "").toLowerCase();
  return type === "camera" || type === "facedoor" || streamUrl(device) != null;
}

export function commandSupport(device: Device, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(device.state ?? {}, field);
}

export function eventDeviceName(event: AppEvent, devices: Device[]): string {
  if (!event.device_id) return "Control plane";
  return devices.find((d) => d.id === event.device_id)?.name ?? event.device_id;
}

const ACCESS_WORDS = ["unlock", "lock", "door", "face", "rfid", "keypad", "gate", "access", "pass", "visitor", "fingerprint"];
export function isAccessEvent(e: AppEvent): boolean {
  const hay = `${e.kind} ${e.title} ${e.body}`.toLowerCase();
  return ACCESS_WORDS.some((w) => hay.includes(w));
}

const SECURITY_WORDS = ["security", "alarm", "intrusion", "motion", "tamper", "door", "window", "lock", "unlock", "siren", "access", "guardian", "camera", "face", "rfid", "keypad", "gate"];
export function isSecurityAutomation(a: Automation, devices: Device[]): boolean {
  const secIds = new Set(devices.filter(isSecurityCapable).map((d) => d.id));
  const triggerDevice = a.trigger.deviceId ? secIds.has(a.trigger.deviceId) : false;
  const actionDevice = a.action.deviceId ? secIds.has(a.action.deviceId) : false;
  const notify = a.action.type === "notify";
  const text = `${a.name} ${a.trigger.field ?? ""} ${a.action.title ?? ""} ${a.action.body ?? ""}`.toLowerCase();
  return triggerDevice || actionDevice || notify || SECURITY_WORDS.some((w) => text.includes(w));
}

export function automationDeviceNames(a: Automation, devices: Device[]): string {
  const ids = [a.trigger.deviceId, a.action.deviceId].filter(Boolean) as string[];
  const names = ids.map((id) => devices.find((d) => d.id === id)?.name ?? id);
  return [...new Set(names)].join(", ") || "No device";
}

export function eventSeverity(e: AppEvent): Severity {
  return severityOf(e.kind);
}

export function sceneLooksLikeResponse(scene: Scene): boolean {
  const text = `${scene.name} ${scene.icon}`.toLowerCase();
  return ["security", "alarm", "panic", "sos", "light", "lock", "sir", "response"].some((w) => text.includes(w));
}
