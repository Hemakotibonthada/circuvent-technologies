"use client";

/**
 * REAL admin data layer.
 *
 * Every value rendered by /smarthome/admin comes from here, and everything here
 * comes from the live Circuvent control plane (platform/api) over the operator's
 * JWT. There is deliberately NO generated, seeded or randomised fallback: when
 * the control plane is unreachable, unauthorised or simply has no rows yet, the
 * hooks report `error` / an empty array and the pages render an honest empty or
 * error state instead of inventing numbers.
 *
 * This file replaces the previous `_lib/sim.ts`, which fabricated 19 stores of
 * tenants, invoices, incidents and telemetry with a seeded PRNG.
 *
 * Endpoint map (see src/lib/control-plane.ts):
 *   adminStats            -> device/user/event totals + real per-type breakdown
 *   adminHealth           -> mqtt + db reachability, process uptime, node version
 *   adminDevices          -> the actual fleet, with owner, firmware and state
 *   adminDevice           -> one device
 *   adminDeviceTelemetry  -> stored telemetry frames for one device
 *   adminUsers            -> real accounts, with role and device counts
 *   adminEvents           -> the real event log (alerts, security, activity)
 *   automations           -> real automation rules (full CRUD)
 *   energySummary         -> real live watts + today's kWh, per device
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  controlPlane,
  type AdminDevice,
  type AdminEvent,
  type AdminHealth,
  type AdminStats,
  type AdminUser,
  type Automation,
  type EnergySummary,
} from "@/lib/control-plane";

// ---------------------------------------------------------------- primitives --

export interface Resource<T> {
  data: T | null;
  /** True only for the very first load, so refreshes don't blank the screen. */
  loading: boolean;
  /** Human-readable failure reason, or null. Never silently swallowed. */
  error: string | null;
  /** True when the failure was an auth failure (401/403). */
  unauthorized: boolean;
  /** Epoch ms of the last successful load, or 0. */
  updatedAt: number;
  reload: () => void;
}

interface ApiLike<T> {
  ok: boolean;
  status: number;
  data: T;
}

function messageFor(status: number, data: unknown): string {
  const fromBody =
    data && typeof data === "object" && "error" in data
      ? String((data as { error?: unknown }).error ?? "")
      : "";
  if (fromBody) return fromBody;
  if (status === 0) return "Cannot reach the control plane.";
  if (status === 401) return "Not signed in to the control plane.";
  if (status === 403) return "This account is not an operator.";
  if (status === 404) return "Not found on the control plane.";
  return `Control plane returned ${status}.`;
}

/**
 * Generic loader for a control-plane call.
 *
 * @param fetcher   Must be stable (wrap in useCallback at the call site).
 * @param select    Pulls the payload out of the response envelope.
 * @param pollMs    Optional background refresh. 0 disables polling.
 */
export function useResource<R, T>(
  fetcher: () => Promise<ApiLike<R>>,
  select: (r: R) => T,
  pollMs = 0
): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(0);

  const alive = useRef(true);
  const selectRef = useRef(select);
  selectRef.current = select;

  const run = useCallback(async () => {
    try {
      const res = await fetcher();
      if (!alive.current) return;
      if (res.ok) {
        setData(selectRef.current(res.data));
        setError(null);
        setUnauthorized(false);
        setUpdatedAt(Date.now());
      } else {
        setError(messageFor(res.status, res.data));
        setUnauthorized(res.status === 401 || res.status === 403);
      }
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    alive.current = true;
    run();
    return () => {
      alive.current = false;
    };
  }, [run]);

  useEffect(() => {
    if (!pollMs) return;
    const t = setInterval(run, pollMs);
    return () => clearInterval(t);
  }, [run, pollMs]);

  const reload = useCallback(() => {
    run();
  }, [run]);

  return { data, loading, error, unauthorized, updatedAt, reload };
}

// ------------------------------------------------------------- real resources --

