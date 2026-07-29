import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../api";
import type { AdminDevice, AdminHealth, AdminStats, AdminUser } from "../../../api";
import { createStore, fleetHealth, isOutdated } from "../../../enterprise";
import { useAppActive } from "../../../ui";

export type ApiResponse<T> = { ok: boolean; status: number; data: T };
export type FleetFilter = "all" | "online" | "offline" | "stale" | "outdated";
export type LoadState<T> = { loading: boolean; refreshing: boolean; error: string | null; adminBlocked: boolean; data: T | null };
export type FleetBundle = { devices: AdminDevice[]; stats: AdminStats | null; health: AdminHealth | null; me: { uid: number; email: string } | null };
export type CommandResult = { id: string; ok: boolean; message: string };
export type RolloutHistoryEntry = { id: string; ts: string; url: string; version: string; type: string; onlineOnly: boolean; targetIds: string[]; mode: "wave" | "broadcast"; succeeded: number; failed: number; dispatched: number };
export type BroadcastLogEntry = { id: string; ts: string; command: Record<string, unknown>; type: string; online: "any" | "online" | "offline"; matched: number; sent: number };

export const rolloutStore = createStore<RolloutHistoryEntry[]>("fleet-rollout-history-v1", []);
export const broadcastStore = createStore<BroadcastLogEntry[]>("fleet-broadcast-log-v1", []);

export async function unwrap<T>(p: Promise<ApiResponse<T>>, fallback = "Request failed"): Promise<T> {
  const res = await p;
  if (!res.ok) {
    const err = (res.data as { error?: string } | undefined)?.error;
    const e = new Error(err || (res.status === 403 ? "Admin access required" : fallback));
    (e as Error & { status?: number }).status = res.status;
    throw e;
  }
  return res.data;
}

export function errorText(e: unknown, fallback = "Something went wrong"): string {
  return e instanceof Error ? e.message : fallback;
}

export function isForbidden(e: unknown): boolean {
  return e instanceof Error && (e as Error & { status?: number }).status === 403;
}

export function latestFirmware(devices: AdminDevice[]): string {
  return devices.map((d) => d.fw_version || "").filter(Boolean).sort((a, b) => -a.localeCompare(b, undefined, { numeric: true }))[0] || "";
}

export function fleetFilterCounts(devices: AdminDevice[], targetVersion: string): Record<FleetFilter, number> {
  const health = fleetHealth(devices);
  return {
    all: devices.length,
    online: health.online,
    offline: health.offline,
    stale: health.stale,
    outdated: targetVersion ? devices.filter((d) => isOutdated(d.fw_version || "", targetVersion)).length : 0,
  };
}

export function matchesFleetFilter(d: AdminDevice, filter: FleetFilter, targetVersion: string): boolean {
  if (filter === "online") return d.online;
  if (filter === "offline") return !d.online;
  if (filter === "outdated") return !!targetVersion && isOutdated(d.fw_version || "", targetVersion);
  if (filter === "stale") {
    const cutoff = Date.now() - 5 * 60 * 1000;
    const seen = d.last_seen ? new Date(d.last_seen).getTime() : 0;
    return d.online && (!Number.isFinite(seen) || seen < cutoff);
  }
  return true;
}

export function deviceSearchText(d: AdminDevice): string {
  return [d.id, d.name, d.type, d.room, d.owner_email, d.fw_version].filter(Boolean).join(" ").toLowerCase();
}

export function useFleetBundle(autoRefresh = true) {
  const appActive = useAppActive();
  const [state, setState] = useState<LoadState<FleetBundle>>({ loading: true, refreshing: false, error: null, adminBlocked: false, data: null });

  const load = useCallback(async (refreshing = false) => {
    setState((s) => ({ ...s, loading: !s.data && !refreshing, refreshing, error: null }));
    try {
      const me = await unwrap(api.adminMe(), "Unable to check administrator access");
      if (!me.admin) {
        setState({ loading: false, refreshing: false, error: null, adminBlocked: true, data: null });
        return;
      }
      const [devices, stats, health] = await Promise.all([
        unwrap(api.adminDevices(), "Unable to load fleet inventory"),
        unwrap(api.adminStats(), "Unable to load fleet statistics").catch(() => null),
        unwrap(api.adminHealth(), "Unable to load platform health").catch(() => null),
      ]);
      setState({ loading: false, refreshing: false, error: null, adminBlocked: false, data: { devices: devices.devices || [], stats, health, me: { uid: me.uid, email: me.email } } });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, refreshing: false, adminBlocked: isForbidden(e), error: errorText(e, "Unable to load fleet") }));
    }
  }, []);

  useEffect(() => { load(false); }, [load]);
  useEffect(() => {
    if (!autoRefresh || !appActive) return;
    const id = setInterval(() => { load(true); }, 20000);
    return () => clearInterval(id);
  }, [appActive, autoRefresh, load]);

  return useMemo(() => ({ ...state, reload: () => load(false), refresh: () => load(true) }), [state, load]);
}

export async function loadAdminUsers(): Promise<AdminUser[]> {
  const res = await api.adminUsers();
  if (!res.ok) return [];
  return res.data.users || [];
}

export function uniqueTypes(devices: AdminDevice[]): string[] {
  const common = ["aquaguard", "guardian", "curtain", "watertank", "facedoor", "touchboard", "sensor", "hub"];
  return Array.from(new Set([...devices.map((d) => d.type).filter(Boolean), ...common])).sort();
}

export function summarizeJson(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}


