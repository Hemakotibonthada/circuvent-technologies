"use client";

/**
 * Circuvent Console — domain hooks.
 *
 * Every value returned here traces to a `controlPlane` endpoint. Nothing is
 * generated, estimated or filled in. Where a figure the UI wants does not exist
 * server-side (a tariff, a budget) the hook returns `null` and the screen shows
 * an explicit "not configured" state instead of a plausible-looking number.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  controlPlane,
  type AdminDevice,
  type AdminHealth,
  type AdminStats,
  type AdminUser,
  type AnprLane,
  type AttendanceSite,
  type AppEvent,
  type Automation,
  type Device,
  type EnergySeries,
  type EnergySummary,
  type GatePass,
  type Room,
  type Scene,
} from "@/lib/control-plane";
import { useOptimisticCommands, type OptimisticCommands } from "@/lib/smarthome-realtime";
import { masterPower } from "@/lib/smarthome-command-map";
import { useConsole } from "../ConsoleProvider";
import { useResource } from "./store";
import type { Severity } from "../_kit/primitives";
import { isAttendanceReader } from "@/lib/attendance-readers";

/* ------------------------------------------------------------------ */
/* Fleet                                                               */
/* ------------------------------------------------------------------ */

export interface FleetApi {
  /** Live-merged devices with optimistic command overlays applied. */
  devices: Device[];
  /** Same list without optimistic overlays — use for diffing, not display. */
  raw: Device[];
  loading: boolean;
  error: string | null;
  lastSync: number | null;
  refresh: () => Promise<void>;
  cmd: OptimisticCommands;
  online: number;
  offline: number;
  poweredOn: number;
  rooms: string[];
  types: string[];
  byId: Map<string, Device>;
  /** Optimistically flip the favourite flag, then persist. */
  toggleFavorite: (device: Device) => Promise<void>;
  rename: (id: string, name: string) => Promise<boolean>;
  assignRoom: (id: string, room: string) => Promise<boolean>;
}

const FLEET_POLL_MS = 20_000;

export function useFleet(): FleetApi {
  const { subscribe } = useConsole();
  const res = useResource<Device[]>(
    "devices",
    () => controlPlane.devices(),
    (raw) => (raw as { devices?: Device[] }).devices ?? [],
    FLEET_POLL_MS
  );
  const devices = useMemo(() => res.data ?? [], [res.data]);
  const cmd = useOptimisticCommands(devices);
  const { set } = res;

  // Live channel: sub-second pushes patch the shared cache directly, so every
  // panel on screen reflects a relay flip without waiting for the next poll.
  useEffect(
    () =>
      subscribe((u) => {
        set((prev) => {
          if (!prev) return prev;
          let changed = false;
          const next = prev.map((d) => {
            if (d.id !== u.deviceId) return d;
            changed = true;
            if (u.kind === "status") return { ...d, online: !!(u.payload as { online?: boolean }).online };
            if (u.kind === "state") return { ...d, online: true, state: { ...d.state, ...u.payload } };
            return { ...d, online: true };
          });
          return changed ? next : prev;
        });
      }),
    [subscribe, set]
  );

  const applied = useMemo(() => devices.map(cmd.apply), [devices, cmd]);

  const toggleFavorite = useCallback(
    async (device: Device) => {
      const want = !device.favorite;
      set((prev) => (prev ? prev.map((d) => (d.id === device.id ? { ...d, favorite: want } : d)) : prev));
      const r = await controlPlane.patchDevice(device.id, { favorite: want });
      if (!r.ok) set((prev) => (prev ? prev.map((d) => (d.id === device.id ? { ...d, favorite: !want } : d)) : prev));
    },
    [set]
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      const r = await controlPlane.patchDevice(id, { name });
      if (r.ok) set((prev) => (prev ? prev.map((d) => (d.id === id ? { ...d, name } : d)) : prev));
      return r.ok;
    },
    [set]
  );

  const assignRoom = useCallback(
    async (id: string, room: string) => {
      const r = await controlPlane.patchDevice(id, { room });
      if (r.ok) set((prev) => (prev ? prev.map((d) => (d.id === id ? { ...d, room } : d)) : prev));
      return r.ok;
    },
    [set]
  );

  const stats = useMemo(() => {
    const online = applied.filter((d) => d.online).length;
    const poweredOn = applied.filter((d) => masterPower(d)?.on).length;
    const rooms = Array.from(new Set(applied.map((d) => d.room).filter((r): r is string => !!r))).sort();
    const types = Array.from(new Set(applied.map((d) => d.type))).sort();
    const byId = new Map(applied.map((d) => [d.id, d] as const));
    return { online, offline: applied.length - online, poweredOn, rooms, types, byId };
  }, [applied]);

  return {
    devices: applied,
    raw: devices,
    loading: res.loading,
    error: res.error,
    lastSync: res.lastSync,
    refresh: res.refresh,
    cmd,
    ...stats,
    toggleFavorite,
    rename,
    assignRoom,
  };
}