export function useAdminStats(pollMs = 20000): Resource<AdminStats> {
  return useResource(
    useCallback(() => controlPlane.adminStats(), []),
    (r) => r,
    pollMs
  );
}

export function useAdminHealth(pollMs = 15000): Resource<AdminHealth> {
  return useResource(
    useCallback(() => controlPlane.adminHealth(), []),
    (r) => r,
    pollMs
  );
}

export function useAdminDevices(pollMs = 15000): Resource<AdminDevice[]> {
  return useResource(
    useCallback(() => controlPlane.adminDevices(), []),
    (r) => r.devices ?? [],
    pollMs
  );
}

export function useAdminUsers(pollMs = 0): Resource<AdminUser[]> {
  return useResource(
    useCallback(() => controlPlane.adminUsers(), []),
    (r) => r.users ?? [],
    pollMs
  );
}

export function useAdminEvents(limit = 100, pollMs = 20000): Resource<AdminEvent[]> {
  return useResource(
    useCallback(() => controlPlane.adminEvents(limit), [limit]),
    (r) => r.events ?? [],
    pollMs
  );
}

export function useAutomations(pollMs = 0): Resource<Automation[]> {
  return useResource(
    useCallback(() => controlPlane.automations(), []),
    (r) => r.automations ?? [],
    pollMs
  );
}

export function useEnergySummary(pollMs = 20000): Resource<EnergySummary> {
  return useResource(
    useCallback(() => controlPlane.energySummary(), []),
    (r) => r,
    pollMs
  );
}

export function useDeviceTelemetry(
  id: string | null,
  limit = 200,
  pollMs = 0
): Resource<{ ts: string; payload: Record<string, unknown> }[]> {
  return useResource(
    useCallback(
      () =>
        id
          ? controlPlane.adminDeviceTelemetry(id, limit)
          : Promise.resolve({ ok: true, status: 200, data: { telemetry: [] } }),
      [id, limit]
    ),
    (r) => r.telemetry ?? [],
    pollMs
  );
}

// -------------------------------------------------------- derived, not faked --

export type DeviceHealth = "healthy" | "warning" | "critical" | "offline";

/** Fault flags the firmware actually publishes (see firmware/<type>/<type>.ino). */
const CRITICAL_FLAGS = ["sos", "dryRun", "overflow", "leak", "tamper", "fault"] as const;

/** Minutes after which a device that claims to be online is treated as stale. */
const STALE_MINUTES = 15;

export function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 60000;
}

/**
 * Classify a device from REAL signals only: its reported online flag, the age of
 * its last frame, and the fault flags in its published state. Nothing here is
 * randomised, so the same device always yields the same status.
 */
export function deviceHealth(d: { online: boolean; last_seen?: string | null; state?: Record<string, unknown> }): DeviceHealth {
  if (!d.online) return "offline";
  const state = d.state ?? {};
  if (CRITICAL_FLAGS.some((f) => Boolean(state[f]))) return "critical";
  const age = minutesSince(d.last_seen);
  if (age !== null && age > STALE_MINUTES) return "warning";
  const battery = Number(state.battery ?? state.batteryPct ?? NaN);
  if (!Number.isNaN(battery) && battery <= 20) return "warning";
  const rssi = Number(state.rssi ?? NaN);
  if (!Number.isNaN(rssi) && rssi <= -80) return "warning";
  return "healthy";
}

/** Which fault flags are currently set — used to explain a "critical" badge. */
export function activeFaults(state: Record<string, unknown> | undefined): string[] {
  if (!state) return [];
  return CRITICAL_FLAGS.filter((f) => Boolean(state[f]));
}

export interface Bucket {
  name: string;
  value: number;
}

