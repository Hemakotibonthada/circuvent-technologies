// Real-time device control engine — optimistic state, reconciliation and
// round-trip latency instrumentation.
//
// PROBLEM
// -------
// A relay command travels app → REST → MQTT → ESP32 → MQTT → WS → app. The
// physical appliance switches in ~100-300 ms, but the dashboard only learned
// about it when the device echoed its state back, so the switch appeared to
// "stick" for a second or more (and much longer if the WS link had dropped and
// the page was waiting on its 15 s poll).
//
// APPROACH
// --------
// 1. Optimistic pins. On send we compute the state patch the firmware is
//    guaranteed to produce (smarthome-command-map) and pin those fields. The
//    rendered device state is `server state` overlaid with pinned values, so
//    the control moves on the same frame as the tap — 0 ms perceived latency.
// 2. Stale-frame protection. A pinned field ignores server values until the
//    device actually confirms it. Without this, the 15 s poll (or a telemetry
//    frame published just before the relay flipped) would momentarily revert
//    the switch — the classic optimistic-UI flicker.
// 3. Bounded optimism. A pin that is not confirmed within COMMAND_TIMEOUT_MS
//    is released and marked failed, so the UI can never lie indefinitely; it
//    falls back to real device state and surfaces the failure.
// 4. Instrumentation. Every command records API ack time and full device
//    round-trip time into a shared ring buffer that powers the live latency
//    badge and the admin latency dashboards.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { controlPlane, type Device } from "./control-plane";
import type { DeviceUpdate } from "./control-plane-live";
import { projectCommand, patchSatisfied, sameValue, type CommandPayload, type StatePatch } from "./smarthome-command-map";

/** How long an unconfirmed optimistic pin survives before it is rolled back. */
export const COMMAND_TIMEOUT_MS = 6000;
/**
 * Confirmation poll ramp used while a command is unconfirmed. The websocket is
 * the primary confirmation path; this is the safety net for when it is slow or
 * has silently dropped. Starting tight and backing off keeps the worst-case
 * confirmation near a quarter second without holding a high request rate for
 * longer than a command should ever take.
 */
export const CONFIRM_POLL_RAMP_MS = [180, 260, 380, 560, 800, 1100] as const;
/** Steady cadence once the ramp is exhausted but a command is still pending. */
export const ACTIVE_POLL_MS = 1100;
/** Poll cadence when idle (the WS channel is the primary path). */
export const IDLE_POLL_MS = 15000;
/** How long a field keeps its confirmed/failed flash after resolving. */
export const FLASH_MS = 1200;

export type FieldStatus = "idle" | "pending" | "confirmed" | "failed";

export interface LatencySample {
  id: string;
  deviceId: string;
  deviceType: string;
  fields: string[];
  /** Epoch ms the command left the browser. */
  sentAt: number;
  /** ms until the control plane accepted the command (HTTP round trip). */
  apiMs: number | null;
  /** ms until the device echoed the expected state back (full round trip). */
  rttMs: number | null;
  outcome: "confirmed" | "timeout" | "error";
  error?: string;
}

// ------------------------------------------------------------ latency store --

const MAX_SAMPLES = 600;
const LATENCY_KEY = "cv-latency-samples";

let samples: LatencySample[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

/**
 * Real command measurements are persisted so the admin latency console shows
 * genuine history after a reload (and across tabs) instead of an empty chart.
 * Only measurements this browser actually recorded are ever stored — nothing
 * is generated.
 */
function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(LATENCY_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) samples = (parsed as LatencySample[]).slice(-MAX_SAMPLES);
  } catch {
    // Corrupt or unavailable storage — start from an empty buffer.
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persist(): void {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(LATENCY_KEY, JSON.stringify(samples));
    } catch {
      // Quota or private mode — stay in memory for this session.
    }
  }, 400);
}

function emit() {
  // New array identity so useSyncExternalStore sees the change.
  samples = samples.slice(-MAX_SAMPLES);
  listeners.forEach((l) => l());
}

export function recordLatencySample(s: LatencySample): void {
  hydrate();
  samples = [...samples, s];
  emit();
  persist();
}

export function getLatencySamples(): LatencySample[] {
  hydrate();
  return samples;
}