/* ------------------------------------------------------------------ */
/* Rooms / scenes / automations                                        */
/* ------------------------------------------------------------------ */

export function useRooms() {
  const res = useResource<Room[]>("rooms", () => controlPlane.rooms(), (raw) => (raw as { rooms?: Room[] }).rooms ?? [], 60_000);
  return { rooms: useMemo(() => res.data ?? [], [res.data]), loading: res.loading, error: res.error, refresh: res.refresh };
}

export function useScenes() {
  const res = useResource<Scene[]>("scenes", () => controlPlane.scenes(), (raw) => (raw as { scenes?: Scene[] }).scenes ?? [], 60_000);
  const { refresh } = res;
  const activate = useCallback(
    async (id: number) => {
      const r = await controlPlane.activateScene(id);
      return r.ok ? (r.data as { sent?: number }).sent ?? 0 : null;
    },
    []
  );
  return { scenes: useMemo(() => res.data ?? [], [res.data]), loading: res.loading, error: res.error, refresh, activate };
}

export function useAutomations() {
  const res = useResource<Automation[]>(
    "automations",
    () => controlPlane.automations(),
    (raw) => (raw as { automations?: Automation[] }).automations ?? [],
    60_000
  );
  const { set, refresh } = res;
  const setEnabled = useCallback(
    async (id: number, enabled: boolean) => {
      set((prev) => (prev ? prev.map((a) => (a.id === id ? { ...a, enabled } : a)) : prev));
      const r = await controlPlane.updateAutomation(id, { enabled });
      if (!r.ok) set((prev) => (prev ? prev.map((a) => (a.id === id ? { ...a, enabled: !enabled } : a)) : prev));
      return r.ok;
    },
    [set]
  );
  const remove = useCallback(
    async (id: number) => {
      const r = await controlPlane.deleteAutomation(id);
      if (r.ok) set((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
      return r.ok;
    },
    [set]
  );
  return { automations: useMemo(() => res.data ?? [], [res.data]), loading: res.loading, error: res.error, refresh, setEnabled, remove };
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

/**
 * Map a control-plane event kind to a console severity.
 * Kinds are emitted by platform/api: `alert`, `security`, `success`, `info`,
 * `activity` (see mqtt.ts / gate.ts / scenes.ts).
 */
export function eventSeverity(e: { kind: string; title?: string }): Severity {
  const k = (e.kind || "").toLowerCase();
  if (k === "alert") return "critical";
  if (k === "security") {
    // SOS is a life-safety signal; ordinary motion is not.
    return /sos/i.test(e.title ?? "") ? "critical" : "warning";
  }
  if (k === "success") return "ok";
  return "info";
}

export interface EventFeed {
  events: AppEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  unread: number;
  counts: Record<Severity, number>;
  markRead: (ids?: number[]) => Promise<void>;
  remove: (id: number) => Promise<void>;
  clear: () => Promise<void>;
  severityOf: (e: AppEvent) => Severity;
}

export function useEvents(limit = 200): EventFeed {
  const res = useResource<AppEvent[]>(
    `events:${limit}`,
    () => controlPlane.events(limit),
    (raw) => (raw as { events?: AppEvent[] }).events ?? [],
    30_000
  );
  const { set, refresh } = res;
  const events = useMemo(() => res.data ?? [], [res.data]);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, warning: 0, info: 0, ok: 0 };
    for (const e of events) c[eventSeverity(e)]++;
    return c;
  }, [events]);

  const markRead = useCallback(
    async (ids?: number[]) => {
      set((prev) => (prev ? prev.map((e) => (!ids || ids.includes(e.id) ? { ...e, read: true } : e)) : prev));
      await controlPlane.markEventsRead(ids);
    },
    [set]
  );

  const remove = useCallback(
    async (id: number) => {
      set((prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
      await controlPlane.deleteEvent(id);
    },
    [set]
  );

  const clear = useCallback(async () => {
    set(() => []);
    await controlPlane.clearEvents();
  }, [set]);

  return {
    events,
    loading: res.loading,
    error: res.error,
    refresh,
    unread: events.filter((e) => !e.read).length,
    counts,
    markRead,
    remove,
    clear,
    severityOf: eventSeverity,
  };
}

/* ------------------------------------------------------------------ */
/* ANPR presence                                                       */
/* ------------------------------------------------------------------ */

/**
 * Does this account actually have a number-plate camera?
 *
 * The console has one section per capability, and a household that owns two
 * lamps should not be shown a gate-management section with an empty plate log
 * in it — an empty screen for a device you do not own reads as something
 * broken, not as something unbought.
 *
 * Two ways to have one, and both count, because both produce plate reads that
 * land in the same log:
 *
 *   - an `anpr-cam`, which reads plates in firmware, or
 *   - an ordinary `camera` enrolled as an ANPR lane, which the control plane
 *     drives (see Docs/20-anpr.md §2a).
 *
 * The lane lookup is skipped entirely for an account with no camera at all, so
 * the common case costs no extra request. It rides the shared resource cache,
 * so the chrome and the Security page ask the same question once between them
 * rather than once each.
 */
export function useAnprPresence(): { hasAnpr: boolean; ready: boolean } {
  const { devices, loading: fleetLoading } = useFleet();

  const hasAnprCam = useMemo(() => devices.some((d) => d.type === "anpr-cam"), [devices]);
  const hasCamera = useMemo(() => devices.some((d) => d.type === "camera"), [devices]);

  // Only asked when it could change the answer: an account already holding an
  // anpr-cam is decided, and one with no camera has nothing to enrol.
  const res = useResource<AnprLane[]>(
    "anpr:lanes",
    () => controlPlane.anprLanes(),
    (raw) => (raw as { lanes?: AnprLane[] }).lanes ?? [],
    120_000,
    hasCamera && !hasAnprCam
  );

  const hasLane = useMemo(() => (res.data ?? []).some((l) => l.enabled), [res.data]);

  return {
    hasAnpr: hasAnprCam || hasLane,
    /*
     * Ready means "the answer will not change on its own in a moment".
     *
     * The nav uses this to avoid rendering the section and then removing it a
     * beat later, which is worse than showing it slightly late: an item that
     * appears and vanishes reads as a glitch, and on a phone it moves whatever
     * the user was about to tap.
     */
    ready: !fleetLoading && (hasAnprCam || !hasCamera || !res.loading),
  };
}

/* ------------------------------------------------------------------ */
/* Attendance                                                          */
/* ------------------------------------------------------------------ */

/**
 * Whether this account runs an attendance system.
 *
 * Two ways to be true, and both matter. An `rfid-attend` terminal on the fleet
 * means somebody has bought the hardware and is about to need the screens even
 * if they have not created a site yet — so the section has to appear before
 * there is anything in it, or there is nowhere to do the setting up.
 *
 * A site with no terminal is the other order: a school that imported its roll
 * on a laptop before the readers arrived. Both are real ways to start, and a
 * check that only understood one of them would leave somebody with hardware
 * and no screen, or a roll and no way back to it.
 */
export function useAttendancePresence(): { hasAttendance: boolean; ready: boolean } {
  const { devices, loading: fleetLoading } = useFleet();

  const hasTerminal = useMemo(() => devices.some((d) => isAttendanceReader(d.type)), [devices]);

  // Only asked when it could change the answer: an account already holding a
  // terminal is decided.
  const res = useResource<AttendanceSite[]>(
    "attendance:sites",
    () => controlPlane.attendanceSites(),
    (raw) => (raw as { sites?: AttendanceSite[] }).sites ?? [],
    120_000,
    !hasTerminal
  );

  const hasSite = useMemo(() => (res.data ?? []).length > 0, [res.data]);

  return {
    hasAttendance: hasTerminal || hasSite,
    /*
     * Ready means "the answer will not change on its own in a moment" — the
     * nav uses it to avoid rendering the section and then removing it a beat
     * later, which reads as a glitch and moves whatever was about to be
     * tapped.
     */
    ready: !fleetLoading && (hasTerminal || !res.loading),
  };
}

/* ------------------------------------------------------------------ */
/* Energy                                                              */
/* ------------------------------------------------------------------ */

export function useEnergy() {
  const res = useResource<EnergySummary>(
    "energy:summary",
    () => controlPlane.energySummary(),
    (raw) => raw as EnergySummary,
    20_000
  );
  const summary = res.data;
  const byDevice = useMemo(() => (summary?.byDevice ?? []).slice().sort((a, b) => b.watts - a.watts), [summary]);
  return {
    summary,
    byDevice,
    liveWatts: summary?.liveWatts ?? null,
    todayKwh: summary?.todayKwh ?? null,
    loading: res.loading,
    error: res.error,
    refresh: res.refresh,
  };
}

/**
 * Per-device energy history. `hours` and `metric` are passed straight through
 * to `/devices/:id/energy`, which returns server-side rollups — the console
 * never resamples or interpolates.
 */
export function useDeviceEnergy(id: string | null, hours = 24, metric = "watts") {
  const res = useResource<EnergySeries | null>(
    `energy:device:${id}:${hours}:${metric}`,
    () => (id ? controlPlane.deviceEnergy(id, hours, metric) : Promise.resolve({ ok: false, status: 0, data: {} })),
    (raw) => (raw as EnergySeries) ?? null,
    60_000,
    Boolean(id)
  );
  const points = useMemo(
    () =>
      (res.data?.series ?? [])
        .map((p) => ({ t: new Date(p.t).getTime(), v: Number(p.avg) }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
        .sort((a, b) => a.t - b.t),
    [res.data]
  );
  return { series: res.data, points, kwh: res.data?.kwh ?? null, loading: res.loading, error: res.error, refresh: res.refresh };
}

/**
 * Whole-home history assembled from the per-device endpoint.
 *
 * The control plane has no aggregate history route, so this sums the real
 * per-device rollups on matching timestamps. Devices are capped because each
 * one is a separate request.
 */
export function useHomeEnergyHistory(deviceIds: string[], hours = 24, maxDevices = 8) {
  const [points, setPoints] = useState<{ t: number; v: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const ids = useMemo(() => deviceIds.slice(0, maxDevices), [deviceIds, maxDevices]);
  const key = ids.join(",");

  useEffect(() => {
    if (ids.length === 0) {
      setPoints([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const results = await Promise.all(ids.map((id) => controlPlane.deviceEnergy(id, hours, "watts")));
      if (cancelled) return;
      const bucket = new Map<number, number>();
      for (const r of results) {
        if (!r.ok) continue;
        for (const p of r.data.series ?? []) {
          const t = new Date(p.t).getTime();
          const v = Number(p.avg);
          if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
          bucket.set(t, (bucket.get(t) ?? 0) + v);
        }
      }
      setPoints(Array.from(bucket, ([t, v]) => ({ t, v })).sort((a, b) => a.t - b.t));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // `key` stands in for the id list identity.
  }, [key, hours, ids]);

  return { points, loading };
}

/* ------------------------------------------------------------------ */
/* Telemetry                                                           */
/* ------------------------------------------------------------------ */

export interface TelemetryRow {
  ts: string;
  payload: Record<string, unknown>;
}

export function useTelemetry(id: string | null, limit = 200) {
  const res = useResource<TelemetryRow[]>(
    `telemetry:${id}:${limit}`,
    () => (id ? controlPlane.telemetry(id, limit) : Promise.resolve({ ok: false, status: 0, data: {} })),
    (raw) => (raw as { telemetry?: TelemetryRow[] }).telemetry ?? [],
    30_000,
    Boolean(id)
  );
  const rows = useMemo(() => res.data ?? [], [res.data]);

  /** Numeric fields present across the sample — drives metric pickers. */
  const numericFields = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const [k, v] of Object.entries(r.payload ?? {})) if (typeof v === "number" && Number.isFinite(v)) set.add(k);
    return Array.from(set).sort();
  }, [rows]);

  const seriesFor = useCallback(
    (field: string) =>
      rows
        .map((r) => ({ t: new Date(r.ts).getTime(), v: Number(r.payload?.[field]) }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
        .sort((a, b) => a.t - b.t),
    [rows]
  );

  return { rows, numericFields, seriesFor, loading: res.loading, error: res.error, refresh: res.refresh };
}

/* ------------------------------------------------------------------ */
/* Gate passes                                                         */
/* ------------------------------------------------------------------ */

export function useGatePasses(deviceId?: string) {
  const res = useResource<GatePass[]>(
    `gate:${deviceId ?? "all"}`,
    () => controlPlane.gatePasses(deviceId),
    (raw) => (raw as { passes?: GatePass[] }).passes ?? [],
    45_000
  );
  const { set, refresh } = res;
  const revoke = useCallback(
    async (id: number) => {
      set((prev) => (prev ? prev.map((p) => (p.id === id ? { ...p, revoked: true, status: "revoked" } : p)) : prev));
      const r = await controlPlane.revokeGatePass(id);
      if (!r.ok) await refresh();
      return r.ok;
    },
    [set, refresh]
  );
  return { passes: useMemo(() => res.data ?? [], [res.data]), loading: res.loading, error: res.error, refresh, revoke };
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

/** Resolves the single server-side authorisation bit (`is_admin`). */
export function useIsAdmin(): { isAdmin: boolean; checked: boolean } {
  const { user } = useConsole();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setIsAdmin(false);
      setChecked(true);
      return;
    }
    setChecked(false);
    controlPlane.adminMe().then((r) => {
      if (cancelled) return;
      setIsAdmin(Boolean(r.ok && (r.data as { admin?: boolean })?.admin));
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);
  return { isAdmin, checked };
}

export function useAdminStats(enabled = true) {
  const res = useResource<AdminStats | null>("admin:stats", () => controlPlane.adminStats(), (raw) => (raw as AdminStats) ?? null, 30_000, enabled);
  return { stats: res.data, loading: res.loading, error: res.error, refresh: res.refresh };
}

export function useAdminHealth(enabled = true) {
  const res = useResource<AdminHealth | null>("admin:health", () => controlPlane.adminHealth(), (raw) => (raw as AdminHealth) ?? null, 15_000, enabled);
  return { health: res.data, loading: res.loading, error: res.error, refresh: res.refresh };
}

export function useAdminUsers(enabled = true) {
  const res = useResource<AdminUser[]>("admin:users", () => controlPlane.adminUsers(), (raw) => (raw as { users?: AdminUser[] }).users ?? [], 60_000, enabled);
  return { users: useMemo(() => res.data ?? [], [res.data]), loading: res.loading, error: res.error, refresh: res.refresh };
}

export function useAdminDevices(enabled = true) {
  const res = useResource<AdminDevice[]>(
    "admin:devices",
    () => controlPlane.adminDevices(),
    (raw) => (raw as { devices?: AdminDevice[] }).devices ?? [],
    30_000,
    enabled
  );
  return { devices: useMemo(() => res.data ?? [], [res.data]), loading: res.loading, error: res.error, refresh: res.refresh };
}

/* ------------------------------------------------------------------ */
/* Reachability probe                                                  */
/* ------------------------------------------------------------------ */

export interface ProbeSample {
  at: number;
  ms: number | null;
  ok: boolean;
}

/**
 * Measures real HTTP round-trip time to the control plane.
 *
 * `/devices` is used as the probe target because it is authenticated and cheap,
 * which makes the number representative of what a control command actually
 * pays. Samples are measured, never synthesised.
 */
export function useControlPlaneProbe(intervalMs = 30_000, keep = 40) {
  const [samples, setSamples] = useState<ProbeSample[]>([]);
  const [busy, setBusy] = useState(false);

  const probe = useCallback(async () => {
    setBusy(true);
    const t0 = performance.now();
    const r = await controlPlane.devices();
    const ms = Math.round(performance.now() - t0);
    setSamples((prev) => [...prev, { at: Date.now(), ms: r.status === 0 ? null : ms, ok: r.ok }].slice(-keep));
    setBusy(false);
  }, [keep]);

  useEffect(() => {
    void probe();
    if (intervalMs <= 0) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void probe();
    }, intervalMs);
    return () => clearInterval(t);
  }, [probe, intervalMs]);

  const stats = useMemo(() => {
    const okMs = samples.filter((s) => s.ok && s.ms != null).map((s) => s.ms!);
    const sorted = [...okMs].sort((a, b) => a - b);
    const q = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null);
    return {
      last: samples.length ? samples[samples.length - 1] : null,
      count: samples.length,
      failures: samples.filter((s) => !s.ok).length,
      p50: q(0.5),
      p95: q(0.95),
      avg: okMs.length ? Math.round(okMs.reduce((a, b) => a + b, 0) / okMs.length) : null,
      max: sorted.length ? sorted[sorted.length - 1] : null,
    };
  }, [samples]);

  return { samples, stats, probe, busy };
}
