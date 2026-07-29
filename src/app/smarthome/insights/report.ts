"use client";

/**
 * Report computation helpers — all arithmetic is over real hook data.
 * Nothing here is fabricated or synthesised.
 */

import type { AppEvent, Device, Automation, Scene } from "@/lib/control-plane";
import type { Severity } from "../_kit/primitives";
import { eventSeverity } from "../_data/hooks";

export type ReportPeriod = "24h" | "7d" | "30d";

export const PERIOD_LABELS: Record<ReportPeriod, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

export const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

export function periodStart(period: ReportPeriod): number {
  const now = Date.now();
  if (period === "24h") return now - 86_400_000;
  if (period === "7d") return now - 7 * 86_400_000;
  return now - 30 * 86_400_000;
}

/* ------------------------------------------------------------------ */
/* Fleet                                                               */
/* ------------------------------------------------------------------ */

export interface TypeStat {
  type: string;
  count: number;
  online: number;
}

export interface RoomStat {
  room: string;
  count: number;
  online: number;
}

export interface FleetSummary {
  total: number;
  online: number;
  offline: number;
  onlinePct: number;
  types: TypeStat[];
  rooms: RoomStat[];
}

export function computeFleetSummary(devices: Device[]): FleetSummary {
  const typeMap = new Map<string, TypeStat>();
  const roomMap = new Map<string, RoomStat>();
  let online = 0;

  for (const d of devices) {
    if (d.online) online++;

    const type = d.type || "(unknown)";
    const existing = typeMap.get(type) ?? { type, count: 0, online: 0 };
    existing.count++;
    if (d.online) existing.online++;
    typeMap.set(type, existing);

    const room = d.room || "(unassigned)";
    const existingRoom = roomMap.get(room) ?? { room, count: 0, online: 0 };
    existingRoom.count++;
    if (d.online) existingRoom.online++;
    roomMap.set(room, existingRoom);
  }

  const total = devices.length;
  return {
    total,
    online,
    offline: total - online,
    onlinePct: total > 0 ? (online / total) * 100 : 0,
    types: Array.from(typeMap.values()).sort((a, b) => b.count - a.count),
    rooms: Array.from(roomMap.values()).sort((a, b) => b.count - a.count),
  };
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export interface EventReport {
  total: number;
  inPeriod: number;
  unread: number;
  bySeverity: Record<Severity, number>;
  byKind: { kind: string; count: number }[];
}

export function computeEventReport(events: AppEvent[], since: number): EventReport {
  const inPeriod = events.filter((e) => new Date(e.ts).getTime() >= since);
  const bySeverity: Record<Severity, number> = { critical: 0, warning: 0, info: 0, ok: 0 };
  const kindMap = new Map<string, number>();

  for (const e of inPeriod) {
    bySeverity[eventSeverity(e)]++;
    kindMap.set(e.kind, (kindMap.get(e.kind) ?? 0) + 1);
  }

  return {
    total: events.length,
    inPeriod: inPeriod.length,
    unread: events.filter((e) => !e.read).length,
    bySeverity,
    byKind: Array.from(kindMap.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/* ------------------------------------------------------------------ */
/* Energy                                                              */
/* ------------------------------------------------------------------ */

export interface EnergyReport {
  liveWatts: number | null;
  todayKwh: number | null;
  topDevices: { id: string; name: string; type: string; watts: number }[];
}

export function computeEnergyReport(summary: {
  liveWatts: number | null;
  todayKwh: number | null;
  byDevice: { id: string; name: string; type: string; watts: number }[];
} | null): EnergyReport {
  if (!summary) return { liveWatts: null, todayKwh: null, topDevices: [] };
  return {
    liveWatts: summary.liveWatts,
    todayKwh: summary.todayKwh,
    topDevices: [...summary.byDevice]
      .sort((a, b) => b.watts - a.watts)
      .slice(0, 10),
  };
}

/* ------------------------------------------------------------------ */
/* Automations                                                         */
/* ------------------------------------------------------------------ */

export interface AutomationReport {
  total: number;
  enabled: number;
  disabled: number;
  byTriggerType: { type: string; count: number }[];
}

export function computeAutomationReport(automations: Automation[]): AutomationReport {
  const trigMap = new Map<string, number>();
  let enabled = 0;

  for (const a of automations) {
    if (a.enabled) enabled++;
    const t = a.trigger?.type ?? "unknown";
    trigMap.set(t, (trigMap.get(t) ?? 0) + 1);
  }

  return {
    total: automations.length,
    enabled,
    disabled: automations.length - enabled,
    byTriggerType: Array.from(trigMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/* ------------------------------------------------------------------ */
/* CSV builders                                                        */
/* ------------------------------------------------------------------ */

export function fleetToCsvRows(devices: Device[]): (string | number | null)[][] {
  return devices.map((d) => [
    d.id, d.name, d.type, d.room ?? "", d.online ? "online" : "offline",
    d.fw_version ?? "", d.last_seen ?? "",
  ]);
}

export const FLEET_CSV_HEADERS = ["id", "name", "type", "room", "status", "fw_version", "last_seen"];

export function eventsToCsvRows(events: AppEvent[]): (string | number | null)[][] {
  return events.map((e) => [
    e.id, e.kind, eventSeverity(e), e.title, e.body, e.device_id ?? "", e.read ? "read" : "unread", e.ts,
  ]);
}

export const EVENTS_CSV_HEADERS = ["id", "kind", "severity", "title", "body", "device_id", "status", "ts"];

export function automationsToCsvRows(automations: Automation[]): (string | number | null)[][] {
  return automations.map((a) => [
    a.id, a.name, a.enabled ? "enabled" : "disabled",
    a.trigger?.type ?? "", a.trigger?.deviceId ?? "", a.action?.type ?? "",
  ]);
}

export const AUTOMATIONS_CSV_HEADERS = ["id", "name", "status", "trigger_type", "trigger_device", "action_type"];