/** Count devices by an arbitrary real field, sorted desc. */
export function countBy<T>(rows: T[], key: (row: T) => string | null | undefined): Bucket[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export interface HealthBreakdown {
  healthy: number;
  warning: number;
  critical: number;
  offline: number;
}

export function healthBreakdown(devices: { online: boolean; last_seen?: string | null; state?: Record<string, unknown> }[]): HealthBreakdown {
  const out: HealthBreakdown = { healthy: 0, warning: 0, critical: 0, offline: 0 };
  for (const d of devices) out[deviceHealth(d)] += 1;
  return out;
}

/**
 * Build a real time-series by bucketing timestamped records into `buckets`
 * windows of `bucketMs`, ending now. Used for event-rate and telemetry charts —
 * it plots what actually happened rather than a random walk.
 */
export function timeSeries<T>(
  rows: T[],
  at: (row: T) => string | number | null | undefined,
  buckets: number,
  bucketMs: number
): { labels: string[]; data: number[] } {
  const now = Date.now();
  const start = now - buckets * bucketMs;
  const data = new Array<number>(buckets).fill(0);
  for (const r of rows) {
    const raw = at(r);
    if (raw === null || raw === undefined) continue;
    const t = typeof raw === "number" ? raw : Date.parse(raw);
    if (Number.isNaN(t) || t < start || t > now) continue;
    const idx = Math.min(buckets - 1, Math.floor((t - start) / bucketMs));
    data[idx] += 1;
  }
  const labels = Array.from({ length: buckets }, (_, i) => {
    const d = new Date(start + i * bucketMs);
    return bucketMs >= 86400000
      ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  });
  return { labels, data };
}

/**
 * Pull a numeric metric out of a device's telemetry frames, oldest first.
 * Frames that don't carry the metric are skipped rather than interpolated.
 */
export function telemetrySeries(
  frames: { ts: string; payload: Record<string, unknown> }[],
  metric: string
): { labels: string[]; data: number[] } {
  const points = frames
    .map((f) => ({ t: Date.parse(f.ts), v: Number(f.payload?.[metric]) }))
    .filter((p) => !Number.isNaN(p.t) && !Number.isNaN(p.v))
    .sort((a, b) => a.t - b.t);
  return {
    labels: points.map((p) => new Date(p.t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })),
    data: points.map((p) => p.v),
  };
}

/** Every numeric metric present across a device's telemetry frames. */
export function availableMetrics(frames: { payload: Record<string, unknown> }[]): string[] {
  const keys = new Set<string>();
  for (const f of frames) {
    for (const [k, v] of Object.entries(f.payload ?? {})) {
      if (typeof v === "number" && Number.isFinite(v)) keys.add(k);
    }
  }
  return [...keys].sort();
}

/** Sum a numeric metric across real device states (e.g. live watts). */
export function sumStateMetric(
  devices: { state?: Record<string, unknown> }[],
  keys: string[]
): { total: number; reporting: number } {
  let total = 0;
  let reporting = 0;
  for (const d of devices) {
    const state = d.state ?? {};
    for (const k of keys) {
      // Number() is too permissive to use on raw device state. Number(true) is
      // 1, so a plug reporting `power: true` would silently contribute 1 W of
      // invented load; Number(null) and Number("") are 0, which would mark a
      // device with no reading as "reporting". Only genuine numerics count.
      const raw = state[k];
      const v =
        typeof raw === "number" && Number.isFinite(raw)
          ? raw
          : typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))
            ? Number(raw)
            : null;
      if (v !== null) {
        total += v;
        reporting += 1;
        break;
      }
    }
  }
  return { total, reporting };
}

/** Convenience: aggregate several resources into one loading/error surface. */
export function combine(...rs: Resource<unknown>[]): {
  loading: boolean;
  error: string | null;
  unauthorized: boolean;
  reload: () => void;
} {
  return {
    loading: rs.some((r) => r.loading),
    error: rs.find((r) => r.error)?.error ?? null,
    unauthorized: rs.some((r) => r.unauthorized),
    reload: () => rs.forEach((r) => r.reload()),
  };
}