export function clearLatencySamples(): void {
  samples = [];
  hydrated = true;
  emit();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LATENCY_KEY);
    } catch {
      // ignore
    }
  }
}

function subscribeLatency(fn: () => void): () => void {
  hydrate();
  listeners.add(fn);
  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

/** Pick up measurements recorded by another tab. */
function onStorage(e: StorageEvent): void {
  if (e.key !== LATENCY_KEY) return;
  try {
    const parsed: unknown = e.newValue ? JSON.parse(e.newValue) : [];
    if (Array.isArray(parsed)) {
      samples = (parsed as LatencySample[]).slice(-MAX_SAMPLES);
      listeners.forEach((l) => l());
    }
  } catch {
    // ignore malformed cross-tab payloads
  }
}

const EMPTY: LatencySample[] = [];

/** Live view of the command latency ring buffer (SSR-safe). */
export function useLatencySamples(): LatencySample[] {
  return useSyncExternalStore(
    subscribeLatency,
    getLatencySamples,
    () => EMPTY
  );
}

export interface LatencyStats {
  count: number;
  confirmed: number;
  failed: number;
  p50: number;
  p90: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
  apiP50: number;
  successRate: number;
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function summarizeLatency(list: LatencySample[]): LatencyStats {
  const rtts = list.map((s) => s.rttMs).filter((v): v is number => v != null).sort((a, b) => a - b);
  const apis = list.map((s) => s.apiMs).filter((v): v is number => v != null).sort((a, b) => a - b);
  const confirmed = list.filter((s) => s.outcome === "confirmed").length;
  const failed = list.length - confirmed;
  const sum = rtts.reduce((a, b) => a + b, 0);
  return {
    count: list.length,
    confirmed,
    failed,
    p50: percentile(rtts, 50),
    p90: percentile(rtts, 90),
    p99: percentile(rtts, 99),
    min: rtts[0] ?? 0,
    max: rtts[rtts.length - 1] ?? 0,
    avg: rtts.length ? sum / rtts.length : 0,
    apiP50: percentile(apis, 50),
    successRate: list.length ? (confirmed / list.length) * 100 : 100,
  };
}

/** Aggregated latency stats over the live ring buffer. */
export function useLatencyStats(): LatencyStats {
  const list = useLatencySamples();
  return useMemo(() => summarizeLatency(list), [list]);
}

// ------------------------------------------------------------------- pins ----

interface Pin {
  value: unknown;
  sentAt: number;
  commandId: string;
}

interface Flash {
  status: Exclude<FieldStatus, "idle" | "pending">;
  at: number;
}

let commandSeq = 0;

export interface LiveDeviceApi {
  device: Device | null;
  loading: boolean;
  notFound: boolean;
  /** Fields currently awaiting device confirmation. */
  pending: Set<string>;
  /** Per-field lifecycle status, including the short confirmed/failed flash. */
  fieldStatus: (field: string) => FieldStatus;
  /** True while any command on this device is in flight. */
  busy: boolean;
  /** Round-trip time of the most recent confirmed command, in ms. */
  lastRttMs: number | null;
  /** Sends a command with optimistic projection. Resolves when accepted. */
  send: (params: CommandPayload) => Promise<void>;
  /** Updates device metadata (name / room / favourite). */
  patch: (body: { name?: string; room?: string; favorite?: boolean }) => Promise<void>;
  /** Local-only edit used by controlled inputs before they commit on blur. */
  setLocal: (fn: (d: Device) => Device) => void;
  reload: () => Promise<void>;
}

/**
 * Owns one device's live state: fetch, WS merge, adaptive polling, optimistic
 * command pins, reconciliation and latency capture.
 *
 * @param id        Device id from the route.
 * @param subscribe ConsoleProvider's device-update fan-out.
 */
export function useLiveDevice(
  id: string,
  subscribe: (fn: (u: DeviceUpdate) => void) => () => void
): LiveDeviceApi {
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lastRttMs, setLastRttMs] = useState<number | null>(null);
  // Bumped whenever pins/flashes mutate so the component re-renders.
  const [, forceRender] = useState(0);

  const pins = useRef(new Map<string, Pin>());
  const flashes = useRef(new Map<string, Flash>());
  const inflight = useRef(new Map<string, { sample: LatencySample; patch: StatePatch }>());
  const typeRef = useRef<string>("");

  const rerender = useCallback(() => forceRender((n) => n + 1), []);

  /** Resolves pins that the incoming authoritative state now satisfies. */
  const reconcile = useCallback(
    (state: Record<string, unknown>) => {
      if (!pins.current.size) return;
      let changed = false;
      const now = Date.now();

      for (const [field, pin] of Array.from(pins.current.entries())) {
        if (sameValue(state[field], pin.value)) {
          pins.current.delete(field);
          flashes.current.set(field, { status: "confirmed", at: now });
          changed = true;
        } else if (now - pin.sentAt > COMMAND_TIMEOUT_MS) {
          // Device never acknowledged — stop lying and show the truth.
          pins.current.delete(field);
          flashes.current.set(field, { status: "failed", at: now });
          changed = true;
        }
      }

      // Close out any command whose projected fields are now all satisfied.
      for (const [cid, entry] of Array.from(inflight.current.entries())) {
        const done = patchSatisfied(state, entry.patch);
        const expired = now - entry.sample.sentAt > COMMAND_TIMEOUT_MS;
        if (!done && !expired) continue;
        inflight.current.delete(cid);
        const rtt = now - entry.sample.sentAt;
        if (done) setLastRttMs(rtt);
        recordLatencySample({
          ...entry.sample,
          rttMs: done ? rtt : null,
          outcome: done ? "confirmed" : "timeout",
        });
        changed = true;
      }

      if (changed) rerender();
    },
    [rerender]
  );

  const load = useCallback(async () => {
    if (!id) return;
    const r = await controlPlane.device(id);
    if (r.ok && r.data?.device) {
      const fresh = r.data.device;
      typeRef.current = fresh.type;
      reconcile(fresh.state ?? {});
      setDevice(fresh);
      setNotFound(false);
    } else if (r.status === 404) {
      setNotFound(true);
    }
    setLoading(false);
  }, [id, reconcile]);

  // Initial fetch.
  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Live WS merge — the fast path.
  useEffect(() => {
    return subscribe((u) => {
      if (u.deviceId !== id) return;
      if (u.kind === "status") {
        const online = !!(u.payload as { online?: boolean }).online;
        setDevice((prev) => (prev ? { ...prev, online } : prev));
        return;
      }
      if (u.kind === "state") {
        setDevice((prev) => {
          if (!prev) return prev;
          const merged = { ...prev.state, ...u.payload };
          reconcile(merged);
          return { ...prev, online: true, state: merged, last_seen: u.at };
        });
        return;
      }
      setDevice((prev) => (prev ? { ...prev, online: true } : prev));
    });
  }, [subscribe, id, reconcile]);

  const hasPending = pins.current.size > 0 || inflight.current.size > 0;

  // Adaptive confirmation polling. While a command is unconfirmed we walk the
  // ramp (tight first, then backing off); when idle we fall back to the relaxed
  // cadence because the websocket carries state pushes.
  useEffect(() => {
    if (!hasPending) {
      const t = setInterval(load, IDLE_POLL_MS);
      return () => clearInterval(t);
    }
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const delay = CONFIRM_POLL_RAMP_MS[step] ?? ACTIVE_POLL_MS;
      step += 1;
      timer = setTimeout(() => {
        load();
        tick();
      }, delay);
    };
    tick();
    return () => clearTimeout(timer);
  }, [load, hasPending]);

  // Expire stale pins and clear finished flashes even with no traffic.
  useEffect(() => {
    if (!pins.current.size && !flashes.current.size && !inflight.current.size) return;
    const t = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [field, pin] of Array.from(pins.current.entries())) {
        if (now - pin.sentAt > COMMAND_TIMEOUT_MS) {
          pins.current.delete(field);
          flashes.current.set(field, { status: "failed", at: now });
          changed = true;
        }
      }
      for (const [cid, entry] of Array.from(inflight.current.entries())) {
        if (now - entry.sample.sentAt > COMMAND_TIMEOUT_MS) {
          inflight.current.delete(cid);
          recordLatencySample({ ...entry.sample, rttMs: null, outcome: "timeout" });
          changed = true;
        }
      }
      for (const [field, f] of Array.from(flashes.current.entries())) {
        if (now - f.at > FLASH_MS) {
          flashes.current.delete(field);
          changed = true;
        }
      }
      if (changed) rerender();
    }, 400);
    return () => clearInterval(t);
  }, [rerender, hasPending, lastRttMs]);

  const send = useCallback(
    async (params: CommandPayload) => {
      const type = typeRef.current || device?.type || "";
      const patch = projectCommand(type, params, device?.state);
      const fields = Object.keys(patch);
      const sentAt = Date.now();
      const commandId = `c${++commandSeq}`;

      // 1. Pin + paint immediately — this is what removes the perceived lag.
      if (fields.length) {
        for (const [field, value] of Object.entries(patch)) {
          pins.current.set(field, { value, sentAt, commandId });
          flashes.current.delete(field);
        }
        setDevice((prev) => (prev ? { ...prev, state: { ...prev.state, ...patch } } : prev));
      }

      const sample: LatencySample = {
        id: commandId,
        deviceId: id,
        deviceType: type,
        fields,
        sentAt,
        apiMs: null,
        rttMs: null,
        outcome: "confirmed",
      };
      if (fields.length) inflight.current.set(commandId, { sample, patch });
      rerender();

      // 2. Fire the command.
      const res = await controlPlane.command(id, { action: "set", ...params });
      const apiMs = Date.now() - sentAt;
      sample.apiMs = apiMs;

      if (!res.ok) {
        // Roll the optimistic paint back to real state right away.
        for (const field of fields) {
          if (pins.current.get(field)?.commandId === commandId) {
            pins.current.delete(field);
            flashes.current.set(field, { status: "failed", at: Date.now() });
          }
        }
        inflight.current.delete(commandId);
        recordLatencySample({
          ...sample,
          rttMs: null,
          outcome: "error",
          error: (res.data as { error?: string })?.error || `HTTP ${res.status}`,
        });
        await load();
        rerender();
        return;
      }

      // 3. Confirmation arrives via WS (or the burst poll) and resolves the pin.
      if (!fields.length) {
        recordLatencySample({ ...sample, rttMs: apiMs, outcome: "confirmed" });
      }
      rerender();
    },
    [id, device?.type, load, rerender]
  );

  const patch = useCallback(
    async (body: { name?: string; room?: string; favorite?: boolean }) => {
      setDevice((prev) => (prev ? { ...prev, ...body } : prev));
      await controlPlane.patchDevice(id, body);
    },
    [id]
  );

  const setLocal = useCallback((fn: (d: Device) => Device) => {
    setDevice((prev) => (prev ? fn(prev) : prev));
  }, []);

  const pending = useMemo(() => new Set(pins.current.keys()), [pins.current.size, lastRttMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const fieldStatus = useCallback((field: string): FieldStatus => {
    if (pins.current.has(field)) return "pending";
    return flashes.current.get(field)?.status ?? "idle";
  }, []);

  return {
    device,
    loading,
    notFound,
    pending,
    fieldStatus,
    busy: pins.current.size > 0,
    lastRttMs,
    send,
    patch,
    setLocal,
    reload: load,
  };
}

/** Short haptic tick on supported devices; silently ignored elsewhere. */
export function haptic(ms = 12): void {
  if (typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}

// ------------------------------------------------- grid / list optimism ---

interface OverlayPin {
  patch: StatePatch;
  sentAt: number;
  apiMs: number | null;
  deviceType: string;
}

export interface OptimisticCommands {
  /** Overlay pending optimistic values on a device at render time. */
  apply: (d: Device) => Device;
  /** Aggregate command lifecycle for a device. */
  statusOf: (deviceId: string) => FieldStatus;
  /** Fire a command with instant optimistic paint and latency capture. */
  send: (device: Device, params: CommandPayload) => Promise<void>;
}

/**
 * Optimistic command layer for screens that render a *list* of devices
 * (dashboard grid, rooms, groups). Unlike `useLiveDevice` the overlay is
 * applied at render time rather than merged into state, so a background poll
 * or a stale telemetry frame can never revert a switch mid-flight.
 */
export function useOptimisticCommands(devices: Device[]): OptimisticCommands {
  const [pins, setPins] = useState<Record<string, OverlayPin>>({});
  const [flashes, setFlashes] = useState<Record<string, { status: FieldStatus; at: number }>>({});

  // Reconcile: drop a pin as soon as the device reports the projected values,
  // or once it has outlived the command timeout.
  useEffect(() => {
    if (!Object.keys(pins).length) return;
    const settle = () => {
      const now = Date.now();
      const resolved: Record<string, FieldStatus> = {};
      setPins((prev) => {
        const next: Record<string, OverlayPin> = {};
        for (const [id, pin] of Object.entries(prev)) {
          const dev = devices.find((d) => d.id === id);
          const done = dev ? patchSatisfied(pin.patch, dev.state) : false;
          const expired = now - pin.sentAt > COMMAND_TIMEOUT_MS;
          if (!done && !expired) {
            next[id] = pin;
            continue;
          }
          resolved[id] = done ? "confirmed" : "failed";
          recordLatencySample({
            id: `${id}-${pin.sentAt}`,
            deviceId: id,
            deviceType: pin.deviceType,
            fields: Object.keys(pin.patch),
            sentAt: pin.sentAt,
            apiMs: pin.apiMs,
            rttMs: done ? now - pin.sentAt : null,
            outcome: done ? "confirmed" : "timeout",
            error: done ? undefined : `device did not echo within ${COMMAND_TIMEOUT_MS} ms`,
          });
        }
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
      if (Object.keys(resolved).length) {
        setFlashes((prev) => {
          const next = { ...prev };
          for (const [id, status] of Object.entries(resolved)) next[id] = { status, at: now };
          return next;
        });
      }
    };
    settle();
    const t = setInterval(settle, 300);
    return () => clearInterval(t);
  }, [devices, pins]);

  // Expire confirmed/failed flashes.
  useEffect(() => {
    if (!Object.keys(flashes).length) return;
    const t = setTimeout(() => {
      const now = Date.now();
      setFlashes((prev) => {
        const next = Object.fromEntries(Object.entries(prev).filter(([, f]) => now - f.at < FLASH_MS));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, FLASH_MS);
    return () => clearTimeout(t);
  }, [flashes]);

  const apply = useCallback(
    (d: Device): Device => {
      const pin = pins[d.id];
      return pin ? { ...d, state: { ...d.state, ...pin.patch } } : d;
    },
    [pins]
  );

  const statusOf = useCallback(
    (deviceId: string): FieldStatus => {
      if (pins[deviceId]) return "pending";
      return flashes[deviceId]?.status ?? "idle";
    },
    [pins, flashes]
  );

  const send = useCallback(async (device: Device, params: CommandPayload) => {
    const patch = projectCommand(device.type, params, device.state);
    const sentAt = Date.now();
    const hasPatch = Object.keys(patch).length > 0;
    haptic();
    if (hasPatch) {
      setPins((prev) => ({ ...prev, [device.id]: { patch, sentAt, apiMs: null, deviceType: device.type } }));
    }

    const res = await controlPlane.command(device.id, { action: "set", ...params });
    const apiMs = Date.now() - sentAt;

    if (!res.ok) {
      setPins((prev) => {
        const next = { ...prev };
        delete next[device.id];
        return next;
      });
      setFlashes((prev) => ({ ...prev, [device.id]: { status: "failed", at: Date.now() } }));
      recordLatencySample({
        id: `${device.id}-${sentAt}`,
        deviceId: device.id,
        deviceType: device.type,
        fields: Object.keys(patch),
        sentAt,
        apiMs,
        rttMs: null,
        outcome: "error",
        error: `HTTP ${res.status}`,
      });
      return;
    }

    // Accepted. The full round trip is recorded when the pin settles; a command
    // with nothing deterministic to project has no echo to wait for.
    if (hasPatch) {
      setPins((prev) => (prev[device.id] ? { ...prev, [device.id]: { ...prev[device.id], apiMs } } : prev));
    } else {
      recordLatencySample({
        id: `${device.id}-${sentAt}`,
        deviceId: device.id,
        deviceType: device.type,
        fields: [],
        sentAt,
        apiMs,
        rttMs: apiMs,
        outcome: "confirmed",
      });
    }
  }, []);

  return { apply, statusOf, send };
}