/** Stable memo of the fleet grouped the ways the admin pages need it. */
export function useFleetInsights(devices: AdminDevice[] | null) {
  return useMemo(() => {
    const rows = devices ?? [];
    return {
      total: rows.length,
      online: rows.filter((d) => d.online).length,
      health: healthBreakdown(rows),
      byType: countBy(rows, (d) => d.type),
      byRoom: countBy(rows, (d) => d.room || "Unassigned"),
      byFirmware: countBy(rows, (d) => d.fw_version || "unknown"),
      byOwner: countBy(rows, (d) => d.owner_email || "unclaimed"),
      stale: rows.filter((d) => d.online && (minutesSince(d.last_seen) ?? 0) > STALE_MINUTES),
      faulted: rows.filter((d) => activeFaults(d.state).length > 0),
    };
  }, [devices]);
}

// ------------------------------------------ persisted admin configuration ----

/**
 * Collections stored by this app's own `/api/smarthome/admin/config` route
 * (disk-backed, operator-authenticated). These are the pieces of platform
 * configuration the control plane does not own — they used to be fabricated in
 * the browser and now genuinely persist.
 */
export type ConfigCollection =
  | "api-keys" | "webhooks" | "integrations" | "feature-flags"
  | "firmware" | "certificates" | "alert-channels" | "dashboards" | "retention";

export interface ConfigRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  [key: string]: unknown;
}

export interface AuditEntry {
  id: string;
  ts: string;
  actor: string;
  action: "create" | "update" | "delete";
  collection: string;
  target: string;
  summary: string;
}

const CONFIG_URL = "/api/smarthome/admin/config";

function authHeaders(): HeadersInit {
  const token = typeof window === "undefined" ? null : window.localStorage.getItem("cv-console-token");
  return token ? { authorization: `Bearer ${token}`, "content-type": "application/json" } : { "content-type": "application/json" };
}

async function configFetch<T>(input: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const res = await fetch(input, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) }, cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} as T };
  }
}

export interface ConfigResource<T> extends Resource<T[]> {
  rows: T[];
  create: (body: Record<string, unknown>) => Promise<T | null>;
  update: (id: string, patch: Record<string, unknown>) => Promise<T | null>;
  remove: (id: string) => Promise<boolean>;
  saving: boolean;
}

/** Disk-backed CRUD for one admin-config collection. */
export function useAdminConfig<T extends ConfigRecord = ConfigRecord>(
  collection: ConfigCollection
): ConfigResource<T> {
  const res = useResource(
    useCallback(
      () => configFetch<{ records?: T[] }>(`${CONFIG_URL}?collection=${collection}`),
      [collection]
    ),
    (r) => r.records ?? [],
    0
  );
  const [saving, setSaving] = useState(false);

  const create = useCallback(
    async (body: Record<string, unknown>) => {
      setSaving(true);
      const r = await configFetch<{ record?: T }>(`${CONFIG_URL}?collection=${collection}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSaving(false);
      if (r.ok) res.reload();
      return r.ok ? r.data.record ?? null : null;
    },
    [collection, res]
  );

  const update = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      setSaving(true);
      const r = await configFetch<{ record?: T }>(`${CONFIG_URL}?collection=${collection}`, {
        method: "PATCH",
        body: JSON.stringify({ id, ...patch }),
      });
      setSaving(false);
      if (r.ok) res.reload();
      return r.ok ? r.data.record ?? null : null;
    },
    [collection, res]
  );

  const remove = useCallback(
    async (id: string) => {
      setSaving(true);
      const r = await configFetch(`${CONFIG_URL}?collection=${collection}&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setSaving(false);
      if (r.ok) res.reload();
      return r.ok;
    },
    [collection, res]
  );

  return { ...res, rows: res.data ?? [], create, update, remove, saving };
}

/** The real audit trail of operator actions taken through this console. */
export function useAdminAudit(limit = 100): Resource<AuditEntry[]> {
  return useResource(
    useCallback(() => configFetch<{ audit?: AuditEntry[] }>(`${CONFIG_URL}?collection=audit&limit=${limit}`), [limit]),
    (r) => r.audit ?? [],
    0
  );
}
